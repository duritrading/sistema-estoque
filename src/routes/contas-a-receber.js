const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET - Mostra a página
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        let { data_inicio, data_fim } = req.query;
        if (!data_inicio) {
            const hoje = new Date();
            data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!data_fim) {
            const hoje = new Date();
            data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
        }
        
        const queryContas = `
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.data_vencimento >= $1 AND cr.data_vencimento <= $2
            ORDER BY cr.data_vencimento ASC
        `;
        
        const [contasResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, [data_inicio, data_fim]),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'RECEITA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows;
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const totalPendente = contas.filter(c => c.status !== 'Pago').reduce((sum, c) => sum + parseFloat(c.valor), 0);

        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas || [],
            categorias: categoriasResult.rows || [],
            filtros: { data_inicio, data_fim },
            totalValor,
            totalPendente
        });
    } catch (error) {
        res.status(500).send('Erro ao carregar contas a receber.');
    }
});

// ROTA POST /faturamento/registrar-pagamento/:id - Processa o pagamento
router.post('/registrar-pagamento/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    const contaId = req.params.id;
    const dataPagamento = new Date().toISOString().split('T')[0];
    
    try {
        const contaResult = await pool.query(`
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            JOIN movimentacoes m ON cr.movimentacao_id = m.id
            JOIN produtos p ON m.produto_id = p.id
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        if (!conta) return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a receber não encontrada.' });
        if (conta.status === 'Pago') return res.redirect('/faturamento');

        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
            RETURNING id
        `, [dataPagamento, conta.valor, descricaoFluxo, 1]); // Categoria 1 = Receita de Vendas

        const fluxoCaixaId = insertResult.rows[0].id;

        await pool.query(
            `UPDATE contas_a_receber SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [dataPagamento, fluxoCaixaId, contaId]
        );
        
        res.redirect('/faturamento');
    } catch (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Não foi possível registrar o pagamento.' });
    }
});

module.exports = router;