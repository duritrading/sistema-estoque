const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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