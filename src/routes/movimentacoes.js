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
    const [produtosResult, fornecedoresResult, movimentacoesResult] = await Promise.all([
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
      `)
    ]);

    res.render('movimentacoes', {
      user: res.locals.user,
      produtos: produtosResult.rows || [],
      fornecedores: fornecedoresResult.rows || [],
      movimentacoes: movimentacoesResult.rows || []
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar a página.');
  }
});

router.post('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao, total_parcelas, vencimentos } = req.body;
        
        if (tipo === 'SAIDA') {
            const saldo = await getSaldoProduto(produto_id);
            if (saldo < parseFloat(quantidade)) {
                return res.render('error', { user: res.locals.user, titulo: 'Estoque Insuficiente', mensagem: `Saldo atual: ${saldo}, Quantidade solicitada: ${quantidade}.` });
            }
        }

        const movQuery = `INSERT INTO movimentacoes (produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`;
        const movParams = [produto_id, fornecedor_id || null, cliente_nome || null, rca || null, tipo, quantidade, preco_unitario || null, valor_total || null, documento || null, observacao];
        const movResult = await pool.query(movQuery, movParams);
        const movimentacaoId = movResult.rows[0].id;

        if (tipo === 'SAIDA' && valor_total > 0 && vencimentos) {
            const numParcelas = parseInt(total_parcelas) || 0;
            const valorParcela = parseFloat(valor_total) / numParcelas;

            for (let i = 0; i < numParcelas; i++) {
                await pool.query(`INSERT INTO contas_a_receber (movimentacao_id, cliente_nome, numero_parcela, total_parcelas, valor, data_vencimento, status) VALUES ($1, $2, $3, $4, $5, $6, 'Pendente')`, [movimentacaoId, cliente_nome, i + 1, numParcelas, valorParcela.toFixed(2), vencimentos[i]]);
            }
        }
        res.redirect('/movimentacoes');
    } catch (err) {
        res.status(500).send('Erro ao registrar movimentação.');
    }
});

module.exports = router;