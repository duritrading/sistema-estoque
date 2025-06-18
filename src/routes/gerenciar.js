const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /gerenciar/produtos
router.get('/produtos', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      COALESCE(SUM(
        CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
             WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
             ELSE 0 END
      ), 0) as saldo_atual,
      COUNT(m.id) as total_movimentacoes
    FROM produtos p
    LEFT JOIN movimentacoes m ON p.id = m.produto_id
    GROUP BY p.id
    ORDER BY p.codigo
  `, [], (err, produtos) => {
    if (err) return res.status(500).send('Erro: ' + err.message);
    res.render('gerenciar-produtos', {
      user: res.locals.user,
      produtos: Array.isArray(produtos) ? produtos : []
    });
  });
});

// GET /gerenciar/movimentacoes
router.get('/movimentacoes', (req, res) => {
  db.all(`
    SELECT m.*, p.codigo, p.descricao
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    ORDER BY m.created_at DESC
    LIMIT 200
  `, [], (err, movimentacoes) => {
    if (err) return res.status(500).send('Erro: ' + err.message);
    res.render('gerenciar-movimentacoes', {
      user: res.locals.user,
      movimentacoes: Array.isArray(movimentacoes) ? movimentacoes : []
    });
  });
});

module.exports = router;