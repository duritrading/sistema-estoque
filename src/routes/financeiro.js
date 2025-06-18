const express = require('express');
const router = express.Router();
// Importa o 'db' para compatibilidade e o 'pool' para operações diretas
const { db, pool } = require('../config/database');

// ROTA INICIAL: Redireciona para a página principal do financeiro
router.get('/', (req, res) => {
  res.redirect('/financeiro/completo');
});

// ROTA FLUXO DE CAIXA: Mostra a página principal do financeiro
router.get('/completo', async (req, res) => {
  if (!pool) {
    return res.status(500).send('Erro de configuração: Pool do banco de dados não disponível.');
  }
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const queryLancamentos = `SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`;
    const lancamentosResult = await pool.query(queryLancamentos);
    
    const queryTotais = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa WHERE status = 'PAGO'
    `;
    const totaisResult = await pool.query(queryTotais);
    
    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;
    
    res.render('financeiro', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });
  } catch (error) {
    console.error('Erro fatal ao carregar página financeira:', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// ROTA FATURAMENTO: Mostra o relatório de contas a receber com filtros
router.get('/faturamento', (req, res) => {
  let { data_inicio, data_fim } = req.query;
  const isProduction = !!process.env.DATABASE_URL;

  if (!data_inicio) {
    const hoje = new Date();
    data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
  }
  if (!data_fim) {
    const hoje = new Date();
    data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
  }
  
  let query = `
    SELECT 
      cr.id, cr.movimentacao_id, cr.cliente_nome, cr.numero_parcela, 
      cr.total_parcelas, cr.valor, cr.data_vencimento, cr.data_pagamento, 
      cr.status, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
  `;
  const params = [];
  const whereClauses = [];
  let paramCount = 1;

  if (data_inicio) {
    whereClauses.push(`cr.data_vencimento >= ${isProduction ? '$' + paramCount++ : '?'}`);
    params.push(data_inicio);
  }
  if (data_fim) {
    whereClauses.push(`cr.data_vencimento <= ${isProduction ? '$' + paramCount++ : '?'}`);
    params.push(data_fim);
  }
  
  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }
  query += ' ORDER BY cr.data_vencimento ASC';

  db.all(query, params, (err, contas) => {
    if (err) {
      console.error('Erro ao buscar contas a receber:', err);
      return res.status(500).send('Erro ao buscar dados de faturamento.');
    }
    const totalValor = (contas || []).reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

    res.render('faturamento', {
      user: res.locals.user,
      contas: Array.isArray(contas) ? contas : [],
      filtros: { data_inicio, data_fim },
      totalValor: totalValor
    });
  });
});

// ROTA DRE: Mostra o Demonstrativo de Resultado do Exercício
router.get('/dre', (req, res) => {
    const ano = new Date().getFullYear();
    const isProduction = !!process.env.DATABASE_URL;
    const dateGroupFunction = isProduction ? `TO_CHAR(data_operacao, 'YYYY-MM')` : `strftime('%Y-%m', data_operacao)`;
    const yearFilterFunction = isProduction ? `EXTRACT(YEAR FROM data_operacao) = $1` : `strftime('%Y', data_operacao) = ?`;

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
        if (err) return res.status(500).send('Erro ao gerar relatório DRE.');
        
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const dreData = {};
        const totaisMensais = Array(12).fill(0).map(() => ({ receitas: 0, despesas: 0 }));

        rows.forEach(row => {
            const mesIndex = parseInt(row.mes.split('-')[1]) - 1;
            if (!dreData[row.categoria_nome]) {
                dreData[row.categoria_nome] = { tipo: row.categoria_tipo, valores: Array(12).fill(0) };
            }
            dreData[row.categoria_nome].valores[mesIndex] = row.total;
            if (row.categoria_tipo === 'RECEITA') totaisMensais[mesIndex].receitas += row.total;
            else if (row.categoria_tipo === 'DESPESA') totaisMensais[mesIndex].despesas += row.total;
        });

        res.render('dre', { user: res.locals.user, ano, meses, dreData, totaisMensais });
    });
});

// ROTA REGISTRAR PAGAMENTO: Atualiza status e cria lançamento no caixa
router.post('/faturamento/registrar-pagamento/:id', (req, res) => {
  const contaId = req.params.id;
  const dataPagamento = new Date().toISOString().split('T')[0];

  db.get(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = ?
  `, [contaId], (err, conta) => {
    if (err || !conta) return res.status(500).send("Erro: Conta a receber não encontrada.");
    if (conta.status === 'Pago') return res.redirect('/financeiro/faturamento');

    const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
    db.run(`
      INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
      VALUES (?, 'CREDITO', ?, ?, ?, 'PAGO')
    `, [dataPagamento, conta.valor, descricaoFluxo, 1], function(err) {
      if (err) return res.status(500).send("Erro ao inserir no fluxo de caixa.");
      const fluxoCaixaId = this.lastID;
      db.run(`
        UPDATE contas_a_receber SET status = 'Pago', data_pagamento = ?, fluxo_caixa_id = ? WHERE id = ?
      `, [dataPagamento, fluxoCaixaId, contaId], (err) => {
        if (err) return res.status(500).send("Erro ao atualizar status da conta.");
        res.redirect('/financeiro/faturamento');
      });
    });
  });
});

// ROTA NOVO LANÇAMENTO: Cria um novo lançamento avulso no caixa
router.post('/lancamento', (req, res) => {
  const { data_operacao, tipo, valor, descricao } = req.body;
  const categoriaId = tipo === 'CREDITO' ? 1 : 3; // Categorias genéricas
  db.run(`
    INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
    VALUES (?, ?, ?, ?, ?, 'PAGO')
  `, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId], (err) => {
    if (err) return res.status(500).send('Erro: ' + err.message);
    res.redirect('/financeiro/completo');
  });
});

module.exports = router;