const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Mostra a página
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Buscas em paralelo: lançamentos (com referências), totais e categorias
    const [lancamentosResult, totaisResult, categoriasResult] = await Promise.all([
        pool.query(`
            SELECT 
                fc.*, 
                cf.nome as categoria_nome,
                fc.conta_receber_id,
                fc.conta_pagar_id
            FROM fluxo_caixa fc 
            LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id 
            ORDER BY fc.data_operacao DESC, fc.created_at DESC 
            LIMIT 20
        `),
        pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito, 
                COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito 
            FROM fluxo_caixa 
            WHERE status = 'PAGO'
        `),
        pool.query(`SELECT * FROM categorias_financeiras ORDER BY nome`)
    ]);

    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;

    res.render('fluxo-caixa', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje,
      categorias: categoriasResult.rows || []
    });
  } catch (error) {
    console.error("Erro ao carregar fluxo de caixa:", error);
    res.status(500).send('Erro ao carregar a página de fluxo de caixa.');
  }
});

// Rota POST /fluxo-caixa/lancamento - Cria um novo lançamento
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { data_operacao, tipo, valor, descricao, categoria_id } = req.body;
        await pool.query(
            `INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
             VALUES ($1, $2, $3, $4, $5, 'PAGO')`, 
            [data_operacao, tipo, parseFloat(valor), descricao, categoria_id]
        );
        res.redirect('/fluxo-caixa');
    } catch(err) {
        console.error("Erro ao criar lançamento:", err);
        res.status(500).send('Erro ao criar lançamento.');
    }
});

// Rota POST /fluxo-caixa/delete/:id - Exclui um lançamento
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const client = await pool.connect();
    try {
        const { id } = req.params;
        
        // Buscar o lançamento para verificar se tem referências
        const lancamentoResult = await client.query(
            'SELECT * FROM fluxo_caixa WHERE id = $1',
            [id]
        );
        
        if (lancamentoResult.rows.length === 0) {
            return res.status(404).send('Lançamento não encontrado');
        }
        
        const lancamento = lancamentoResult.rows[0];
        
        // Verificar se é um lançamento vinculado a contas
        if (lancamento.conta_receber_id || lancamento.conta_pagar_id) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Este lançamento não pode ser excluído pois é um recebimento/pagamento de faturamento. Use o botão Estornar primeiro.'
            });
        }
        
        // Verificação antiga para compatibilidade
        const check = await client.query(
            'SELECT id FROM contas_a_receber WHERE fluxo_caixa_id = $1', 
            [id]
        );
        if (check.rows.length > 0) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Este lançamento não pode ser excluído pois é um recebimento de faturamento.'
            });
        }
        
        // Deletar apenas lançamentos avulsos
        await client.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        
        res.redirect('/fluxo-caixa');
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento.');
    } finally {
        client.release();
    }
});

// Rota POST /fluxo-caixa/estornar/:id - Estorna um pagamento/recebimento
router.post('/estornar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        
        // Buscar o lançamento no fluxo de caixa
        const lancamentoResult = await client.query(
            'SELECT * FROM fluxo_caixa WHERE id = $1',
            [id]
        );
        
        if (lancamentoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('Lançamento não encontrado');
        }
        
        const lancamento = lancamentoResult.rows[0];
        
        // Verificar se é um lançamento de conta a receber
        if (lancamento.conta_receber_id) {
            // Atualizar o status da conta a receber de volta para "Pendente"
            await client.query(
                'UPDATE contas_a_receber SET status = $1, data_pagamento = NULL WHERE id = $2',
                ['Pendente', lancamento.conta_receber_id]
            );
            
            // Remover o lançamento do fluxo de caixa
            await client.query(
                'DELETE FROM fluxo_caixa WHERE id = $1',
                [id]
            );
            
            // Log de auditoria (se você tiver tabela de logs)
            if (res.locals.user && res.locals.user.id) {
                await client.query(
                    'INSERT INTO logs_sistema (usuario_id, acao, detalhes) VALUES ($1, $2, $3)',
                    [res.locals.user.id, 'ESTORNO_RECEBIMENTO', `Estorno de recebimento ID ${lancamento.conta_receber_id} - Valor: R$ ${lancamento.valor}`]
                );
            }
            
            await client.query('COMMIT');
            res.redirect('/contas-a-receber');
            
        } 
        // Verificar se é um lançamento de conta a pagar
        else if (lancamento.conta_pagar_id) {
            // Atualizar o status da conta a pagar de volta para "Pendente"
            await client.query(
                'UPDATE contas_a_pagar SET status = $1, data_pagamento = NULL WHERE id = $2',
                ['Pendente', lancamento.conta_pagar_id]
            );
            
            // Remover o lançamento do fluxo de caixa
            await client.query(
                'DELETE FROM fluxo_caixa WHERE id = $1',
                [id]
            );
            
            // Log de auditoria (se você tiver tabela de logs)
            if (res.locals.user && res.locals.user.id) {
                await client.query(
                    'INSERT INTO logs_sistema (usuario_id, acao, detalhes) VALUES ($1, $2, $3)',
                    [res.locals.user.id, 'ESTORNO_PAGAMENTO', `Estorno de pagamento ID ${lancamento.conta_pagar_id} - Valor: R$ ${lancamento.valor}`]
                );
            }
            
            await client.query('COMMIT');
            res.redirect('/contas-a-pagar');
            
        } else {
            await client.query('ROLLBACK');
            res.status(400).send('Este lançamento não pode ser estornado pois não está vinculado a uma conta.');
        }
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao estornar:', error);
        res.status(500).send('Erro ao processar estorno');
    } finally {
        client.release();
    }
});

module.exports = router;