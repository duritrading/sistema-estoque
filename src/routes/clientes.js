const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /clientes - Mostra a página com a lista e o formulário de clientes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clientes ORDER BY nome');
    res.render('clientes', {
      user: res.locals.user,
      clientes: result.rows || []
    });
  } catch (err) {
    console.error("Erro ao buscar clientes:", err);
    res.status(500).send('Erro ao buscar clientes.');
  }
});

// Rota POST /clientes - Processa o cadastro de um novo cliente
router.post('/', async (req, res) => {
  try {
    const { codigo, nome, contato, telefone, email, endereco, cpf_cnpj, observacao } = req.body;
    const query = `
        INSERT INTO clientes (codigo, nome, contato, telefone, email, endereco, cpf_cnpj, observacao) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const params = [codigo, nome, contato, telefone, email, endereco, cpf_cnpj, observacao];
    await pool.query(query, params);
    res.redirect('/clientes');
  } catch (err) {
    console.error("Erro ao criar cliente:", err);
    res.status(500).send('Erro ao criar cliente.');
  }
});

// No futuro, podemos adicionar a rota de exclusão aqui
// router.post('/delete/:id', ...);

module.exports = router;