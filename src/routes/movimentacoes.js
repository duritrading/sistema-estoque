const express = require('express');
const router = express.Router();
const pool = require('../config/database');

async function getSaldoProduto(produtoId) {
    if (!pool) throw new Error("Database pool not configured");
    const result = await pool.query(`
        SELECT COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade WHEN tipo = 'SAIDA' THEN -quantidade ELSE 0 END), 0) as saldo 
        FROM movimentacoes WHERE produto_id = $1
    `, [produtoId]);
    return result.rows[0] ? parseFloat(result.rows[0].saldo) : 0;
}

router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const [produtosResult, fornecedoresResult, movimentacoesResult, rcasResult] = await Promise.all([
      pool.query('SELECT * FROM produtos ORDER BY codigo'),
      pool.query('SELECT * FROM fornecedores ORDER BY nome'),
      pool.query(`
        SELECT m.*, p.codigo, p.descricao, f.nome as fornecedor_nome, 
               (SELECT MAX(cr.total_parcelas) FROM contas_a_receber cr WHERE cr.movimentacao_id = m.id) as total_parcelas
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY m.created_at DESC
        LIMIT 20
      `),
      pool.query('SELECT nome FROM rcas ORDER BY nome')
    ]);

    res.render('movimentacoes', {
      user: res.locals.user,
      produtos: produtosResult.rows || [],
      fornecedores: fornecedoresResult.rows || [],
      movimentacoes: movimentacoesResult.rows || [],
      rcas: rcasResult.rows || []
    });
  } catch (error) {
    console.error("Erro ao carregar página de movimentações:", error);
    res.status(500).send('Erro ao carregar a página.');
  }
});

router.post('/', async (req, res) => {
    // ... (código do POST para criar movimentação continua o mesmo) ...
});

// NOVA ROTA PARA EXCLUIR UMA MOVIMENTAÇÃO
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // A cláusula ON DELETE CASCADE no banco de dados cuidará de apagar as contas_a_receber associadas.
    await pool.query('DELETE FROM movimentacoes WHERE id = $1', [id]);

    res.redirect('/movimentacoes');
  } catch (err) {
    console.error("Erro ao excluir movimentação:", err);
    res.status(500).send('Erro ao excluir movimentação.');
  }
});

module.exports = router;