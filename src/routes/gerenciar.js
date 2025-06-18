const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/produtos', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const query = `
      SELECT p.*, COALESCE(s.saldo_atual, 0) as saldo_atual, COALESCE(mc.total_movimentacoes, 0) as total_movimentacoes
      FROM produtos p
      LEFT JOIN (
        SELECT produto_id, SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade WHEN tipo = 'SAIDA' THEN -quantidade ELSE 0 END) as saldo_atual
        FROM movimentacoes GROUP BY produto_id
      ) s ON p.id = s.produto_id
      LEFT JOIN (
        SELECT produto_id, COUNT(id) as total_movimentacoes
        FROM movimentacoes GROUP BY produto_id
      ) mc ON p.id = mc.produto_id
      ORDER BY p.codigo
    `;
    const result = await pool.query(query);
    res.render('gerenciar-produtos', {
      user: res.locals.user,
      produtos: result.rows || []
    });
  } catch (err) {
    res.status(500).send('Erro ao carregar produtos.');
  }
});

router.get('/movimentacoes', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const query = `
      SELECT m.*, p.codigo, p.descricao
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      ORDER BY m.created_at DESC
      LIMIT 200
    `;
    const result = await pool.query(query);
    res.render('gerenciar-movimentacoes', {
      user: res.locals.user,
      movimentacoes: result.rows || []
    });
  } catch (err) {
    res.status(500).send('Erro ao carregar movimentações.');
  }
});

module.exports = router;