// Em src/routes/contas-a-receber.js

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

        // LÓGICA DE CÁLCULO QUE ESTAVA FALTANDO
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const totalPendente = contas.filter(c => c.status !== 'Pago').reduce((sum, c) => sum + parseFloat(c.valor), 0);

        // RENDER CORRIGIDO, ENVIANDO OS TOTAIS
        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas || [],
            categorias: categoriasResult.rows || [],
            filtros: { data_inicio, data_fim },
            totalValor: totalValor,
            totalPendente: totalPendente
        });
    } catch (error) {
        console.error("Erro ao carregar contas a receber:", error);
        res.status(500).send('Erro ao carregar contas a receber.');
    }
});