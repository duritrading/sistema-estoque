const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /clientes - Agora busca clientes, seus RCAs associados e a lista de todos os RCAs
router.get('/', async (req, res) => {
  try {
    // Busca clientes e o nome do RCA associado usando um LEFT JOIN
    const clientesQuery = `
      SELECT c.*, r.nome as rca_nome 
      FROM clientes c
      LEFT JOIN rcas r ON c.rca_id = r.id
      ORDER BY c.nome
    `;
    // Busca todos os RCAs para popular o formulário
    const rcasQuery = 'SELECT id, nome FROM rcas ORDER BY nome';

    const [clientesResult, rcasResult] = await Promise.all([
      pool.query(clientesQuery),
      pool.query(rcasQuery)
    ]);

    res.render('clientes', {
      user: res.locals.user,
      clientes: clientesResult.rows || [],
      rcas: rcasResult.rows || []
    });
  } catch (err) {
    console.error("Erro ao buscar clientes:", err);
    res.status(500).send('Erro ao buscar clientes.');
  }
});

// Rota POST /clientes - Agora salva também o rca_id
router.post('/', async (req, res) => {
  try {
    const { nome, cpf, endereco, cep, telefone, email, observacao, rca_id } = req.body;
    const query = `
        INSERT INTO clientes (nome, cpf, endereco, cep, telefone, email, observacao, rca_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    // rca_id pode ser nulo se nenhum for selecionado
    const params = [nome, cpf, endereco, cep, telefone, email, observacao, rca_id || null];
    await pool.query(query, params);
    res.redirect('/clientes');
  } catch (err) {
    console.error("Erro ao criar cliente:", err);
    res.status(500).send('Erro ao criar cliente.');
  }
});

// Rota para EXCLUIR um cliente
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const clienteResult = await pool.query('SELECT nome FROM clientes WHERE id = $1', [id]);
    if (clienteResult.rows.length === 0) {
      return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Cliente não encontrado.' });
    }
    const clienteNome = clienteResult.rows[0].nome;

    // Verifica se o cliente está em uso em movimentações
    const check = await pool.query(`SELECT COUNT(*) as count FROM movimentacoes WHERE cliente_nome = $1`, [clienteNome]);

    if (check.rows[0].count > 0) {
      return res.render('error', {
          user: res.locals.user,
          titulo: 'Ação Bloqueada',
          mensagem: `Este cliente não pode ser excluído pois está associado a ${check.rows[0].count} movimentação(ões).`,
          voltar_url: '/clientes'
      });
    }

    await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    res.redirect('/clientes');
  } catch (err) {
    console.error("Erro ao excluir cliente:", err);
    res.status(500).send('Erro ao excluir cliente.');
  }
});

module.exports = router;