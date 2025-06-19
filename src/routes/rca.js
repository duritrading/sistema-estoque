const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /rca - Mostra o relatório de performance por RCA
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração: Conexão com o banco de dados não disponível.');

  try {
    let { data_inicio, data_fim } = req.query;

    // Define datas padrão (últimos 30 dias) se não forem fornecidas
    if (!data_fim) {
      data_fim = new Date().toISOString().split('T')[0];
    }
    if (!data_inicio) {
      const hoje = new Date();
      hoje.setDate(hoje.getDate() - 30);
      data_inicio = hoje.toISOString().split('T')[0];
    }

    const params = [data_inicio, data_fim];

    // Query que agrupa as vendas por RCA e calcula os totais
    const query = `
      SELECT
          rca,
          COUNT(id) as total_vendas,
          SUM(quantidade) as quantidade_total,
          SUM(valor_total) as faturamento_total
      FROM 
          movimentacoes
      WHERE
          tipo = 'SAIDA'
          AND rca IS NOT NULL AND rca != ''
          AND DATE(created_at) >= $1 AND DATE(created_at) <= $2
      GROUP BY
          rca
      ORDER BY
          faturamento_total DESC
    `;

    const result = await pool.query(query, params);

    res.render('rca', {
        user: res.locals.user,
        relatorio: result.rows,
        filtros: { data_inicio, data_fim }
    });
  } catch (error) {
      console.error('Erro ao gerar relatório de RCA:', error);
      return res.status(500).send('Erro ao gerar relatório de RCA.');
  }
});

module.exports = router;