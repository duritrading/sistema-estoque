const express = require('express');
const router = express.Router();
const { db, pool } = require('../config/database');

// Rota principal /financeiro redireciona para a completa
router.get('/', (req, res) => {
  return res.redirect('/financeiro/completo');
});

// Página principal do fluxo de caixa
router.get('/completo', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});

// Processar novo lançamento no fluxo de caixa
router.post('/lancamento', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});

// Rota para o relatório DRE
router.get('/dre', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});

// Em src/routes/financeiro.js
router.get('/completo', async (req, res) => {
  // Verifica se estamos em produção e se o pool existe
  if (!pool) {
    return res.status(500).send('Erro de configuração: Pool do banco de dados não disponível.');
  }

  try {
    const hoje = new Date().toISOString().split('T')[0];

    console.log('FINANCEIRO (direto): Buscando últimos lançamentos...');
    const queryLancamentos = `SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`;
    const lancamentosResult = await pool.query(queryLancamentos);
    const lancamentos = lancamentosResult.rows;
    console.log(`FINANCEIRO (direto): Lançamentos encontrados: ${lancamentos.length}`);

    console.log('FINANCEIRO (direto): Buscando totais...');
    const queryTotais = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa
    `;
    const totaisResult = await pool.query(queryTotais);
    const totais = totaisResult.rows[0];
    console.log('FINANCEIRO (direto): Totais calculados.', totais);

    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;

    console.log('FINANCEIRO (direto): Renderizando a página...');
    res.render('financeiro', {
      user: res.locals.user,
      lancamentos: lancamentos || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });

  } catch (error) {
    console.error('Erro fatal ao carregar página financeira (direto):', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// 3. NOVA ROTA PARA REGISTRAR O PAGAMENTO
router.post('/faturamento/registrar-pagamento/:id', (req, res) => {
  const contaId = req.params.id;
  const dataPagamento = new Date().toISOString().split('T')[0];

  // Passo 1: Buscar os dados da conta a receber
  db.get(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = ?
  `, [contaId], (err, conta) => {
    if (err || !conta) {
      return res.status(500).send("Erro: Conta a receber não encontrada.");
    }
    
    if (conta.status === 'Pago') {
      return res.redirect('/financeiro/faturamento'); // Já está paga, não faz nada
    }

    // Passo 2: Inserir o crédito no fluxo de caixa
    const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
    db.run(`
      INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id)
      VALUES (?, 'CREDITO', ?, ?, ?)
    `, [dataPagamento, conta.valor, descricaoFluxo, 1], function(err) { // Categoria 1 = Receita de Vendas
      if (err) {
        return res.status(500).send("Erro ao inserir no fluxo de caixa.");
      }
      
      const fluxoCaixaId = this.lastID;

      // Passo 3: Atualizar o status da conta a receber
      db.run(`
        UPDATE contas_a_receber 
        SET status = 'Pago', data_pagamento = ?, fluxo_caixa_id = ?
        WHERE id = ?
      `, [dataPagamento, fluxoCaixaId, contaId], (err) => {
        if (err) {
          return res.status(500).send("Erro ao atualizar status da conta.");
        }
        res.redirect('/financeiro/faturamento');
      });
    });
  });
});

module.exports = router;