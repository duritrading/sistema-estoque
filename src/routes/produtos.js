// src/routes/produtos.js - EXEMPLO COM VALIDAÇÃO

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createProdutoSchema, updateProdutoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

// Schema para parâmetros de ID
const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// ========================================
// GET /produtos - Listar todos
// ========================================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM produtos ORDER BY created_at DESC');
    res.render('produtos', {
      user: res.locals.user,
      produtos: result.rows || []
    });
  } catch (err) {
    console.error('Erro ao buscar produtos:', err.message);
    res.status(500).send('Erro ao buscar produtos');
  }
});

// ========================================
// POST /produtos - Criar produto (COM VALIDAÇÃO)
// ========================================
router.post('/', validateBody(createProdutoSchema), async (req, res) => {
  // ✅ req.body já foi validado e sanitizado pelo middleware!
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [codigo, descricao, unidade, categoria, estoque_minimo, preco_custo]);
    
    res.redirect('/produtos');
  } catch (err) {
    console.error('Erro ao criar produto:', err.message);
    
    // Verificar se é erro de duplicação
    if (err.code === '23505') {
      return res.status(400).send('Código do produto já existe');
    }
    
    res.status(500).send('Erro ao criar produto');
  }
});

// ========================================
// PUT /produtos/:id - Atualizar produto (COM VALIDAÇÃO)
// ========================================
router.put('/:id', 
  validateParams(idParamSchema),
  validateBody(updateProdutoSchema),
  async (req, res) => {
    // ✅ Ambos params e body foram validados!
    const { id } = req.params;
    const updates = req.body;
    
    try {
      // Construir query dinâmica apenas com campos fornecidos
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      
      if (fields.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }
      
      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
      const query = `UPDATE produtos SET ${setClause} WHERE id = $1 RETURNING *`;
      
      const result = await pool.query(query, [id, ...values]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }
      
      res.json({ success: true, produto: result.rows[0] });
    } catch (err) {
      console.error('Erro ao atualizar produto:', err.message);
      res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
  }
);

// ========================================
// DELETE /produtos/:id - Deletar produto (COM VALIDAÇÃO)
// ========================================
router.delete('/:id', validateParams(idParamSchema), async (req, res) => {
  // ✅ req.params.id já foi validado!
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM produtos WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    res.json({ success: true, message: 'Produto deletado' });
  } catch (err) {
    console.error('Erro ao deletar produto:', err.message);
    
    // Verificar se há dependências (foreign key)
    if (err.code === '23503') {
      return res.status(400).json({ 
        error: 'Não é possível deletar produto com movimentações associadas' 
      });
    }
    
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

module.exports = router;