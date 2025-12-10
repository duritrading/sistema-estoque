// src/routes/rcas.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createRcaSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, dependencyError, duplicateError } = require('../utils/helpers');
const { findById, findAll, countDependencies } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/rcas';

// GET / - Listar RCAs
router.get('/', asyncHandler(async (req, res) => {
  const rcas = await findAll('rcas', 'nome');
  res.render('rcas', { user: res.locals.user, rcas });
}, ROUTE));

// POST / - Criar RCA
router.post('/', validateBody(createRcaSchema), asyncHandler(async (req, res) => {
  const { nome, praca, cpf, endereco, cep, telefone, email, observacao } = req.body;
  
  try {
    await pool.query(
      `INSERT INTO rcas (nome, praca, cpf, endereco, cep, telefone, email, observacao) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [nome, praca, cpf, endereco, cep, telefone, email, observacao]
    );
    res.redirect(ROUTE);
  } catch (err) {
    if (err.code === '23505') return duplicateError(res, 'dados', ROUTE);
    throw err;
  }
}, ROUTE));

// POST /delete/:id - Excluir RCA
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const rca = await findById('rcas', id, 'nome');
  if (!rca) return notFound(res, 'RCA', ROUTE);
  
  // Verificar clientes vinculados
  const clientes = await countDependencies('clientes', 'rca_id', id);
  if (clientes > 0) return dependencyError(res, 'RCA', `${clientes} cliente(s)`, ROUTE);
  
  await pool.query('DELETE FROM rcas WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;