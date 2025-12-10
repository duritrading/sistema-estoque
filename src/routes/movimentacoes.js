// src/routes/movimentacoes.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createMovimentacaoSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound } = require('../utils/helpers');
const { findById, findAll } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/movimentacoes';

// Helper: Calcular métricas do mês
async function getMonthMetrics() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  
  const fimMes = new Date();
  fimMes.setMonth(fimMes.getMonth() + 1);
  fimMes.setDate(0);
  fimMes.setHours(23, 59, 59, 999);
  
  const result = await pool.query(`
    SELECT 
      COUNT(CASE WHEN tipo = 'ENTRADA' THEN 1 END) as entradas_mes,
      COUNT(CASE WHEN tipo = 'SAIDA' THEN 1 END) as saidas_mes,
      COUNT(*) as total_movimentacoes,
      COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN COALESCE(valor_total, quantidade * COALESCE(preco_unitario, 0)) ELSE 0 END), 0) as valor_total
    FROM movimentacoes
    WHERE created_at >= $1 AND created_at <= $2
  `, [inicioMes, fimMes]);
  
  const m = result.rows[0];
  return {
    entradas_mes: parseInt(m.entradas_mes) || 0,
    saidas_mes: parseInt(m.saidas_mes) || 0,
    total_movimentacoes: parseInt(m.total_movimentacoes) || 0,
    valor_total: parseFloat(m.valor_total) || 0
  };
}

// Helper: Construir query com filtros
function buildFilteredQuery(filtros) {
  const { tipo, produto_id, data_inicial, data_fim } = filtros;
  let query = `
    SELECT m.*, 
           p.descricao as produto_descricao, p.codigo as produto_codigo,
           f.nome as fornecedor_nome,
           COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) as valor_total_calc
    FROM movimentacoes m
    LEFT JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE 1=1
  `;
  const params = [];
  let idx = 1;
  
  if (tipo) { query += ` AND m.tipo = $${idx++}`; params.push(tipo); }
  if (produto_id) { query += ` AND m.produto_id = $${idx++}`; params.push(produto_id); }
  if (data_inicial) { query += ` AND DATE(m.created_at) >= $${idx++}`; params.push(data_inicial); }
  if (data_fim) { query += ` AND DATE(m.created_at) <= $${idx++}`; params.push(data_fim); }
  
  query += ' ORDER BY m.created_at DESC';
  return { query, params };
}

// GET / - Listar movimentações com filtros
router.get('/', asyncHandler(async (req, res) => {
  const filtros = req.query;
  const { query, params } = buildFilteredQuery(filtros);
  
  const [movResult, produtos, fornecedores, rcas, metrics] = await Promise.all([
    pool.query(query, params),
    findAll('produtos', 'descricao'),
    findAll('fornecedores', 'nome'),
    findAll('rcas', 'nome'),
    getMonthMetrics()
  ]);

  res.render('movimentacoes', {
    user: res.locals.user,
    movimentacoes: movResult.rows,
    produtos,
    fornecedores,
    rcas,
    filtros,
    metrics
  });
}, ROUTE));

// GET /:id - Visualizar movimentação (JSON)
router.get('/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT m.*, 
           p.descricao as produto_descricao, p.codigo as produto_codigo,
           f.nome as fornecedor_nome,
           COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) as valor_total_calc
    FROM movimentacoes m
    LEFT JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE m.id = $1
  `, [req.params.id]);
  
  if (!result.rows[0]) return res.status(404).json({ error: 'Movimentação não encontrada' });
  res.json(result.rows[0]);
}, ROUTE));

// POST / - Criar movimentação
router.post('/', validateBody(createMovimentacaoSchema), asyncHandler(async (req, res) => {
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao } = req.body;
  
  await pool.query(
    `INSERT INTO movimentacoes (produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [produto_id, fornecedor_id || null, cliente_nome || null, rca || null, tipo, quantidade, preco_unitario || null, valor_total || null, documento || null, observacao || null]
  );
  
  res.redirect(ROUTE);
}, ROUTE));

// POST /:id/edit - Editar movimentação
router.post('/:id/edit', validateParams(idParamSchema), validateBody(createMovimentacaoSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao } = req.body;
  
  await pool.query(
    `UPDATE movimentacoes SET produto_id=$1, fornecedor_id=$2, cliente_nome=$3, rca=$4, tipo=$5, quantidade=$6, preco_unitario=$7, valor_total=$8, documento=$9, observacao=$10 WHERE id=$11`,
    [produto_id, fornecedor_id || null, cliente_nome || null, rca || null, tipo, quantidade, preco_unitario || null, valor_total || null, documento || null, observacao || null, id]
  );
  
  res.redirect(ROUTE);
}, ROUTE));

// POST /delete/:id - Excluir movimentação
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM movimentacoes WHERE id = $1', [req.params.id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;