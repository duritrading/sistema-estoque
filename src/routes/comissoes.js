// src/routes/comissoes.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { idParamSchema, renderError } = require('../utils/helpers');
const asyncHandler = require('../middleware/asyncHandler');
const Joi = require('joi');

const ROUTE = '/comissoes';

// ========================================
// SCHEMAS DE VALIDAÇÃO
// ========================================

const gerarComissaoSchema = Joi.object({
  rca_id: Joi.number().integer().positive().required(),
  periodo_inicio: Joi.date().iso().required(),
  periodo_fim: Joi.date().iso().required()
});

const atualizarComissaoProdutoSchema = Joi.object({
  percentual_comissao: Joi.number().min(0).max(100).precision(2).required()
});

// ========================================
// INICIALIZAR TABELAS
// ========================================

async function inicializarTabelas() {
  try {
    // Verificar se coluna percentual_comissao existe em produtos
    const checkColumn = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'produtos' AND column_name = 'percentual_comissao'
    `);
    
    if (checkColumn.rows.length === 0) {
      await pool.query('ALTER TABLE produtos ADD COLUMN percentual_comissao DECIMAL(5,2) DEFAULT 5.00');
      await pool.query('UPDATE produtos SET percentual_comissao = 5.00 WHERE percentual_comissao IS NULL');
    }

    // Criar tabela de comissões
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comissoes_rca (
        id SERIAL PRIMARY KEY,
        rca_id INTEGER NOT NULL REFERENCES rcas(id) ON DELETE CASCADE,
        periodo_inicio DATE NOT NULL,
        periodo_fim DATE NOT NULL,
        valor_vendas DECIMAL(12,2) NOT NULL DEFAULT 0,
        valor_comissao DECIMAL(12,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGO', 'CANCELADO')),
        data_pagamento DATE,
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de itens detalhados
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comissoes_rca_itens (
        id SERIAL PRIMARY KEY,
        comissao_id INTEGER NOT NULL REFERENCES comissoes_rca(id) ON DELETE CASCADE,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        quantidade_vendida DECIMAL(12,2) NOT NULL,
        valor_vendido DECIMAL(12,2) NOT NULL,
        percentual_aplicado DECIMAL(5,2) NOT NULL,
        valor_comissao_item DECIMAL(12,2) NOT NULL
      )
    `);
  } catch (err) {
    console.error('Erro ao inicializar tabelas de comissões:', err.message);
  }
}

// ========================================
// GET / - Página principal de comissões
// ========================================

router.get('/', asyncHandler(async (req, res) => {
  await inicializarTabelas();
  
  const { mes, ano, rca_id } = req.query;
  const hoje = new Date();
  const mesAtual = mes || (hoje.getMonth() + 1);
  const anoAtual = ano || hoje.getFullYear();
  
  const periodoInicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
  const periodoFim = new Date(anoAtual, mesAtual, 0).toISOString().split('T')[0];

  // Query RCAs com vendas e comissões
  let queryRcas = `
    SELECT 
      r.id, r.nome, r.praca, r.telefone, r.email,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        THEN COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) ELSE 0 END), 0) as vendas_periodo,
      COUNT(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2 THEN 1 END) as qtd_vendas,
      COALESCE(SUM(CASE WHEN m.tipo = 'SAIDA' AND m.created_at >= $1 AND m.created_at <= $2
        THEN (COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100) ELSE 0 END), 0) as valor_comissao
    FROM rcas r
    LEFT JOIN movimentacoes m ON r.nome = m.rca
    LEFT JOIN produtos p ON m.produto_id = p.id
  `;
  
  const params = [periodoInicio + ' 00:00:00', periodoFim + ' 23:59:59'];
  if (rca_id) {
    queryRcas += ' WHERE r.id = $3';
    params.push(rca_id);
  }
  queryRcas += ' GROUP BY r.id, r.nome, r.praca, r.telefone, r.email ORDER BY valor_comissao DESC';

  const [rcasResult, comissoesResult, rcasListResult, produtosResult] = await Promise.all([
    pool.query(queryRcas, params),
    pool.query(`
      SELECT c.*, r.nome as rca_nome FROM comissoes_rca c
      JOIN rcas r ON c.rca_id = r.id
      WHERE c.periodo_inicio >= $1 AND c.periodo_fim <= $2
      ORDER BY c.created_at DESC
    `, [periodoInicio, periodoFim]),
    pool.query('SELECT id, nome FROM rcas ORDER BY nome'),
    pool.query('SELECT id, codigo, descricao, COALESCE(percentual_comissao, 5) as percentual_comissao FROM produtos ORDER BY descricao')
  ]);

  const rcasComComissao = rcasResult.rows.map(rca => ({
    ...rca,
    vendas_periodo: parseFloat(rca.vendas_periodo) || 0,
    valor_comissao: parseFloat(rca.valor_comissao) || 0
  }));

  const totais = {
    total_vendas: rcasComComissao.reduce((sum, r) => sum + r.vendas_periodo, 0),
    total_comissoes: rcasComComissao.reduce((sum, r) => sum + r.valor_comissao, 0),
    total_rcas: rcasComComissao.filter(r => r.vendas_periodo > 0).length
  };

  res.render('comissoes', {
    user: res.locals.user,
    rcas: rcasComComissao,
    comissoes: comissoesResult.rows,
    rcasList: rcasListResult.rows,
    produtos: produtosResult.rows,
    totais,
    filtros: { mes: mesAtual, ano: anoAtual, rca_id: rca_id || '', periodo_inicio: periodoInicio, periodo_fim: periodoFim }
  });
}, ROUTE));

// ========================================
// GET /detalhes/:id - Detalhes de vendas por produto
// ========================================

router.get('/detalhes/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { periodo_inicio, periodo_fim } = req.query;

  const rcaResult = await pool.query('SELECT * FROM rcas WHERE id = $1', [id]);
  if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });
  
  const rca = rcaResult.rows[0];

  const vendasResult = await pool.query(`
    SELECT 
      p.id as produto_id, p.codigo, p.descricao,
      COALESCE(p.percentual_comissao, 5) as percentual_comissao,
      SUM(m.quantidade) as quantidade_vendida,
      SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as valor_vendido,
      SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100) as valor_comissao
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
    GROUP BY p.id, p.codigo, p.descricao, p.percentual_comissao
    ORDER BY valor_comissao DESC
  `, [rca.nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

  const vendas = vendasResult.rows.map(v => ({
    ...v,
    quantidade_vendida: parseFloat(v.quantidade_vendida) || 0,
    valor_vendido: parseFloat(v.valor_vendido) || 0,
    percentual_comissao: parseFloat(v.percentual_comissao) || 5,
    valor_comissao: parseFloat(v.valor_comissao) || 0
  }));

  res.json({
    rca,
    vendas,
    totais: {
      valor_vendido: vendas.reduce((sum, v) => sum + v.valor_vendido, 0),
      valor_comissao: vendas.reduce((sum, v) => sum + v.valor_comissao, 0)
    }
  });
}, ROUTE));

// ========================================
// GET /itens/:id - Buscar itens de uma comissão
// ========================================

router.get('/itens/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const itensResult = await pool.query(`
    SELECT ci.*, p.codigo, p.descricao
    FROM comissoes_rca_itens ci
    JOIN produtos p ON ci.produto_id = p.id
    WHERE ci.comissao_id = $1
    ORDER BY ci.valor_comissao_item DESC
  `, [req.params.id]);

  res.json(itensResult.rows);
}, ROUTE));

// ========================================
// GET /api/calcular - API para calcular comissão
// ========================================

router.get('/api/calcular', asyncHandler(async (req, res) => {
  const { rca_id, periodo_inicio, periodo_fim } = req.query;

  if (!rca_id || !periodo_inicio || !periodo_fim) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: rca_id, periodo_inicio, periodo_fim' });
  }

  const rcaResult = await pool.query('SELECT nome FROM rcas WHERE id = $1', [rca_id]);
  if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });

  const vendasResult = await pool.query(`
    SELECT 
      COUNT(DISTINCT m.id) as qtd_vendas,
      COUNT(DISTINCT p.id) as qtd_produtos,
      COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))), 0) as total_vendas,
      COALESCE(SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100), 0) as total_comissao
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
  `, [rcaResult.rows[0].nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

  const vendas = vendasResult.rows[0];
  res.json({
    rca_nome: rcaResult.rows[0].nome,
    qtd_vendas: parseInt(vendas.qtd_vendas),
    qtd_produtos: parseInt(vendas.qtd_produtos),
    valor_vendas: parseFloat(vendas.total_vendas) || 0,
    valor_comissao: parseFloat(vendas.total_comissao) || 0
  });
}, ROUTE));

// ========================================
// POST /gerar - Gerar registro de comissão (com TRANSAÇÃO)
// ========================================

router.post('/gerar', validateBody(gerarComissaoSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { rca_id, periodo_inicio, periodo_fim } = req.body;

    const rcaResult = await client.query('SELECT id, nome FROM rcas WHERE id = $1', [rca_id]);
    if (rcaResult.rows.length === 0) return res.status(404).json({ error: 'RCA não encontrado' });
    const rca = rcaResult.rows[0];

    // Verificar duplicidade
    const existeResult = await client.query(`
      SELECT id FROM comissoes_rca WHERE rca_id = $1 AND periodo_inicio = $2 AND periodo_fim = $3 AND status != 'CANCELADO'
    `, [rca_id, periodo_inicio, periodo_fim]);

    if (existeResult.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe comissão registrada para este período' });
    }

    // Calcular vendas
    const vendasResult = await client.query(`
      SELECT 
        p.id as produto_id,
        SUM(m.quantidade) as quantidade_vendida,
        SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0))) as valor_vendido,
        COALESCE(p.percentual_comissao, 5) as percentual_comissao,
        SUM(COALESCE(m.valor_total, m.quantidade * COALESCE(m.preco_unitario, 0)) * COALESCE(p.percentual_comissao, 5) / 100) as valor_comissao
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.rca = $1 AND m.tipo = 'SAIDA' AND m.created_at >= $2 AND m.created_at <= $3
      GROUP BY p.id, p.percentual_comissao
    `, [rca.nome, periodo_inicio + ' 00:00:00', periodo_fim + ' 23:59:59']);

    if (vendasResult.rows.length === 0) {
      return res.status(400).json({ error: 'Nenhuma venda encontrada para este RCA no período' });
    }

    const vendas = vendasResult.rows;
    const valorVendas = vendas.reduce((sum, v) => sum + parseFloat(v.valor_vendido), 0);
    const valorComissao = vendas.reduce((sum, v) => sum + parseFloat(v.valor_comissao), 0);

    await client.query('BEGIN');

    // Inserir comissão
    const insertResult = await client.query(`
      INSERT INTO comissoes_rca (rca_id, periodo_inicio, periodo_fim, valor_vendas, valor_comissao)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [rca_id, periodo_inicio, periodo_fim, valorVendas, valorComissao]);

    const comissaoId = insertResult.rows[0].id;

    // Inserir itens
    for (const venda of vendas) {
      await client.query(`
        INSERT INTO comissoes_rca_itens (comissao_id, produto_id, quantidade_vendida, valor_vendido, percentual_aplicado, valor_comissao_item)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [comissaoId, venda.produto_id, venda.quantidade_vendida, venda.valor_vendido, venda.percentual_comissao, venda.valor_comissao]);
    }

    await client.query('COMMIT');
    res.redirect(`/comissoes?mes=${new Date(periodo_inicio).getMonth() + 1}&ano=${new Date(periodo_inicio).getFullYear()}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao gerar comissão:', err);
    res.status(500).json({ error: 'Erro ao gerar comissão: ' + err.message });
  } finally {
    client.release();
  }
});

// ========================================
// POST /pagar/:id - Marcar comissão como paga (com TRANSAÇÃO)
// ========================================

router.post('/pagar/:id', validateParams(idParamSchema), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { data_pagamento } = req.body;
    const dataPgto = data_pagamento || new Date().toISOString().split('T')[0];

    const comissaoResult = await client.query(`
      SELECT c.*, r.nome as rca_nome FROM comissoes_rca c JOIN rcas r ON c.rca_id = r.id WHERE c.id = $1
    `, [id]);

    if (comissaoResult.rows.length === 0) return res.status(404).send('Comissão não encontrada');
    const comissao = comissaoResult.rows[0];
    if (comissao.status === 'PAGO') return res.status(400).send('Esta comissão já foi paga');

    await client.query('BEGIN');

    await client.query('UPDATE comissoes_rca SET status = $1, data_pagamento = $2 WHERE id = $3', ['PAGO', dataPgto, id]);

    await client.query(`
      INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
      VALUES ($1, 'DEBITO', $2, $3, 4, 'PAGO')
    `, [dataPgto, comissao.valor_comissao, `Pagamento Comissão - ${comissao.rca_nome} (${new Date(comissao.periodo_inicio).toLocaleDateString('pt-BR')} a ${new Date(comissao.periodo_fim).toLocaleDateString('pt-BR')})`]);

    await client.query('COMMIT');
    res.redirect(ROUTE);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao pagar comissão:', err);
    res.status(500).send('Erro ao registrar pagamento: ' + err.message);
  } finally {
    client.release();
  }
});

// ========================================
// POST /cancelar/:id - Cancelar comissão
// ========================================

router.post('/cancelar/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const result = await pool.query(`
    UPDATE comissoes_rca SET status = 'CANCELADO' WHERE id = $1 AND status = 'PENDENTE' RETURNING id
  `, [req.params.id]);

  if (result.rows.length === 0) return res.status(400).send('Comissão não encontrada ou já processada');
  res.redirect(ROUTE);
}, ROUTE));

// ========================================
// POST /produto/:id/comissao - Atualizar % de comissão do produto
// ========================================

router.post('/produto/:id/comissao', validateParams(idParamSchema), validateBody(atualizarComissaoProdutoSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { percentual_comissao } = req.body;

  await pool.query('UPDATE produtos SET percentual_comissao = $1 WHERE id = $2', [percentual_comissao, id]);

  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.json({ success: true, percentual_comissao });
  }
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;