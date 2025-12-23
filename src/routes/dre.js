// src/routes/dre.js - DRE CONFORME ESTRUTURA CONTÁBIL
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');

// ========================================
// ESTRUTURA DO DRE (conforme imagem)
// ========================================
// tipo: 'grupo' = negrito sem fundo (título, sem valores)
// tipo: 'item' = normal (com valores)
// tipo: 'subtotal' = negrito + fundo cinza (soma do grupo)
// tipo: 'total' = negrito + fundo cinza escuro (soma acumulada)

const ESTRUTURA_DRE = [
  // RECEITAS OPERACIONAIS
  { id: 'grupo_receitas', label: 'Receitas Operacionais', tipo: 'grupo' },
  { id: 'receita_vendas', label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item', categoria: 'Receita de Vendas de Produtos e Serviços' },
  { id: 'receita_fretes', label: 'Receita de Fretes e Entregas', tipo: 'item', categoria: 'Receita de Fretes e Entregas' },
  { id: 'receita_bruta', label: 'Receita Bruta de Vendas', tipo: 'subtotal', soma: ['receita_vendas', 'receita_fretes'] },

  // DEDUÇÕES DA RECEITA BRUTA
  { id: 'grupo_deducoes', label: 'Deduções da Receita Bruta', tipo: 'grupo' },
  { id: 'impostos', label: 'Impostos Sobre Vendas', tipo: 'item', categoria: 'Impostos Sobre Vendas', negativo: true },
  { id: 'comissoes', label: 'Comissões Sobre Vendas', tipo: 'item', categoria: 'Comissões Sobre Vendas', negativo: true },
  { id: 'descontos', label: 'Descontos Incondicionais', tipo: 'item', categoria: 'Descontos Incondicionais', negativo: true },
  { id: 'devolucoes', label: 'Devoluções de Vendas', tipo: 'item', categoria: 'Devoluções de Vendas', negativo: true },

  // RECEITA LÍQUIDA (Receita Bruta - Deduções)
  { id: 'receita_liquida', label: 'Receita Líquida de Vendas', tipo: 'total', calculo: 'receita_bruta + impostos + comissoes + descontos + devolucoes' },

  // CUSTOS OPERACIONAIS
  { id: 'grupo_custos', label: 'Custos Operacionais', tipo: 'grupo' },
  { id: 'custo_produtos', label: 'Custo dos Produtos Vendidos', tipo: 'item', categoria: 'Custo dos Produtos Vendidos', negativo: true },
  { id: 'custo_vendas', label: 'Custo das Vendas de Produtos', tipo: 'item', categoria: 'Custo das Vendas de Produtos', negativo: true },
  { id: 'custo_servicos', label: 'Custo dos Serviços Prestados', tipo: 'item', categoria: 'Custo dos Serviços Prestados', negativo: true },

  // LUCRO BRUTO (Receita Líquida - Custos)
  { id: 'lucro_bruto', label: 'Lucro Bruto', tipo: 'total', calculo: 'receita_liquida + custo_produtos + custo_vendas + custo_servicos' },

  // DESPESAS OPERACIONAIS
  { id: 'grupo_despesas_op', label: 'Despesas Operacionais', tipo: 'grupo' },
  { id: 'desp_comerciais', label: 'Despesas Comerciais', tipo: 'item', categoria: 'Despesas Comerciais', negativo: true },
  { id: 'desp_administrativas', label: 'Despesas Administrativas', tipo: 'item', categoria: 'Despesas Administrativas', negativo: true },
  { id: 'desp_operacionais', label: 'Despesas Operacionais', tipo: 'item', categoria: 'Despesas Operacionais', negativo: true },

  // LUCRO OPERACIONAL (Lucro Bruto - Despesas Operacionais)
  { id: 'lucro_operacional', label: 'Lucro / Prejuízo Operacional', tipo: 'total', calculo: 'lucro_bruto + desp_comerciais + desp_administrativas + desp_operacionais' },

  // RECEITAS E DESPESAS FINANCEIRAS
  { id: 'grupo_financeiras', label: 'Receitas e Despesas Financeiras', tipo: 'grupo' },
  { id: 'receitas_financeiras', label: 'Receitas e Rendimentos Financeiros', tipo: 'item', categoria: 'Receitas Financeiras' },
  { id: 'despesas_financeiras', label: 'Despesas Financeiras', tipo: 'item', categoria: 'Despesas Financeiras', negativo: true },

  // OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS
  { id: 'grupo_nao_operacionais', label: 'Outras Receitas e Despesas Não Operacionais', tipo: 'grupo' },
  { id: 'outras_receitas', label: 'Outras Receitas Não Operacionais', tipo: 'item', categoria: 'Outras Receitas Não Operacionais' },
  { id: 'outras_despesas', label: 'Outras Despesas Não Operacionais', tipo: 'item', categoria: 'Outras Despesas Não Operacionais', negativo: true },

  // LUCRO LÍQUIDO (Lucro Operacional + Financeiras + Não Operacionais)
  { id: 'lucro_liquido', label: 'Lucro / Prejuízo Líquido', tipo: 'total', calculo: 'lucro_operacional + receitas_financeiras + despesas_financeiras + outras_receitas + outras_despesas' },

  // DESPESAS COM INVESTIMENTOS E EMPRÉSTIMOS
  { id: 'grupo_investimentos', label: 'Despesas com Investimentos e Empréstimos', tipo: 'grupo' },
  { id: 'investimentos', label: 'Investimentos em Imobilizado', tipo: 'item', categoria: 'Investimentos em Imobilizado', negativo: true },
  { id: 'emprestimos', label: 'Empréstimos e Dívidas', tipo: 'item', categoria: 'Empréstimos e Dívidas', negativo: true },

  // LUCRO FINAL
  { id: 'lucro_final', label: 'Lucro / Prejuízo Final', tipo: 'total-final', calculo: 'lucro_liquido + investimentos + emprestimos' }
];

// ========================================
// GET / - Relatório DRE
// ========================================

router.get('/', asyncHandler(async (req, res) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();

  // Buscar dados do fluxo de caixa agrupados por categoria e mês
  const query = `
    SELECT 
      TO_CHAR(data_operacao, 'MM') as mes_index,
      cf.nome as categoria,
      SUM(fc.valor) as total
    FROM fluxo_caixa fc
    JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
    WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
    GROUP BY mes_index, cf.nome
  `;

  const result = await pool.query(query, [ano]);
  const dadosBrutos = result.rows;

  // Mapeia dados por categoria e mês
  const dadosPorCategoria = {};
  dadosBrutos.forEach(dado => {
    const mesIndex = parseInt(dado.mes_index) - 1;
    if (!dadosPorCategoria[dado.categoria]) {
      dadosPorCategoria[dado.categoria] = Array(12).fill(0);
    }
    dadosPorCategoria[dado.categoria][mesIndex] = parseFloat(dado.total) || 0;
  });

  // Função para pegar valores de uma categoria
  const getValores = (categoria) => dadosPorCategoria[categoria] || Array(12).fill(0);

  // Calcular valores para cada linha
  const resultados = {};
  
  // Primeiro: calcular itens (valores diretos das categorias)
  ESTRUTURA_DRE.forEach(linha => {
    if (linha.tipo === 'item' && linha.categoria) {
      const valores = getValores(linha.categoria);
      resultados[linha.id] = valores.map(v => linha.negativo ? -Math.abs(v) : v);
    } else if (linha.tipo === 'grupo') {
      // Grupos não têm valores
      resultados[linha.id] = null;
    }
  });

  // Segundo: calcular subtotais e totais
  ESTRUTURA_DRE.forEach(linha => {
    if (linha.tipo === 'subtotal' && linha.soma) {
      // Subtotal = soma dos itens listados
      resultados[linha.id] = Array(12).fill(0).map((_, mes) => {
        return linha.soma.reduce((acc, itemId) => {
          return acc + (resultados[itemId] ? resultados[itemId][mes] : 0);
        }, 0);
      });
    }
  });

  // Terceiro: calcular totais acumulados (na ordem correta)
  ESTRUTURA_DRE.forEach(linha => {
    if ((linha.tipo === 'total' || linha.tipo === 'total-final') && linha.calculo) {
      // Extrair IDs do cálculo
      const ids = linha.calculo.split(/\s*\+\s*/);
      resultados[linha.id] = Array(12).fill(0).map((_, mes) => {
        return ids.reduce((acc, itemId) => {
          const val = resultados[itemId] ? resultados[itemId][mes] : 0;
          return acc + val;
        }, 0);
      });
    }
  });

  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  res.render('dre', {
    user: res.locals.user,
    currentPage: 'dre',
    ano,
    estrutura: ESTRUTURA_DRE,
    resultados,
    meses
  });
}, '/dre'));

module.exports = router;