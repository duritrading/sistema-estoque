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

// ... (o código de router.get e router.post que já existe continua aqui em cima) ...

// NOVA ROTA PARA DELETAR UM FORNECEDOR
router.post('/delete/:id', (req, res) => {
  const { id } = req.params;

  // Primeiro, verifica se o fornecedor tem movimentações associadas
  db.get('SELECT COUNT(*) as count FROM movimentacoes WHERE fornecedor_id = ?', [id], (err, row) => {
    if (err) {
      console.error("Erro ao verificar fornecedor:", err);
      return res.status(500).send('Erro ao verificar uso do fornecedor.');
    }

    if (row.count > 0) {
      // Se estiver em uso, mostra uma página de erro amigável
      return res.render('error', {
          user: res.locals.user,
          titulo: 'Ação Bloqueada',
          mensagem: `Este fornecedor não pode ser excluído pois está associado a ${row.count} movimentação(ões) de entrada.`,
          voltar_url: '/fornecedores'
      });
    }

    // Se não estiver em uso, pode excluir
    db.run('DELETE FROM fornecedores WHERE id = ?', [id], (err) => {
      if (err) {
        console.error("Erro ao deletar fornecedor:", err);
        return res.status(500).send('Erro ao excluir fornecedor.');
      }
      // Redireciona de volta para a lista de fornecedores após excluir
      res.redirect('/fornecedores');
    });
  });
});

module.exports = router; // Esta linha já deve existir, o código novo vai acima dela