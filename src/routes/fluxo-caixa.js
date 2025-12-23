// src/routes/fluxo-caixa.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createLancamentoFluxoSchema } = require('../schemas/validation.schemas');
const { idParamSchema, notFound, renderError, buildRedirectUrl } = require('../utils/helpers');
const { findById } = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/fluxo-caixa';

// Schemas
const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required()
});

// Helper: Garantir categoria Investimentos existe
async function garantirCategoriaInvestimentos() {
  const existe = await pool.query(`SELECT id FROM categorias_financeiras WHERE nome = 'Investimentos'`);
  if (existe.rows.length === 0) {
    await pool.query(`INSERT INTO categorias_financeiras (nome, tipo) VALUES ('Investimentos', 'RECEITA')`);
  }
}

// Helper: Calcular período
function calcularPeriodo(query) {
  const hoje = new Date();
  let dataInicio, dataFim;
  const periodo = query.periodo || 'mes-atual';

  switch (periodo) {
    case 'hoje':
      dataInicio = dataFim = hoje.toISOString().split('T')[0];
      break;
    case 'semana':
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      dataInicio = inicioSemana.toISOString().split('T')[0];
      dataFim = hoje.toISOString().split('T')[0];
      break;
    case 'mes-passado':
      const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      dataInicio = mesPassado.toISOString().split('T')[0];
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split('T')[0];
      break;
    case 'ultimos-30':
      const trintaDiasAtras = new Date(hoje);
      trintaDiasAtras.setDate(hoje.getDate() - 30);
      dataInicio = trintaDiasAtras.toISOString().split('T')[0];
      dataFim = hoje.toISOString().split('T')[0];
      break;
    case 'custom':
    case 'personalizado':
      dataInicio = query.data_inicio || new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      dataFim = query.data_fim || hoje.toISOString().split('T')[0];
      break;
    case 'mes-atual':
    default:
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
      break;
  }
  
  return { dataInicio, dataFim, periodo };
}

// GET / - Listar fluxo de caixa
router.get('/', asyncHandler(async (req, res) => {
  // Garantir categoria Investimentos
  await garantirCategoriaInvestimentos();
  
  const { dataInicio, dataFim, periodo } = calcularPeriodo(req.query);
  const { pesquisar, tipo } = req.query;
  const hoje = new Date().toISOString().split('T')[0];

  // Query base
  let queryLancamentos = `
    SELECT fc.*, cf.nome as categoria_nome
    FROM fluxo_caixa fc
    LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
    WHERE fc.data_operacao BETWEEN $1 AND $2
  `;
  const params = [dataInicio, dataFim];
  let idx = 3;

  if (tipo) { queryLancamentos += ` AND fc.tipo = $${idx++}`; params.push(tipo); }
  if (pesquisar) { queryLancamentos += ` AND (fc.descricao ILIKE $${idx} OR cf.nome ILIKE $${idx++})`; params.push(`%${pesquisar}%`); }
  queryLancamentos += ' ORDER BY fc.data_operacao DESC, fc.id DESC';

  const [lancamentos, categorias, metricsResult] = await Promise.all([
    pool.query(queryLancamentos, params),
    pool.query('SELECT * FROM categorias_financeiras ORDER BY tipo DESC, nome'),
    pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' AND status = 'PENDENTE' THEN valor ELSE 0 END), 0) as receitas_abertas,
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' AND status = 'PAGO' THEN valor ELSE 0 END), 0) as receitas_realizadas,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' AND status = 'PENDENTE' THEN valor ELSE 0 END), 0) as despesas_abertas,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' AND status = 'PAGO' THEN valor ELSE 0 END), 0) as despesas_realizadas
      FROM fluxo_caixa
      WHERE data_operacao BETWEEN $1 AND $2
    `, [dataInicio, dataFim])
  ]);

  const m = metricsResult.rows[0];
  const receitasAbertas = parseFloat(m.receitas_abertas) || 0;
  const receitasRealizadas = parseFloat(m.receitas_realizadas) || 0;
  const despesasAbertas = parseFloat(m.despesas_abertas) || 0;
  const despesasRealizadas = parseFloat(m.despesas_realizadas) || 0;
  const saldoTotal = (receitasRealizadas - despesasRealizadas);

  res.render('fluxo-caixa', {
    user: res.locals.user,
    lancamentos: lancamentos.rows,
    categorias: categorias.rows,
    metricas: { 
      receitasAbertas, 
      receitasRealizadas, 
      despesasAbertas, 
      despesasRealizadas, 
      saldoTotal 
    },
    hoje,
    filtros: { 
      periodo, 
      pesquisar: pesquisar || '', 
      tipo: tipo || '', 
      data_inicio: dataInicio, 
      data_fim: dataFim 
    }
  });
}, ROUTE));

// POST /lancamento - Criar lançamento
router.post('/lancamento', validateBody(createLancamentoFluxoSchema), asyncHandler(async (req, res) => {
  const { data_operacao, tipo, valor, descricao, categoria_id } = req.body;

  await pool.query(
    `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, $2, $3, $4, $5, 'PAGO')`,
    [data_operacao, tipo, valor, descricao, categoria_id]
  );
  
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /estornar/:id - Estornar lançamento
router.post('/estornar/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const lancamento = await findById('fluxo_caixa', id);
  if (!lancamento) return notFound(res, 'Lançamento', ROUTE);

  // Reverter contas vinculadas
  await pool.query(`UPDATE contas_a_receber SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL WHERE fluxo_caixa_id = $1`, [id]);
  await pool.query(`UPDATE contas_a_pagar SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL WHERE fluxo_caixa_id = $1`, [id]);
  
  // Excluir lançamento
  await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
  
  res.redirect(buildRedirectUrl(ROUTE + '?success=estorno', req.get('Referer')));
}, ROUTE));

// POST /delete/:id - Excluir lançamento
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verificar vínculos
  const vinculos = await pool.query(`
    SELECT COUNT(*) as count FROM contas_a_receber WHERE fluxo_caixa_id = $1
    UNION ALL
    SELECT COUNT(*) as count FROM contas_a_pagar WHERE fluxo_caixa_id = $1
  `, [id]);

  const totalVinculado = vinculos.rows.reduce((t, r) => t + parseInt(r.count), 0);
  
  if (totalVinculado > 0) {
    return renderError(res, {
      titulo: 'Ação Bloqueada',
      mensagem: 'Use o botão Estornar para lançamentos vinculados.',
      voltar_url: ROUTE
    });
  }

  await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
  res.redirect(buildRedirectUrl(ROUTE, req.get('Referer')));
}, ROUTE));

// POST /bulk-delete - Exclusão em massa
router.post('/bulk-delete', validateBody(bulkDeleteSchema), asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const resultados = { total: ids.length, excluidos: 0, bloqueados: 0, erros: 0, detalhes: [] };

  for (const id of ids) {
    try {
      const vinculos = await pool.query(`
        SELECT COUNT(*) as count FROM contas_a_receber WHERE fluxo_caixa_id = $1
        UNION ALL SELECT COUNT(*) as count FROM contas_a_pagar WHERE fluxo_caixa_id = $1
      `, [id]);

      const total = vinculos.rows.reduce((t, r) => t + parseInt(r.count), 0);
      
      if (total > 0) {
        resultados.bloqueados++;
        resultados.detalhes.push({ id, status: 'bloqueado', mensagem: 'Vinculado a contas' });
      } else {
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        resultados.excluidos++;
        resultados.detalhes.push({ id, status: 'excluido' });
      }
    } catch (err) {
      resultados.erros++;
      resultados.detalhes.push({ id, status: 'erro', mensagem: err.message });
    }
  }

  res.json({ success: true, resultados });
}, ROUTE));

module.exports = router;