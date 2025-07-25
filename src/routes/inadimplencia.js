const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /inadimplencia - Mostra o relatório de contas vencidas
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const hoje = new Date().toISOString().split('T')[0];

        // Query com NOVA COLUNA de descrição + coluna produto original
        const query = `
            SELECT 
                cr.id, 
                cr.cliente_nome, 
                cr.numero_parcela, 
                cr.total_parcelas, 
                cr.valor, 
                cr.data_vencimento, 
                cr.movimentacao_id, 
                -- Manter produto original (do JOIN)
                p.descricao as produto_descricao,
                -- NOVA COLUNA: descrição da conta a receber
                COALESCE(cr.descricao, '') as conta_descricao,
                (CURRENT_DATE - cr.data_vencimento::date) as dias_atraso
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE 
                cr.status = 'Pendente' 
                AND cr.data_vencimento < $1
            ORDER BY cr.data_vencimento ASC
        `;

        const result = await pool.query(query, [hoje]);
        const contasVencidas = result.rows;

        // Calcular o total em atraso
        const totalEmAtraso = contasVencidas.reduce((sum, conta) => sum + parseFloat(conta.valor), 0);

        // Calcular clientes únicos inadimplentes
        const clientesUnicos = [...new Set(contasVencidas.map(conta => conta.cliente_nome))];
        const clientesInadimplentes = clientesUnicos.length;

        res.render('inadimplencia', {
            user: res.locals.user,
            contasVencidas: contasVencidas,
            totalEmAtraso: totalEmAtraso,
            clientesInadimplentes: clientesInadimplentes
        });
    } catch (error) {
        console.error('Erro ao buscar inadimplência:', error);
        return res.status(500).send('Erro ao buscar dados de inadimplência.');
    }
});

// ROTA ATUALIZADA: Marcar conta como paga com data customizada
router.post('/marcar-paga/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    const { data_pagamento } = req.body;
    
    // Validar se a data foi enviada
    if (!data_pagamento) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Erro de Validação',
            mensagem: 'Data de pagamento é obrigatória.',
            voltar_url: '/inadimplencia'
        });
    }
    
    // Validar formato da data
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(data_pagamento)) {
        return res.render('error', {
            user: res.locals.user,
            titulo: 'Erro de Validação',
            mensagem: 'Formato de data inválido.',
            voltar_url: '/inadimplencia'
        });
    }
    
    try {
        // Buscar dados da conta com ambas as descrições
        const contaResult = await pool.query(`
            SELECT 
                cr.*, 
                p.descricao as produto_descricao,
                COALESCE(cr.descricao, '') as conta_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
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

        // Registrar o pagamento no fluxo de caixa usando descrição da conta
        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.conta_descricao || conta.produto_descricao || conta.cliente_nome} (PAGAMENTO ATRASADO)`;
        
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
            RETURNING id
        `, [data_pagamento, conta.valor, descricaoFluxo, 1]); // categoria 1 = Receita de Vendas

        const fluxoCaixaId = insertResult.rows[0].id;

        // Atualizar status da conta com a data escolhida
        await pool.query(
            `UPDATE contas_a_receber SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [data_pagamento, fluxoCaixaId, contaId]
        );
        
        console.log(`✅ Conta ID ${contaId} marcada como paga em ${data_pagamento} (cliente: ${conta.cliente_nome})`);
        
        res.redirect('/inadimplencia');
    } catch (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível registrar o pagamento: ' + err.message,
            voltar_url: '/inadimplencia'
        });
    }
});

// NOVA ROTA: Excluir conta a receber vencida
router.post('/excluir/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    
    try {
        // Buscar dados da conta
        const contaResult = await pool.query(`
            SELECT 
                cr.*, 
                p.descricao as produto_descricao,
                COALESCE(cr.descricao, '') as conta_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        if (!conta) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Conta não encontrada.' 
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

        // Excluir a conta
        await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [contaId]);
        
        console.log(`🗑️ Conta ID ${contaId} excluída - Cliente: ${conta.cliente_nome} - Valor: R$ ${conta.valor}`);
        
        res.redirect('/inadimplencia');
    } catch (err) {
        console.error("Erro ao excluir conta:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível excluir a conta: ' + err.message,
            voltar_url: '/inadimplencia'
        });
    }
});

module.exports = router;