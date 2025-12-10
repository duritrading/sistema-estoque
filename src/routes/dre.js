// src/routes/dre.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/dre';

// Estrutura completa do DRE
const ESTRUTURA_DRE = [
  { label: 'Receitas Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item' },
  { label: 'Receita de Fretes e Entregas', tipo: 'item' },
  { label: 'Receita Bruta de Vendas', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Deduções da Receita Bruta', tipo: 'header', css: 'dre-header' },
  { label: 'Impostos Sobre Vendas', tipo: 'item' },
  { label: 'Comissões Sobre Vendas', tipo: 'item' },
  { label: 'Descontos Incondicionais', tipo: 'item' },
  { label: 'Devoluções de Vendas', tipo: 'item' },
  { label: 'Receita Líquida de Vendas', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Custos Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Custo dos Produtos Vendidos', tipo: 'item' },
  { label: 'Custo das Vendas de Produtos', tipo: 'item' },
  { label: 'Custo dos Serviços Prestados', tipo: 'item' },
  { label: 'Lucro Bruto', tipo: 'total', css: 'dre-total-l2' },

  { label: 'Despesas Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Despesas Comerciais', tipo: 'item' },
  { label: 'Despesas Administrativas', tipo: 'item' },
  { label: 'Despesas Operacionais (Item)', tipo: 'item' },
  { label: 'Lucro / Prejuízo Operacional', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Receitas e Despesas Financeiras', tipo: 'header', css: 'dre-header' },
  { label: 'Receitas e Rendimentos Financeiros', tipo: 'item' },
  { label: 'Despesas Financeiras', tipo: 'item' },

  { label: 'Outras Receitas e Despesas Não Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Outras Receitas Não Operacionais', tipo: 'item' },
  { label: 'Outras Despesas Não Operacionais', tipo: 'item' },
  { label: 'Lucro / Prejuízo Líquido', tipo: 'total', css: 'dre-total-l3' },

  { label: 'Despesas com Investimentos e Empréstimos', tipo: 'header', css: 'dre-header' },
  { label: 'Investimentos em Imobilizado', tipo: 'item' },
  { label: 'Empréstimos e Dívidas', tipo: 'item' },
  { label: 'Lucro / Prejuízo Final', tipo: 'total', css: 'dre-total-final' },
];

// GET / - Relatório DRE
router.get('/', asyncHandler(async (req, res) => {
  const ano = req.query.ano || new Date().getFullYear();

  // Buscar dados agrupados por categoria e mês
  const result = await pool.query(`
    SELECT 
      TO_CHAR(data_operacao, 'MM') as mes_index,
      cf.nome as categoria,
      SUM(fc.valor) as total
    FROM fluxo_caixa fc
    JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
    WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
    GROUP BY mes_index, cf.nome
  `, [ano]);

  // Mapear dados por categoria e mês
  const dadosPorCategoria = {};
  result.rows.forEach(dado => {
    const mesIndex = parseInt(dado.mes_index) - 1;
    if (!dadosPorCategoria[dado.categoria]) {
      dadosPorCategoria[dado.categoria] = Array(12).fill(0);
    }
    dadosPorCategoria[dado.categoria][mesIndex] = parseFloat(dado.total);
  });

  const getValores = (nome) => dadosPorCategoria[nome] || Array(12).fill(0);

  // Inicializar resultados
  const resultados = {};
  ESTRUTURA_DRE.forEach(linha => {
    resultados[linha.label] = Array(12).fill(0);
  });

  // Calcular valores para cada mês
  for (let i = 0; i < 12; i++) {
    // RECEITAS OPERACIONAIS
    const recVendas = getValores('Receita de Vendas de Produtos e Serviços')[i];
    const recFretes = getValores('Receita de Fretes e Entregas')[i];
    
    resultados['Receita de Vendas de Produtos e Serviços'][i] = recVendas;
    resultados['Receita de Fretes e Entregas'][i] = recFretes;
    resultados['Receitas Operacionais'][i] = recVendas + recFretes;
    resultados['Receita Bruta de Vendas'][i] = recVendas + recFretes;

    // DEDUÇÕES DA RECEITA BRUTA
    const impostos = getValores('Impostos Sobre Vendas')[i];
    const comissoes = getValores('Comissões Sobre Vendas')[i];
    const descontos = getValores('Descontos Incondicionais')[i];
    const devolucoes = getValores('Devoluções de Vendas')[i];
    
    resultados['Impostos Sobre Vendas'][i] = -impostos;
    resultados['Comissões Sobre Vendas'][i] = -comissoes;
    resultados['Descontos Incondicionais'][i] = -descontos;
    resultados['Devoluções de Vendas'][i] = -devolucoes;
    
    const totalDeducoes = (-impostos) + (-comissoes) + (-descontos) + (-devolucoes);
    resultados['Deduções da Receita Bruta'][i] = totalDeducoes;
    resultados['Receita Líquida de Vendas'][i] = resultados['Receita Bruta de Vendas'][i] + totalDeducoes;

    // CUSTOS OPERACIONAIS
    const custoProdutos = getValores('Custo dos Produtos Vendidos')[i];
    const custoVendas = getValores('Custo das Vendas de Produtos')[i];
    const custoServicos = getValores('Custo dos Serviços Prestados')[i];
    
    resultados['Custo dos Produtos Vendidos'][i] = -custoProdutos;
    resultados['Custo das Vendas de Produtos'][i] = -custoVendas;
    resultados['Custo dos Serviços Prestados'][i] = -custoServicos;
    resultados['Custos Operacionais'][i] = (-custoProdutos) + (-custoVendas) + (-custoServicos);
    resultados['Lucro Bruto'][i] = resultados['Receita Líquida de Vendas'][i] + resultados['Custos Operacionais'][i];

    // DESPESAS OPERACIONAIS
    const despComerciais = getValores('Despesas Comerciais')[i];
    const despAdmin = getValores('Despesas Administrativas')[i];
    const despOperacionais = getValores('Despesas Operacionais')[i];
    
    resultados['Despesas Comerciais'][i] = -despComerciais;
    resultados['Despesas Administrativas'][i] = -despAdmin;
    resultados['Despesas Operacionais (Item)'][i] = -despOperacionais;
    const totalDespOperacionais = (-despComerciais) + (-despAdmin) + (-despOperacionais);
    resultados['Despesas Operacionais'][i] = totalDespOperacionais;
    resultados['Lucro / Prejuízo Operacional'][i] = resultados['Lucro Bruto'][i] + totalDespOperacionais;

    // RECEITAS E DESPESAS FINANCEIRAS
    const recFinanceiras = getValores('Receitas e Rendimentos Financeiros')[i];
    const despFinanceiras = getValores('Despesas Financeiras')[i];
    
    resultados['Receitas e Rendimentos Financeiros'][i] = recFinanceiras;
    resultados['Despesas Financeiras'][i] = -despFinanceiras;
    resultados['Receitas e Despesas Financeiras'][i] = recFinanceiras + (-despFinanceiras);

    // OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS
    const outrasRec = getValores('Outras Receitas Não Operacionais')[i];
    const outrasDesp = getValores('Outras Despesas Não Operacionais')[i];
    
    resultados['Outras Receitas Não Operacionais'][i] = outrasRec;
    resultados['Outras Despesas Não Operacionais'][i] = -outrasDesp;
    resultados['Outras Receitas e Despesas Não Operacionais'][i] = outrasRec + (-outrasDesp);

    // LUCRO LÍQUIDO
    resultados['Lucro / Prejuízo Líquido'][i] = resultados['Lucro / Prejuízo Operacional'][i] + 
                                                resultados['Receitas e Despesas Financeiras'][i] + 
                                                resultados['Outras Receitas e Despesas Não Operacionais'][i];

    // DESPESAS COM INVESTIMENTOS E EMPRÉSTIMOS
    const invest = getValores('Investimentos em Imobilizado')[i];
    const emprestimos = getValores('Empréstimos e Dívidas')[i];
    
    resultados['Investimentos em Imobilizado'][i] = -invest;
    resultados['Empréstimos e Dívidas'][i] = -emprestimos;
    resultados['Despesas com Investimentos e Empréstimos'][i] = (-invest) + (-emprestimos);

    // LUCRO FINAL
    resultados['Lucro / Prejuízo Final'][i] = resultados['Lucro / Prejuízo Líquido'][i] + 
                                              resultados['Despesas com Investimentos e Empréstimos'][i];
  }

  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  res.render('dre', { 
    user: res.locals.user, 
    ano, 
    estrutura: ESTRUTURA_DRE, 
    resultados, 
    meses 
  });
}, ROUTE));

module.exports = router;