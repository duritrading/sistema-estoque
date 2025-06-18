const express = require('express');
const router = express.Router();
// Importa a pool de conexão diretamente, a forma mais robusta para async/await
const { pool } = require('../config/database');

// Rota inicial: redireciona para a página principal do financeiro (fluxo de caixa)
router.get('/', (req, res) => {
  res.redirect('/financeiro/completo');
});

// ROTA FLUXO DE CAIXA: Mostra a página principal do financeiro
router.get('/completo', async (req, res) => {
  // Validação para garantir que a pool de conexão está disponível
  if (!pool) {
    return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');
  }

  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    // Busca os últimos 20 lançamentos do fluxo de caixa
    const queryLancamentos = `SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`;
    const lancamentosResult = await pool.query(queryLancamentos);
    
    // Busca os totais de crédito e débito
    const queryTotais = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa WHERE status = 'PAGO'
    `;
    const totaisResult = await pool.query(queryTotais);
    
    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;
    
    res.render('financeiro', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });
  } catch (error) {
    console.error('Erro ao carregar página financeira:', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// ROTA FATURAMENTO: Mostra o relatório de contas a receber com todas as melhorias
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
    
    // Query ATUALIZADA para buscar o nome do produto com JOIN
    const query = `
      SELECT 
        cr.id, cr.movimentacao_id, cr.cliente_nome, cr.numero_parcela, 
        cr.total_parcelas, cr.valor, cr.data_vencimento, cr.data_pagamento, 
        cr.status, p.descricao as produto_descricao
      FROM contas_a_receber cr
      JOIN movimentacoes m ON cr.movimentacao_id = m.id
      JOIN produtos p ON m.produto_id = p.id
      WHERE cr.data_vencimento >= $1 AND cr.data_vencimento <= $2
      ORDER BY cr.data_vencimento ASC
    `;
    
    const result = await pool.query(query, params);
    const contas = result.rows;

    // Lógica para calcular a soma dos valores
    const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

    res.render('faturamento', {
      user: res.locals.user,
      contas: contas,
      filtros: { data_inicio, data_fim },
      totalValor: totalValor
    });
  } catch (error) {
      console.error('Erro ao buscar contas a receber:', error);
      return res.status(500).send('Erro ao buscar dados de faturamento.');
  }
});

// ROTA REGISTRAR PAGAMENTO: Funcionalidade completa
router.post('/faturamento/registrar-pagamento/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');

    const contaId = req.params.id;
    const dataPagamento = new Date().toISOString().split('T')[0];
    
    try {
        // Passo 1: Busca dados da conta e do produto associado
        const contaResult = await pool.query(`
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            JOIN movimentacoes m ON cr.movimentacao_id = m.id
            JOIN produtos p ON m.produto_id = p.id
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        if (!conta) return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a receber não encontrada.' });
        if (conta.status === 'Pago') return res.redirect('/financeiro/faturamento');

        // Passo 2: Insere o crédito no fluxo de caixa
        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
            RETURNING id
        `, [dataPagamento, conta.valor, descricaoFluxo, 1]); // Categoria 1 = Receita de Vendas

        const fluxoCaixaId = insertResult.rows[0].id;

        // Passo 3: Atualiza o status da conta a receber
        await pool.query(`
            UPDATE contas_a_receber 
            SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2
            WHERE id = $3
        `, [dataPagamento, fluxoCaixaId, contaId]);

        res.redirect('/financeiro/faturamento');

    } catch (error) {
        console.error("Erro ao registrar pagamento:", error);
        return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Não foi possível registrar o pagamento.' });
    }
});


// ROTA DRE:
router.get('/dre', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');
    // ... (o código da rota /dre que já está funcionando pode ser adaptado para pool.query se necessário)
});

// ROTA NOVO LANÇAMENTO:
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');
    // ... (o código da rota para criar lançamento pode ser adaptado para pool.query se necessário)
});


module.exports = router;