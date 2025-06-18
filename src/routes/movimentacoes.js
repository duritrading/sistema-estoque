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

// Dentro de src/routes/movimentacoes.js

router.post('/', async (req, res) => {
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao, total_parcelas } = req.body;

  try {
    if (tipo === 'SAIDA') { /* ... (verificação de saldo) ... */ }

    // Comando SQL corrigido com "RETURNING id" no final
    const query = `
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, 
        preco_unitario, valor_total, documento, observacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const params = [
      produto_id, fornecedor_id || null, cliente_nome || null, rca || null, 
      tipo, quantidade, preco_unitario || null, valor_total || null, 
      documento || null, observacao || null
    ];

    db.run(query, params, function(err) {
      if (err) {
          console.error('Erro ao inserir movimentação:', err);
          return res.status(500).send('Erro: ' + err.message);
      }

      const movimentacaoId = this.lastID;
      if (!movimentacaoId) {
          console.error('Não foi possível obter o ID da movimentação inserida.');
          return res.redirect('/movimentacoes');
      }

      if (tipo === 'SAIDA' && valor_total > 0) {
        // ... (o restante da lógica para criar as parcelas continua o mesmo) ...
        const numParcelas = parseInt(total_parcelas) || 1;
        const valorParcela = valor_total / numParcelas;
        const hoje = new Date();

        for (let i = 1; i <= numParcelas; i++) {
          const dataVencimento = new Date(hoje);
          dataVencimento.setDate(hoje.getDate() + (i * 30));

          db.run(`
            INSERT INTO contas_a_receber (movimentacao_id, cliente_nome, numero_parcela, total_parcelas, valor, data_vencimento, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [movimentacaoId, cliente_nome, i, numParcelas, valorParcela.toFixed(2), dataVencimento.toISOString().split('T')[0], 'Pendente'],
          (err) => {
            if (err) console.error(`Erro ao criar parcela ${i}:`, err);
          });
        }
      }

      return res.redirect('/movimentacoes');
    });
  } catch (error) {
    console.error('Erro geral no POST /movimentacoes:', error);
    return res.status(500).send('Erro: ' + error.message);
  }
});

module.exports = router;