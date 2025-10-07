const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createProdutoSchema, updateProdutoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

rrouter.get('/', async (req, res) => {
  try {
    const produtos = await pool.query('SELECT * FROM produtos ORDER BY created_at DESC');
    
    // Buscar categorias únicas dos produtos
    const categorias = await pool.query(`
      SELECT DISTINCT categoria 
      FROM produtos 
      WHERE categoria IS NOT NULL AND categoria != ''
      ORDER BY categoria
    `);
    
    res.render('produtos', {
      user: res.locals.user,
      produtos: produtos.rows || [],
      categorias: categorias.rows || []
    });
  } catch (err) {
    console.error('Erro ao buscar produtos:', err.message);
    res.status(500).send('Erro ao buscar produtos');
  }
});

router.post('/', validateBody(createProdutoSchema), async (req, res) => {
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  try {
    await pool.query(`
      INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [codigo, descricao, unidade, categoria, estoque_minimo, preco_custo]);
    
    res.redirect('/produtos');
  } catch (err) {
    console.error('Erro ao criar produto:', err.message);
    
    if (err.code === '23505') {
      return res.status(400).send('Código do produto já existe');
    }
    
    res.status(500).send('Erro ao criar produto');
  }
});

router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    res.redirect('/produtos');
  } catch (err) {
    console.error('Erro ao deletar produto:', err.message);
    
    if (err.code === '23503') {
      return res.status(400).send('Não é possível deletar produto com movimentações associadas');
    }
    
    res.status(500).send('Erro ao deletar produto');
  }
});

module.exports = router;