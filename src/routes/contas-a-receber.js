// src/routes/contas-a-receber.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createContaReceberManualSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, renderError, buildRedirectUrl } = require('../utils/helpers');
const { findById } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/contas-a-receber';

// Schema para recebimento
const receberContaSchema = Joi.object({
  data_recebimento: Joi.date().iso().max('now').required()
});

// Helper: Obter datas padrão
function getDefaultDates(query) {
  const hoje = new Date();
  return {
    data_inicio: query.data_inicio || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0],
    data_fim: query.data_fim || new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  };
}

// GET / - Listar contas a receber
router.get('/', asyncHandler(async (req, res) => {
  const { data_inicio, data_fim } = getDefaultDates(req.query);
  const hoje = new Date().toISOString().split('T')[0];

  const [contas, categorias, clientes] = await Promise.all([
    pool.query(`
      SELECT cr.*, p.descricao as produto_descricao
      FROM contas_a_receber cr
      LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
      LEFT JOIN produtos p ON m.produto_id = p.id
      WHERE cr.status = 'Pendente' AND cr.data_vencimento >= $1
      ORDER BY cr.data_vencimento ASC
    `, [hoje]),
    pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'RECEITA' ORDER BY nome`),
    pool.query('SELECT DISTINCT nome FROM clientes ORDER BY nome')
  ]);

  const total = contas.rows.reduce((s, c) => s + parseFloat(c.valor || 0), 0);
  const pendente = contas.rows.filter(c => c.status !== 'Pago').reduce((s, c) => s + parseFloat(c.valor || 0), 0);

  res.render('contas-a-receber', {
    user: res.locals.user,
    contas: contas.rows,
    categorias: categorias.rows,
    clientes: clientes.rows,
    filtros: { data_inicio, data_fim },
    totalValor: total,
    totalPendente: pendente
  });
}, ROUTE));

// POST / - Criar conta manual
router.post('/', validateBody(createContaReceberManualSchema), asyncHandler(async (req, res) => {
  const { cliente_nome, valor, data_vencimento, categoria_id, descricao } = req.body;
  
  await pool.query(
    `INSERT INTO contas_a_receber (cliente_nome, numero_parcela, total_parcelas, valor, data_vencimento, status, categoria_id, descricao)
     VALUES ($1, 1, 1, $2, $3, 'Pendente', $4, $5)`,
    [cliente_nome, valor, data_vencimento, categoria_id, descricao || null]
  );
  
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /receber/:id - Registrar recebimento
router.post('/receber/:id', validateParams(idParamSchema), validateBody(receberContaSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data_recebimento } = req.body;
  
  const contaResult = await pool.query(`
    SELECT cr.*, p.descricao as produto_descricao
    FROM contas_a_receber cr
    LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
    LEFT JOIN produtos p ON m.produto_id = p.id
    WHERE cr.id = $1
  `, [id]);
  
  const conta = contaResult.rows[0];
  if (!conta) return notFound(res, 'Conta', ROUTE);
  if (conta.status === 'Pago') return res.redirect(ROUTE);

  // Descrição do fluxo
  const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.descricao || conta.produto_descricao || conta.cliente_nome}`;

  // Criar lançamento no fluxo de caixa
  const fluxoResult = await pool.query(
    `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
     VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO') RETURNING id`,
    [data_recebimento, conta.valor, descricaoFluxo, conta.categoria_id || 1]
  );

  // Atualizar conta
  await pool.query(
    'UPDATE contas_a_receber SET status = $1, data_pagamento = $2, fluxo_caixa_id = $3 WHERE id = $4',
    ['Pago', data_recebimento, fluxoResult.rows[0].id, id]
  );

  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /estornar/:id - Estornar recebimento
router.post('/estornar/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const conta = await findById('contas_a_receber', id);
  if (!conta) return notFound(res, 'Conta', ROUTE);
  if (conta.status !== 'Pago') return res.redirect(ROUTE);

  // Reverter conta
  await pool.query(
    'UPDATE contas_a_receber SET status = $1, data_pagamento = NULL, fluxo_caixa_id = NULL WHERE id = $2',
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
  
  const conta = await findById('contas_a_receber', id, 'status, movimentacao_id');
  if (!conta) return notFound(res, 'Conta', ROUTE);
  
  if (conta.movimentacao_id) {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Conta vinculada a movimentação não pode ser excluída.',
      voltar_url: ROUTE
    });
  }
  
  if (conta.status === 'Pago') {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Estorne o recebimento antes de excluir.',
      voltar_url: ROUTE
    });
  }

  await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [id]);
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

module.exports = router;