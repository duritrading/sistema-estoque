const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET

router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        // Lógica para pegar as datas do filtro ou usar datas padrão
        let { data_inicio, data_fim } = req.query;
        if (!data_inicio) {
            const hoje = new Date();
            data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!data_fim) {
            const hoje = new Date();
            data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        const params = [data_inicio, data_fim];
        // Query de contas a pagar agora com filtro de data de vencimento
        const queryContas = `
            SELECT cp.*, f.nome as fornecedor_nome, cf.nome as categoria_nome 
            FROM contas_a_pagar cp
            LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
            LEFT JOIN categorias_financeiras cf ON cp.categoria_id = cf.id
            WHERE cp.data_vencimento >= $1 AND cp.data_vencimento <= $2
            ORDER BY cp.data_vencimento ASC
        `;

        const [contasResult, fornecedoresResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, params),
            pool.query('SELECT * FROM fornecedores ORDER BY nome'),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'DESPESA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows || [];

        // Os totais agora são calculados com base nos resultados filtrados
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const totalPendente = contas
            .filter(conta => conta.status !== 'Pago')
            .reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

        res.render('contas-a-pagar', {
            user: res.locals.user,
            contas: contas,
            fornecedores: fornecedoresResult.rows || [],
            categorias: categoriasResult.rows || [],
            filtros: { data_inicio, data_fim },
            totalValor: totalValor,
            totalPendente: totalPendente
        });
    } catch (error) {
        console.error('Erro ao buscar contas a pagar:', error);
        res.status(500).send('Erro ao carregar a página.');
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