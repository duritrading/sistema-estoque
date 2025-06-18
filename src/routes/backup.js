const express = require('express');
const router = express.Router();
const { pool } = require('../config/database-postgres'); // Necessário para usar o pool do PostgreSQL

// GET /backup - Gera e faz o download do backup completo
router.get('/', async (req, res) => {
  // Verifica se o usuário está logado (vem do res.locals)
  if (!res.locals.user || !res.locals.user.username) {
      return res.status(403).send('Acesso negado. Faça login para gerar o backup.');
  }

  try {
    console.log('📦 Gerando backup manual...');

    const backup = {
      sistema: 'Sistema de Estoque',
      data: new Date().toISOString(),
      gerado_por: res.locals.user.username,
      dados: {}
    };

    // Backup das tabelas principais
    const tabelas = ['produtos', 'fornecedores', 'movimentacoes', 'fluxo_caixa'];

    for (const tabela of tabelas) {
      const result = await pool.query(`SELECT * FROM ${tabela} ORDER BY id`);
      backup.dados[tabela] = result.rows;
    }

    // Backup dos usuários (sem as senhas)
    const usuarios = await pool.query('SELECT id, username, email, nome_completo, ativo FROM usuarios ORDER BY id');
    backup.dados.usuarios = usuarios.rows;

    const total = Object.values(backup.dados).reduce((sum, t) => sum + t.length, 0);
    console.log(`✅ Backup gerado: ${total} registros`);

    // Download do arquivo
    const arquivo = `backup_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.json(backup);

  } catch (error) {
    console.error('❌ Erro no backup:', error);
    res.status(500).send('Erro no backup: ' + error.message);
  }
});

module.exports = router;