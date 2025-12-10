// src/routes/dashboard.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/';

// Helper: Calcular período com base nos filtros
function calcularPeriodo(query) {
  const { dataInicial, dataFinal } = query;
  const hoje = new Date();
  
  let inicioMes = dataInicial ? new Date(dataInicial) : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  let fimMes = dataFinal ? new Date(dataFinal) : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  
  const inicioMesPassado = new Date(inicioMes);
  inicioMesPassado.setMonth(inicioMesPassado.getMonth() - 1);
  const fimMesPassado = new Date(fimMes);
  fimMesPassado.setMonth(fimMesPassado.getMonth() - 1);
  
  return { inicioMes, fimMes, inicioMesPassado, fimMesPassado };
}

// GET / - Dashboard principal
router.get('/', asyncHandler(async (req, res) => {
  const { inicioMes, fimMes, inicioMesPassado, fimMesPassado } = calcularPeriodo(req.query);
  const dashboardData = {};

  // Queries paralelas para performance
  const [
    faturamentoAtual,
    faturamentoAnterior,
    lucroResult,
    contasVencidasResult,
    produtosBaixoEstoque,
    topProdutos,
    inadimplenciaResult
  ] = await Promise.all([
    // 1. Faturamento atual
    pool.query(`
      SELECT COALESCE(SUM(valor_total), 0) as total
      FROM movimentacoes WHERE tipo = 'SAIDA' AND created_at >= $1 AND created_at <= $2
    `, [inicioMes, fimMes]),
    
    // 2. Faturamento anterior
    pool.query(`
      SELECT COALESCE(SUM(valor_total), 0) as total
      FROM movimentacoes WHERE tipo = 'SAIDA' AND created_at >= $1 AND created_at <= $2
    `, [inicioMesPassado, fimMesPassado]),
    
    // 3. Lucro (Receitas - Despesas)
    pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as receitas,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as despesas
      FROM fluxo_caixa WHERE status = 'PAGO' AND data_operacao >= $1 AND data_operacao <= $2
    `, [inicioMes, fimMes]),
    
    // 4. Contas vencidas
    pool.query(`
      SELECT COUNT(*) as quantidade, COALESCE(SUM(valor), 0) as total
      FROM contas_a_receber WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
    `),
    
    // 5. Produtos com estoque baixo
    pool.query(`
      SELECT p.codigo, p.descricao, p.estoque_minimo,
        COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                         WHEN m.tipo = 'SAIDA' THEN -m.quantidade ELSE 0 END), 0) as saldo_atual
      FROM produtos p
      LEFT JOIN movimentacoes m ON p.id = m.produto_id
      GROUP BY p.id, p.codigo, p.descricao, p.estoque_minimo
      HAVING COALESCE(SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                              WHEN m.tipo = 'SAIDA' THEN -m.quantidade ELSE 0 END), 0) <= p.estoque_minimo
      ORDER BY saldo_atual ASC LIMIT 5
    `),
    
    // 6. Top produtos
    pool.query(`
      SELECT p.codigo, p.descricao, SUM(m.quantidade) as total_vendido, SUM(m.valor_total) as faturamento_produto
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
      GROUP BY p.id, p.codigo, p.descricao
      ORDER BY total_vendido DESC LIMIT 5
    `, [inicioMes, fimMes]),
    
    // 7. Inadimplência
    pool.query(`
      SELECT COUNT(*) as clientes_inadimplentes, COALESCE(SUM(valor), 0) as valor_total,
        COUNT(CASE WHEN data_vencimento < CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as mais_30_dias
      FROM contas_a_receber WHERE status = 'Pendente' AND data_vencimento < CURRENT_DATE
    `)
  ]);

  // Processar faturamento
  dashboardData.faturamentoMes = parseFloat(faturamentoAtual.rows[0].total);
  dashboardData.faturamentoMesPassado = parseFloat(faturamentoAnterior.rows[0].total);
  dashboardData.crescimentoFaturamento = dashboardData.faturamentoMesPassado > 0
    ? ((dashboardData.faturamentoMes - dashboardData.faturamentoMesPassado) / dashboardData.faturamentoMesPassado * 100).toFixed(1)
    : 0;

  // Processar lucro
  const receitas = parseFloat(lucroResult.rows[0].receitas);
  const despesas = parseFloat(lucroResult.rows[0].despesas);
  dashboardData.lucroMes = receitas - despesas;
  dashboardData.margemLucro = dashboardData.faturamentoMes > 0
    ? ((dashboardData.lucroMes / dashboardData.faturamentoMes) * 100).toFixed(1)
    : 0;

  // Fluxo de caixa
  dashboardData.fluxoCaixa = { entradas: receitas, saidas: despesas, saldo: receitas - despesas };

  // Contas vencidas
  dashboardData.contasVencidas = {
    quantidade: parseInt(contasVencidasResult.rows[0].quantidade),
    total: parseFloat(contasVencidasResult.rows[0].total)
  };

  // Listas
  dashboardData.produtosBaixoEstoque = produtosBaixoEstoque.rows;
  dashboardData.topProdutos = topProdutos.rows;
  dashboardData.inadimplencia = inadimplenciaResult.rows[0];

  // Entregas (opcional - pode não existir tabela)
  try {
    const entregasResult = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
        COUNT(CASE WHEN status = 'ENTREGUE' THEN 1 END) as entregues
      FROM entregas WHERE data_entrega >= $1 AND data_entrega <= $2
    `, [inicioMes, fimMes]);
    dashboardData.entregas = entregasResult.rows[0];
  } catch {
    dashboardData.entregas = { total: 0, pendentes: 0, entregues: 0 };
  }

  res.render('dashboard', {
    user: res.locals.user,
    currentPage: 'dashboard',
    dashboardData,
    filtros: {
      dataInicial: req.query.dataInicial || inicioMes.toISOString().split('T')[0],
      dataFinal: req.query.dataFinal || fimMes.toISOString().split('T')[0]
    }
  });
}, ROUTE));

module.exports = router;