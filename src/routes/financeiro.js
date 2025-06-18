const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Rota principal /financeiro redireciona para a completa
router.get('/', (req, res) => {
  return res.redirect('/financeiro/completo');
});

// Página principal do fluxo de caixa
router.get('/completo', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});

// Processar novo lançamento no fluxo de caixa
router.post('/lancamento', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});

// Rota para o relatório DRE
router.get('/dre', (req, res) => {
    // A lógica desta rota continua a mesma
    // ...
});


// ROTA DE FATURAMENTO ATUALIZADA
router.get('/faturamento', (req, res) => {
  let { data_inicio, data_fim } = req.query;
  const isProduction = !!process.env.DATABASE_URL;

  if (!data_inicio) {
    const hoje = new Date();
    data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
  }
  if (!data_fim) {
    const hoje = new Date();
    data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
  }
  
  // 1. QUERY ATUALIZADA PARA INCLUIR O NOME DO PRODUTO
  let query = `
    SELECT 
      cr.id, 
      cr.movimentacao_id, 
      cr.cliente_nome, 
      cr.numero_parcela, 
      cr.total_parcelas, 
      cr.valor, 
      cr.data_vencimento, 
      cr.data_pagamento, 
      cr.status,
      p.descricao as produto_descricao
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

    // 2. CÁLCULO DA SOMA TOTAL
    const totalValor = (contas || []).reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

    res.render('faturamento', {
      user: res.locals.user,
      contas: Array.isArray(contas) ? contas : [],
      filtros: { data_inicio, data_fim },
      totalValor: totalValor // Enviando o total para a view
    });
  });
});

// 3. NOVA ROTA PARA REGISTRAR O PAGAMENTO
router.post('/faturamento/registrar-pagamento/:id', (req, res) => {
  const contaId = req.params.id;
  const dataPagamento = new Date().toISOString().split('T')[0];

  // Passo 1: Buscar os dados da conta a receber
  db.get(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    JOIN movimentacoes m ON cr.movimentacao_id = m.id
    JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = ?
  `, [contaId], (err, conta) => {
    if (err || !conta) {
      return res.status(500).send("Erro: Conta a receber não encontrada.");
    }
    
    if (conta.status === 'Pago') {
      return res.redirect('/financeiro/faturamento'); // Já está paga, não faz nada
    }

    // Passo 2: Inserir o crédito no fluxo de caixa
    const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao}`;
    db.run(`
      INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id)
      VALUES (?, 'CREDITO', ?, ?, ?)
    `, [dataPagamento, conta.valor, descricaoFluxo, 1], function(err) { // Categoria 1 = Receita de Vendas
      if (err) {
        return res.status(500).send("Erro ao inserir no fluxo de caixa.");
      }
      
      const fluxoCaixaId = this.lastID;

      // Passo 3: Atualizar o status da conta a receber
      db.run(`
        UPDATE contas_a_receber 
        SET status = 'Pago', data_pagamento = ?, fluxo_caixa_id = ?
        WHERE id = ?
      `, [dataPagamento, fluxoCaixaId, contaId], (err) => {
        if (err) {
          return res.status(500).send("Erro ao atualizar status da conta.");
        }
        res.redirect('/financeiro/faturamento');
      });
    });
  });
});

module.exports = router;