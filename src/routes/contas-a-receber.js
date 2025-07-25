const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET - Mostra a página
router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        // Pega a data de hoje para comparação
        const hoje = new Date().toISOString().split('T')[0];
        
        let { data_inicio, data_fim } = req.query;
        if (!data_inicio) {
            const hojeDate = new Date();
            data_inicio = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1).toISOString().split('T')[0];
        }
        if (!data_fim) {
            const hojeDate = new Date();
            data_fim = new Date(hojeDate.getFullYear(), hojeDate.getMonth() + 1, 0).toISOString().split('T')[0];
        }
        
        // QUERY CORRIGIDA - Mostra apenas contas NÃO vencidas e NÃO pagas
        const queryContas = `
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.status = 'Pendente'
                AND cr.data_vencimento >= $1
            ORDER BY cr.data_vencimento ASC
        `;
        
        const [contasResult, categoriasResult, clientesResult] = await Promise.all([
            pool.query(queryContas, [hoje]), // Agora só passa a data de hoje
            pool.query(`SELECT * FROM categorias_financeiras WHERE tipo = 'RECEITA' ORDER BY nome`),
            pool.query('SELECT DISTINCT nome FROM clientes ORDER BY nome') // NOVA QUERY
        ]);

        const contas = contasResult.rows || [];
        const totalValor = contas.reduce((sum, conta) => sum + parseFloat(conta.valor || 0), 0);
        const totalPendente = contas.filter(c => c.status !== 'Pago').reduce((sum, c) => sum + parseFloat(c.valor || 0), 0);

        res.render('contas-a-receber', {
            user: res.locals.user,
            contas: contas,
            categorias: categoriasResult.rows || [],
            clientes: clientesResult.rows || [], // NOVA LINHA
            filtros: { data_inicio, data_fim },
            totalValor,
            totalPendente
        });
    } catch (error) {
        console.error('Erro ao carregar contas a receber:', error);
        res.status(500).send('Erro ao carregar contas a receber: ' + error.message);
    }
});

// ROTA POST /contas-a-receber/registrar-pagamento/:id - Processa o pagamento
router.post('/registrar-pagamento/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    const contaId = req.params.id;
    const dataPagamento = new Date().toISOString().split('T')[0];
    
    try {
        const contaResult = await pool.query(`
            SELECT cr.*, p.descricao as produto_descricao
            FROM contas_a_receber cr
            LEFT JOIN movimentacoes m ON cr.movimentacao_id = m.id
            LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE cr.id = $1
        `, [contaId]);

        const conta = contaResult.rows[0];
        if (!conta) return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta a receber não encontrada.' });
        if (conta.status === 'Pago') return res.redirect('/contas-a-receber');

        const descricaoFluxo = `Recebimento Parcela ${conta.numero_parcela}/${conta.total_parcelas} - ${conta.produto_descricao || conta.cliente_nome}`;
        const insertResult = await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status)
            VALUES ($1, 'CREDITO', $2, $3, $4, 'PAGO')
            RETURNING id
        `, [dataPagamento, conta.valor, descricaoFluxo, 1]);

        const fluxoCaixaId = insertResult.rows[0].id;

        await pool.query(
            `UPDATE contas_a_receber SET status = 'Pago', data_pagamento = $1, fluxo_caixa_id = $2 WHERE id = $3`,
            [dataPagamento, fluxoCaixaId, contaId]
        );
        
        res.redirect('/contas-a-receber');
    } catch (err) {
        console.error("Erro ao registrar pagamento:", err);
        return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Não foi possível registrar o pagamento: ' + err.message });
    }
});

// ROTA POST para criar conta manual
router.post('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { cliente_nome, valor, data_vencimento, categoria_id, descricao } = req.body;
        
        // Validações
        if (!cliente_nome || !valor || !data_vencimento || !categoria_id) {
            return res.status(400).send('Dados obrigatórios faltando.');
        }
        
        // Converte valor para número
        const valorNumerico = parseFloat(valor);
        
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).send('Valor inválido.');
        }
        
        if (valorNumerico > 99999999.99) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Validação',
                mensagem: 'Valor muito grande. Máximo permitido: R$ 99.999.999,99',
                voltar_url: '/contas-a-receber'
            });
        }
        
        await pool.query(`
            INSERT INTO contas_a_receber (
                cliente_nome, numero_parcela, total_parcelas, 
                valor, data_vencimento, status, categoria_id, descricao
            ) VALUES ($1, 1, 1, $2, $3, 'Pendente', $4, $5)
        `, [cliente_nome, valorNumerico, data_vencimento, parseInt(categoria_id), descricao || null]);
        
        res.redirect('/contas-a-receber');
    } catch (err) {
        console.error("Erro ao criar conta a receber:", err);
        res.status(500).send('Erro ao criar conta a receber: ' + err.message);
    }
});

// NOVA ROTA PARA EXCLUIR
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;
        
        // Verifica se é um lançamento manual (sem movimentacao_id)
        const conta = await pool.query('SELECT movimentacao_id, status FROM contas_a_receber WHERE id = $1', [id]);
        
        if (conta.rows.length === 0) {
            return res.render('error', { user: res.locals.user, titulo: 'Erro', mensagem: 'Conta não encontrada.' });
        }
        
        if (conta.rows[0].movimentacao_id) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Esta conta está vinculada a uma movimentação e não pode ser excluída diretamente.' 
            });
        }
        
        if (conta.rows[0].status === 'Pago') {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Não é possível excluir uma conta que já foi paga.' 
            });
        }
        
        await pool.query('DELETE FROM contas_a_receber WHERE id = $1', [id]);
        res.redirect('/contas-a-receber');
    } catch (err) {
        console.error("Erro ao excluir conta a receber:", err);
        res.status(500).send('Erro ao excluir conta a receber.');
    }
});

module.exports = router;