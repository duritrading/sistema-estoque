const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota inicial: redireciona para a página principal do financeiro (fluxo de caixa)
router.get('/', (req, res) => {
  res.redirect('/financeiro/completo');
});

// ROTA FLUXO DE CAIXA: Mostra a página principal do financeiro
router.get('/completo', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');

  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const queryLancamentos = `SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`;
    const lancamentosResult = await pool.query(queryLancamentos);
    
    const queryTotais = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa WHERE status = 'PAGO'
    `;
    const totaisResult = await pool.query(queryTotais);
    
    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;
    
    // O nome da variável aqui deve ser o mesmo que a view espera
    res.render('financeiro', {
      user: res.locals.user,
      contas: lancamentosResult.rows || [], // CORRIGIDO: Enviando como 'contas'
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });
  } catch (error) {
    console.error('Erro ao carregar página financeira:', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// ROTA FATURAMENTO: Mostra o relatório de contas a receber com filtros
// Em src/routes/financeiro.js

router.get('/faturamento', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');

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

    const params = [data_inicio, data_fim];
    const query = `
      SELECT cr.id, cr.cliente_nome, cr.numero_parcela, cr.total_parcelas, cr.valor, 
             cr.data_vencimento, cr.status, p.descricao as produto_descricao
      FROM contas_a_receber cr
      JOIN movimentacoes m ON cr.movimentacao_id = m.id
      JOIN produtos p ON m.produto_id = p.id
      WHERE cr.data_vencimento >= $1 AND cr.data_vencimento <= $2
      ORDER BY cr.data_vencimento ASC
    `;

    const result = await pool.query(query, params);
    const contas = result.rows;

    // CÁLCULO DOS TOTAIS
    const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
    // NOVO CÁLCULO: SOMA APENAS O QUE ESTIVER COM STATUS 'Pendente' OU 'Atrasado'
    const totalPendente = contas
      .filter(conta => conta.status !== 'Pago')
      .reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

    res.render('faturamento', {
        user: res.locals.user,
        contas: contas,
        filtros: { data_inicio, data_fim },
        totalValor: totalValor,
        totalPendente: totalPendente // Enviando o novo total para a view
    });
  } catch (error) {
      console.error('Erro ao buscar contas a receber:', error);
      return res.status(500).send('Erro ao buscar dados de faturamento.');
  }
});

// ROTA DRE

router.get('/dre', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const ano = new Date().getFullYear();
        const query = `
            SELECT 
                cf.nome as categoria,
                cf.tipo as categoria_tipo,
                SUM(fc.valor) as total
            FROM fluxo_caixa fc
            JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
            WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
            GROUP BY cf.nome, cf.tipo
        `;
        const result = await pool.query(query, [ano]);
        const dadosBrutos = result.rows;

        const dados = {};
        dadosBrutos.forEach(d => {
            dados[d.categoria] = parseFloat(d.total);
        });

        const get = (nome) => dados[nome] || 0;

        // Estrutura da DRE com fórmulas
        const estrutura = [
            { label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item' },
            { label: 'Receita de Fretes e Entregas', tipo: 'item' },
            { label: 'Receita Bruta de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Impostos Sobre Vendas', tipo: 'item' },
            { label: 'Comissões Sobre Vendas', tipo: 'item' },
            { label: 'Descontos Incondicionais', tipo: 'item' },
            { label: 'Devoluções de Vendas', tipo: 'item' },
            { label: 'Receita Líquida de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Custo dos Produtos Vendidos', tipo: 'item' },
            { label: 'Custo das Vendas de Produtos', tipo: 'item' },
            { label: 'Custo dos Serviços Prestados', tipo: 'item' },
            { label: 'Lucro Bruto', tipo: 'total', css: 'dre-total-l2' },
            { label: 'Despesas Comerciais', tipo: 'item' },
            { label: 'Despesas Administrativas', tipo: 'item' },
            { label: 'Despesas Operacionais', tipo: 'item' },
            { label: 'Lucro / Prejuízo Operacional', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Receitas e Rendimentos Financeiros', tipo: 'item' },
            { label: 'Despesas Financeiras', tipo: 'item' },
            { label: 'Outras Receitas Não Operacionais', tipo: 'item' },
            { label: 'Outras Despesas Não Operacionais', tipo: 'item' },
            { label: 'Lucro / Prejuízo Líquido', tipo: 'total', css: 'dre-total-l3' },
            { label: 'Investimentos em Imobilizado', tipo: 'item' },
            { label: 'Empréstimos e Dívidas', tipo: 'item' },
            { label: 'Lucro / Prejuízo Final', tipo: 'total', css: 'dre-total-final' },
        ];

        const resultados = {};

        // Calcula os valores de forma sequencial e segura
        const recVendas = get('Receita de Vendas de Produtos e Serviços');
        const recFretes = get('Receita de Fretes e Entregas');
        resultados['Receita de Vendas de Produtos e Serviços'] = recVendas;
        resultados['Receita de Fretes e Entregas'] = recFretes;
        resultados['Receita Bruta de Vendas'] = recVendas + recFretes;

        const impVendas = get('Impostos Sobre Vendas');
        const comissoes = get('Comissões Sobre Vendas');
        const descontos = get('Descontos Incondicionais');
        const devolucoes = get('Devoluções de Vendas');
        resultados['Impostos Sobre Vendas'] = -impVendas;
        resultados['Comissões Sobre Vendas'] = -comissoes;
        resultados['Descontos Incondicionais'] = -descontos;
        resultados['Devoluções de Vendas'] = -devolucoes;
        resultados['Receita Líquida de Vendas'] = resultados['Receita Bruta de Vendas'] - impVendas - comissoes - descontos - devolucoes;

        const custoProdutos = get('Custo dos Produtos Vendidos');
        const custoVendas = get('Custo das Vendas de Produtos');
        const custoServicos = get('Custo dos Serviços Prestados');
        resultados['Custo dos Produtos Vendidos'] = -custoProdutos;
        resultados['Custo das Vendas de Produtos'] = -custoVendas;
        resultados['Custo dos Serviços Prestados'] = -custoServicos;
        resultados['Lucro Bruto'] = resultados['Receita Líquida de Vendas'] - custoProdutos - custoVendas - custoServicos;

        const despComerciais = get('Despesas Comerciais');
        const despAdmin = get('Despesas Administrativas');
        const despOperacionais = get('Despesas Operacionais');
        resultados['Despesas Comerciais'] = -despComerciais;
        resultados['Despesas Administrativas'] = -despAdmin;
        resultados['Despesas Operacionais'] = -despOperacionais;
        resultados['Lucro / Prejuízo Operacional'] = resultados['Lucro Bruto'] - despComerciais - despAdmin - despOperacionais;

        const recFinanceiras = get('Receitas e Rendimentos Financeiros');
        const despFinanceiras = get('Despesas Financeiras');
        resultados['Receitas e Rendimentos Financeiros'] = recFinanceiras;
        resultados['Despesas Financeiras'] = -despFinanceiras;

        const outrasRec = get('Outras Receitas Não Operacionais');
        const outrasDesp = get('Outras Despesas Não Operacionais');
        resultados['Outras Receitas Não Operacionais'] = outrasRec;
        resultados['Outras Despesas Não Operacionais'] = -outrasDesp;
        resultados['Lucro / Prejuízo Líquido'] = resultados['Lucro / Prejuízo Operacional'] + (recFinanceiras - despFinanceiras) + (outrasRec - outrasDesp);

        const invest = get('Investimentos em Imobilizado');
        const emprestimos = get('Empréstimos e Dívidas');
        resultados['Investimentos em Imobilizado'] = -invest;
        resultados['Empréstimos e Dívidas'] = -emprestimos;
        resultados['Lucro / Prejuízo Final'] = resultados['Lucro / Prejuízo Líquido'] - invest - emprestimos;

        res.render('dre', { user: res.locals.user, ano, estrutura, resultados });

    } catch (err) {
        console.error("Erro ao gerar DRE:", err);
        res.status(500).send('Erro ao gerar relatório DRE.');
    }
});

// ROTA NOVO LANÇAMENTO
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { data_operacao, tipo, valor, descricao } = req.body;
        const categoriaId = tipo === 'CREDITO' ? 1 : 3;
        await pool.query(`INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, $2, $3, $4, $5, 'PAGO')`, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId]);
        res.redirect('/financeiro/completo');
    } catch(err) {
        res.status(500).send('Erro ao criar lançamento.');
    }
});

module.exports = router;