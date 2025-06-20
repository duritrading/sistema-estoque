const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /contas-a-receber - Agora apenas mostra o relatório
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

        const params = [data_inicio, data_fim];
        const query = `
            SELECT 
              cr.id, cr.cliente_nome, cr.numero_parcela, cr.total_parcelas, cr.valor, 
              cr.data_vencimento, cr.status, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.data_vencimento >= $1 AND cr.data_vencimento <= $2
            ORDER BY cr.data_vencimento ASC
        `;

        const result = await pool.query(query, params);
        const contas = result.rows;

        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const totalPendente = contas.filter(c => c.status !== 'Pago').reduce((sum, c) => sum + parseFloat(c.valor), 0);

        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas,
            filtros: { data_inicio, data_fim },
            totalValor: totalValor,
            totalPendente: totalPendente
        });
    } catch (error) {
        console.error('Erro ao buscar contas a receber:', error);
        return res.status(500).send('Erro ao buscar dados de faturamento.');
    }
});

// A rota POST para criar contas manualmente foi REMOVIDA

// A rota POST para registrar o pagamento continua aqui
router.post('/registrar-pagamento/:id', async (req, res) => {
    // ... (o código desta rota continua o mesmo)
});

// A rota POST para excluir contas manuais pode ser mantida ou removida
router.post('/delete/:id', async (req, res) => {
  // ... (o código desta rota continua o mesmo)
});

module.exports = router;