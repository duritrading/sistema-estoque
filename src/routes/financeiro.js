const express = require('express');
const router = express.Router();
const { db, pool } = require('../config/database');

// ROTA INICIAL: Redireciona para a página principal do financeiro
router.get('/', (req, res) => {
  res.redirect('/financeiro/completo');
});

// ROTA FLUXO DE CAIXA: Mostra a página principal do financeiro
router.get('/completo', async (req, res) => {
  // ... (O código desta rota, que já está funcionando, permanece o mesmo) ...
});

// ROTA FATURAMENTO: ATUALIZADA para buscar o nome do produto
router.get('/faturamento', (req, res) => {
  let { data_inicio, data_fim } = req.query;
  const isProduction = !!process.env.DATABASE_URL;

  // ... (a lógica de datas padrão permanece a mesma) ...
  
  // QUERY ATUALIZADA para incluir o nome do produto
  let query = `
    SELECT 
      cr.id, cr.movimentacao_id, cr.cliente_nome, cr.numero_parcela, 
      cr.total_parcelas, cr.valor, cr.data_vencimento, cr.data_pagamento, 
      cr.status, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
  `;
  const params = [];
  const whereClauses = [];
  let paramCount = 1;

  if (data_inicio) {
    whereClauses.push(`cr.data_vencimento >= ${isProduction ? '$' + paramCount++ : '?'}`);
    params.push(data_inicio);
  }
  if (data_fim) {
    whereClauses.push(`cr.data_vencimento <= ${isProduction ? '$' + paramCount++ : '?'}`);
    params.push(data_fim);
  }
  
  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }
  query += ' ORDER BY cr.data_vencimento ASC';

  db.all(query, params, (err, contas) => {
    if (err) {
      console.error('Erro ao buscar contas a receber:', err);
      return res.status(500).send('Erro ao buscar dados de faturamento.');
    }
    const totalValor = (contas || []).reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
    res.render('faturamento', {
      user: res.locals.user,
      contas: Array.isArray(contas) ? contas : [],
      filtros: { data_inicio, data_fim },
      totalValor: totalValor
    });
  });
});

// ROTA DRE:
router.get('/dre', (req, res) => {
    // ... (O código desta rota, que já está funcionando, permanece o mesmo) ...
});
    
// NOVA ROTA PARA REGISTRAR O PAGAMENTO
router.post('/faturamento/registrar-pagamento/:id', (req, res) => {
  const contaId = req.params.id;
  const dataPagamento = new Date().toISOString().split('T')[0];

  // Passo 1: Buscar os dados da conta, incluindo o nome do produto
  db.get(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = ?
  `, [contaId], (err, conta) => {
    if (err || !conta) {
      return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a receber não encontrada.' });
    }
    if (conta.status === 'Pago') {
      return res.redirect('/financeiro/faturamento');
    }

    // Passo 2: Inserir o crédito no fluxo de caixa
    const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
    const queryInsert = `
      INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
      VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
      RETURNING id
    `;
    db.run(queryInsert, [dataPagamento, conta.valor, descricaoFluxo, 1], function(err) { // Categoria 1 = Receita de Vendas
      if (err) {
        return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Erro ao inserir no fluxo de caixa.' });
      }
      const fluxoCaixaId = this.lastID;

      // Passo 3: Atualizar o status da conta a receber
      const queryUpdate = `
        UPDATE contas_a_receber 
        SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2
        WHERE id = $3
      `;
      db.run(queryUpdate, [dataPagamento, fluxoCaixaId, contaId], (err) => {
        if (err) {
          return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Erro ao atualizar status da conta.' });
        }
        res.redirect('/financeiro/faturamento');
      });
    });
  });
});

// Rota para criar LANÇAMENTO avulso
router.post('/lancamento', (req, res) => {
    // ... (O código desta rota, que já está funcionando, permanece o mesmo) ...
});


module.exports = router;