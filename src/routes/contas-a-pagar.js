// src/routes/contas-a-pagar.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createContaPagarSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, renderError, buildRedirectUrl } = require('../utils/helpers');
const { findById, findAll } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/contas-a-pagar';

// Schema para pagamento
const pagarContaSchema = Joi.object({
  data_pagamento: Joi.date().iso().max('now').required()
});

// Helper: Obter datas padrão do mês
function getDefaultDates(query) {
  const hoje = new Date();
  return {
    data_inicio: query.data_inicio || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0],
    data_fim: query.data_fim || new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  };
}

// GET / - Listar contas a pagar
router.get('/', asyncHandler(async (req, res) => {
  const { data_inicio, data_fim } = getDefaultDates(req.query);

  const [contas, categorias, fornecedores] = await Promise.all([
    pool.query(`
      SELECT cp.*, f.nome as fornecedor_nome, cf.nome as categoria_nome
      FROM contas_a_pagar cp
      LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
      LEFT JOIN categorias_financeiras cf ON cp.categoria_id = cf.id
      WHERE cp.data_vencimento BETWEEN $1 AND $2
      ORDER BY cp.data_vencimento ASC
    `, [data_inicio, data_fim]),
    pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'DESPESA' ORDER BY nome`),
    findAll('fornecedores', 'nome')
  ]);

  const total = contas.rows.reduce((s, c) => s + parseFloat(c.valor || 0), 0);
  const pendente = contas.rows.filter(c => c.status !== 'Pago').reduce((s, c) => s + parseFloat(c.valor || 0), 0);

  res.render('contas-a-pagar', {
    user: res.locals.user,
    contas: contas.rows,
    categorias: categorias.rows,
    fornecedores,
    filtros: { data_inicio, data_fim },
    totalValor: total,
    totalPendente: pendente
  });
}, ROUTE));

// POST / - Criar conta a pagar
router.post('/', validateBody(createContaPagarSchema), asyncHandler(async (req, res) => {
  const { descricao, fornecedor_id, valor, data_vencimento, categoria_id } = req.body;
  
  await pool.query(
    'INSERT INTO contas_a_pagar (descricao, fornecedor_id, valor, data_vencimento, categoria_id) VALUES ($1, $2, $3, $4, $5)',
    [descricao, fornecedor_id || null, valor, data_vencimento, categoria_id]
  );
  
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /pagar/:id - Registrar pagamento
router.post('/pagar/:id', validateParams(idParamSchema), validateBody(pagarContaSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data_pagamento } = req.body;
  
  const conta = await findById('contas_a_pagar', id);
  if (!conta) return notFound(res, 'Conta', ROUTE);
  if (conta.status === 'Pago') return res.redirect(ROUTE);

  // Criar lançamento no fluxo de caixa
  const fluxoResult = await pool.query(
    `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
     VALUES ($1, 'DEBITO', $2, $3, $4, 'PAGO') RETURNING id`,
    [data_pagamento, conta.valor, `Pagamento: ${conta.descricao}`, conta.categoria_id]
  );

  // Atualizar conta
  await pool.query(
    'UPDATE contas_a_pagar SET status = $1, data_pagamento = $2, fluxo_caixa_id = $3 WHERE id = $4',
    ['Pago', data_pagamento, fluxoResult.rows[0].id, id]
  );

  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /estornar/:id - Estornar pagamento
router.post('/estornar/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const conta = await findById('contas_a_pagar', id);
  if (!conta) return notFound(res, 'Conta', ROUTE);
  if (conta.status !== 'Pago') return res.redirect(ROUTE);

  // Reverter conta
  await pool.query(
    'UPDATE contas_a_pagar SET status = $1, data_pagamento = NULL, fluxo_caixa_id = NULL WHERE id = $2',
    ['Pendente', id]
  );

  // Excluir lançamento do fluxo
  if (conta.fluxo_caixa_id) {
    await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [conta.fluxo_caixa_id]);
  }

  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /delete/:id - Excluir conta
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const conta = await findById('contas_a_pagar', id, 'status');
  if (!conta) return notFound(res, 'Conta', ROUTE);
  
  if (conta.status === 'Pago') {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Estorne o pagamento antes de excluir.',
      voltar_url: ROUTE
    });
  }

  await pool.query('DELETE FROM contas_a_pagar WHERE id = $1', [id]);
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

module.exports = router;