// src/routes/comissoes.js - COM COMISSÃO RIAN E COMISSÃO FIXA
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { idParamSchema } = require('../utils/helpers');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/comissoes';

// Schemas
const gerarComissaoSchema = Joi.object({
  rca_id: Joi.number().integer().positive().required(),
  periodo_inicio: Joi.date().iso().required(),
  periodo_fim: Joi.date().iso().required()
});

const atualizarComissaoProdutoSchema = Joi.object({
  percentual_comissao: Joi.number().min(0).max(100).precision(2).optional(),
  percentual_comissao_rian: Joi.number().min(0).max(100).precision(2).optional(),
  comissao_fixa_rca: Joi.number().min(0).precision(2).allow(null).optional(),
  comissao_fixa_rian: Joi.number().min(0).precision(2).allow(null).optional()
});

// Inicializar tabelas
async function inicializarTabelas() {
  try {
    // Verificar colunas em produtos
    const cols = ['percentual_comissao', 'percentual_comissao_rian', 'comissao_fixa_rca', 'comissao_fixa_rian'];
    for (const col of cols) {
      const check = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'produtos' AND column_name = $1`, [col]);
      if (check.rows.length === 0) {
        const defaultVal = col.includes('fixa') ? 'NULL' : (col === 'percentual_comissao' ? '5.00' : '0');
        const tipo = col.includes('fixa') ? 'DECIMAL(10,2)' : 'DECIMAL(5,2)';
        await pool.query(`ALTER TABLE produtos ADD COLUMN ${col} ${tipo} DEFAULT ${defaultVal}`);
      }
    }

    // Criar tabela comissoes_rca
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comissoes_rca (
        id SERIAL PRIMARY KEY, rca_id INTEGER NOT NULL REFERENCES rcas(id) ON DELETE CASCADE,
        periodo_inicio DATE NOT NULL, periodo_fim DATE NOT NULL,
        valor_vendas DECIMAL(12,2) NOT NULL DEFAULT 0, valor_comissao DECIMAL(12,2) NOT NULL,
        valor_comissao_rian DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO', 'CANCELADO')),
        data_pagamento DATE, observacao TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verificar coluna valor_comissao_rian
    const checkRian = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'comissoes_rca' AND column_name = 'valor_comissao_rian'`);
    if (checkRian.rows.length === 0) {
      await pool.query('ALTER TABLE comissoes_rca ADD COLUMN valor_comissao_rian DECIMAL(12,2) DEFAULT 0');
    }

    // Criar tabela itens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comissoes_rca_itens (
        id SERIAL PRIMARY KEY, comissao_id INTEGER NOT NULL REFERENCES comissoes_rca(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        quantidade_vendida DECIMAL(12,2) NOT NULL, valor_vendido DECIMAL(12,2) NOT NULL,
        percentual_aplicado DECIMAL(5,2) NOT NULL, valor_comissao_item DECIMAL(12,2) NOT NULL,
        valor_comissao_rian_item DECIMAL(12,2) DEFAULT 0
      )
    `);

    const checkItemRian = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'comissoes_rca_itens' AND column_name = 'valor_comissao_rian_item'`);
    if (checkItemRian.rows.length === 0) {
      await pool.query('ALTER TABLE comissoes_rca_itens ADD COLUMN valor_comissao_rian_item DECIMAL(12,2) DEFAULT 0');
    }
  } catch (err) {
    console.error('Erro ao inicializar tabelas de comissões:', err.message);
  }
}

// GET / - Página principal
router.get('/', asyncHandler(async (req, res) => {
  await inicializarTabelas();
  
  const { mes, ano, rca_id } = req.query;
  const hoje = new Date();
  const mesAtual = mes || (hoje.getMonth() + 1);
  const anoAtual = ano || hoje.getFullYear();
  
  const periodoInicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
  const periodoFim = new Date(anoAtual, mesAtual, 0).toISOString().split('T')[0];

  let queryRcas = `
    SELECT r.id, r.nome, r.praca, r.telefone, r.email,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) ELSE 0 END), 0) as vendas_periodo,
      COUNT(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2 THEN 1 END) as qtd_vendas,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2 THEN 
        CASE WHEN p.comissao_fixa_rca IS NOT NULL AND p.comissao_fixa_rca > 0 THEN m.quantidade * p.comissao_fixa_rca
        ELSE (COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100) END
      ELSE 0 END), 0) as valor_comissao,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2 THEN 
        CASE WHEN p.comissao_fixa_rian IS NOT NULL AND p.comissao_fixa_rian > 0 THEN m.quantidade * p.comissao_fixa_rian
        ELSE (COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao_rian, 0) / 100) END
      ELSE 0 END), 0) as valor_comissao_rian
    FROM rcas r
    LEFT JOIN movimentacoes m ON r.nome = m.rca
    LEFT JOIN produtos p ON m.produto_id = p.id
  `;
  
  const params = [periodoInicio + ' 00:00:00', periodoFim + ' 23:59:59'];
  if (rca_id) { queryRcas += ' WHERE r.id = $3'; params.push(rca_id); }
  queryRcas += ' GROUP BY r.id ORDER BY valor_comissao DESC';

  const [rcasResult, comissoesResult, rcasListResult, produtosResult] = await Promise.all([
    pool.query(queryRcas, params),
    pool.query(`SELECT c.*, r.nome as rca_nome FROM comissoes_rca c JOIN rcas r ON c.rca_id = r.id WHERE c.periodo_inicio >= $1 AND c.periodo_fim <= $2 ORDER BY c.created_at DESC`, [periodoInicio, periodoFim]),
    pool.query('SELECT id, nome FROM rcas ORDER BY nome'),
    pool.query(`SELECT id, codigo, descricao, COALESCE(percentual_comissao, 5) as percentual_comissao, COALESCE(percentual_comissao_rian, 0) as percentual_comissao_rian, comissao_fixa_rca, comissao_fixa_rian FROM produtos ORDER BY descricao`)
  ]);

  const rcasComComissao = rcasResult.rows.map(rca => ({
    ...rca,
    vendas_periodo: parseFloat(rca.vendas_periodo) || 0,
    valor_comissao: parseFloat(rca.valor_comissao) || 0,
    valor_comissao_rian: parseFloat(rca.valor_comissao_rian) || 0
  }));

  const totais = {
    total_vendas: rcasComComissao.reduce((sum, r) => sum + r.vendas_periodo, 0),
    total_comissoes: rcasComComissao.reduce((sum, r) => sum + r.valor_comissao, 0),
    total_comissoes_rian: rcasComComissao.reduce((sum, r) => sum + r.valor_comissao_rian, 0),
    total_rcas: rcasComComissao.filter(r => r.vendas_periodo > 0).length
  };

  res.render('comissoes', {
    user: res.locals.user, rcas: rcasComComissao, comissoes: comissoesResult.rows,
    rcasList: rcasListResult.rows, produtos: produtosResult.rows, totais,
    filtros: { mes: mesAtual, ano: anoAtual, rca_id: rca_id || '', periodo_inicio: periodoInicio, periodo_fim: periodoFim }
  });
}, ROUTE));

// GET /detalhes/:id
router.get('/detalhes/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { periodo_inicio, periodo_fim } = req.query;

  const rcaResult = await pool.query('SELECT * FROM rcas WHERE id = $1', [id]);
  if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });
  const rca = rcaResult.rows[0];

  const vendasResult = await pool.query(`
    SELECT p.id as produto_id, p.codigo, p.descricao, COALESCE(p.percentual_comissao, 5) as percentual_comissao,
      COALESCE(p.percentual_comissao_rian, 0) as percentual_comissao_rian, p.comissao_fixa_rca, p.comissao_fixa_rian,
      SUM(m.quantidade) as quantidade_vendida,
      SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as valor_vendido,
      SUM(CASE WHEN p.comissao_fixa_rca > 0 THEN m.quantidade * p.comissao_fixa_rca ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100 END) as valor_comissao,
      SUM(CASE WHEN p.comissao_fixa_rian > 0 THEN m.quantidade * p.comissao_fixa_rian ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao_rian, 0) / 100 END) as valor_comissao_rian
    FROM movimentacoes m JOIN produtos p ON m.produto_id = p.id
    WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
    GROUP BY p.id ORDER BY valor_comissao DESC
  `, [rca.nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

  const vendas = vendasResult.rows.map(v => ({
    ...v, quantidade_vendida: parseFloat(v.quantidade_vendida) || 0, valor_vendido: parseFloat(v.valor_vendido) || 0,
    percentual_comissao: parseFloat(v.percentual_comissao) || 5, percentual_comissao_rian: parseFloat(v.percentual_comissao_rian) || 0,
    comissao_fixa_rca: v.comissao_fixa_rca ? parseFloat(v.comissao_fixa_rca) : null, comissao_fixa_rian: v.comissao_fixa_rian ? parseFloat(v.comissao_fixa_rian) : null,
    valor_comissao: parseFloat(v.valor_comissao) || 0, valor_comissao_rian: parseFloat(v.valor_comissao_rian) || 0
  }));

  res.json({ rca, vendas, totais: { valor_vendido: vendas.reduce((s, v) => s + v.valor_vendido, 0), valor_comissao: vendas.reduce((s, v) => s + v.valor_comissao, 0), valor_comissao_rian: vendas.reduce((s, v) => s + v.valor_comissao_rian, 0) } });
}, ROUTE));

// GET /itens/:id
router.get('/itens/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const itens = await pool.query(`SELECT ci.*, p.codigo, p.descricao FROM comissoes_rca_itens ci JOIN produtos p ON ci.produto_id = p.id WHERE ci.comissao_id = $1 ORDER BY ci.valor_comissao_item DESC`, [req.params.id]);
  res.json(itens.rows);
}, ROUTE));

// GET /api/calcular
router.get('/api/calcular', asyncHandler(async (req, res) => {
  const { rca_id, periodo_inicio, periodo_fim } = req.query;
  if (!rca_id || !periodo_inicio || !periodo_fim) return res.status(400).json({ error: 'Parâmetros obrigatórios' });

  const rcaResult = await pool.query('SELECT nome FROM rcas WHERE id = $1', [rca_id]);
  if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });

  const vendasResult = await pool.query(`
    SELECT COUNT(DISTINCT m.id) as qtd_vendas, COUNT(DISTINCT p.id) as qtd_produtos,
      COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))), 0) as total_vendas,
      COALESCE(SUM(CASE WHEN p.comissao_fixa_rca > 0 THEN m.quantidade * p.comissao_fixa_rca ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100 END), 0) as total_comissao,
      COALESCE(SUM(CASE WHEN p.comissao_fixa_rian > 0 THEN m.quantidade * p.comissao_fixa_rian ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao_rian, 0) / 100 END), 0) as total_comissao_rian
    FROM movimentacoes m JOIN produtos p ON m.produto_id = p.id
    WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
  `, [rcaResult.rows[0].nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

  const v = vendasResult.rows[0];
  res.json({ rca_nome: rcaResult.rows[0].nome, qtd_vendas: parseInt(v.qtd_vendas), qtd_produtos: parseInt(v.qtd_produtos), valor_vendas: parseFloat(v.total_vendas) || 0, valor_comissao: parseFloat(v.total_comissao) || 0, valor_comissao_rian: parseFloat(v.total_comissao_rian) || 0 });
}, ROUTE));

// POST /gerar
router.post('/gerar', validateBody(gerarComissaoSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rca_id, periodo_inicio, periodo_fim } = req.body;
    const rcaResult = await client.query('SELECT id, nome FROM rcas WHERE id = $1', [rca_id]);
    if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });
    const rca = rcaResult.rows[0];

    const existe = await client.query(`SELECT id FROM comissoes_rca WHERE rca_id = $1 AND periodo_inicio = $2 AND periodo_fim = $3 AND status != 'CANCELADO'`, [rca_id, periodo_inicio, periodo_fim]);
    if (existe.rows.length > 0) return res.status(400).json({ error: 'Já existe comissão para este período' });

    const vendas = await client.query(`
      SELECT p.id as produto_id, SUM(m.quantidade) as quantidade_vendida, SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as valor_vendido,
        COALESCE(p.percentual_comissao, 5) as percentual_comissao,
        SUM(CASE WHEN p.comissao_fixa_rca > 0 THEN m.quantidade * p.comissao_fixa_rca ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100 END) as valor_comissao,
        SUM(CASE WHEN p.comissao_fixa_rian > 0 THEN m.quantidade * p.comissao_fixa_rian ELSE COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao_rian, 0) / 100 END) as valor_comissao_rian
      FROM movimentacoes m JOIN produtos p ON m.produto_id = p.id
      WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
      GROUP BY p.id, p.percentual_comissao
    `, [rca.nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

    if (vendas.rows.length === 0) return res.status(400).json({ error: 'Nenhuma venda encontrada' });

    const valorVendas = vendas.rows.reduce((s, v) => s + parseFloat(v.valor_vendido), 0);
    const valorComissao = vendas.rows.reduce((s, v) => s + parseFloat(v.valor_comissao), 0);
    const valorComissaoRian = vendas.rows.reduce((s, v) => s + parseFloat(v.valor_comissao_rian), 0);

    await client.query('BEGIN');
    const insert = await client.query(`INSERT INTO comissoes_rca (rca_id, periodo_inicio, periodo_fim, valor_vendas, valor_comissao, valor_comissao_rian) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [rca_id, periodo_inicio, periodo_fim, valorVendas, valorComissao, valorComissaoRian]);
    const comissaoId = insert.rows[0].id;

    for (const v of vendas.rows) {
      await client.query(`INSERT INTO comissoes_rca_itens (comissao_id, produto_id, quantidade_vendida, valor_vendido, percentual_aplicado, valor_comissao_item, valor_comissao_rian_item) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [comissaoId, v.produto_id, v.quantidade_vendida, v.valor_vendido, v.percentual_comissao, v.valor_comissao, v.valor_comissao_rian]);
    }

    await client.query('COMMIT');
    res.redirect(`/comissoes?mes=${new Date(periodo_inicio).getMonth() + 1}&ano=${new Date(periodo_inicio).getFullYear()}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao gerar comissão:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /pagar/:id
router.post('/pagar/:id', validateParams(idParamSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { data_pagamento } = req.body;
    const dataPgto = data_pagamento || new Date().toISOString().split('T')[0];

    const comissao = await client.query(`SELECT c.*, r.nome as rca_nome FROM comissoes_rca c JOIN rcas r ON c.rca_id = r.id WHERE c.id = $1`, [id]);
    if (comissao.rows.length === 0) return res.status(404).send('Comissão não encontrada');
    const c = comissao.rows[0];
    if (c.status === 'PAGO') return res.status(400).send('Já paga');

    await client.query('BEGIN');
    await client.query('UPDATE comissoes_rca SET status = $1, data_pagamento = $2 WHERE id = $3', ['PAGO', dataPgto, id]);
    await client.query(`INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, 'DEBITO', $2, $3, 4, 'PAGO')`, [dataPgto, c.valor_comissao, `Pagamento Comissão - ${c.rca_nome}`]);
    await client.query('COMMIT');
    res.redirect(ROUTE);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).send(err.message);
  } finally {
    client.release();
  }
});

// POST /cancelar/:id
router.post('/cancelar/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  await pool.query(`UPDATE comissoes_rca SET status = 'CANCELADO' WHERE id = $1 AND status = 'PENDENTE'`, [req.params.id]);
  res.redirect(ROUTE);
}, ROUTE));

// POST /produto/:id/comissao
router.post('/produto/:id/comissao', validateParams(idParamSchema), validateBody(atualizarComissaoProdutoSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { percentual_comissao, percentual_comissao_rian, comissao_fixa_rca, comissao_fixa_rian } = req.body;

  const updates = [], values = [];
  let idx = 1;
  if (percentual_comissao !== undefined) { updates.push(`percentual_comissao = $${idx++}`); values.push(percentual_comissao); }
  if (percentual_comissao_rian !== undefined) { updates.push(`percentual_comissao_rian = $${idx++}`); values.push(percentual_comissao_rian); }
  if (comissao_fixa_rca !== undefined) { updates.push(`comissao_fixa_rca = $${idx++}`); values.push(comissao_fixa_rca); }
  if (comissao_fixa_rian !== undefined) { updates.push(`comissao_fixa_rian = $${idx++}`); values.push(comissao_fixa_rian); }

  if (updates.length > 0) { values.push(id); await pool.query(`UPDATE produtos SET ${updates.join(', ')} WHERE id = $${idx}`, values); }
  if (req.xhr || req.headers.accept?.includes('json')) return res.json({ success: true });
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;