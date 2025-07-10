const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
    try {
        // Valores padrão para evitar erros
        const defaultData = {
            user: res.locals.user,
            faturamentoMes: 0,
            faturamentoMesPassado: 0,
            variacaoFaturamento: 0,
            lucroMes: 0,
            contasVencidas: { quantidade: 0, total: 0 },
            fluxoCaixa: { entradas: 0, saidas: 0, saldo: 0 },
            topProdutos: [],
            produtosParados: [],
            vendasDiarias: [],
            produtosCriticos: [],
            valorEstoque: { custo: 0, venda: 0, totalProdutos: 0, produtosZerados: 0 },
            alertasContas: []
        };

        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

        let dashboardData = { ...defaultData };

        // 1. FATURAMENTO DO MÊS
        try {
            const faturamentoMesResult = await pool.query(`
                SELECT COALESCE(SUM(valor_total), 0) as total
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                AND created_at >= $1
                AND created_at <= $2
            `, [inicioMes, fimMes]);
            dashboardData.faturamentoMes = parseFloat(faturamentoMesResult.rows[0].total);

            const faturamentoMesPassadoResult = await pool.query(`
                SELECT COALESCE(SUM(valor_total), 0) as total
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                AND created_at >= $1
                AND created_at <= $2
            `, [inicioMesPassado, fimMesPassado]);
            dashboardData.faturamentoMesPassado = parseFloat(faturamentoMesPassadoResult.rows[0].total);

            dashboardData.variacaoFaturamento = dashboardData.faturamentoMesPassado > 0 
                ? ((dashboardData.faturamentoMes - dashboardData.faturamentoMesPassado) / dashboardData.faturamentoMesPassado * 100).toFixed(1)
                : 0;
        } catch (err) {
            console.error('Erro ao calcular faturamento:', err);
        }

        // 2. LUCRO DO MÊS - versão corrigida
        try {
            const lucroMesResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(valor_total), 0) as vendas
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                AND created_at >= $1
                AND created_at <= $2
            `, [inicioMes, fimMes]);
            
            // Margem de 30% como padrão
            dashboardData.lucroMes = parseFloat(lucroMesResult.rows[0].vendas) * 0.3;
        } catch (err) {
            console.error('Erro ao calcular lucro:', err);
        }

        // 3. CONTAS A RECEBER VENCIDAS
        try {
            const contasVencidasResult = await pool.query(`
                SELECT 
                    COUNT(*) as quantidade,
                    COALESCE(SUM(valor), 0) as total
                FROM contas_a_receber
                WHERE status = 'pendente'
                AND data_vencimento < CURRENT_DATE
            `);
            dashboardData.contasVencidas = {
                quantidade: parseInt(contasVencidasResult.rows[0].quantidade),
                total: parseFloat(contasVencidasResult.rows[0].total)
            };
        } catch (err) {
            console.error('Erro ao buscar contas vencidas:', err);
        }

        // 4. FLUXO DE CAIXA
        try {
            const fluxoCaixaResult = await pool.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) as entradas,
                    COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) as saidas
                FROM fluxo_caixa
                WHERE created_at >= $1
                AND created_at <= $2
            `, [inicioMes, fimMes]);
            
            dashboardData.fluxoCaixa = {
                entradas: parseFloat(fluxoCaixaResult.rows[0].entradas),
                saidas: parseFloat(fluxoCaixaResult.rows[0].saidas),
                saldo: parseFloat(fluxoCaixaResult.rows[0].entradas) - parseFloat(fluxoCaixaResult.rows[0].saidas)
            };
        } catch (err) {
            console.error('Erro ao buscar fluxo de caixa:', err);
        }

        // 5. VENDAS DOS ÚLTIMOS 7 DIAS
        try {
            const vendasDiariasResult = await pool.query(`
                SELECT 
                    DATE(created_at) as dia,
                    COALESCE(SUM(valor_total), 0) as total
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                AND created_at >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(created_at)
                ORDER BY dia
            `);
            dashboardData.vendasDiarias = vendasDiariasResult.rows;
        } catch (err) {
            console.error('Erro ao buscar vendas diárias:', err);
        }

        // 6. TOP PRODUTOS - corrigido sem JOIN problemático
        try {
            const topProdutosResult = await pool.query(`
                SELECT 
                    produto_id,
                    SUM(quantidade) as quantidade_vendida,
                    SUM(valor_total) as valor_total
                FROM movimentacoes
                WHERE tipo = 'SAIDA'
                AND created_at >= $1
                AND created_at <= $2
                GROUP BY produto_id
                ORDER BY quantidade_vendida DESC
                LIMIT 5
            `, [inicioMes, fimMes]);
            
            // Buscar nomes dos produtos separadamente
            for (let produto of topProdutosResult.rows) {
                try {
                    const produtoInfo = await pool.query(
                        'SELECT descricao FROM produtos WHERE id = $1',
                        [produto.produto_id]
                    );
                    produto.nome = produtoInfo.rows[0]?.descricao || `Produto ${produto.produto_id}`;
                } catch (err) {
                    produto.nome = `Produto ${produto.produto_id}`;
                }
            }
            
            dashboardData.topProdutos = topProdutosResult.rows;
        } catch (err) {
            console.error('Erro ao buscar top produtos:', err);
        }

        // 7. PRODUTOS CRÍTICOS - corrigido com cálculo dinâmico do estoque
        try {
            const produtosCriticosResult = await pool.query(`
                SELECT 
                    p.id,
                    p.descricao as nome,
                    p.estoque_minimo,
                    p.preco_custo,
                    COALESCE(SUM(CASE 
                        WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                        WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                        ELSE 0 
                    END), 0) as saldo_atual
                FROM produtos p
                LEFT JOIN movimentacoes m ON p.id = m.produto_id
                GROUP BY p.id, p.descricao, p.estoque_minimo, p.preco_custo
                HAVING COALESCE(SUM(CASE 
                    WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                    WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                    ELSE 0 
                END), 0) <= p.estoque_minimo
                ORDER BY saldo_atual ASC
                LIMIT 10
            `);
            dashboardData.produtosCriticos = produtosCriticosResult.rows;
        } catch (err) {
            console.error('Erro ao buscar produtos críticos:', err);
        }

        // 8. VALOR DO ESTOQUE - corrigido com cálculo dinâmico
        try {
            const valorEstoqueResult = await pool.query(`
                SELECT 
                    COUNT(DISTINCT p.id) as total_produtos,
                    COALESCE(SUM(
                        CASE WHEN saldos.saldo_atual > 0 
                        THEN saldos.saldo_atual * p.preco_custo 
                        ELSE 0 
                        END
                    ), 0) as custo_total,
                    COUNT(CASE WHEN saldos.saldo_atual = 0 THEN 1 END) as produtos_zerados
                FROM produtos p
                LEFT JOIN (
                    SELECT 
                        produto_id,
                        COALESCE(SUM(CASE 
                            WHEN tipo = 'ENTRADA' THEN quantidade 
                            WHEN tipo = 'SAIDA' THEN -quantidade 
                            ELSE 0 
                        END), 0) as saldo_atual
                    FROM movimentacoes
                    GROUP BY produto_id
                ) saldos ON p.id = saldos.produto_id
            `);
            
            dashboardData.valorEstoque = {
                custo: parseFloat(valorEstoqueResult.rows[0].custo_total),
                venda: parseFloat(valorEstoqueResult.rows[0].custo_total) * 1.3, // Margem 30%
                totalProdutos: parseInt(valorEstoqueResult.rows[0].total_produtos),
                produtosZerados: parseInt(valorEstoqueResult.rows[0].produtos_zerados)
            };
        } catch (err) {
            console.error('Erro ao calcular valor do estoque:', err);
        }

        // 9. ALERTAS DE CONTAS
        try {
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
            dashboardData.alertasContas = alertasContasResult.rows;
        } catch (err) {
            console.error('Erro ao buscar alertas de contas:', err);
        }

        // 10. PRODUTOS PARADOS - corrigido
        try {
            const produtosParadosResult = await pool.query(`
                SELECT 
                    p.id,
                    p.descricao as nome,
                    p.preco_custo,
                    COALESCE(saldos.saldo_atual, 0) as quantidade_estoque,
                    COALESCE(saldos.saldo_atual * p.preco_custo, 0) as valor_parado
                FROM produtos p
                LEFT JOIN (
                    SELECT 
                        produto_id,
                        COALESCE(SUM(CASE 
                            WHEN tipo = 'ENTRADA' THEN quantidade 
                            WHEN tipo = 'SAIDA' THEN -quantidade 
                            ELSE 0 
                        END), 0) as saldo_atual
                    FROM movimentacoes
                    GROUP BY produto_id
                ) saldos ON p.id = saldos.produto_id
                WHERE COALESCE(saldos.saldo_atual, 0) > 0
                ORDER BY valor_parado DESC
                LIMIT 5
            `);
            
            // Adicionar info de última venda
            for (let produto of produtosParadosResult.rows) {
                try {
                    const ultimaVenda = await pool.query(`
                        SELECT MAX(created_at) as ultima_venda
                        FROM movimentacoes
                        WHERE produto_id = $1 AND tipo = 'SAIDA'
                    `, [produto.id]);
                    produto.ultima_venda = ultimaVenda.rows[0]?.ultima_venda;
                } catch (err) {
                    produto.ultima_venda = null;
                }
            }
            
            // Filtrar apenas produtos sem venda nos últimos 30 dias
            const trintaDiasAtras = new Date(hoje.getTime() - (30 * 24 * 60 * 60 * 1000));
            dashboardData.produtosParados = produtosParadosResult.rows.filter(p => 
                !p.ultima_venda || new Date(p.ultima_venda) < trintaDiasAtras
            );
        } catch (err) {
            console.error('Erro ao buscar produtos parados:', err);
        }

        res.render('dashboard', dashboardData);

    } catch (error) {
        console.error('Erro geral ao carregar dashboard:', error);
        res.render('dashboard', defaultData);
    }
});

module.exports = router;