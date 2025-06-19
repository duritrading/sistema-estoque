const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /rcas - Mostra a página de cadastro e listagem
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rcas ORDER BY nome');
    res.render('rcas', {
      user: res.locals.user,
      rcas: result.rows || []
    });
  } catch (err) {
    console.error("Erro ao buscar RCAs:", err);
    res.status(500).send('Erro ao buscar RCAs.');
  }
});

// Rota POST /rcas - Processa o cadastro de um novo RCA
router.post('/', async (req, res) => {
  try {
    const { nome, codigo, praca, telefone, email, observacao } = req.body;
    const query = `
        INSERT INTO rcas (nome, codigo, praca, telefone, email, observacao) 
        VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const params = [nome, codigo, praca, telefone, email, observacao];
    await pool.query(query, params);
    res.redirect('/rcas');
  } catch (err) {
    console.error("Erro ao criar RCA:", err);
    res.status(500).send('Erro ao criar RCA.');
  }
});

module.exports = router;