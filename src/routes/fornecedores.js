const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

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

// POST /fornecedores - Processa o cadastro de um novo fornecedor (ESTAVA FALTANDO)
router.post('/', (req, res) => {
  const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
  const query = `
    INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `;
  const params = [codigo, nome, contato, telefone, email, endereco, cnpj, observacao];

  db.run(query, params, function(err) {
    if (err) {
      console.error('Erro criar fornecedor:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/fornecedores');
  });
});


// POST /delete/:id - Deleta um fornecedor (COM QUERY CORRIGIDA)
router.post('/delete/:id', (req, res) => {
  const { id } = req.params;

  // Query corrigida para usar $1 em vez de ?
  db.get('SELECT COUNT(*) as count FROM movimentacoes WHERE fornecedor_id = $1', [id], (err, row) => {
    if (err) {
      console.error("Erro ao verificar fornecedor:", err);
      // Mensagem de erro que você viu
      return res.status(500).send('Erro ao verificar uso do fornecedor.');
    }

    if (row.count > 0) {
      return res.render('error', {
          user: res.locals.user,
          titulo: 'Ação Bloqueada',
          mensagem: `Este fornecedor não pode ser excluído pois está associado a ${row.count} movimentação(ões) de entrada.`,
          voltar_url: '/fornecedores'
      });
    }

    // Query corrigida para usar $1 em vez de ?
    db.run('DELETE FROM fornecedores WHERE id = $1', [id], (err) => {
      if (err) {
        console.error("Erro ao deletar fornecedor:", err);
        return res.status(500).send('Erro ao excluir fornecedor.');
      }
      res.redirect('/fornecedores');
    });
  });
});

module.exports = router;