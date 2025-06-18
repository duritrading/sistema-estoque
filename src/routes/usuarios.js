const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { pool } = require('../config/database-postgres'); // Necessário para usar await

// GET /usuarios - Mostra a página com a lista e o formulário
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, nome_completo, ativo, ultimo_login, created_at 
      FROM usuarios 
      ORDER BY created_at DESC
    `);
    res.render('usuarios', {
      user: res.locals.user,
      usuarios: result.rows
    });
  } catch (error) {
    console.error('Erro buscar usuários:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// POST /usuarios - Processa o cadastro de um novo usuário
router.post('/', async (req, res) => {
    const { username, email, nome_completo, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(`
            INSERT INTO usuarios (username, email, password_hash, nome_completo)
            VALUES ($1, $2, $3, $4)
        `, [username, email, hashedPassword, nome_completo]);
        res.redirect('/usuarios');
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        res.status(500).send('Erro ao criar usuário. Verifique se o username ou e-mail já existem.');
    }
});

module.exports = router;