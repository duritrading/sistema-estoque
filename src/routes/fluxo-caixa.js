const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Mostra a página
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const [lancamentosResult, totaisResult, categoriasResult] = await Promise.all([
        pool.query(`SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20`),
        pool.query(`SELECT COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito, COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito FROM fluxo_caixa WHERE status = 'PAGO'`),
        pool.query(`SELECT * FROM categorias_financeiras ORDER BY nome`)
    ]);

    const totais = totaisResult.rows[0];
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;

    res.render('fluxo-caixa', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [], // Enviando como 'lancamentos'
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
        await pool.query(`INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) VALUES ($1, $2, $3, $4, $5, 'PAGO')`, [data_operacao, tipo, parseFloat(valor), descricao, categoria_id]);
        res.redirect('/fluxo-caixa');
    } catch(err) {
        console.error("Erro ao criar lançamento:", err);
        res.status(500).send('Erro ao criar lançamento.');
    }
});

// Rota POST /fluxo-caixa/delete/:id - Exclui um lançamento
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;
        const check = await pool.query('SELECT id FROM contas_a_receber WHERE fluxo_caixa_id = $1', [id]);
        if (check.rows.length > 0) {
            return res.render('error', { user: res.locals.user, titulo: 'Ação Bloqueada', mensagem: 'Este lançamento não pode ser excluído pois é um recebimento de faturamento.'});
        }
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        res.redirect('/fluxo-caixa');
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento.');
    }
});

module.exports = router;