const express = require('express');
const router = express.Router();
// Esta linha pode precisar de ajuste dependendo de onde você exporta o 'db'
// Se o seu 'db' está em /src/config/database.js, este caminho está correto.
const db = require('../config/database'); 

function getSaldoProduto(produtoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(
        CASE WHEN tipo = 'ENTRADA' THEN quantidade 
             WHEN tipo = 'SAIDA' THEN -quantidade 
             ELSE 0 END
      ), 0) as saldo 
      FROM movimentacoes 
      WHERE produto_id = $1`,
      [produtoId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.saldo : 0);
      }
    );
  });
}

router.get('/', (req, res) => {
  db.all('SELECT * FROM produtos ORDER BY codigo', [], (err, produtos) => {
    if (err) return res.status(500).send('Erro: ' + err.message);
    db.all('SELECT * FROM fornecedores ORDER BY nome', [], (err2, fornecedores) => {
      if (err2) return res.status(500).send('Erro: ' + err2.message);
      db.all(`
        SELECT m.*, p.codigo, p.descricao, f.nome as fornecedor_nome
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY m.created_at DESC LIMIT 20
      `, [], (err3, movimentacoes) => {
        if (err3) return res.status(500).send('Erro: ' + err3.message);

        res.render('movimentacoes', {
          user: res.locals.user,
          produtos: Array.isArray(produtos) ? produtos : [],
          fornecedores: Array.isArray(fornecedores) ? fornecedores : [],
          movimentacoes: Array.isArray(movimentacoes) ? movimentacoes : []
        });
      });
    });
  });
});

router.post('/', async (req, res) => {
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao } = req.body;
  try {
    if (tipo === 'SAIDA') {
      const saldo = await getSaldoProduto(produto_id);
      if (saldo < quantidade) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Estoque Insuficiente',
            mensagem: `Não foi possível registrar a saída. Saldo atual: ${saldo}, Quantidade solicitada: ${quantidade}.`,
            voltar_url: '/movimentacoes'
        });
      }
    }
    db.run(`
      INSERT INTO movimentacoes (produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [produto_id, fornecedor_id || null, cliente_nome || null, rca || null, tipo, quantidade, preco_unitario || null, valor_total || null, documento || null, observacao || null], 
    function(err) {
      if (err) return res.status(500).send('Erro: ' + err.message);
      return res.redirect('/movimentacoes');
    });
  } catch (error) {
    return res.status(500).send('Erro: ' + error.message);
  }
});

module.exports = router;