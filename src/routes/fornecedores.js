const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /fornecedores - Mostra a página com a lista e o formulário
router.get('/', (req, res) => {
  db.all('SELECT * FROM fornecedores ORDER BY nome', [], (err, fornecedores) => {
    if (err) {
      console.error('Erro buscar fornecedores:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    res.render('fornecedores', {
      user: res.locals.user,
      fornecedores: Array.isArray(fornecedores) ? fornecedores : []
    });
  });
});

// POST /fornecedores - Processa o cadastro de um novo fornecedor
router.post('/', (req, res) => {
  const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
  db.run(`
    INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [codigo, nome, contato, telefone, email, endereco, cnpj, observacao],
  function(err) {
    if (err) {
      console.error('Erro criar fornecedor:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/fornecedores');
  });
});

module.exports = router;