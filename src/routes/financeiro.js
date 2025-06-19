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

router.get('/dre', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const ano = new Date().getFullYear();
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

        // Define a estrutura da DRE, como na sua planilha
        const estruturaDRE = [
            { nome: 'Receita de Vendas e Serviços', tipo: 'receita', isHeader: false, categorias: ['Receita de Vendas de Produtos e Serviços'] },
            { nome: 'Receita Bruta de Vendas', tipo: 'total_receita', isHeader: true },
            { nome: 'Impostos Sobre Vendas', tipo: 'deducao', isHeader: false, categorias: ['Impostos Sobre Vendas'] },
            { nome: 'Receita Líquida de Vendas', tipo: 'total_liquido', isHeader: true },
            { nome: 'Custo dos Produtos Vendidos', tipo: 'custo', isHeader: false, categorias: ['Custo dos Produtos Vendidos'] },
            { nome: 'Custos Operacionais', tipo: 'total_custo', isHeader: true },
            { nome: 'Lucro Bruto', tipo: 'lucro_bruto', isHeader: true },
            { nome: 'Despesas Administrativas', tipo: 'despesa', isHeader: false, categorias: ['Despesas Administrativas'] },
            { nome: 'Despesas Operacionais', tipo: 'despesa', isHeader: false, categorias: ['Despesas Operacionais', 'Comissões Sobre Vendas'] },
            { nome: 'Despesas Operacionais Total', tipo: 'total_despesa', isHeader: true },
            { nome: 'Lucro / Prejuízo Operacional', tipo: 'resultado_final', isHeader: true, class: 'final-result' },
        ];

        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const relatorioFinal = [];

        // Processa os dados para preencher a estrutura
        estruturaDRE.forEach(linha => {
            const valoresMensais = Array(12).fill(0);
            if (linha.categorias) {
                linha.categorias.forEach(catNome => {
                    dadosBrutos.filter(d => d.categoria === catNome).forEach(dado => {
                        const mesIndex = parseInt(d.mes_index) - 1;
                        valoresMensais[mesIndex] += parseFloat(dado.total);
                    });
                });
            }
            relatorioFinal.push({ ...linha, valores: valoresMensais });
        });

        // Calcula os totais e subtotais
        const receitaBruta = Array(12).fill(0);
        const receitaLiquida = Array(12).fill(0);
        const custoTotal = Array(12).fill(0);
        const lucroBruto = Array(12).fill(0);
        const despesaTotal = Array(12).fill(0);
        const resultadoFinal = Array(12).fill(0);

        for(let i=0; i<12; i++) {
            receitaBruta[i] = relatorioFinal.filter(l => l.tipo === 'receita').reduce((sum, l) => sum + l.valores[i], 0);
            const deducoes = relatorioFinal.filter(l => l.tipo === 'deducao').reduce((sum, l) => sum + l.valores[i], 0);
            receitaLiquida[i] = receitaBruta[i] - deducoes;
            custoTotal[i] = relatorioFinal.filter(l => l.tipo === 'custo').reduce((sum, l) => sum + l.valores[i], 0);
            lucroBruto[i] = receitaLiquida[i] - custoTotal[i];
            despesaTotal[i] = relatorioFinal.filter(l => l.tipo === 'despesa').reduce((sum, l) => sum + l.valores[i], 0);
            resultadoFinal[i] = lucroBruto[i] - despesaTotal[i];
        }

        // Atribui os valores calculados às linhas corretas
        relatorioFinal.find(l => l.tipo === 'total_receita').valores = receitaBruta;
        relatorioFinal.find(l => l.tipo === 'total_liquido').valores = receitaLiquida;
        relatorioFinal.find(l => l.tipo === 'total_custo').valores = custoTotal;
        relatorioFinal.find(l => l.tipo === 'lucro_bruto').valores = lucroBruto;
        relatorioFinal.find(l => l.tipo === 'total_despesa').valores = despesaTotal;
        relatorioFinal.find(l => l.tipo === 'resultado_final').valores = resultadoFinal;

        res.render('dre', {
            user: res.locals.user,
            ano,
            meses,
            relatorio: relatorioFinal
        });
    } catch (err) {
        console.error("Erro ao gerar DRE:", err);
        res.status(500).send('Erro ao gerar relatório DRE.');
    }
});

// ROTA REGISTRAR PAGAMENTO
router.post('/faturamento/registrar-pagamento/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    const contaId = req.params.id;
    const dataPagamento = new Date().toISOString().split('T')[0];
    
    try {
        const contaResult = await pool.query(`SELECT cr.*, p.descricao as produto_descricao FROM contas_a_receber cr JOIN movimentacoes m ON cr.movimentacao_id = m.id JOIN produtos p ON m.produto_id = p.id WHERE cr.id = $1`, [contaId]);
        const conta = contaResult.rows[0];
        
        if (!conta) return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a receber não encontrada.' });
        if (conta.status === 'Pago') return res.redirect('/financeiro/faturamento');

        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
        const insertResult = await pool.query(`INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO') RETURNING id`, [dataPagamento, conta.valor, descricaoFluxo, 1]);
        const fluxoCaixaId = insertResult.rows[0].id;

        await pool.query(`UPDATE contas_a_receber SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`, [dataPagamento, fluxoCaixaId, contaId]);
        res.redirect('/financeiro/faturamento');
    } catch (err) {
        res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Não foi possível registrar o pagamento.' });
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