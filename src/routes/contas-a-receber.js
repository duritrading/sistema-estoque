const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const hoje = new Date().toISOString().split('T')[0];

        // QUERY ATUALIZADA: Agora busca apenas contas pendentes e com vencimento futuro
        const queryContas = `
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.status = 'Pendente' AND cr.data_vencimento >= $1
            ORDER BY cr.data_vencimento ASC
        `;

        const [contasResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, [hoje]),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'RECEITA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows;
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas || [],
            categorias: categoriasResult.rows || [],
            totalPendente: totalValor // O total agora é apenas o pendente
        });
    } catch (error) {
        console.error('Erro ao buscar contas a receber:', error);
        res.status(500).send('Erro ao carregar contas a receber.');
    }
});