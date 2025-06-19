const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Mostra a página
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const lancamentosResult = await pool.query(`SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`);
    const totaisResult = await pool.query(`SELECT COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito, COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito FROM fluxo_caixa WHERE status = 'PAGO'`);
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
    res.status(500).send('Erro ao carregar a página de fluxo de caixa.');
  }
});

// Rota POST /fluxo-caixa/lancamento - Cria um novo lançamento
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { data_operacao, tipo, valor, descricao } = req.body;
        const categoriaId = tipo === 'CREDITO' ? 1 : 3;
        await pool.query(`INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, $2, $3, $4, $5, 'PAGO')`, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId]);
        res.redirect('/fluxo-caixa');
    } catch(err) {
        res.status(500).send('Erro ao criar lançamento.');
    }
});

module.exports = router;