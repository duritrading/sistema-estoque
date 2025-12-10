// ========================================
// DRE - COM VALIDAÇÃO JOI
// ========================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateQuery } = require('../middleware/validation');
const Joi = require('joi');

// ========================================
// SCHEMA DE VALIDAÇÃO
// ========================================

const filtroAnoSchema = Joi.object({
  ano: Joi.number()
    .integer()
    .min(2000)
    .max(2100)
    .default(new Date().getFullYear())
    .messages({
      'number.base': 'Ano deve ser um número',
      'number.min': 'Ano mínimo: 2000',
      'number.max': 'Ano máximo: 2100'
    })
});

// ========================================
// ESTRUTURA DO DRE
// ========================================

const ESTRUTURA_DRE = [
  { label: 'Receitas Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item' },
  { label: 'Receita de Fretes e Entregas', tipo: 'item' },
  { label: 'Receita Bruta de Vendas', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Deduções da Receita Bruta', tipo: 'header', css: 'dre-header' },
  { label: 'Impostos Sobre Vendas', tipo: 'item' },
  { label: 'Comissões Sobre Vendas', tipo: 'item' },
  { label: 'Descontos Incondicionais', tipo: 'item' },
  { label: 'Deduções da Receita Bruta', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Receita Líquida de Vendas', tipo: 'total', css: 'dre-total-l2' },

  { label: 'Custo das Mercadorias Vendidas (CMV)', tipo: 'header', css: 'dre-header' },
  { label: 'Custo de Produtos Vendidos', tipo: 'item' },
  { label: 'Custo de Fretes e Transportes', tipo: 'item' },
  { label: 'Custo das Mercadorias Vendidas (CMV)', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Lucro Bruto', tipo: 'total', css: 'dre-total-l2' },

  { label: 'Despesas Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Despesas Administrativas', tipo: 'item' },
  { label: 'Despesas com Pessoal', tipo: 'item' },
  { label: 'Despesas com Marketing', tipo: 'item' },
  { label: 'Despesas Operacionais', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Lucro / Prejuízo Operacional', tipo: 'total', css: 'dre-total-l2' },

  { label: 'Receitas e Despesas Financeiras', tipo: 'header', css: 'dre-header' },
  { label: 'Receitas Financeiras', tipo: 'item' },
  { label: 'Despesas Financeiras', tipo: 'item' },
  { label: 'Receitas e Despesas Financeiras', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Outras Receitas e Despesas Não Operacionais', tipo: 'header', css: 'dre-header' },
  { label: 'Outras Receitas Não Operacionais', tipo: 'item' },
  { label: 'Outras Despesas Não Operacionais', tipo: 'item' },
  { label: 'Outras Receitas e Despesas Não Operacionais', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Lucro / Prejuízo Líquido', tipo: 'total', css: 'dre-total-l2' },

  { label: 'Despesas com Investimentos e Empréstimos', tipo: 'header', css: 'dre-header' },
  { label: 'Investimentos em Imobilizado', tipo: 'item' },
  { label: 'Empréstimos e Dívidas', tipo: 'item' },
  { label: 'Despesas com Investimentos e Empréstimos', tipo: 'total', css: 'dre-total-l1' },

  { label: 'Lucro / Prejuízo Final', tipo: 'total', css: 'dre-total-final' }
];

// ========================================
// GET / - Relatório DRE
// ========================================

router.get('/', validateQuery(filtroAnoSchema), async (req, res) => {
  const ano = req.query.ano;

  try {
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
      dadosPorCategoria[dado.categoria][mesIndex] = parseFloat(dado.total);
    });

    const getValores = (nome) => dadosPorCategoria[nome] || Array(12).fill(0);

    // Calcular resultados
    const resultados = {};
    ESTRUTURA_DRE.forEach(item => {
      resultados[item.label] = Array(12).fill(0);
    });

    for (let i = 0; i < 12; i++) {
      // RECEITAS
      const vendas = getValores('Receita de Vendas de Produtos e Serviços')[i];
      const fretes = getValores('Receita de Fretes e Entregas')[i];
      
      resultados['Receita de Vendas de Produtos e Serviços'][i] = vendas;
      resultados['Receita de Fretes e Entregas'][i] = fretes;
      resultados['Receita Bruta de Vendas'][i] = vendas + fretes;

      // DEDUÇÕES
      const impostos = getValores('Impostos Sobre Vendas')[i];
      const comissoes = getValores('Comissões Sobre Vendas')[i];
      const descontos = getValores('Descontos Incondicionais')[i];
      
      resultados['Impostos Sobre Vendas'][i] = -impostos;
      resultados['Comissões Sobre Vendas'][i] = -comissoes;
      resultados['Descontos Incondicionais'][i] = -descontos;
      resultados['Deduções da Receita Bruta'][i] = (-impostos) + (-comissoes) + (-descontos);

      // RECEITA LÍQUIDA
      resultados['Receita Líquida de Vendas'][i] = resultados['Receita Bruta de Vendas'][i] + 
                                                  resultados['Deduções da Receita Bruta'][i];

      // CMV
      const custoProdutos = getValores('Custo de Produtos Vendidos')[i];
      const custoFretes = getValores('Custo de Fretes e Transportes')[i];
      
      resultados['Custo de Produtos Vendidos'][i] = -custoProdutos;
      resultados['Custo de Fretes e Transportes'][i] = -custoFretes;
      resultados['Custo das Mercadorias Vendidas (CMV)'][i] = (-custoProdutos) + (-custoFretes);

      // LUCRO BRUTO
      resultados['Lucro Bruto'][i] = resultados['Receita Líquida de Vendas'][i] + 
                                    resultados['Custo das Mercadorias Vendidas (CMV)'][i];

      // DESPESAS OPERACIONAIS
      const despAdmin = getValores('Despesas Administrativas')[i];
      const despPessoal = getValores('Despesas com Pessoal')[i];
      const despMkt = getValores('Despesas com Marketing')[i];
      
      resultados['Despesas Administrativas'][i] = -despAdmin;
      resultados['Despesas com Pessoal'][i] = -despPessoal;
      resultados['Despesas com Marketing'][i] = -despMkt;
      resultados['Despesas Operacionais'][i] = (-despAdmin) + (-despPessoal) + (-despMkt);

      // LUCRO OPERACIONAL
      resultados['Lucro / Prejuízo Operacional'][i] = resultados['Lucro Bruto'][i] + 
                                                    resultados['Despesas Operacionais'][i];

      // FINANCEIRAS
      const recFin = getValores('Receitas Financeiras')[i];
      const despFin = getValores('Despesas Financeiras')[i];
      
      resultados['Receitas Financeiras'][i] = recFin;
      resultados['Despesas Financeiras'][i] = -despFin;
      resultados['Receitas e Despesas Financeiras'][i] = recFin + (-despFin);

      // NÃO OPERACIONAIS
      const outrasRec = getValores('Outras Receitas Não Operacionais')[i];
      const outrasDesp = getValores('Outras Despesas Não Operacionais')[i];
      
      resultados['Outras Receitas Não Operacionais'][i] = outrasRec;
      resultados['Outras Despesas Não Operacionais'][i] = -outrasDesp;
      resultados['Outras Receitas e Despesas Não Operacionais'][i] = outrasRec + (-outrasDesp);

      // LUCRO LÍQUIDO
      resultados['Lucro / Prejuízo Líquido'][i] = resultados['Lucro / Prejuízo Operacional'][i] + 
                                                resultados['Receitas e Despesas Financeiras'][i] + 
                                                resultados['Outras Receitas e Despesas Não Operacionais'][i];

      // INVESTIMENTOS/EMPRÉSTIMOS
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

  } catch (err) {
    console.error('Erro ao gerar DRE:', err);
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao gerar relatório DRE.',
      voltarUrl: '/'
    });
  }
});

module.exports = router;