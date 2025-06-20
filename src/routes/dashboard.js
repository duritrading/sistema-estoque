const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
    try {
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        const trintaDiasAtras = new Date(hoje.getTime() - (30 * 24 * 60 * 60 * 1000));

        // 1. INDICADORES FINANCEIROS
        // Faturamento do mês atual
        const faturamentoMesResult = await pool.query(`
            SELECT COALESCE(SUM(valor_total), 0) as total
            FROM movimentacoes
            WHERE tipo = 'saida'
            AND data_movimentacao >= $1
            AND data_movimentacao <= $2
        `, [inicioMes, fimMes]);
        const faturamentoMes = parseFloat(faturamentoMesResult.rows[0].total);

        // Faturamento do mês passado
        const faturamentoMesPassadoResult = await pool.query(`
            SELECT COALESCE(SUM(valor_total), 0) as total
            FROM movimentacoes
            WHERE tipo = 'saida'
            AND data_movimentacao >= $1
            AND data_movimentacao <= $2
        `, [inicioMesPassado, fimMesPassado]);
        const faturamentoMesPassado = parseFloat(faturamentoMesPassadoResult.rows[0].total);

        // Variação percentual
        const variacaoFaturamento = faturamentoMesPassado > 0 
            ? ((faturamentoMes - faturamentoMesPassado) / faturamentoMesPassado * 100).toFixed(1)
            : 0;

        // Lucro do mês (vendas - custo dos produtos vendidos)
        const lucroMesResult = await pool.query(`
            SELECT 
                COALESCE(SUM(m.valor_total), 0) as vendas,
                COALESCE(SUM(m.quantidade * p.preco_custo), 0) as custo
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            WHERE m.tipo = 'saida'
            AND m.data_movimentacao >= $1
            AND m.data_movimentacao <= $2
        `, [inicioMes, fimMes]);
        const lucroMes = parseFloat(lucroMesResult.rows[0].vendas) - parseFloat(lucroMesResult.rows[0].custo);

        // Contas a receber vencidas
        const contasVencidasResult = await pool.query(`
            SELECT 
                COUNT(*) as quantidade,
                COALESCE(SUM(valor), 0) as total
            FROM contas_a_receber
            WHERE status = 'pendente'
            AND data_vencimento < CURRENT_DATE
        `);
        const contasVencidas = {
            quantidade: parseInt(contasVencidasResult.rows[0].quantidade),
            total: parseFloat(contasVencidasResult.rows[0].total)
        };

        // Fluxo de caixa do mês
        const fluxoCaixaResult = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) as entradas,
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) as saidas
            FROM fluxo_caixa
            WHERE data >= $1
            AND data <= $2
        `, [inicioMes, fimMes]);
        const fluxoCaixa = {
            entradas: parseFloat(fluxoCaixaResult.rows[0].entradas),
            saidas: parseFloat(fluxoCaixaResult.rows[0].saidas),
            saldo: parseFloat(fluxoCaixaResult.rows[0].entradas) - parseFloat(fluxoCaixaResult.rows[0].saidas)
        };

        // 2. PERFORMANCE DE VENDAS
        // Top 5 produtos mais vendidos no mês
        const topProdutosResult = await pool.query(`
            SELECT 
                p.nome,
                SUM(m.quantidade) as quantidade_vendida,
                SUM(m.valor_total) as valor_total
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            WHERE m.tipo = 'saida'
            AND m.data_movimentacao >= $1
            AND m.data_movimentacao <= $2
            GROUP BY p.id, p.nome
            ORDER BY quantidade_vendida DESC
            LIMIT 5
        `, [inicioMes, fimMes]);
        const topProdutos = topProdutosResult.rows;

        // Produtos sem venda há 30 dias
        const produtosParadosResult = await pool.query(`
            SELECT 
                p.nome,
                p.quantidade_estoque,
                p.preco_custo * p.quantidade_estoque as valor_parado,
                MAX(m.data_movimentacao) as ultima_venda
            FROM produtos p
            LEFT JOIN movimentacoes m ON p.id = m.produto_id AND m.tipo = 'saida'
            WHERE p.quantidade_estoque > 0
            GROUP BY p.id, p.nome, p.quantidade_estoque, p.preco_custo
            HAVING MAX(m.data_movimentacao) < $1 OR MAX(m.data_movimentacao) IS NULL
            ORDER BY valor_parado DESC
            LIMIT 5
        `, [trintaDiasAtras]);
        const produtosParados = produtosParadosResult.rows;

        // Vendas dos últimos 7 dias (para gráfico)
        const vendasDiariasResult = await pool.query(`
            SELECT 
                DATE(data_movimentacao) as dia,
                COALESCE(SUM(valor_total), 0) as total
            FROM movimentacoes
            WHERE tipo = 'saida'
            AND data_movimentacao >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY DATE(data_movimentacao)
            ORDER BY dia
        `);
        const vendasDiarias = vendasDiariasResult.rows;

        // 3. GESTÃO DE ESTOQUE
        // Produtos em falta ou críticos
        const produtosCriticosResult = await pool.query(`
            SELECT 
                nome,
                quantidade_estoque,
                estoque_minimo,
                preco_venda
            FROM produtos
            WHERE quantidade_estoque <= estoque_minimo
            ORDER BY quantidade_estoque ASC
            LIMIT 10
        `);
        const produtosCriticos = produtosCriticosResult.rows;

        // Valor total em estoque
        const valorEstoqueResult = await pool.query(`
            SELECT 
                COALESCE(SUM(quantidade_estoque * preco_custo), 0) as custo_total,
                COALESCE(SUM(quantidade_estoque * preco_venda), 0) as valor_venda,
                COUNT(*) as total_produtos,
                COUNT(CASE WHEN quantidade_estoque = 0 THEN 1 END) as produtos_zerados
            FROM produtos
        `);
        const valorEstoque = {
            custo: parseFloat(valorEstoqueResult.rows[0].custo_total),
            venda: parseFloat(valorEstoqueResult.rows[0].valor_venda),
            totalProdutos: parseInt(valorEstoqueResult.rows[0].total_produtos),
            produtosZerados: parseInt(valorEstoqueResult.rows[0].produtos_zerados)
        };

        // 4. ALERTAS IMPORTANTES
        // Contas vencidas há mais de 7 dias
        const alertasContasResult = await pool.query(`
            SELECT 
                cliente_nome,
                valor,
                data_vencimento,
                CURRENT_DATE - data_vencimento as dias_atraso
            FROM contas_a_receber
            WHERE status = 'pendente'
            AND data_vencimento < CURRENT_DATE - INTERVAL '7 days'
            ORDER BY dias_atraso DESC
            LIMIT 5
        `);
        const alertasContas = alertasContasResult.rows;

        res.render('dashboard', {
            user: res.locals.user,
            // Indicadores financeiros
            faturamentoMes,
            faturamentoMesPassado,
            variacaoFaturamento,
            lucroMes,
            contasVencidas,
            fluxoCaixa,
            // Performance de vendas
            topProdutos,
            produtosParados,
            vendasDiarias,
            // Gestão de estoque
            produtosCriticos,
            valorEstoque,
            // Alertas
            alertasContas
        });

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.status(500).send('Erro ao carregar dashboard');
    }
});

module.exports = router;