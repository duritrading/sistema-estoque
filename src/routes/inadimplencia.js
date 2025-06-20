const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /inadimplencia - Mostra o relatório de contas vencidas
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const hoje = new Date().toISOString().split('T')[0];

        // Query que busca apenas contas com status Pendente e data de vencimento no passado
        const query = `
    SELECT 
        cr.id, cr.cliente_nome, cr.numero_parcela, cr.total_parcelas, cr.valor, 
        cr.data_vencimento, cr.movimentacao_id, p.descricao as produto_descricao
    FROM contas_a_receber cr
    LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
    LEFT JOIN produtos p ON m.produto_id = p.id
    WHERE 
        cr.status = 'Pendente' 
        AND cr.data_vencimento < $1
    ORDER BY cr.data_vencimento ASC
`;

        const result = await pool.query(query, [hoje]);
        const contasVencidas = result.rows;

        const totalInadimplencia = contasVencidas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

        res.render('inadimplencia', {
            user: res.locals.user,
            contas: contasVencidas,
            totalInadimplencia: totalInadimplencia
        });
    } catch (error) {
        console.error('Erro ao buscar inadimplência:', error);
        return res.status(500).send('Erro ao buscar dados de inadimplência.');
    }
});

module.exports = router;