const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /produtos - Mostra a página de cadastro e listagem de produtos
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade WHEN m.tipo = 'SAIDA' THEN -m.quantidade ELSE 0 END), 0) as saldo_atual
      FROM produtos p
      LEFT JOIN movimentacoes m ON p.id = m.produto_id
      GROUP BY p.id
      ORDER BY p.codigo
    `;
    const produtosResult = await pool.query(query);
    const categoriasResult = await pool.query(`SELECT DISTINCT categoria FROM produtos WHERE categoria IS NOT NULL ORDER BY categoria`);

    res.render('produtos', {
      user: res.locals.user,
      produtos: produtosResult.rows || [],
      categorias: categoriasResult.rows.map(c => c.categoria) || []
    });
  } catch (err) {
    console.error("Erro ao buscar produtos:", err);
    res.status(500).send('Erro ao buscar produtos.');
  }
});

// Rota POST /produtos - Processa o cadastro de um novo produto
router.post('/', async (req, res) => {
  try {
    const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
    const query = `
      INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const params = [codigo, descricao, unidade || 'UN', categoria, estoque_minimo || 0, preco_custo || null];
    await pool.query(query, params);
    res.redirect('/produtos');
  } catch (err) {
    console.error("Erro ao criar produto:", err);
    res.status(500).send('Erro ao criar produto.');
  }
});

module.exports = router;