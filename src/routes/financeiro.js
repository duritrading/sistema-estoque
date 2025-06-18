const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Rota principal /financeiro redireciona para a completa
router.get('/', (req, res) => {
  return res.redirect('/financeiro/completo');
});

// Página principal do financeiro
router.get('/completo', (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    db.all(`
      SELECT * FROM fluxo_caixa 
      ORDER BY data_operacao DESC, created_at DESC 
      LIMIT 20
    `, [], (err, lancamentos) => {
      if (err) {
        return res.status(500).send('Erro buscando lançamentos: ' + err.message);
      }

      db.get(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
          COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
        FROM fluxo_caixa
      `, [], (err2, totais) => {
        if (err2) {
          return res.status(500).send('Erro buscando totais: ' + err2.message);
        }
        const saldoAtual = totais ? (totais.total_credito - totais.total_debito) : 0;

        res.render('financeiro', {
          user: res.locals.user,
          lancamentos: Array.isArray(lancamentos) ? lancamentos : [],
          totais: totais || { total_credito: 0, total_debito: 0 },
          saldoAtual,
          hoje
        });
      });
    });
  } catch (error) {
    return res.status(500).send('Erro geral financeiro: ' + error.message);
  }
});

// Processar novo lançamento
router.post('/lancamento', (req, res) => {
  const { data_operacao, tipo, valor, descricao } = req.body;
  const categoriaId = tipo === 'CREDITO' ? 1 : 3;

  db.run(`
    INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id)
    VALUES ($1, $2, $3, $4, $5)
  `, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId], (err) => {
    if (err) {
      console.error('Erro lançamento financeiro:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/financeiro/completo');
  });
});

// Dentro de src/routes/financeiro.js

router.get('/faturamento', (req, res) => {
  let { data_inicio, data_fim } = req.query;
  const isProduction = !!process.env.DATABASE_URL;

  // Define datas padrão se não forem fornecidas
  if (!data_inicio) {
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    data_inicio = primeiroDiaDoMes.toISOString().split('T')[0];
  }
  if (!data_fim) {
    const hoje = new Date();
    const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    data_fim = ultimoDiaDoMes.toISOString().split('T')[0];
  }

  // Query SQL base
  let query = `
    SELECT id, movimentacao_id, cliente_nome, numero_parcela, total_parcelas, valor, data_vencimento, data_pagamento, status
    FROM contas_a_receber
  `;
  const params = [];
  let whereClauses = [];
  let paramCount = 1;

  // Monta a cláusula WHERE dinamicamente com os placeholders corretos
  if (data_inicio) {
    whereClauses.push(`data_vencimento >= <span class="math-inline">\{isProduction ? '</span>' + paramCount++ : '?'}`);
    params.push(data_inicio);
  }
  if (data_fim) {
    whereClauses.push(`data_vencimento <= <span class="math-inline">\{isProduction ? '</span>' + paramCount++ : '?'}`);
    params.push(data_fim);
  }

  if (whereClauses.length > 0) {
    // Garante o espaço antes do WHERE
    query += ' WHERE ' + whereClauses.join(' AND ');
  }
  query += ' ORDER BY data_vencimento ASC';

  // Log para depuração. Se o erro continuar, isso nos ajudará.
  console.log('Executando query de faturamento:', query);
  console.log('Com parâmetros:', params);

  db.all(query, params, (err, contas) => {
    if (err) {
      console.error('Erro ao buscar contas a receber:', err);
      return res.status(500).send('Erro ao buscar dados de faturamento.');
    }

    res.render('faturamento', {
      user: res.locals.user,
      contas: Array.isArray(contas) ? contas : [],
      filtros: { data_inicio, data_fim }
    });
  });
});

// DRE

router.get('/dre', (req, res) => {
  const ano = new Date().getFullYear();

  // Lógica para usar a função de data correta para cada banco
  const isProduction = !!process.env.DATABASE_URL;
  const dateGroupFunction = isProduction 
    ? `TO_CHAR(data_operacao, 'YYYY-MM')` // PostgreSQL
    : `strftime('%Y-%m', data_operacao)`; // SQLite

  const yearFilterFunction = isProduction
    ? `EXTRACT(YEAR FROM data_operacao) = $1` // PostgreSQL
    : `strftime('%Y', data_operacao) = ?`; // SQLite

  const query = `
    SELECT
      ${dateGroupFunction} as mes,
      cf.nome as categoria_nome,
      cf.tipo as categoria_tipo,
      SUM(fc.valor) as total
    FROM fluxo_caixa fc
    JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
    WHERE ${yearFilterFunction} AND fc.status = 'PAGO'
    GROUP BY mes, cf.nome, cf.tipo
    ORDER BY mes, cf.tipo
  `;

  db.all(query, [String(ano)], (err, rows) => {
    if (err) {
      console.error('Erro ao gerar relatório DRE:', err);
      return res.status(500).send('Erro ao gerar relatório DRE.');
    }

    // ... (o restante da lógica para processar os dados continua o mesmo) ...
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const dreData = {};
    const totaisMensais = Array(12).fill(0).map(() => ({ receitas: 0, despesas: 0 }));

    rows.forEach(row => {
      const mesIndex = parseInt(row.mes.split('-')[1]) - 1;

      if (!dreData[row.categoria_nome]) {
        dreData[row.categoria_nome] = { tipo: row.categoria_tipo, valores: Array(12).fill(0) };
      }
      dreData[row.categoria_nome].valores[mesIndex] = row.total;

      if (row.categoria_tipo === 'RECEITA') {
        totaisMensais[mesIndex].receitas += row.total;
      } else if (row.categoria_tipo === 'DESPESA') {
        totaisMensais[mesIndex].despesas += row.total;
      }
    });

    res.render('dre', {
      user: res.locals.user,
      ano,
      meses,
      dreData,
      totaisMensais
    });
  });
});

module.exports = router;