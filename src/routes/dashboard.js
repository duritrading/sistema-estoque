const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET / - Dashboard apenas com relatórios
router.get('/', async (req, res) => {
  // Validação para garantir que a pool de conexão está disponível
  if (!pool) {
    return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');
  }

  try {
    // Query para os cartões de estatísticas (mais eficiente)
    const statsQuery = `
      WITH saldo_produtos AS (
        SELECT 
          p.id,
          p.preco_custo,
          COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade WHEN m.tipo = 'SAIDA' THEN -m.quantidade ELSE 0 END), 0) as saldo_atual
        FROM produtos p
        LEFT JOIN movimentacoes m ON p.id = m.produto_id
        GROUP BY p.id
      )
      SELECT
        (SELECT COUNT(*) FROM produtos) as total_produtos,
        COALESCE(SUM(saldo_atual), 0) as total_em_estoque,
        COALESCE(SUM(saldo_atual * preco_custo), 0) as valor_estoque
      FROM saldo_produtos;
    `;

    // Query para os alertas de estoque
    const alertasQuery = `
      SELECT p.codigo, p.descricao, p.estoque_minimo, s.saldo_atual
      FROM produtos p
      JOIN (
        SELECT produto_id, SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE -quantidade END) as saldo_atual
        FROM movimentacoes
        GROUP BY produto_id
      ) s ON p.id = s.produto_id
      WHERE s.saldo_atual <= p.estoque_minimo AND p.estoque_minimo > 0
    `;

    const [statsResult, alertasResult] = await Promise.all([
      pool.query(statsQuery),
      pool.query(alertasQuery)
    ]);

    res.render('dashboard', {
      user: res.locals.user,
      stats: statsResult.rows[0] || { total_produtos: 0, total_em_estoque: 0, valor_estoque: 0 },
      alertas: alertasResult.rows || []
    });
  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    res.status(500).send('Erro ao carregar dashboard.');
  }
});

module.exports = router;