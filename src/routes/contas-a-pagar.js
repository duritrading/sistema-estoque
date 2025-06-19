const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /contas-a-pagar - Mostra a página
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const [contasResult, fornecedoresResult] = await Promise.all([
            pool.query(`
                SELECT cp.*, f.nome as fornecedor_nome 
                FROM contas_a_pagar cp
                LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
                ORDER BY cp.data_vencimento ASC
            `),
            pool.query('SELECT * FROM fornecedores ORDER BY nome')
        ]);

        res.render('contas-a-pagar', {
            user: res.locals.user,
            contas: contasResult.rows || [],
            fornecedores: fornecedoresResult.rows || []
        });
    } catch (error) {
        console.error('Erro ao buscar contas a pagar:', error);
        res.status(500).send('Erro ao carregar a página.');
    }
});

// Rota POST /contas-a-pagar - Cria uma nova conta a pagar
router.post('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { descricao, fornecedor_id, valor, data_vencimento } = req.body;
        const params = [descricao, fornecedor_id || null, parseFloat(valor), data_vencimento];
        await pool.query(
            'INSERT INTO contas_a_pagar (descricao, fornecedor_id, valor, data_vencimento) VALUES ($1, $2, $3, $4)',
            params
        );
        res.redirect('/contas-a-pagar');
    } catch(err) {
        console.error('Erro ao criar conta a pagar:', err);
        res.status(500).send('Erro ao criar conta.');
    }
});

// Rota POST /contas-a-pagar/pagar/:id - Registra o pagamento
router.post('/pagar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    const contaId = req.params.id;
    try {
        const conta = (await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId])).rows[0];
        if (!conta) return res.status(404).send('Conta não encontrada.');
        if (conta.status === 'Pago') return res.redirect('/contas-a-pagar');

        const dataPagamento = new Date().toISOString().split('T')[0];
        const descricaoFluxo = `Pagamento: ${conta.descricao}`;

        // Lança a saída no fluxo de caixa
        const fluxoResult = await pool.query(
            `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, 'DEBITO', $2, $3, $4, 'PAGO') RETURNING id`,
            [dataPagamento, conta.valor, descricaoFluxo, 6] // Categoria 6 = Despesas Operacionais (pode ser ajustado)
        );
        const fluxoCaixaId = fluxoResult.rows[0].id;

        // Atualiza o status da conta a pagar
        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [dataPagamento, fluxoCaixaId, contaId]
        );

        res.redirect('/contas-a-pagar');
    } catch (err) {
        console.error('Erro ao registrar pagamento:', err);
        res.status(500).send('Erro ao registrar pagamento.');
    }
});

module.exports = router;