const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createFornecedorSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, dependencyError, handleDbError } = require('../utils/helpers');
const { findById, findAll, countDependencies } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/fornecedores';

// GET / - Listar fornecedores
router.get('/', asyncHandler(async (req, res) => {
  const fornecedores = await findAll('fornecedores', 'nome');
  res.render('fornecedores', { user: res.locals.user, fornecedores });
}, ROUTE));

// POST / - Criar fornecedor
router.post('/', validateBody(createFornecedorSchema), asyncHandler(async (req, res) => {
  const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
  
  await pool.query(
    `INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [codigo, nome, contato, telefone, email, endereco, cnpj, observacao]
  );
  
  res.redirect(ROUTE);
}, ROUTE));

// POST /delete/:id - Excluir fornecedor
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Verificar existência
  const fornecedor = await findById('fornecedores', id, 'nome');
  if (!fornecedor) return notFound(res, 'Fornecedor', ROUTE);
  
  // Verificar dependências
  const movs = await countDependencies('movimentacoes', 'fornecedor_id', id);
  if (movs > 0) return dependencyError(res, 'Fornecedor', `${movs} movimentação(ões)`, ROUTE);
  
  const contas = await countDependencies('contas_a_pagar', 'fornecedor_id', id);
  if (contas > 0) return dependencyError(res, 'Fornecedor', `${contas} conta(s) a pagar`, ROUTE);
  
  // Excluir
  await pool.query('DELETE FROM fornecedores WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;