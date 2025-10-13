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

const pagarContaSchema = Joi.object({
  data_pagamento: Joi.date()
    .iso()
    .max('now')
    .required()
    .messages({
      'any.required': 'Data de pagamento é obrigatória',
      'date.max': 'Data não pode ser futura'
    })
});

// ========================================
// HELPER: Preservar query params no redirect
// ========================================

function buildRedirectUrl(baseUrl, referer) {
  try {
    if (referer) {
      const url = new URL(referer);
      const queryString = url.search;
      return baseUrl + queryString;
    }
  } catch (e) {
    // Se falhar parsing, retorna URL base
  }
  return baseUrl;
}

// ========================================
// HELPER: Parse seguro de valores numéricos
// ========================================

function safeParseFloat(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) || !isFinite(parsed) ? defaultValue : parsed;
}

// ========================================
// GET / - Lista contas a pagar
// ========================================

router.get('/', async (req, res) => {
    // ✅ FIX 1: Verificação robusta do pool
    if (!pool) {
        console.error('❌ Pool de conexão PostgreSQL não inicializado!');
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro de Configuração',
            mensagem: 'Banco de dados não conectado. Contate o administrador.',
            voltar_url: '/'
        });
    }
    
    try {
        // ✅ FIX 2: Definir filtros de data com validação
        let { data_inicio, data_fim } = req.query;
        
        if (!data_inicio) {
            const hoje = new Date();
            data_inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!data_fim) {
            const hoje = new Date();
            data_fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
        }

        // ✅ FIX 3: Verificar existência das tabelas antes de consultar
        const checkTablesQuery = `
            SELECT 
                COUNT(DISTINCT table_name) as total
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('contas_a_pagar', 'fornecedores', 'categorias_financeiras')
        `;
        
        const tableCheck = await pool.query(checkTablesQuery);
        const tableCount = parseInt(tableCheck.rows[0]?.total || 0);
        
        if (tableCount < 3) {
            console.error('❌ Tabelas necessárias não encontradas no banco!');
            console.error(`   Tabelas encontradas: ${tableCount}/3`);
            
            return res.status(500).render('error', {
                user: res.locals.user,
                titulo: 'Erro de Banco de Dados',
                mensagem: 'Tabelas do sistema não encontradas. Execute: node scripts/init-database.js',
                voltar_url: '/'
            });
        }

        // ✅ FIX 4: Query principal com tratamento de dados
        const queryContas = `
            SELECT 
                cp.*, 
                COALESCE(f.nome, 'Sem fornecedor') as fornecedor_nome, 
                COALESCE(cf.nome, 'Sem categoria') as categoria_nome 
            FROM contas_a_pagar cp
            LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
            LEFT JOIN categorias_financeiras cf ON cp.categoria_id = cf.id
            WHERE cp.data_vencimento >= $1 AND cp.data_vencimento <= $2
            ORDER BY cp.data_vencimento ASC
        `;
        
        console.log(`🔍 Buscando contas de ${data_inicio} até ${data_fim}`);
        
        // ✅ FIX 5: Executar queries em paralelo com Promise.all
        const [contasResult, fornecedoresResult, categoriasResult] = await Promise.all([
            pool.query(queryContas, [data_inicio, data_fim]),
            pool.query('SELECT * FROM fornecedores ORDER BY nome'),
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'DESPESA' ORDER BY nome`)
        ]);

        const contas = contasResult.rows || [];
        const fornecedores = fornecedoresResult.rows || [];
        const categorias = categoriasResult.rows || [];

        console.log(`✅ Encontradas ${contas.length} contas a pagar`);
        console.log(`✅ Encontrados ${fornecedores.length} fornecedores`);
        console.log(`✅ Encontradas ${categorias.length} categorias de despesa`);

        // ✅ FIX 6: Cálculo seguro de totais com proteção contra NaN
        const totalValor = contas.reduce((sum, conta) => {
            return sum + safeParseFloat(conta.valor, 0);
        }, 0);
        
        const totalPendente = contas
            .filter(c => c.status !== 'Pago')
            .reduce((sum, c) => {
                return sum + safeParseFloat(c.valor, 0);
            }, 0);

        console.log(`💰 Total geral: R$ ${totalValor.toFixed(2)}`);
        console.log(`⏳ Total pendente: R$ ${totalPendente.toFixed(2)}`);

        // ✅ FIX 7: Renderizar view com dados garantidos
        res.render('contas-a-pagar', {
            user: res.locals.user,
            contas: contas,
            fornecedores: fornecedores,
            categorias: categorias,
            filtros: { data_inicio, data_fim },
            totalValor: totalValor,
            totalPendente: totalPendente
        });

    } catch (error) {
        // ✅ FIX 8: Log detalhado para debugging
        console.error('❌ ERRO CRÍTICO em GET /contas-a-pagar:');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('📝 Mensagem:', error.message);
        console.error('🔢 Código:', error.code);
        console.error('📍 Detalhe:', error.detail);
        console.error('📚 Stack:', error.stack);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // ✅ FIX 9: Mensagem de erro específica baseada no código
        let mensagemErro = 'Erro ao carregar contas a pagar.';
        
        if (error.code === '42P01') {
            mensagemErro = 'Tabela não encontrada no banco. Execute: node scripts/init-database.js';
        } else if (error.code === '3D000') {
            mensagemErro = 'Banco de dados não encontrado. Verifique a configuração.';
        } else if (error.code === 'ECONNREFUSED') {
            mensagemErro = 'PostgreSQL não está rodando. Inicie o banco de dados.';
        }

        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro ao Carregar Contas a Pagar',
            mensagem: `${mensagemErro}\n\nDetalhes técnicos: ${error.message}`,
            voltar_url: '/'
        });
    }
});

// ========================================
// POST / - Criar nova conta a pagar
// ========================================

router.post('/', validateBody(createContaPagarSchema), async (req, res) => {
    if (!pool) {
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro de Configuração',
            mensagem: 'Banco de dados não conectado.',
            voltar_url: '/contas-a-pagar'
        });
    }
    
    try {
        const { descricao, fornecedor_id, valor, data_vencimento, categoria_id } = req.body;
        
        // ✅ Validação adicional de valor
        if (isNaN(parseFloat(valor)) || parseFloat(valor) <= 0) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Validação',
                mensagem: 'Valor deve ser um número positivo válido.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        await pool.query(
            'INSERT INTO contas_a_pagar (descricao, fornecedor_id, valor, data_vencimento, categoria_id) VALUES ($1, $2, $3, $4, $5)',
            [descricao, fornecedor_id || null, valor, data_vencimento, categoria_id]
        );
        
        console.log(`✅ Conta a pagar criada: ${descricao} - R$ ${valor}`);
        
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch(err) {
        console.error('❌ Erro ao criar conta a pagar:', err);
        
        if (err.code === '23503') {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Validação',
                mensagem: 'Fornecedor ou categoria financeira não encontrados.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro ao Criar Conta',
            mensagem: `Não foi possível criar a conta. ${err.message}`,
            voltar_url: '/contas-a-pagar'
        });
    }
});

// ========================================
// POST /pagar/:id - Registrar pagamento com data customizada
// ========================================

router.post('/pagar/:id', validateParams(idParamSchema), validateBody(pagarContaSchema), async (req, res) => {
    if (!pool) {
        return res.status(500).send('Erro de configuração.');
    }
    
    const contaId = req.params.id;
    const { data_pagamento } = req.body;
    
    try {
        const contaResult = await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId]);
        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        if (conta.status === 'Pago') {
            console.log(`⚠️ Tentativa de pagar conta já paga: ID ${contaId}`);
            return res.redirect('/contas-a-pagar');
        }

        const descricaoFluxo = `Pagamento: ${conta.descricao}`;

        // Lança a saída no fluxo de caixa com a data escolhida
        const fluxoResult = await pool.query(
            `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
             VALUES ($1, 'DEBITO', $2, $3, $4, 'PAGO') 
             RETURNING id`,
            [data_pagamento, conta.valor, descricaoFluxo, conta.categoria_id]
        );
        const fluxoCaixaId = fluxoResult.rows[0].id;

        // Atualiza a conta com a data escolhida
        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [data_pagamento, fluxoCaixaId, contaId]
        );

        console.log(`✅ Conta ID ${contaId} paga em ${data_pagamento} - R$ ${conta.valor}`);

        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('❌ Erro ao registrar pagamento:', err);
        
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro ao Registrar Pagamento',
            mensagem: `Não foi possível registrar o pagamento. ${err.message}`,
            voltar_url: '/contas-a-pagar'
        });
    }
});

// ========================================
// POST /estornar/:id - Estornar pagamento
// ========================================

router.post('/estornar/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) {
        return res.status(500).send('Erro de configuração.');
    }
    
    const contaId = req.params.id;
    
    try {
        const contaResult = await pool.query('SELECT * FROM contas_a_pagar WHERE id = $1', [contaId]);
        const conta = contaResult.rows[0];

        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta a pagar não encontrada.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        if (conta.status !== 'Pago') {
            console.log(`⚠️ Tentativa de estornar conta não paga: ID ${contaId}`);
            return res.redirect('/contas-a-pagar');
        }

        // PASSO 1: Atualiza a conta PRIMEIRO
        await pool.query(
            `UPDATE contas_a_pagar SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL WHERE id = $1`,
            [contaId]
        );

        // PASSO 2: Deleta lançamento do fluxo de caixa DEPOIS
        if (conta.fluxo_caixa_id) {
            await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [conta.fluxo_caixa_id]);
            console.log(`✅ Pagamento estornado: Conta ID ${contaId} - R$ ${conta.valor}`);
        }

        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('❌ Erro ao estornar pagamento:', err);
        
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro ao Estornar Pagamento',
            mensagem: `Não foi possível estornar o pagamento. ${err.message}`,
            voltar_url: '/contas-a-pagar'
        });
    }
});

// ========================================
// POST /delete/:id - Excluir conta a pagar
// ========================================

router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) {
        return res.status(500).send('Erro de configuração.');
    }
    
    try {
        const { id } = req.params;

        const contaResult = await pool.query('SELECT status, descricao, valor FROM contas_a_pagar WHERE id = $1', [id]);
        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.',
                voltar_url: '/contas-a-pagar'
            });
        }
        
        if (conta.status === 'Pago') {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Não é possível excluir uma conta que já foi paga. Você deve estornar o pagamento primeiro.',
                voltar_url: '/contas-a-pagar'
            });
        }

        await pool.query('DELETE FROM contas_a_pagar WHERE id = $1', [id]);
        
        console.log(`🗑️ Conta excluída: ${conta.descricao} - R$ ${conta.valor}`);
        
        const redirectUrl = buildRedirectUrl('/contas-a-pagar', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch (err) {
        console.error("❌ Erro ao excluir conta a pagar:", err);
        
        return res.status(500).render('error', {
            user: res.locals.user,
            titulo: 'Erro ao Excluir Conta',
            mensagem: `Não foi possível excluir a conta. ${err.message}`,
            voltar_url: '/contas-a-pagar'
        });
    }
});

module.exports = router;