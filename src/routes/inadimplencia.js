const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// =====================================================
// ROTA PRINCIPAL: Listar contas vencidas (inadimplência)
// =====================================================
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const hoje = new Date().toISOString().split('T')[0];

        // Query OTIMIZADA: usar descrição da própria conta a receber
        const query = `
            SELECT 
                cr.id, 
                cr.cliente_nome, 
                cr.numero_parcela, 
                cr.total_parcelas, 
                cr.valor, 
                cr.data_vencimento, 
                cr.movimentacao_id,
                COALESCE(cr.descricao, 'Produto/Serviço') as produto_descricao,
                (CURRENT_DATE - cr.data_vencimento::date) as dias_atraso
            FROM contas_a_receber cr
            WHERE 
                cr.status = 'Pendente' 
                AND cr.data_vencimento < $1
            ORDER BY cr.data_vencimento ASC
        `;

        const result = await pool.query(query, [hoje]);
        const contasVencidas = result.rows;

        // Calcular métricas de inadimplência
        const totalEmAtraso = contasVencidas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const clientesUnicos = [...new Set(contasVencidas.map(conta => conta.cliente_nome))];
        const clientesInadimplentes = clientesUnicos.length;

        console.log(`📊 Inadimplência: ${contasVencidas.length} contas, ${clientesInadimplentes} clientes, R$ ${totalEmAtraso.toFixed(2)}`);

        res.render('inadimplencia', {
            user: res.locals.user,
            contasVencidas: contasVencidas,
            totalEmAtraso: totalEmAtraso,
            clientesInadimplentes: clientesInadimplentes
        });

    } catch (error) {
        console.error('❌ Erro ao buscar inadimplência:', error);
        return res.status(500).send('Erro ao buscar dados de inadimplência: ' + error.message);
    }
});

// =====================================================
// ROTA: Marcar conta como paga (com data customizada)
// =====================================================
router.post('/marcar-paga/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    const { data_pagamento } = req.body;
    
    // Validações de entrada
    if (!data_pagamento) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Erro de Validação',
            mensagem: 'Data de pagamento é obrigatória.',
            voltar_url: '/inadimplencia'
        });
    }
    
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(data_pagamento)) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Erro de Validação',
            mensagem: 'Formato de data inválido. Use AAAA-MM-DD.',
            voltar_url: '/inadimplencia'
        });
    }
    
    try {
        // Buscar dados da conta usando descrição da própria conta
        const contaResult = await pool.query(`
            SELECT 
                cr.*,
                COALESCE(cr.descricao, 'Produto/Serviço') as produto_descricao
            FROM contas_a_receber cr
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro',
                mensagem: 'Conta não encontrada.',
                voltar_url: '/inadimplencia'
            });
        }

        if (conta.status === 'Pago') {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Ação Bloqueada',
                mensagem: 'Esta conta já foi marcada como paga.',
                voltar_url: '/inadimplencia'
            });
        }

        // Criar registro no fluxo de caixa
        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao} - ${conta.cliente_nome} (PAGAMENTO ATRASADO)`;
        
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (
                data_operacao, 
                tipo, 
                valor, 
                descricao, 
                categoria_id, 
                status,
                observacao
            )
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO', $5)
            RETURNING id
        `, [
            data_pagamento, 
            conta.valor, 
            descricaoFluxo, 
            1, // categoria 1 = Receita de Vendas
            `Conta ID: ${contaId} - Atraso: ${conta.dias_atraso || 0} dias`
        ]);

        const fluxoCaixaId = insertResult.rows[0].id;

        // Atualizar status da conta
        await pool.query(`
            UPDATE contas_a_receber 
            SET 
                status = 'Pago', 
                data_pagamento = $1, 
                fluxo_caixa_id = $2 
            WHERE id = $3
        `, [data_pagamento, fluxoCaixaId, contaId]);
        
        console.log(`✅ Pagamento registrado: Conta ${contaId} - ${conta.cliente_nome} - R$ ${conta.valor} - Data: ${data_pagamento}`);
        
        res.redirect('/inadimplencia');

    } catch (err) {
        console.error("❌ Erro ao registrar pagamento:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível registrar o pagamento: ' + err.message,
            voltar_url: '/inadimplencia'
        });
    }
});

// =====================================================
// ROTA: Excluir conta vencida (cancelamento)
// =====================================================
router.post('/excluir/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    
    try {
        // Buscar dados da conta antes de excluir
        const contaResult = await pool.query(`
            SELECT 
                cr.*,
                COALESCE(cr.descricao, 'Produto/Serviço') as produto_descricao
            FROM contas_a_receber cr
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.',
                voltar_url: '/inadimplencia'
            });
        }

        // Verificar se a conta já foi paga
        if (conta.status === 'Pago') {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Não é possível excluir uma conta que já foi paga. Use o estorno no fluxo de caixa se necessário.',
                voltar_url: '/inadimplencia' 
            });
        }

        // Se a conta tem fluxo_caixa_id, verificar se precisa estornar
        if (conta.fluxo_caixa_id) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Esta conta possui movimentação financeira. Faça o estorno no fluxo de caixa antes de excluir.',
                voltar_url: '/inadimplencia' 
            });
        }

        // Excluir a conta
        await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [contaId]);
        
        console.log(`🗑️ Conta excluída: ID ${contaId} - ${conta.cliente_nome} - ${conta.produto_descricao} - R$ ${conta.valor}`);
        
        res.redirect('/inadimplencia');

    } catch (err) {
        console.error("❌ Erro ao excluir conta:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível excluir a conta: ' + err.message,
            voltar_url: '/inadimplencia'
        });
    }
});

// =====================================================
// ROTA: Reagendar vencimento (nova funcionalidade)
// =====================================================
router.post('/reagendar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    const { nova_data_vencimento, motivo } = req.body;
    
    if (!nova_data_vencimento) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Erro de Validação',
            mensagem: 'Nova data de vencimento é obrigatória.',
            voltar_url: '/inadimplencia'
        });
    }
    
    try {
        // Buscar dados da conta
        const contaResult = await pool.query(`
            SELECT 
                cr.*,
                COALESCE(cr.descricao, 'Produto/Serviço') as produto_descricao
            FROM contas_a_receber cr
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        
        if (!conta) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro',
                mensagem: 'Conta não encontrada.',
                voltar_url: '/inadimplencia'
            });
        }

        if (conta.status === 'Pago') {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Ação Bloqueada',
                mensagem: 'Não é possível reagendar uma conta já paga.',
                voltar_url: '/inadimplencia'
            });
        }

        // Atualizar data de vencimento
        const observacaoReagendamento = motivo ? ` - Motivo: ${motivo}` : '';
        
        await pool.query(`
            UPDATE contas_a_receber 
            SET 
                data_vencimento = $1,
                observacao = COALESCE(observacao, '') || $2
            WHERE id = $3
        `, [
            nova_data_vencimento, 
            `[REAGENDADO ${new Date().toLocaleDateString('pt-BR')}]${observacaoReagendamento}`,
            contaId
        ]);
        
        console.log(`📅 Conta reagendada: ID ${contaId} - ${conta.cliente_nome} - Nova data: ${nova_data_vencimento}`);
        
        res.redirect('/inadimplencia');

    } catch (err) {
        console.error("❌ Erro ao reagendar conta:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível reagendar a conta: ' + err.message,
            voltar_url: '/inadimplencia'
        });
    }
});

// =====================================================
// ROTA: Relatório de inadimplência (JSON para APIs)
// =====================================================
router.get('/api/relatorio', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Erro de configuração.' });

    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Buscar dados completos de inadimplência
        const result = await pool.query(`
            SELECT 
                cr.id,
                cr.cliente_nome,
                cr.numero_parcela,
                cr.total_parcelas,
                cr.valor,
                cr.data_vencimento,
                COALESCE(cr.descricao, 'Produto/Serviço') as produto_descricao,
                (CURRENT_DATE - cr.data_vencimento::date) as dias_atraso
            FROM contas_a_receber cr
            WHERE 
                cr.status = 'Pendente' 
                AND cr.data_vencimento < $1
            ORDER BY cr.data_vencimento ASC
        `, [hoje]);

        const contas = result.rows;
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);
        const clientesUnicos = [...new Set(contas.map(conta => conta.cliente_nome))];

        // Agrupar por faixas de atraso
        const faixasAtraso = {
            ate_30_dias: contas.filter(c => c.dias_atraso <= 30),
            ate_60_dias: contas.filter(c => c.dias_atraso > 30 && c.dias_atraso <= 60),
            ate_90_dias: contas.filter(c => c.dias_atraso > 60 && c.dias_atraso <= 90),
            acima_90_dias: contas.filter(c => c.dias_atraso > 90)
        };

        res.json({
            data_consulta: hoje,
            resumo: {
                total_contas: contas.length,
                total_valor: totalValor,
                total_clientes: clientesUnicos.length
            },
            faixas_atraso: {
                ate_30_dias: {
                    quantidade: faixasAtraso.ate_30_dias.length,
                    valor: faixasAtraso.ate_30_dias.reduce((sum, c) => sum + parseFloat(c.valor), 0)
                },
                ate_60_dias: {
                    quantidade: faixasAtraso.ate_60_dias.length,
                    valor: faixasAtraso.ate_60_dias.reduce((sum, c) => sum + parseFloat(c.valor), 0)
                },
                ate_90_dias: {
                    quantidade: faixasAtraso.ate_90_dias.length,
                    valor: faixasAtraso.ate_90_dias.reduce((sum, c) => sum + parseFloat(c.valor), 0)
                },
                acima_90_dias: {
                    quantidade: faixasAtraso.acima_90_dias.length,
                    valor: faixasAtraso.acima_90_dias.reduce((sum, c) => sum + parseFloat(c.valor), 0)
                }
            },
            contas: contas
        });

    } catch (error) {
        console.error('❌ Erro API inadimplência:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;