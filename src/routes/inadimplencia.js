// ========================================
// INADIMPLÊNCIA - COM VALIDAÇÃO JOI
// ========================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const Joi = require('joi');

// ========================================
// SCHEMAS DE VALIDAÇÃO
// ========================================

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
    .messages({
      'number.base': 'ID deve ser um número',
      'number.positive': 'ID deve ser positivo',
      'any.required': 'ID é obrigatório'
    })
});

const marcarPagaSchema = Joi.object({
  data_pagamento: Joi.date()
    .iso()
    .max('now')
    .required()
    .messages({
      'date.base': 'Data de pagamento inválida',
      'date.max': 'Data de pagamento não pode ser futura',
      'any.required': 'Data de pagamento é obrigatória'
    }),
  _csrf: Joi.string().optional() // Permite o token CSRF
});

// ========================================
// GET / - Relatório de inadimplência
// ========================================

router.get('/', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const query = `
      SELECT 
        cr.id, 
        cr.cliente_nome, 
        cr.numero_parcela, 
        cr.total_parcelas, 
        cr.valor, 
        cr.data_vencimento, 
        cr.movimentacao_id, 
        p.descricao as produto_descricao,
        COALESCE(cr.descricao, '') as conta_descricao,
        (CURRENT_DATE - cr.data_vencimento::date) as dias_atraso
      FROM contas_a_receber cr
      LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
      LEFT JOIN produtos p ON m.produto_id = p.id
      WHERE 
        cr.status = 'Pendente' 
        AND cr.data_vencimento < $1
      ORDER BY cr.data_vencimento ASC
    `;

    const result = await pool.query(query, [hoje]);
    const contasVencidas = result.rows;

    const totalEmAtraso = contasVencidas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
    const clientesUnicos = [...new Set(contasVencidas.map(conta => conta.cliente_nome))];

    res.render('inadimplencia', {
      user: res.locals.user,
      contasVencidas,
      totalEmAtraso,
      clientesInadimplentes: clientesUnicos.length
    });

  } catch (error) {
    console.error('Erro ao buscar inadimplência:', error);
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao buscar dados de inadimplência.',
      voltarUrl: '/'
    });
  }
});

// ========================================
// POST /marcar-paga/:id - Registrar pagamento atrasado
// ========================================

router.post('/marcar-paga/:id', 
  validateParams(idParamSchema), 
  validateBody(marcarPagaSchema), 
  async (req, res) => {
    const { id } = req.params;
    const { data_pagamento } = req.body;

    try {
      // Buscar conta
      const contaResult = await pool.query(`
        SELECT 
          cr.*, 
          p.descricao as produto_descricao,
          COALESCE(cr.descricao, '') as conta_descricao
        FROM contas_a_receber cr
        LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
        LEFT JOIN produtos p ON m.produto_id = p.id
        WHERE cr.id = $1
      `, [id]);

      const conta = contaResult.rows[0];

      if (!conta) {
        return res.render('error', {
          user: res.locals.user,
          titulo: 'Erro',
          mensagem: 'Conta não encontrada.',
          voltarUrl: '/inadimplencia'
        });
      }

      if (conta.status === 'Pago') {
        return res.render('error', {
          user: res.locals.user,
          titulo: 'Ação Bloqueada',
          mensagem: 'Esta conta já foi marcada como paga.',
          voltarUrl: '/inadimplencia'
        });
      }

      // Registrar no fluxo de caixa
      const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.conta_descricao || conta.produto_descricao || conta.cliente_nome} (PAGAMENTO ATRASADO)`;

      const insertResult = await pool.query(`
        INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
        VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
        RETURNING id
      `, [data_pagamento, conta.valor, descricaoFluxo, 1]);

      const fluxoCaixaId = insertResult.rows[0].id;

      // Atualizar conta
      await pool.query(`
        UPDATE contas_a_receber 
        SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 
        WHERE id = $3
      `, [data_pagamento, fluxoCaixaId, id]);

      console.log(`✅ Conta ID ${id} marcada como paga em ${data_pagamento}`);
      res.redirect('/inadimplencia');

    } catch (err) {
      console.error('Erro ao registrar pagamento:', err);
      res.render('error', {
        user: res.locals.user,
        titulo: 'Erro',
        mensagem: 'Não foi possível registrar o pagamento: ' + err.message,
        voltarUrl: '/inadimplencia'
      });
    }
  }
);

// ========================================
// POST /excluir/:id - Excluir conta vencida
// ========================================

router.post('/excluir/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar conta
    const contaResult = await pool.query(`
      SELECT cr.*, p.descricao as produto_descricao
      FROM contas_a_receber cr
      LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
      LEFT JOIN produtos p ON m.produto_id = p.id
      WHERE cr.id = $1
    `, [id]);

    const conta = contaResult.rows[0];

    if (!conta) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro',
        mensagem: 'Conta não encontrada.',
        voltarUrl: '/inadimplencia'
      });
    }

    if (conta.status === 'Pago') {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Ação Bloqueada',
        mensagem: 'Não é possível excluir uma conta já paga.',
        voltarUrl: '/inadimplencia'
      });
    }

    // Excluir
    await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [id]);

    console.log(`✅ Conta ID ${id} excluída (cliente: ${conta.cliente_nome})`);
    res.redirect('/inadimplencia');

  } catch (err) {
    console.error('Erro ao excluir conta:', err);
    res.render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Não foi possível excluir a conta: ' + err.message,
      voltarUrl: '/inadimplencia'
    });
  }
});

module.exports = router;