const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, nome_completo, ativo, ultimo_login, created_at FROM usuarios ORDER BY created_at DESC');
    res.render('usuarios', {
      user: res.locals.user,
      usuarios: result.rows || []
    });
  } catch (err) {
    res.status(500).send('Erro ao buscar usuários.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { username, email, nome_completo, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO usuarios (username, email, password_hash, nome_completo) VALUES ($1, $2, $3, $4)`;
    await pool.query(query, [username, email, hashedPassword, nome_completo]);
    res.redirect('/usuarios');
  } catch (err) {
    res.status(500).send('Erro ao criar usuário.');
  }
});

module.exports = router;