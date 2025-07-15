// src/routes/dashboard.js - Dashboard corrigido com métricas reais
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        // Obter datas dos filtros ou usar padrão do mês atual
        const { dataInicial, dataFinal } = req.query;
        
        let inicioMes, fimMes;
        if (dataInicial && dataFinal) {
            inicioMes = new Date(dataInicial);
            fimMes = new Date(dataFinal);
        } else {
            const hoje = new Date();
            inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        }
        
        const inicioMesPassado = new Date(inicioMes);
        inicioMesPassado.setMonth(inicioMesPassado.getMonth() - 1);
        const fimMesPassado = new Date(fimMes);
        fimMesPassado.setMonth(fimMesPassado.getMonth() - 1);

        const dashboardData = {};

        // 1. FATURAMENTO DO MÊS (Vendas/Saídas)
        const [faturamentoAtual, faturamentoAnterior] = await Promise.all([
            pool.query(`
                SELECT COALESCE(SUM(valor_total), 0) as total
                FROM movimentacoes 
                WHERE tipo = 'SAIDA' 
                AND created_at >= $1 AND created_at <= $2
            `, [inicioMes, fimMes]),
            
            pool.query(`
                SELECT COALESCE(SUM(valor_total), 0) as total
                FROM movimentacoes 
                WHERE tipo = 'SAIDA' 
                AND created_at >= $1 AND created_at <= $2
            `, [inicioMesPassado, fimMesPassado])
        ]);

        dashboardData.faturamentoMes = parseFloat(faturamentoAtual.rows[0].total);
        dashboardData.faturamentoMesPassado = parseFloat(faturamentoAnterior.rows[0].total);
        dashboardData.crescimentoFaturamento = dashboardData.faturamentoMesPassado > 0 
            ? ((dashboardData.faturamentoMes - dashboardData.faturamentoMesPassado) / dashboardData.faturamentoMesPassado * 100).toFixed(1)
            : 0;

        // 2. LUCRO DO MÊS (Receitas - Despesas do Fluxo de Caixa)
        const lucroResult = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as receitas,
                COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as despesas
            FROM fluxo_caixa 
            WHERE status = 'PAGO'
            AND data_operacao >= $1 AND data_operacao <= $2
        `, [inicioMes, fimMes]);

        const receitas = parseFloat(lucroResult.rows[0].receitas);
        const despesas = parseFloat(lucroResult.rows[0].despesas);
        dashboardData.lucroMes = receitas - despesas;
        dashboardData.margemLucro = dashboardData.faturamentoMes > 0 
            ? ((dashboardData.lucroMes / dashboardData.faturamentoMes) * 100).toFixed(1)
            : 0;

        // 3. FLUXO DE CAIXA (Realizado no mês)
        dashboardData.fluxoCaixa = {
            entradas: receitas,
            saidas: despesas,
            saldo: receitas - despesas
        };

        // 4. CONTAS VENCIDAS (Contas a Receber em atraso)
        const contasVencidasResult = await pool.query(`
            SELECT 
                COUNT(*) as quantidade,
                COALESCE(SUM(valor), 0) as total
            FROM contas_a_receber 
            WHERE status = 'Pendente' 
            AND data_vencimento < CURRENT_DATE
        `);

        dashboardData.contasVencidas = {
            quantidade: parseInt(contasVencidasResult.rows[0].quantidade),
            total: parseFloat(contasVencidasResult.rows[0].total)
        };

        // 5. PRODUTOS COM ESTOQUE BAIXO
        const produtosBaixoEstoque = await pool.query(`
            SELECT 
                p.codigo,
                p.descricao,
                p.estoque_minimo,
                COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                                 WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                                 ELSE 0 END), 0) as saldo_atual
            FROM produtos p
            LEFT JOIN movimentacoes m ON p.id = m.produto_id
            GROUP BY p.id, p.codigo, p.descricao, p.estoque_minimo
            HAVING COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                                   WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                                   ELSE 0 END), 0) <= p.estoque_minimo
            ORDER BY saldo_atual ASC
            LIMIT 5
        `);

        dashboardData.produtosBaixoEstoque = produtosBaixoEstoque.rows;

        // 6. TOP PRODUTOS VENDIDOS (mês atual)
        const topProdutos = await pool.query(`
            SELECT 
                p.codigo,
                p.descricao,
                SUM(m.quantidade) as total_vendido,
                SUM(m.valor_total) as faturamento_produto
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            WHERE m.tipo = 'SAIDA'
            AND m.created_at >= $1 AND m.created_at <= $2
            GROUP BY p.id, p.codigo, p.descricao
            ORDER BY total_vendido DESC
            LIMIT 5
        `, [inicioMes, fimMes]);

        dashboardData.topProdutos = topProdutos.rows;

        // 7. RESUMO ENTREGAS (se existir tabela)
        try {
            const entregasResult = await pool.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
                    COUNT(CASE WHEN status = 'ENTREGUE' THEN 1 END) as entregues
                FROM entregas 
                WHERE data_entrega >= $1 AND data_entrega <= $2
            `, [inicioMes, fimMes]);
            
            dashboardData.entregas = entregasResult.rows[0];
        } catch (err) {
            dashboardData.entregas = { total: 0, pendentes: 0, entregues: 0 };
        }

        // 8. INADIMPLÊNCIA
        const inadimplenciaResult = await pool.query(`
            SELECT 
                COUNT(*) as clientes_inadimplentes,
                COALESCE(SUM(valor), 0) as valor_total,
                COUNT(CASE WHEN data_vencimento < CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as mais_30_dias
            FROM contas_a_receber 
            WHERE status = 'Pendente' 
            AND data_vencimento < CURRENT_DATE
        `);

        dashboardData.inadimplencia = inadimplenciaResult.rows[0];

         res.render('dashboard', { 
            user: res.locals.user,
            currentPage: 'dashboard',
            dashboardData,
            filtros: { dataInicial: dataInicial || inicioMes.toISOString().split('T')[0], 
                      dataFinal: dataFinal || fimMes.toISOString().split('T')[0] }
        });

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.status(500).send('Erro ao carregar dashboard: ' + error.message);
    }
});



module.exports = router;