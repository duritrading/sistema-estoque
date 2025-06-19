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

// Em src/routes/financeiro.js

router.get('/dre', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const ano = new Date().getFullYear();
        const query = `
            SELECT cf.nome as categoria, SUM(fc.valor) as total
            FROM fluxo_caixa fc
            JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
            WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
            GROUP BY cf.nome
        `;
        const result = await pool.query(query, [ano]);
        const dadosBrutos = result.rows;

        const dados = {};
        dadosBrutos.forEach(d => {
            dados[d.categoria] = parseFloat(d.total);
        });

        const get = (nome) => dados[nome] || 0;

        // Estrutura final da DRE, espelhando sua lista
        const estrutura = [
            { label: 'Receitas Operacionais', isHeader: true },
            { label: 'Receita de Vendas de Produtos e Serviços', valor: get('Receita de Vendas de Produtos e Serviços'), isSubItem: true },
            { label: 'Receita de Fretes e Entregas', valor: get('Receita de Fretes e Entregas'), isSubItem: true },
            { label: 'Receita Bruta de Vendas', css: 'dre-total-l1', valor: () => get('Receita de Vendas de Produtos e Serviços') + get('Receita de Fretes e Entregas') },

            { label: 'Deduções da Receita Bruta', isHeader: true },
            { label: 'Impostos Sobre Vendas', valor: get('Impostos Sobre Vendas'), isSubItem: true },
            { label: 'Comissões Sobre Vendas', valor: get('Comissões Sobre Vendas'), isSubItem: true },
            { label: 'Descontos Incondicionais', valor: get('Descontos Incondicionais'), isSubItem: true },
            { label: 'Devoluções de Vendas', valor: get('Devoluções de Vendas'), isSubItem: true },
            { label: 'Receita Líquida de Vendas', css: 'dre-total-l1', valor: (r) => r['Receita Bruta de Vendas'] - get('Impostos Sobre Vendas') - get('Comissões Sobre Vendas') - get('Descontos Incondicionais') - get('Devoluções de Vendas') },

            { label: 'Custos Operacionais', isHeader: true },
            { label: 'Custo dos Produtos Vendidos', valor: get('Custo dos Produtos Vendidos'), isSubItem: true },
            { label: 'Custo das Vendas de Produtos', valor: get('Custo das Vendas de Produtos'), isSubItem: true },
            { label: 'Custo dos Serviços Prestados', valor: get('Custo dos Serviços Prestados'), isSubItem: true },
            { label: 'Lucro Bruto', css: 'dre-total-l2', valor: (r) => r['Receita Líquida de Vendas'] - get('Custo dos Produtos Vendidos') - get('Custo das Vendas de Produtos') - get('Custo dos Serviços Prestados') },

            { label: 'Despesas Operacionais', isHeader: true },
            { label: 'Despesas Comerciais', valor: get('Despesas Comerciais'), isSubItem: true },
            { label: 'Despesas Administrativas', valor: get('Despesas Administrativas'), isSubItem: true },
            { label: 'Despesas Operacionais', valor: get('Despesas Operacionais'), isSubItem: true },
            { label: 'Lucro / Prejuízo Operacional', css: 'dre-total-l1', valor: (r) => r['Lucro Bruto'] - get('Despesas Comerciais') - get('Despesas Administrativas') - get('Despesas Operacionais') },

            { label: 'Receitas e Despesas Financeiras', isHeader: true },
            { label: 'Receitas e Rendimentos Financeiros', valor: get('Receitas e Rendimentos Financeiros'), isSubItem: true },
            { label: 'Despesas Financeiras', valor: -get('Despesas Financeiras'), isSubItem: true },

            { label: 'Outras Receitas e Despesas Não Operacionais', isHeader: true },
            { label: 'Outras Receitas Não Operacionais', valor: get('Outras Receitas Não Operacionais'), isSubItem: true },
            { label: 'Outras Despesas Não Operacionais', valor: -get('Outras Despesas Não Operacionais'), isSubItem: true },
            { label: 'Lucro / Prejuízo Líquido', css: 'dre-total-l3', valor: (r) => r['Lucro / Prejuízo Operacional'] + (get('Receitas e Rendimentos Financeiros') - get('Despesas Financeiras')) + (get('Outras Receitas Não Operacionais') - get('Outras Despesas Não Operacionais')) },

            { label: 'Despesas com Investimentos e Empréstimos', isHeader: true },
            { label: 'Investimentos em Imobilizado', valor: -get('Investimentos em Imobilizado'), isSubItem: true },
            { label: 'Empréstimos e Dívidas', valor: -get('Empréstimos e Dívidas'), isSubItem: true },
            { label: 'Lucro / Prejuízo Final', css: 'dre-total-final', valor: (r) => r['Lucro / Prejuízo Líquido'] - get('Investimentos em Imobilizado') - get('Empréstimos e Dívidas') },
        ];

        const resultados = {};
        estrutura.forEach(linha => {
            if (typeof linha.valor === 'function') {
                resultados[linha.label] = linha.valor(resultados);
            } else {
                resultados[linha.label] = linha.valor;
            }
        });

        res.render('dre-final', { user: res.locals.user, ano, estrutura, resultados });
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