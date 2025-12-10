// src/routes/clientes.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createClienteSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, dependencyError } = require('../utils/helpers');
const { findById, countDependencies } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/clientes';

// GET / - Listar clientes com RCAs
router.get('/', asyncHandler(async (req, res) => {
  const [clientesResult, rcasResult] = await Promise.all([
    pool.query(`
      SELECT c.*, r.nome as rca_nome 
      FROM clientes c
      LEFT JOIN rcas r ON c.rca_id = r.id
      ORDER BY c.nome
    `),
    pool.query('SELECT id, nome FROM rcas ORDER BY nome')
  ]);

  res.render('clientes', {
    user: res.locals.user,
    clientes: clientesResult.rows,
    rcas: rcasResult.rows
  });
}, ROUTE));

// POST / - Criar cliente
router.post('/', validateBody(createClienteSchema), asyncHandler(async (req, res) => {
  const { nome, cpf_cnpj, endereco, cep, telefone, email, observacao, rca_id } = req.body;
  
  await pool.query(
    `INSERT INTO clientes (nome, cpf_cnpj, endereco, cep, telefone, email, observacao, rca_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [nome, cpf_cnpj || null, endereco || null, cep || null, telefone || null, email || null, observacao || null, rca_id || null]
  );
  
  res.redirect(ROUTE);
}, ROUTE));

// POST /delete/:id - Excluir cliente
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const cliente = await findById('clientes', id, 'nome');
  if (!cliente) return notFound(res, 'Cliente', ROUTE);
  
  // Verificar movimentações por nome do cliente
  const movs = await pool.query(
    'SELECT COUNT(*) as count FROM movimentacoes WHERE cliente_nome = $1',
    [cliente.nome]
  );
  
  if (parseInt(movs.rows[0].count) > 0) {
    return dependencyError(res, 'Cliente', `${movs.rows[0].count} movimentação(ões)`, ROUTE);
  }
  
  await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;