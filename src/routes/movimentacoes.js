const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createMovimentacaoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, p.descricao as produto_descricao, f.nome as fornecedor_nome
      FROM movimentacoes m
      LEFT JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      ORDER BY m.created_at DESC
    `);
    
    const produtos = await pool.query('SELECT * FROM produtos ORDER BY descricao');
    const fornecedores = await pool.query('SELECT * FROM fornecedores ORDER BY nome');
    
    res.render('movimentacoes', {
      user: res.locals.user,
      movimentacoes: result.rows || [],
      produtos: produtos.rows || [],
      fornecedores: fornecedores.rows || []
    });
  } catch (err) {
    console.error('Erro ao buscar movimentações:', err.message);
    res.status(500).send('Erro ao buscar movimentações');
  }
});

router.post('/', validateBody(createMovimentacaoSchema), async (req, res) => {
  const { 
    produto_id, 
    fornecedor_id, 
    cliente_nome, 
    rca, 
    tipo, 
    quantidade, 
    preco_unitario, 
    valor_total, 
    documento, 
    observacao 
  } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, 
        quantidade, preco_unitario, valor_total, documento, observacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      produto_id, 
      fornecedor_id || null, 
      cliente_nome || null, 
      rca || null, 
      tipo, 
      quantidade, 
      preco_unitario || null, 
      valor_total || null, 
      documento || null, 
      observacao || null
    ]);
    
    res.redirect('/movimentacoes');
  } catch (err) {
    console.error('Erro ao criar movimentação:', err.message);
    
    if (err.code === '23503') {
      return res.status(400).send('Produto ou fornecedor não encontrado');
    }
    
    res.status(500).send('Erro ao criar movimentação');
  }
});

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