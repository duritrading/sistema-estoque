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
// Na rota de registrar pagamento em contas-a-receber.js
// Substitua a rota existente por esta versão atualizada:

router.post('/registrar-pagamento/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        
        // Buscar a conta a receber
        const contaResult = await client.query(
            'SELECT * FROM contas_a_receber WHERE id = $1',
            [id]
        );
        
        if (contaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('Conta não encontrada');
        }
        
        const contaReceber = contaResult.rows[0];
        
        // Atualizar o status para Pago
        await client.query(
            'UPDATE contas_a_receber SET status = $1, data_pagamento = NOW() WHERE id = $2',
            ['Pago', id]
        );
        
        // Criar lançamento no fluxo de caixa COM A REFERÊNCIA
        await client.query(
            `INSERT INTO fluxo_caixa 
            (tipo, valor, descricao, data_operacao, categoria_id, status, conta_receber_id) 
            VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
            [
                'CREDITO', 
                contaReceber.valor, 
                `Recebimento - ${contaReceber.cliente_nome} - ${contaReceber.descricao || 'Parcela ' + contaReceber.numero_parcela}`,
                contaReceber.categoria_id,
                'PAGO',
                id // Aqui está a referência para conta_receber_id!
            ]
        );
        
        // Log de auditoria (se você tiver tabela de logs)
        if (res.locals.user && res.locals.user.id) {
            await client.query(
                'INSERT INTO logs_sistema (usuario_id, acao, detalhes) VALUES ($1, $2, $3)',
                [res.locals.user.id, 'REGISTRO_RECEBIMENTO', `Recebimento registrado - Cliente: ${contaReceber.cliente_nome} - Valor: R$ ${contaReceber.valor}`]
            );
        }
        
        await client.query('COMMIT');
        res.redirect('/contas-a-receber');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao registrar pagamento:', error);
        res.status(500).send('Erro ao processar pagamento');
    } finally {
        client.release();
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