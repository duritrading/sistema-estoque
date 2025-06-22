const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /inadimplencia - Mostra o relatório de contas vencidas
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const hoje = new Date().toISOString().split('T')[0];

        // Query corrigida para PostgreSQL
        const query = `
            SELECT 
                cr.id, 
                cr.cliente_nome, 
                cr.numero_parcela, 
                cr.total_parcelas, 
                cr.valor, 
                cr.data_vencimento, 
                cr.movimentacao_id, 
                p.descricao as produto_descricao,
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

// NOVA ROTA: Marcar conta como paga
router.post('/marcar-paga/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    const dataPagamento = new Date().toISOString().split('T')[0];
    
    try {
        // Buscar dados da conta
        const contaResult = await pool.query(`
            SELECT cr.*, p.descricao as produto_descricao
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

        if (conta.status === 'Pago') {
            return res.redirect('/inadimplencia');
        }

        // Registrar o pagamento no fluxo de caixa
        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao || conta.cliente_nome} (PAGAMENTO ATRASADO)`;
        
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
            RETURNING id
        `, [dataPagamento, conta.valor, descricaoFluxo, 1]); // categoria 1 = Receita de Vendas

        const fluxoCaixaId = insertResult.rows[0].id;

        // Atualizar status da conta
        await pool.query(
            `UPDATE contas_a_receber SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [dataPagamento, fluxoCaixaId, contaId]
        );
        
        res.redirect('/inadimplencia');
    } catch (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Não foi possível registrar o pagamento.' 
        });
    }
});

// ADICIONAR no arquivo src/routes/inadimplencia.js
// Inserir ANTES da linha: module.exports = router;

// NOVA ROTA: Excluir conta a receber vencida
router.post('/excluir/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const contaId = req.params.id;
    
    try {
        // Buscar dados da conta
        const contaResult = await pool.query(`
            SELECT cr.*, p.descricao as produto_descricao
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

        // Verificar se está vinculada a uma movimentação (venda real)
        if (conta.movimentacao_id) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: `Esta conta está vinculada a uma venda real (movimentação ${conta.movimentacao_id}). 
                          <br><br>
                          <strong>Para remover:</strong><br>
                          • Vá em "Movimentações"<br>
                          • Exclua a movimentação de saída<br>
                          • Isso removerá automaticamente todas as parcelas`,
                voltar_url: '/inadimplencia'
            });
        }

        // Se chegou aqui, é uma conta manual que pode ser excluída
        await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [contaId]);
        
        console.log(`✅ Conta a receber manual ID ${contaId} excluída (cliente: ${conta.cliente_nome})`);
        
        res.redirect('/inadimplencia?success=' + encodeURIComponent('Conta excluída com sucesso!'));
        
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