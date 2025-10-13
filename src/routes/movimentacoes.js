const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createMovimentacaoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// GET / - Lista movimentacoes com filtros
router.get('/', async (req, res) => {
  try {
    const { tipo, produto_id, data_inicial, data_fim } = req.query;
    
    let query = `
      SELECT m.*, p.descricao as produto_descricao, p.codigo as produto_codigo,
             f.nome as fornecedor_nome
      FROM movimentacoes m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (tipo) {
      query += ` AND m.tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }
    
    if (produto_id) {
      query += ` AND m.produto_id = $${paramIndex}`;
      params.push(produto_id);
      paramIndex++;
    }
    
    if (data_inicial) {
      query += ` AND DATE(m.created_at) >= $${paramIndex}`;
      params.push(data_inicial);
      paramIndex++;
    }
    
    if (data_fim) {
      query += ` AND DATE(m.created_at) <= $${paramIndex}`;
      params.push(data_fim);
      paramIndex++;
    }
    
    query += ' ORDER BY m.created_at DESC';
    
    const result = await pool.query(query, params);
    const produtos = await pool.query('SELECT * FROM produtos ORDER BY descricao');
    const fornecedores = await pool.query('SELECT * FROM fornecedores ORDER BY nome');
    const rcas = await pool.query('SELECT * FROM rcas ORDER BY nome');
    
    res.render('movimentacoes', {
      user: res.locals.user,
      movimentacoes: result.rows || [],
      produtos: produtos.rows || [],
      fornecedores: fornecedores.rows || [],
      rcas: rcas.rows || [],
      filtros: { tipo, produto_id, data_inicial, data_fim }
    });
  } catch (err) {
    console.error('Erro ao buscar movimentações:', err.message);
    res.status(500).send('Erro ao buscar movimentações');
  }
});

// GET /:id - Visualizar movimentação
router.get('/:id', validateParams(idParamSchema), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT m.*, p.descricao as produto_descricao, p.codigo as produto_codigo,
             f.nome as fornecedor_nome
      FROM movimentacoes m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      WHERE m.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao buscar movimentação:', err.message);
    res.status(500).json({ error: 'Erro ao buscar movimentação' });
  }
});

// POST / - Criar movimentação
router.post('/', validateBody(createMovimentacaoSchema), async (req, res) => {
  const { 
    produto_id, fornecedor_id, cliente_nome, rca, tipo, 
    quantidade, preco_unitario, valor_total, documento, observacao 
  } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, 
        quantidade, preco_unitario, valor_total, documento, observacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      produto_id, fornecedor_id || null, cliente_nome || null, 
      rca || null, tipo, quantidade, preco_unitario || null, 
      valor_total || null, documento || null, observacao || null
    ]);
    
    res.redirect('/movimentacoes');
  } catch (err) {
    console.error('Erro ao criar movimentação:', err.message);
    res.status(500).send('Erro ao criar movimentação');
  }
});

// POST /:id/edit - Editar movimentação
router.post('/:id/edit', validateParams(idParamSchema), validateBody(createMovimentacaoSchema), async (req, res) => {
  const { id } = req.params;
  const { 
    produto_id, fornecedor_id, cliente_nome, rca, tipo, 
    quantidade, preco_unitario, valor_total, documento, observacao 
  } = req.body;
  
  try {
    await pool.query(`
      UPDATE movimentacoes SET
        produto_id = $1, fornecedor_id = $2, cliente_nome = $3, 
        rca = $4, tipo = $5, quantidade = $6, preco_unitario = $7,
        valor_total = $8, documento = $9, observacao = $10
      WHERE id = $11
    `, [
      produto_id, fornecedor_id || null, cliente_nome || null,
      rca || null, tipo, quantidade, preco_unitario || null,
      valor_total || null, documento || null, observacao || null, id
    ]);
    
    res.redirect('/movimentacoes');
  } catch (err) {
    console.error('Erro ao editar movimentação:', err.message);
    res.status(500).send('Erro ao editar movimentação');
  }
});

// POST /delete/:id - Deletar movimentação
router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM movimentacoes WHERE id = $1', [id]);
    res.redirect('/movimentacoes');
  } catch (err) {
    console.error('Erro ao deletar movimentação:', err.message);
    
    if (err.code === '23503') {
      return res.status(400).send('Não é possível deletar movimentação com dependências');
    }
    
    res.status(500).send('Erro ao deletar movimentação');
  }
});

module.exports = router;