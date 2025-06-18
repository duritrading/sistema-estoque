const express = require('express');
const router = express.Router();
// Importação correta que pega o 'pool'
const { pool } = require('../config/database');

// ... (as outras rotas de financeiro, como /faturamento e /dre, continuam aqui) ...
// A rota /completo é a que estava travando:
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
// ... (o resto do arquivo, incluindo a rota /faturamento e /dre, continua aqui) ...

module.exports = router;