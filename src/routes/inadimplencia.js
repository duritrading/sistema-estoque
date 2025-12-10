// src/routes/inadimplencia.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateParams } = require('../middleware/validation');
const { idParamSchema, notFound, renderError } = require('../utils/helpers');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/inadimplencia';

// Schema para pagamento
const marcarPagaSchema = Joi.object({
  data_pagamento: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
});

// GET / - Relatório de contas vencidas
router.get('/', asyncHandler(async (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];

  const result = await pool.query(`
    SELECT 
      cr.id, cr.cliente_nome, cr.numero_parcela, cr.total_parcelas, 
      cr.valor, cr.data_vencimento, cr.movimentacao_id, cr.status,
      p.descricao as produto_descricao,
      COALESCE(cr.descricao, '') as conta_descricao,
      (CURRENT_DATE - cr.data_vencimento::date) as dias_atraso
    FROM contas_a_receber cr
    LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
    LEFT JOIN produtos p ON m.produto_id = p.id
    WHERE cr.status = 'Pendente' AND cr.data_vencimento < $1
    ORDER BY cr.data_vencimento ASC
  `, [hoje]);

  const contasVencidas = result.rows;
  const totalEmAtraso = contasVencidas.reduce((sum, c) => sum + parseFloat(c.valor), 0);
  const clientesUnicos = [...new Set(contasVencidas.map(c => c.cliente_nome))];

  res.render('inadimplencia', {
    user: res.locals.user,
    contasVencidas,
    totalEmAtraso,
    clientesInadimplentes: clientesUnicos.length
  });
}, ROUTE));

// POST /marcar-paga/:id - Registrar pagamento de conta vencida
router.post('/marcar-paga/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data_pagamento } = req.body;

  // Validar data
  if (!data_pagamento || !/^\d{4}-\d{2}-\d{2}$/.test(data_pagamento)) {
    return renderError(res, {
      titulo: 'Erro de Validação',
      mensagem: 'Data de pagamento é obrigatória e deve estar no formato correto.',
      voltar_url: ROUTE
    });
  }

  // Buscar conta com descrições
  const contaResult = await pool.query(`
    SELECT cr.*, p.descricao as produto_descricao, COALESCE(cr.descricao, '') as conta_descricao
    FROM contas_a_receber cr
    LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
    LEFT JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = $1
  `, [id]);

  const conta = contaResult.rows[0];
  if (!conta) return notFound(res, 'Conta', ROUTE);

  if (conta.status === 'Pago') {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Esta conta já foi marcada como paga.',
      voltar_url: ROUTE
    });
  }

  // Descrição do fluxo de caixa
  const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.conta_descricao || conta.produto_descricao || conta.cliente_nome} (PAGAMENTO ATRASADO)`;

  // Criar lançamento no fluxo de caixa
  const fluxoResult = await pool.query(
    `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
     VALUES ($1, 'CREDITO', $2, $3, 1, 'PAGO') RETURNING id`,
    [data_pagamento, conta.valor, descricaoFluxo]
  );

  // Atualizar conta
  await pool.query(
    'UPDATE contas_a_receber SET status = $1, data_pagamento = $2, fluxo_caixa_id = $3 WHERE id = $4',
    ['Pago', data_pagamento, fluxoResult.rows[0].id, id]
  );

  res.redirect(ROUTE);
}, ROUTE));

// POST /excluir/:id - Excluir conta vencida
router.post('/excluir/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;

  const contaResult = await pool.query(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
    LEFT JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = $1
  `, [id]);

  const conta = contaResult.rows[0];
  if (!conta) return notFound(res, 'Conta', ROUTE);

  if (conta.status === 'Pago') {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Não é possível excluir uma conta já paga. Use estorno no fluxo de caixa.',
      voltar_url: ROUTE
    });
  }

  await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;