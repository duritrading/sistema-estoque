const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET /contas-a-pagar - Mostra a página, agora buscando também as categorias
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const [contasResult, fornecedoresResult, categoriasResult] = await Promise.all([
            pool.query(`
                SELECT cp.*, f.nome as fornecedor_nome, cf.nome as categoria_nome 
                FROM contas_a_pagar cp
                LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
                LEFT JOIN categorias_financeiras cf ON cp.categoria_id = cf.id
                ORDER BY cp.data_vencimento ASC
            `),
            pool.query('SELECT * FROM fornecedores ORDER BY nome'),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'DESPESA' ORDER BY nome`)
        ]);

        res.render('contas-a-pagar', {
            user: res.locals.user,
            contas: contasResult.rows || [],
            fornecedores: fornecedoresResult.rows || [],
            categorias: categoriasResult.rows || []
        });
    } catch (error) {
        console.error('Erro ao buscar contas a pagar:', error);
        res.status(500).send('Erro ao carregar a página.');
    }
});

// POST /contas-a-pagar - Cria uma nova conta a pagar, agora com categoria
router.post('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { descricao, fornecedor_id, valor, data_vencimento, categoria_id } = req.body;
        const params = [descricao, fornecedor_id || null, parseFloat(valor), data_vencimento, categoria_id];
        await pool.query(
            'INSERT INTO contas_a_pagar (descricao, fornecedor_id, valor, data_vencimento, categoria_id) VALUES ($1, $2, $3, $4, $5)',
            params
        );
        res.redirect('/contas-a-pagar');
    } catch(err) {
        console.error('Erro ao criar conta a pagar:', err);
        res.status(500).send('Erro ao criar conta.');
    }
});

// POST /contas-a-pagar/pagar/:id - Registra o pagamento usando a categoria correta
router.post('/pagar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    const contaId = req.params.id;
    try {
        const conta = (await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId])).rows[0];
        if (!conta) return res.status(404).send('Conta não encontrada.');
        if (conta.status === 'Pago') return res.redirect('/contas-a-pagar');

        const dataPagamento = new Date().toISOString().split('T')[0];
        const descricaoFluxo = `Pagamento: ${conta.descricao}`;

        // Lança a saída no fluxo de caixa usando a categoria da conta
        const fluxoResult = await pool.query(
            `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, 'DEBITO', $2, $3, $4, 'PAGO') RETURNING id`,
            [dataPagamento, conta.valor, descricaoFluxo, conta.categoria_id]
        );
        const fluxoCaixaId = fluxoResult.rows[0].id;

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

// NOVA ROTA PARA ESTORNAR UM PAGAMENTO

router.post('/estornar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    const contaId = req.params.id;
    try {
        const contaResult = await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId]);
        const conta = contaResult.rows[0];

        if (!conta) {
            return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a pagar não encontrada.'});
        }
        if (conta.status !== 'Pago') {
            return res.redirect('/contas-a-pagar');
        }

        // PASSO 1 (NOVO): Atualiza a conta a pagar PRIMEIRO, removendo a referência ao fluxo_caixa_id.
        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL WHERE id = $1`,
            [contaId]
        );

        // PASSO 2 (NOVO): Se a conta tinha um lançamento no caixa associado, deleta ele DEPOIS.
        if (conta.fluxo_caixa_id) {
            await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [conta.fluxo_caixa_id]);
        }

        res.redirect('/contas-a-pagar');
    } catch (err) {
        console.error('Erro ao estornar pagamento:', err);
        res.status(500).send('Erro ao estornar pagamento.');
    }
});
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;

        // Medida de segurança: só permite excluir contas que ainda não foram pagas.
        const conta = (await pool.query('SELECT status FROM contas_a_pagar WHERE id = $1', [id])).rows[0];
        if (conta && conta.status === 'Pago') {
            return res.render('error', { user: res.locals.user, titulo: 'Ação Bloqueada', mensagem: 'Não é possível excluir uma conta que já foi paga. Você deve estornar o pagamento primeiro.' });
        }

        await pool.query('DELETE FROM contas_a_pagar WHERE id = $1', [id]);
        res.redirect('/contas-a-pagar');
    } catch (err) {
        console.error("Erro ao excluir conta a pagar:", err);
        res.status(500).send('Erro ao excluir conta a pagar.');
    }
});

module.exports = router;