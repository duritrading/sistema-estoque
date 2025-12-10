// src/routes/produtos.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createProdutoSchema, updateProdutoSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, dependencyError, duplicateError } = require('../utils/helpers');
const { findById, countDependencies } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/produtos';

// GET / - Listar produtos com saldo
router.get('/', asyncHandler(async (req, res) => {
  const [produtos, categorias] = await Promise.all([
    pool.query(`
      SELECT p.*,
        COALESCE(SUM(
          CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
               WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
               ELSE 0 END
        ), 0) as saldo_atual
      FROM produtos p
      LEFT JOIN movimentacoes m ON p.id = m.produto_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `),
    pool.query(`
      SELECT DISTINCT categoria FROM produtos 
      WHERE categoria IS NOT NULL AND categoria != ''
      ORDER BY categoria
    `)
  ]);

  res.render('produtos', {
    user: res.locals.user,
    produtos: produtos.rows,
    categorias: categorias.rows.map(r => r.categoria)
  });
}, ROUTE));

// POST / - Criar produto
router.post('/', validateBody(createProdutoSchema), asyncHandler(async (req, res) => {
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [codigo, descricao, unidade || 'UN', categoria || null, estoque_minimo || 0, preco_custo || null]
    );
    res.redirect(ROUTE);
  } catch (err) {
    if (err.code === '23505') return duplicateError(res, 'código', ROUTE);
    throw err;
  }
}, ROUTE));

// POST /update/:id - Atualizar produto
router.post('/update/:id', validateParams(idParamSchema), validateBody(updateProdutoSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  const produto = await findById('produtos', id);
  if (!produto) return notFound(res, 'Produto', ROUTE);
  
  try {
    await pool.query(
      `UPDATE produtos 
       SET codigo = $1, descricao = $2, unidade = $3, categoria = $4, estoque_minimo = $5, preco_custo = $6
       WHERE id = $7`,
      [codigo, descricao, unidade, categoria, estoque_minimo, preco_custo, id]
    );
    res.redirect(ROUTE);
  } catch (err) {
    if (err.code === '23505') return duplicateError(res, 'código', ROUTE);
    throw err;
  }
}, ROUTE));

// POST /delete/:id - Excluir produto
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const produto = await findById('produtos', id, 'codigo, descricao');
  if (!produto) return notFound(res, 'Produto', ROUTE);
  
  const movs = await countDependencies('movimentacoes', 'produto_id', id);
  if (movs > 0) return dependencyError(res, 'Produto', `${movs} movimentação(ões)`, ROUTE);
  
  await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;