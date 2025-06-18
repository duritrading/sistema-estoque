const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  if (!req.locals.user || !req.locals.user.username) {
      return res.status(403).send('Acesso negado.');
  }
  if (!pool) {
      return res.status(500).send('Erro: Banco de dados não configurado para backup.');
  }

  try {
    const backup = {
      sistema: 'Sistema de Estoque',
      data: new Date().toISOString(),
      gerado_por: req.locals.user.username,
      dados: {}
    };

    const tabelas = ['produtos', 'fornecedores', 'movimentacoes', 'fluxo_caixa', 'categorias_financeiras', 'formas_pagamento'];
    
    for (const tabela of tabelas) {
      const result = await pool.query(`SELECT * FROM ${tabela} ORDER BY id`);
      backup.dados[tabela] = result.rows;
    }

    const usuariosResult = await pool.query('SELECT id, username, email, nome_completo, ativo FROM usuarios ORDER BY id');
    backup.dados.usuarios = usuariosResult.rows;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backup);

  } catch (error) {
    res.status(500).send('Erro no backup: ' + error.message);
  }
});

module.exports = router;