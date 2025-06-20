const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /contas-a-receber - Mostra apenas contas PENDENTES e A VENCER
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const hoje = new Date().toISOString().split('T')[0];
        let { data_inicio, data_fim } = req.query;

        // Datas padrão: de hoje até 60 dias para frente
        if (!data_inicio) data_inicio = hoje;
        if (!data_fim) {
            const dataFinalPadrao = new Date();
            dataFinalPadrao.setDate(dataFinalPadrao.getDate() + 60);
            data_fim = dataFinalPadrao.toISOString().split('T')[0];
        }

        const params = [data_inicio, data_fim];

        // QUERY ATUALIZADA: Agora busca apenas contas pendentes e com vencimento a partir de hoje
        const queryContas = `
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE 
                cr.status = 'Pendente' 
                AND cr.data_vencimento >= $1 
                AND cr.data_vencimento <= $2
            ORDER BY cr.data_vencimento ASC
        `;

        const [contasResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, params),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'RECEITA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows;
        const totalPendente = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas,
            categorias: categoriasResult.rows || [],
            filtros: { data_inicio, data_fim },
            totalPendente: totalPendente // Apenas o total pendente faz sentido aqui
        });
    } catch (error) {
        console.error('Erro ao buscar contas a receber:', error);
        return res.status(500).send('Erro ao carregar contas a receber.');
    }
});

// As outras rotas (POST '/', POST '/registrar-pagamento', etc.) continuam as mesmas

module.exports = router;