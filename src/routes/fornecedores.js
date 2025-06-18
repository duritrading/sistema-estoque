const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fornecedores ORDER BY nome');
    res.render('fornecedores', {
      user: res.locals.user,
      fornecedores: result.rows || []
    });
  } catch (err) {
    res.status(500).send('Erro ao buscar fornecedores.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
    const query = `INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    await pool.query(query, [codigo, nome, contato, telefone, email, endereco, cnpj, observacao]);
    res.redirect('/fornecedores');
  } catch (err) {
    res.status(500).send('Erro ao criar fornecedor.');
  }
});

router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT COUNT(*) as count FROM movimentacoes WHERE fornecedor_id = $1', [id]);
    if (check.rows[0].count > 0) {
      return res.render('error', { user: res.locals.user, titulo: 'Ação Bloqueada', mensagem: 'Este fornecedor não pode ser excluído pois possui movimentações associadas.' });
    }
    await pool.query('DELETE FROM fornecedores WHERE id = $1', [id]);
    res.redirect('/fornecedores');
  } catch (err) {
    res.status(500).send('Erro ao excluir fornecedor.');
  }
});

module.exports = router;