const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createContaPagarSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

// ========================================
// SCHEMAS DE VALIDAÇÃO
// ========================================

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

// ========================================
// HELPER: Preservar query params no redirect
// ========================================

function buildRedirectUrl(baseUrl, referer) {
  try {
    if (referer) {
      const url = new URL(referer);
      const queryString = url.search; // Pega ?param1=value1&param2=value2
      return baseUrl + queryString;
    }
  } catch (e) {
    // Se falhar parsing, retorna URL base
  }
  return baseUrl;
}

// ========================================
// GET / - Lista contas a pagar
// ========================================

router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração do banco de dados.');
    try {
        let { data_inicio, data_fim } = req.query;
        if (!data_inicio) {
            const hoje = new Date();
            data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!data_fim) {
            const hoje = new Date();
            data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        const queryContas = `
            SELECT cp.*, f.nome as fornecedor_nome, cf.nome as categoria_nome 
            FROM contas_a_pagar cp
            LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
            LEFT JOIN categorias_financeiras cf ON cp.categoria_id = cf.id
            WHERE cp.data_vencimento >= $1 AND cp.data_vencimento <= $2
            ORDER BY cp.data_vencimento ASC
        `;
        
        const [contasResult, fornecedoresResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, [data_inicio, data_fim]),
            pool.query('SELECT * FROM fornecedores ORDER BY nome'),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'DESPESA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows || [];
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const totalPendente = contas.filter(c => c.status !== 'Pago').reduce((sum, c) => sum + parseFloat(c.valor), 0);

        res.render('contas-a-pagar', {
            user: res.locals.user,
            contas,
            fornecedores: fornecedoresResult.rows || [],
            categorias: categoriasResult.rows || [],
            filtros: { data_inicio, data_fim },
            totalValor,
            totalPendente
        });
    } catch (error) {
        console.error('Erro ao carregar contas a pagar:', error);
        res.status(500).send('Erro ao carregar a página.');
    }
});

// ========================================
// POST / - Criar nova conta a pagar
// ========================================

router.post('/', validateBody(createContaPagarSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        // Dados já validados e sanitizados pelo Joi
        const { descricao, fornecedor_id, valor, data_vencimento, categoria_id } = req.body;
        
        await pool.query(
            'INSERT INTO contas_a_pagar (descricao, fornecedor_id, valor, data_vencimento, categoria_id) VALUES ($1, $2, $3, $4, $5)',
            [descricao, fornecedor_id || null, valor, data_vencimento, categoria_id]
        );
        
        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch(err) {
        console.error('Erro ao criar conta a pagar:', err);
        
        // Tratamento específico de erros
        if (err.code === '23503') {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Validação',
                mensagem: 'Fornecedor ou categoria financeira não encontrados.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        res.status(500).send('Erro ao criar conta: ' + err.message);
    }
});

// ========================================
// POST /pagar/:id - Registrar pagamento
// ========================================

router.post('/pagar/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id; // Já validado pelo middleware
    
    try {
        const contaResult = await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId]);
        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.' 
            });
        }
        
        if (conta.status === 'Pago') {
            return res.redirect('/contas-a-pagar');
        }

        const dataPagamento = new Date().toISOString().split('T')[0];
        const descricaoFluxo = `Pagamento: ${conta.descricao}`;

        // Lança a saída no fluxo de caixa usando a categoria da conta
        const fluxoResult = await pool.query(
            `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
             VALUES ($1, 'DEBITO', $2, $3, $4, 'PAGO') 
             RETURNING id`,
            [dataPagamento, conta.valor, descricaoFluxo, conta.categoria_id]
        );
        const fluxoCaixaId = fluxoResult.rows[0].id;

        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [dataPagamento, fluxoCaixaId, contaId]
        );

        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('Erro ao registrar pagamento:', err);
        res.status(500).send('Erro ao registrar pagamento: ' + err.message);
    }
});

// ========================================
// POST /estornar/:id - Estornar pagamento
// ========================================

router.post('/estornar/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id; // Já validado pelo middleware
    
    try {
        const contaResult = await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId]);
        const conta = contaResult.rows[0];

        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta a pagar não encontrada.'
            });
        }
        
        if (conta.status !== 'Pago') {
            return res.redirect('/contas-a-pagar');
        }

        // PASSO 1: Atualiza a conta a pagar PRIMEIRO, removendo a referência ao fluxo_caixa_id
        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL WHERE id = $1`,
            [contaId]
        );

        // PASSO 2: Se a conta tinha um lançamento no caixa associado, deleta ele DEPOIS
        if (conta.fluxo_caixa_id) {
            await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [conta.fluxo_caixa_id]);
        }

        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('Erro ao estornar pagamento:', err);
        res.status(500).send('Erro ao estornar pagamento: ' + err.message);
    }
});

// ========================================
// POST /delete/:id - Excluir conta a pagar
// ========================================

router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { id } = req.params; // Já validado pelo middleware

        // Medida de segurança: só permite excluir contas que ainda não foram pagas
        const contaResult = await pool.query('SELECT status FROM contas_a_pagar WHERE id = $1', [id]);
        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.' 
            });
        }
        
        if (conta.status === 'Pago') {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Não é possível excluir uma conta que já foi paga. Você deve estornar o pagamento primeiro.' 
            });
        }

        await pool.query('DELETE FROM contas_a_pagar WHERE id = $1', [id]);
        
        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error("Erro ao excluir conta a pagar:", err);
        res.status(500).send('Erro ao excluir conta a pagar: ' + err.message);
    }
});

module.exports = router;