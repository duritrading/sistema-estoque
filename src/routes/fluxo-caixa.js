const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Mostra a página com métricas completas
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Buscar lançamentos do fluxo de caixa
    const lancamentosResult = await pool.query(`
      SELECT fc.*, cf.nome as categoria_nome 
      FROM fluxo_caixa fc 
      LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id 
      ORDER BY fc.data_operacao DESC, fc.created_at DESC 
      LIMIT 50
    `);

    // Calcular totais do fluxo de caixa (realizados)
    const totaisFluxoResult = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa 
      WHERE status = 'PAGO'
    `);

    // Calcular receitas em aberto (contas a receber pendentes)
    const receitasAbertasResult = await pool.query(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_receber 
      WHERE status = 'Pendente'
    `);

    // Calcular despesas em aberto (contas a pagar pendentes)
    const despesasAbertasResult = await pool.query(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_pagar 
      WHERE status = 'Pendente'
    `);

    // Buscar categorias para o formulário
    const categoriasResult = await pool.query(`
      SELECT * FROM categorias_financeiras ORDER BY nome
    `);

    // Preparar dados para a view
    const totaisFluxo = totaisFluxoResult.rows[0] || { total_credito: 0, total_debito: 0 };
    const receitasAbertas = parseFloat(receitasAbertasResult.rows[0].total || 0);
    const despesasAbertas = parseFloat(despesasAbertasResult.rows[0].total || 0);
    const receitasRealizadas = parseFloat(totaisFluxo.total_credito || 0);
    const despesasRealizadas = parseFloat(totaisFluxo.total_debito || 0);
    
    // Calcular saldo total (realizadas + abertas)
    const saldoTotal = (receitasRealizadas + receitasAbertas) - (despesasRealizadas + despesasAbertas);

    const metricas = {
      receitasAbertas,
      receitasRealizadas,
      despesasAbertas,
      despesasRealizadas,
      saldoTotal
    };

    res.render('fluxo-caixa', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [],
      totais: totaisFluxo,
      saldoAtual: saldoTotal,
      metricas: metricas,
      hoje,
      categorias: categoriasResult.rows || []
    });

  } catch (error) {
    console.error("Erro ao carregar fluxo de caixa:", error);
    res.status(500).send('Erro ao carregar a página de fluxo de caixa: ' + error.message);
  }
});

// Rota POST /fluxo-caixa/lancamento - Cria um novo lançamento
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { data_operacao, tipo, valor, descricao, categoria_id } = req.body;
        
        // Validação básica
        if (!data_operacao || !tipo || !valor || !descricao || !categoria_id) {
            return res.status(400).send('Todos os campos obrigatórios devem ser preenchidos.');
        }

        // Inserir lançamento
        await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
            VALUES ($1, $2, $3, $4, $5, 'PAGO')
        `, [data_operacao, tipo, parseFloat(valor), descricao, categoria_id]);
        
        res.redirect('/fluxo-caixa');
    } catch(err) {
        console.error("Erro ao criar lançamento:", err);
        res.status(500).send('Erro ao criar lançamento: ' + err.message);
    }
});

// Rota POST /fluxo-caixa/delete/:id - Exclui um lançamento
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;
        
        // Verificar se o lançamento está vinculado a alguma conta
        const checkContas = await pool.query(`
            SELECT COUNT(*) as count 
            FROM contas_a_receber 
            WHERE fluxo_caixa_id = $1
            UNION ALL
            SELECT COUNT(*) as count 
            FROM contas_a_pagar 
            WHERE fluxo_caixa_id = $1
        `, [id]);
        
        const totalVinculado = checkContas.rows.reduce((total, row) => total + parseInt(row.count), 0);
        
        if (totalVinculado > 0) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: 'Este lançamento não pode ser excluído pois está vinculado a contas a receber/pagar.',
                voltar_url: '/fluxo-caixa'
            });
        }
        
        // Excluir o lançamento
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        res.redirect('/fluxo-caixa');
        
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento: ' + err.message);
    }
});

module.exports = router;