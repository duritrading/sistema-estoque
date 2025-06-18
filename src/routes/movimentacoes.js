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

// Dentro de src/routes/movimentacoes.js, substitua o router.get('/',...) antigo

router.get('/', async (req, res) => {
  // Criamos uma função auxiliar para transformar nosso db.all em uma Promise
  const queryPromise = (query, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  };

  try {
    const queryProdutos = 'SELECT * FROM produtos ORDER BY codigo';
    const queryFornecedores = 'SELECT * FROM fornecedores ORDER BY nome';
    const queryMovimentacoes = `
      SELECT 
        m.*,
        p.codigo,
        p.descricao,
        f.nome as fornecedor_nome,
        (SELECT MAX(cr.total_parcelas) FROM contas_a_receber cr WHERE cr.movimentacao_id = m.id) as total_parcelas
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      ORDER BY m.created_at DESC
      LIMIT 20
    `;

    // Executa todas as buscas ao banco de dados em paralelo
    const [produtos, fornecedores, movimentacoes] = await Promise.all([
      queryPromise(queryProdutos),
      queryPromise(queryFornecedores),
      queryPromise(queryMovimentacoes)
    ]);

    // Renderiza a página somente após ter todos os dados
    res.render('movimentacoes', {
      user: res.locals.user,
      produtos: produtos || [],
      fornecedores: fornecedores || [],
      movimentacoes: movimentacoes || []
    });

  } catch (error) {
    console.error('Erro ao carregar página de movimentações:', error);
    res.status(500).send('Erro ao carregar a página.');
  }
});

// Dentro de src/routes/movimentacoes.js

router.post('/', async (req, res) => {
  // 'vencimentos' é o array de datas que vem do formulário
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao, total_parcelas, vencimentos } = req.body;

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

    // Query SQL COMPLETA e CORRIGIDA
    const query = `
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, 
        preco_unitario, valor_total, documento, observacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    // Parâmetros COMPLETOS e CORRIGIDOS
    const params = [
      produto_id, fornecedor_id || null, cliente_nome || null, rca || null, 
      tipo, quantidade, preco_unitario || null, valor_total || null, 
      documento || null, observacao || null
    ];

    db.run(query, params, function(err) {
      if (err) {
          console.error('Erro ao inserir movimentação:', err);
          return res.status(500).send('Erro ao registrar movimentação.');
      }

      const movimentacaoId = this.lastID;
      if (!movimentacaoId) {
        console.error('Não foi possível obter o ID da movimentação inserida.');
        // Mesmo com erro na parcela, a movimentação foi feita, então redirecionamos.
        return res.redirect('/movimentacoes');
      }

      // Se for uma SAÍDA (venda), criar as contas a receber
      if (tipo === 'SAIDA' && valor_total > 0) {
        const numParcelas = parseInt(total_parcelas) || 0;
        // Garante que o valor da parcela seja calculado corretamente
        const valorCalculado = parseFloat(quantidade) * parseFloat(preco_unitario);
        const valorParcela = valorCalculado / numParcelas;

        if (vencimentos && numParcelas > 0) {
          for (let i = 0; i < numParcelas; i++) {
            const dataVencimento = vencimentos[i]; 

            if (dataVencimento) {
                db.run(`
                  INSERT INTO contas_a_receber (movimentacao_id, cliente_nome, numero_parcela, total_parcelas, valor, data_vencimento, status)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [movimentacaoId, cliente_nome, i + 1, numParcelas, valorParcela.toFixed(2), dataVencimento, 'Pendente'],
                (err) => {
                  if (err) console.error(`Erro ao criar parcela ${i + 1}:`, err);
                });
            }
          }
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