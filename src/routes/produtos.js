// routes/produtos.js - FIX + OPTIMIZATION
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createProdutoSchema, updateProdutoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

// ========================================
// VALIDATION SCHEMAS
// ========================================
const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// ========================================
// GET / - Lista produtos
// ========================================
router.get('/', async (req, res) => {
  try {
    // Query otimizada: produtos + saldo em uma única query
    const produtos = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(
          CASE 
            WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
            WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
            ELSE 0 
          END
        ), 0) as saldo_atual
      FROM produtos p
      LEFT JOIN movimentacoes m ON p.id = m.produto_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    
    // Buscar categorias únicas
    const categorias = await pool.query(`
      SELECT DISTINCT categoria 
      FROM produtos 
      WHERE categoria IS NOT NULL AND categoria != ''
      ORDER BY categoria
    `);
    
    res.render('produtos', {
      user: res.locals.user,
      produtos: produtos.rows || [],
      categorias: categorias.rows.map(r => r.categoria) || []
    });
  } catch (err) {
    console.error('❌ Erro ao buscar produtos:', err.message);
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro ao Carregar Produtos',
      mensagem: 'Não foi possível carregar a lista de produtos. Tente novamente.',
      voltar_url: '/'
    });
  }
});

// ========================================
// POST / - Criar novo produto
// ========================================
router.post('/', validateBody(createProdutoSchema), async (req, res) => {
  try {
    const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
    
    await pool.query(`
      INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      codigo, 
      descricao, 
      unidade || 'UN', 
      categoria || null, 
      estoque_minimo || 0, 
      preco_custo || null
    ]);
    
    console.log(`✅ Produto criado: ${codigo} - ${descricao}`);
    res.redirect('/produtos');
    
  } catch (err) {
    console.error('❌ Erro ao criar produto:', err.message);
    
    // Tratamento específico de erros
    if (err.code === '23505') {
      return res.status(400).render('error', {
        user: res.locals.user,
        titulo: 'Código Duplicado',
        mensagem: `O código "${req.body.codigo}" já existe no sistema. Use um código único.`,
        voltar_url: '/produtos'
      });
    }
    
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro ao Criar Produto',
      mensagem: 'Não foi possível cadastrar o produto. Verifique os dados e tente novamente.',
      voltar_url: '/produtos'
    });
  }
});

// ========================================
// POST /update/:id - Atualizar produto
// ========================================
router.post('/update/:id', validateParams(idParamSchema), validateBody(updateProdutoSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
    
    // Verificar se produto existe
    const produtoCheck = await pool.query('SELECT id FROM produtos WHERE id = $1', [id]);
    
    if (produtoCheck.rows.length === 0) {
      return res.status(404).render('error', {
        user: res.locals.user,
        titulo: 'Produto Não Encontrado',
        mensagem: 'O produto que você está tentando atualizar não existe.',
        voltar_url: '/produtos'
      });
    }
    
    await pool.query(`
      UPDATE produtos 
      SET codigo = $1, descricao = $2, unidade = $3, categoria = $4, 
          estoque_minimo = $5, preco_custo = $6
      WHERE id = $7
    `, [codigo, descricao, unidade, categoria, estoque_minimo, preco_custo, id]);
    
    console.log(`✅ Produto atualizado: ID ${id}`);
    res.redirect('/produtos');
    
  } catch (err) {
    console.error('❌ Erro ao atualizar produto:', err.message);
    
    if (err.code === '23505') {
      return res.status(400).render('error', {
        user: res.locals.user,
        titulo: 'Código Duplicado',
        mensagem: 'Este código já está em uso por outro produto.',
        voltar_url: '/produtos'
      });
    }
    
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro ao Atualizar',
      mensagem: 'Não foi possível atualizar o produto.',
      voltar_url: '/produtos'
    });
  }
});

// ========================================
// POST /delete/:id - Deletar produto
// ========================================
router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se produto existe
    const produtoCheck = await pool.query(
      'SELECT codigo, descricao FROM produtos WHERE id = $1', 
      [id]
    );
    
    if (produtoCheck.rows.length === 0) {
      return res.status(404).render('error', {
        user: res.locals.user,
        titulo: 'Produto Não Encontrado',
        mensagem: 'O produto que você está tentando excluir não existe.',
        voltar_url: '/produtos'
      });
    }
    
    const produto = produtoCheck.rows[0];
    
    // Verificar dependências (movimentações)
    const movimentacoesCheck = await pool.query(
      'SELECT COUNT(*) as count FROM movimentacoes WHERE produto_id = $1', 
      [id]
    );
    
    if (parseInt(movimentacoesCheck.rows[0].count) > 0) {
      return res.status(400).render('error', {
        user: res.locals.user,
        titulo: 'Ação Bloqueada',
        mensagem: `O produto "${produto.codigo} - ${produto.descricao}" não pode ser excluído pois possui ${movimentacoesCheck.rows[0].count} movimentação(ões) associada(s).`,
        voltar_url: '/produtos'
      });
    }
    
    // Deletar produto
    await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    
    console.log(`🗑️ Produto deletado: ${produto.codigo} - ${produto.descricao}`);
    res.redirect('/produtos');
    
  } catch (err) {
    console.error('❌ Erro ao deletar produto:', err.message);
    
    // Tratamento de constraint violations
    if (err.code === '23503') {
      return res.status(400).render('error', {
        user: res.locals.user,
        titulo: 'Dependências Encontradas',
        mensagem: 'Este produto está sendo usado em outras partes do sistema e não pode ser excluído.',
        voltar_url: '/produtos'
      });
    }
    
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro ao Excluir',
      mensagem: 'Não foi possível excluir o produto.',
      voltar_url: '/produtos'
    });
  }
});

module.exports = router;