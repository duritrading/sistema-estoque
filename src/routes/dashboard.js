// src/routes/dashboard.js - COM SALDO SEPARADO E RENTABILIDADE
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateQuery } = require('../middleware/validation');
const Joi = require('joi');

// Schema de validação
const filtrosDashboardSchema = Joi.object({
  dataInicial: Joi.date().iso().optional(),
  dataFinal: Joi.date().iso().optional().min(Joi.ref('dataInicial'))
});

// GET / - Dashboard principal
router.get('/', validateQuery(filtrosDashboardSchema), async (req, res) => {
  try {
    let { dataInicial, dataFinal } = req.query;

    // Definir período padrão (mês atual)
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    if (!dataInicial) dataInicial = inicioMes.toISOString().split('T')[0];
    if (!dataFinal) dataFinal = fimMes.toISOString().split('T')[0];

    // Período anterior (para comparação)
    const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    const dashboardData = {};

    // Executar todas as queries em paralelo
    const [
      faturamentoAtual,
      faturamentoAnterior,
      fluxoCaixa,
      saldoInvestimentos,
      contasVencidas,
      produtosBaixoEstoque,
      topProdutos,
      inadimplencia,
      entregas,
      rentabilidadeProdutos,
      rentabilidadeCategorias
    ] = await Promise.all([
      // 1. FATURAMENTO ATUAL
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN COALESCE(valor_total, quantidade * COALESCE(preco_unitario, 0)) ELSE 0 END), 0) as faturamento,
          COUNT(CASE WHEN tipo = 'SAIDA' THEN 1 END) as total_vendas
        FROM movimentacoes
        WHERE created_at >= $1 AND created_at <= $2
      `, [dataInicial, dataFinal + ' 23:59:59']),

      // 2. FATURAMENTO MÊS ANTERIOR
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN COALESCE(valor_total, quantidade * COALESCE(preco_unitario, 0)) ELSE 0 END), 0) as faturamento
        FROM movimentacoes
        WHERE created_at >= $1 AND created_at <= $2
      `, [inicioMesAnterior, fimMesAnterior]),

      // 3. FLUXO DE CAIXA (excluindo Investimentos)
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN fc.tipo = 'CREDITO' THEN fc.valor ELSE 0 END), 0) as creditos,
          COALESCE(SUM(CASE WHEN fc.tipo = 'DEBITO' THEN fc.valor ELSE 0 END), 0) as debitos
        FROM fluxo_caixa fc
        LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
        WHERE fc.data_operacao >= $1 AND fc.data_operacao <= $2 
          AND fc.status = 'PAGO'
          AND (cf.nome IS NULL OR cf.nome != 'Investimentos')
      `, [dataInicial, dataFinal]),

      // 4. SALDO DE INVESTIMENTOS (categoria específica)
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN fc.tipo = 'CREDITO' THEN fc.valor ELSE -fc.valor END), 0) as saldo_investimentos
        FROM fluxo_caixa fc
        JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
        WHERE cf.nome = 'Investimentos' AND fc.status = 'PAGO'
      `),

      // 5. CONTAS VENCIDAS
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(valor), 0) as valor_total
        FROM contas_a_pagar
        WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
      `),

      // 6. PRODUTOS BAIXO ESTOQUE
      pool.query(`
        SELECT 
          p.codigo,
          p.descricao,
          p.estoque_minimo,
          COALESCE(SUM(
            CASE 
              WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
              WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
              ELSE 0 
            END
          ), 0) as saldo_atual
        FROM produtos p
        LEFT JOIN movimentacoes m ON p.id = m.produto_id
        GROUP BY p.id
        HAVING COALESCE(SUM(
          CASE 
            WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
            WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
            ELSE 0 
          END
        ), 0) <= p.estoque_minimo
        ORDER BY saldo_atual ASC
        LIMIT 10
      `),

      // 7. TOP PRODUTOS
      pool.query(`
        SELECT 
          p.descricao,
          SUM(m.quantidade) as quantidade_vendida,
          SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as valor_total
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        GROUP BY p.id, p.descricao
        ORDER BY quantidade_vendida DESC
        LIMIT 5
      `, [dataInicial, dataFinal + ' 23:59:59']),

      // 8. INADIMPLÊNCIA
      pool.query(`
        SELECT 
          COUNT(*) as clientes_inadimplentes,
          COALESCE(SUM(valor), 0) as valor_total,
          COUNT(CASE WHEN data_vencimento < CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as mais_30_dias
        FROM contas_a_receber 
        WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
      `),

      // 9. ENTREGAS
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
          COUNT(CASE WHEN status = 'ENTREGUE' THEN 1 END) as entregues
        FROM entregas 
        WHERE data_entrega >= $1 AND data_entrega <= $2
      `, [dataInicial, dataFinal]).catch(() => ({ rows: [{ total: 0, pendentes: 0, entregues: 0 }] })),

      // 10. RENTABILIDADE POR PRODUTO (TOP 10)
      pool.query(`
        SELECT 
          p.id,
          p.descricao,
          p.categoria,
          SUM(m.quantidade) as qtd_vendida,
          SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as receita,
          SUM(m.quantidade * COALESCE(p.preco_custo, 0)) as custo,
          SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) - SUM(m.quantidade * COALESCE(p.preco_custo, 0)) as lucro,
          CASE 
            WHEN SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) > 0 
            THEN ((SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) - SUM(m.quantidade * COALESCE(p.preco_custo, 0))) / SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)))) * 100
            ELSE 0 
          END as margem_percentual
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        GROUP BY p.id, p.descricao, p.categoria
        ORDER BY lucro DESC
        LIMIT 10
      `, [dataInicial, dataFinal + ' 23:59:59']),

      // 11. RENTABILIDADE POR CATEGORIA
      pool.query(`
        SELECT 
          COALESCE(p.categoria, 'Sem Categoria') as categoria,
          COUNT(DISTINCT p.id) as qtd_produtos,
          SUM(m.quantidade) as qtd_vendida,
          SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as receita,
          SUM(m.quantidade * COALESCE(p.preco_custo, 0)) as custo,
          SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) - SUM(m.quantidade * COALESCE(p.preco_custo, 0)) as lucro,
          CASE 
            WHEN SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) > 0 
            THEN ((SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) - SUM(m.quantidade * COALESCE(p.preco_custo, 0))) / SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)))) * 100
            ELSE 0 
          END as margem_percentual
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        GROUP BY COALESCE(p.categoria, 'Sem Categoria')
        ORDER BY lucro DESC
      `, [dataInicial, dataFinal + ' 23:59:59'])
    ]);

    // Processar resultados
    const fatAtual = parseFloat(faturamentoAtual.rows[0].faturamento) || 0;
    const fatAnterior = parseFloat(faturamentoAnterior.rows[0].faturamento) || 0;
    const variacaoFaturamento = fatAnterior > 0 ? ((fatAtual - fatAnterior) / fatAnterior * 100).toFixed(1) : 0;

    const creditos = parseFloat(fluxoCaixa.rows[0].creditos) || 0;
    const debitos = parseFloat(fluxoCaixa.rows[0].debitos) || 0;
    const saldoFluxo = creditos - debitos;
    const saldoInvest = parseFloat(saldoInvestimentos.rows[0]?.saldo_investimentos) || 0;
    
    const lucro = fatAtual - debitos;
    const margemLucro = fatAtual > 0 ? (lucro / fatAtual * 100).toFixed(1) : 0;

    dashboardData.faturamento = {
      atual: fatAtual,
      anterior: fatAnterior,
      variacao: variacaoFaturamento,
      totalVendas: parseInt(faturamentoAtual.rows[0].total_vendas) || 0
    };

    dashboardData.fluxoCaixa = {
      creditos,
      debitos,
      saldo: saldoFluxo
    };

    dashboardData.investimentos = {
      saldo: saldoInvest
    };

    dashboardData.lucro = {
      valor: lucro,
      margem: margemLucro
    };

    dashboardData.contasVencidas = contasVencidas.rows[0];
    dashboardData.produtosBaixoEstoque = produtosBaixoEstoque.rows;
    dashboardData.topProdutos = topProdutos.rows;
    dashboardData.inadimplencia = inadimplencia.rows[0];
    dashboardData.entregas = entregas.rows[0];

    // Rentabilidade por Produto
    dashboardData.rentabilidadeProdutos = rentabilidadeProdutos.rows.map(p => ({
      ...p,
      receita: parseFloat(p.receita) || 0,
      custo: parseFloat(p.custo) || 0,
      lucro: parseFloat(p.lucro) || 0,
      margem_percentual: parseFloat(p.margem_percentual) || 0
    }));

    // Rentabilidade por Categoria
    dashboardData.rentabilidadeCategorias = rentabilidadeCategorias.rows.map(c => ({
      ...c,
      receita: parseFloat(c.receita) || 0,
      custo: parseFloat(c.custo) || 0,
      lucro: parseFloat(c.lucro) || 0,
      margem_percentual: parseFloat(c.margem_percentual) || 0
    }));

    res.render('dashboard', {
      user: res.locals.user,
      currentPage: 'dashboard',
      dashboardData,
      filtros: {
        dataInicial,
        dataFinal
      }
    });

  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    res.status(500).render('erro', {
      titulo: 'Erro',
      mensagem: 'Erro ao carregar dashboard: ' + error.message,
      voltar_url: '/'
    });
  }
});

module.exports = router;