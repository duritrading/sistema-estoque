const express = require('express');
const router = express.Router();
// Usamos a importação que nos dá acesso tanto ao 'db' quanto ao 'pool'
const { db, pool } = require('../config/database');

// ==========================================================
// ROTA INICIAL QUE ESTAVA FALTANDO
// ==========================================================
router.get('/', (req, res) => {
  // A função desta rota é simplesmente redirecionar para a página principal do financeiro
  res.redirect('/financeiro/completo');
});
// ==========================================================

// Rota para a página de FLUXO DE CAIXA
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
      FROM fluxo_caixa
    `;
    const totaisResult = await pool.query(queryTotais);

    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;

    res.render('financeiro', {
      user: res.locals.user,
      contas: lancamentosResult.rows || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });
  } catch (error) {
    console.error('Erro fatal ao carregar página financeira:', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// Rota para a página de FATURAMENTO
router.get('/faturamento', (req, res) => {
    // ... (código da rota /faturamento que já corrigimos)
});

// Rota para a página de DRE
router.get('/dre', (req, res) => {
    // ... (código da rota /dre que já corrigimos)
});

// Rota para registrar PAGAMENTO
router.post('/faturamento/registrar-pagamento/:id', (req, res) => {
    // ... (código da rota para registrar pagamento que já implementamos)
});

// Rota para criar LANÇAMENTO no fluxo de caixa
router.post('/lancamento', (req, res) => {
    // ... (código da rota para criar lançamento)
});


module.exports = router;