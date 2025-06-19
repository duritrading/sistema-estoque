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
    if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');

    try {
        const ano = new Date().getFullYear();
        const query = `
            SELECT 
                TO_CHAR(data_operacao, 'MM') as mes_index,
                cf.nome as categoria,
                cf.tipo as categoria_tipo,
                SUM(fc.valor) as total
            FROM fluxo_caixa fc
            JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
            WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
            GROUP BY mes_index, cf.nome, cf.tipo
        `;
        const result = await pool.query(query, [ano]);
        const dadosBrutos = result.rows;

        // Define a estrutura da DRE
        const estruturaDRE = [
            { nome: 'Receita de Vendas e Serviços', tipo: 'receita', isSubItem: true },
            { nome: 'Receita Bruta de Vendas', tipo: 'subtotal', isHeader: true, formula: (totais) => totais.receitas },
            { nome: 'Impostos Sobre Vendas', tipo: 'deducao', isSubItem: true },
            { nome: 'Comissões Sobre Vendas', tipo: 'deducao', isSubItem: true },
            { nome: 'Receita Líquida de Vendas', tipo: 'subtotal', isHeader: true, formula: (totais) => totais.receitas - totais.deducoes },
            { nome: 'Custo dos Produtos Vendidos', tipo: 'custo', isSubItem: true },
            { nome: 'Custos Operacionais', tipo: 'subtotal', isHeader: true, formula: (totais) => totais.custos },
            { nome: 'Lucro Bruto', tipo: 'subtotal', isHeader: true, formula: (totais) => (totais.receitas - totais.deducoes) - totais.custos },
            { nome: 'Despesas Comerciais', tipo: 'despesa', isSubItem: true },
            { nome: 'Despesas Administrativas', tipo: 'despesa', isSubItem: true },
            { nome: 'Despesas Operacionais', tipo: 'despesa', isSubItem: true },
            { nome: 'Lucro / Prejuízo Operacional', tipo: 'subtotal', isHeader: true, style: 'final-result', formula: (totais) => ((totais.receitas - totais.deducoes) - totais.custos) - totais.despesas },
        ];

        // Monta o relatório final
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const totaisPorTipo = { receitas: Array(12).fill(0), deducoes: Array(12).fill(0), custos: Array(12).fill(0), despesas: Array(12).fill(0) };

        // Agrupa os dados brutos por tipo
        dadosBrutos.forEach(dado => {
            const mesIndex = parseInt(dado.mes_index) - 1;
            const tipoLinha = estruturaDRE.find(e => e.nome === dado.categoria)?.tipo;
            if (tipoLinha && totaisPorTipo[tipoLinha]) {
                totaisPorTipo[tipoLinha][mesIndex] += parseFloat(dado.total);
            }
        });

        // Prepara cada linha do relatório para a view
        const relatorioFinal = estruturaDRE.map(linha => {
            let valoresMensais = Array(12).fill(0);
            if (linha.tipo !== 'subtotal') {
                const dadosDaCategoria = dadosBrutos.filter(d => d.categoria === linha.nome);
                dadosDaCategoria.forEach(d => {
                    valoresMensais[parseInt(d.mes_index) - 1] = parseFloat(d.total);
                });
            } else {
                for(let i=0; i<12; i++) {
                    valoresMensais[i] = linha.formula({
                        receitas: totaisPorTipo.receitas[i],
                        deducoes: totaisPorTipo.deducoes[i],
                        custos: totaisPorTipo.custos[i],
                        despesas: totaisPorTipo.despesas[i]
                    });
                }
            }
            return { ...linha, valores: valoresMensais };
        });

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