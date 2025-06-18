const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Função auxiliar para transformar callbacks em Promises
const queryPromise = (method, query, params = []) => {
  return new Promise((resolve, reject) => {
    db[method](query, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

router.get('/completo', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    const lancamentos = await queryPromise('all', 'SELECT * FROM fluxo_caixa ORDER BY data_operacao DESC, created_at DESC LIMIT 20');
    
    const totais = await queryPromise('get', `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa WHERE status = 'PAGO'
    `);
    
    const saldoAtual = totais ? (parseFloat(totais.total_credito) - parseFloat(totais.total_debito)) : 0;
    
    res.render('financeiro', {
      user: res.locals.user,
      lancamentos: lancamentos || [],
      totais: totais || { total_credito: 0, total_debito: 0 },
      saldoAtual,
      hoje
    });
  } catch (error) {
    console.error('Erro ao carregar página financeira:', error);
    return res.status(500).send('Erro ao carregar a página financeira.');
  }
});

// ... resto das suas rotas financeiras ...

module.exports = router;