// src/routes/usuarios.js - REFATORADO
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createUserSchema } = require('../schemas/validation.schemas');
const { idParamSchema, duplicateError } = require('../utils/helpers');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/usuarios';

// GET / - Listar usuários
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, email, nome_completo, ativo, ultimo_login, created_at FROM usuarios ORDER BY created_at DESC'
  );
  res.render('usuarios', { user: res.locals.user, usuarios: result.rows });
}, ROUTE));

// POST / - Criar usuário
router.post('/', validateBody(createUserSchema), asyncHandler(async (req, res) => {
  const { username, email, nome_completo, password } = req.body;
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (username, email, password_hash, nome_completo) VALUES ($1, $2, $3, $4)',
      [username, email, hashedPassword, nome_completo]
    );
    res.redirect(ROUTE);
  } catch (err) {
    if (err.code === '23505') return duplicateError(res, 'username ou email', ROUTE);
    throw err;
  }
}, ROUTE));

// POST /toggle/:id - Ativar/Desativar usuário
router.post('/toggle/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query('UPDATE usuarios SET ativo = NOT ativo WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;