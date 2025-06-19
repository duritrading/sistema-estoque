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
    const { nome, praca, cpf, endereco, cep, telefone, email, observacao } = req.body;
    const query = `
        INSERT INTO rcas (nome, praca, cpf, endereco, cep, telefone, email, observacao) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const params = [nome, praca, cpf, endereco, cep, telefone, email, observacao];
    await pool.query(query, params);
    res.redirect('/rcas');
  } catch (err) {
    console.error("Erro ao criar RCA:", err);
    res.status(500).send('Erro ao criar RCA.');
  }
});

// NOVA ROTA PARA EXCLUIR UM RCA
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Primeiro, pega o nome do RCA que será excluído
    const rcaResult = await pool.query('SELECT nome FROM rcas WHERE id = $1', [id]);
    if (rcaResult.rows.length === 0) {
      return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'RCA não encontrado.' });
    }
    const rcaNome = rcaResult.rows[0].nome;

    // Em seguida, verifica se esse nome de RCA está em uso na tabela de movimentações
    const check = await pool.query('SELECT COUNT(*) as count FROM movimentacoes WHERE rca = $1', [rcaNome]);

    if (check.rows[0].count > 0) {
      return res.render('error', {
          user: res.locals.user,
          titulo: 'Ação Bloqueada',
          mensagem: `Este RCA não pode ser excluído pois está associado a ${check.rows[0].count} movimentação(ões).`,
          voltar_url: '/rcas'
      });
    }

    // Se não estiver em uso, exclui o RCA
    await pool.query('DELETE FROM rcas WHERE id = $1', [id]);
    res.redirect('/rcas');
  } catch (err) {
    console.error("Erro ao excluir RCA:", err);
    res.status(500).send('Erro ao excluir RCA.');
  }
});

module.exports = router;