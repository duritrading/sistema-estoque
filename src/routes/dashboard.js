// ========================================
// DASHBOARD - COM VALIDAÇÃO JOI
// ========================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateQuery } = require('../middleware/validation');
const Joi = require('joi');

// ========================================
// SCHEMA DE VALIDAÇÃO
// ========================================

const filtrosDashboardSchema = Joi.object({
  dataInicial: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.base': 'Data inicial inválida'
    }),
  dataFinal: Joi.date()
    .iso()
    .optional()
    .min(Joi.ref('dataInicial'))
    .messages({
      'date.base': 'Data final inválida',
      'date.min': 'Data final deve ser maior que data inicial'
    })
});

// ========================================
// GET / - Dashboard principal
// ========================================

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
      contasVencidas,
      produtosBaixoEstoque,
      topProdutos,
      inadimplencia,
      entregas
    ] = await Promise.all([
      // 1. FATURAMENTO ATUAL
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN COALESCE(valor_total, quantidade * COALESCE(preco_unitario, 0)) ELSE 0 END), 0) as faturamento,
          COUNT(CASE WHEN tipo = 'SAIDA' THEN 1 END) as total_vendas
        FROM movimentacoes
        WHERE created_at >= $1 AND created_at <= $2
      `, [dataInicial, dataFinal]),

      // 2. FATURAMENTO MÊS ANTERIOR
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'SAIDA' THEN COALESCE(valor_total, quantidade * COALESCE(preco_unitario, 0)) ELSE 0 END), 0) as faturamento
        FROM movimentacoes
        WHERE created_at >= $1 AND created_at <= $2
      `, [inicioMesAnterior, fimMesAnterior]),

      // 3. FLUXO DE CAIXA
      pool.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as creditos,
          COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as debitos
        FROM fluxo_caixa
        WHERE data_operacao >= $1 AND data_operacao <= $2 AND status = 'PAGO'
      `, [dataInicial, dataFinal]),

      // 4. CONTAS VENCIDAS
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(valor), 0) as valor_total
        FROM contas_a_pagar
        WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
      `),

      // 5. PRODUTOS BAIXO ESTOQUE
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

      // 6. TOP PRODUTOS
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
      `, [dataInicial, dataFinal]),

      // 7. INADIMPLÊNCIA
      pool.query(`
        SELECT 
          COUNT(*) as clientes_inadimplentes,
          COALESCE(SUM(valor), 0) as valor_total,
          COUNT(CASE WHEN data_vencimento < CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as mais_30_dias
        FROM contas_a_receber 
        WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
      `),

      // 8. ENTREGAS (tabela pode não existir)
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
          COUNT(CASE WHEN status = 'ENTREGUE' THEN 1 END) as entregues
        FROM entregas 
        WHERE data_entrega >= $1 AND data_entrega <= $2
      `, [inicioMes, fimMes]).catch(() => ({ rows: [{ total: 0, pendentes: 0, entregues: 0 }] }))
    ]);

    // Processar resultados
    const fatAtual = parseFloat(faturamentoAtual.rows[0].faturamento) || 0;
    const fatAnterior = parseFloat(faturamentoAnterior.rows[0].faturamento) || 0;
    const variacaoFaturamento = fatAnterior > 0 ? ((fatAtual - fatAnterior) / fatAnterior * 100).toFixed(1) : 0;

    const creditos = parseFloat(fluxoCaixa.rows[0].creditos) || 0;
    const debitos = parseFloat(fluxoCaixa.rows[0].debitos) || 0;
    const saldoFluxo = creditos - debitos;
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

    dashboardData.lucro = {
      valor: lucro,
      margem: margemLucro
    };

    dashboardData.contasVencidas = contasVencidas.rows[0];
    dashboardData.produtosBaixoEstoque = produtosBaixoEstoque.rows;
    dashboardData.topProdutos = topProdutos.rows;
    dashboardData.inadimplencia = inadimplencia.rows[0];
    dashboardData.entregas = entregas.rows[0];

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
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao carregar dashboard.',
      voltarUrl: '/'
    });
  }
});

module.exports = router;