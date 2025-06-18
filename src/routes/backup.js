const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /backup - Gera e faz o download do backup completo
router.get('/', (req, res) => {
  if (!res.locals.user || !res.locals.user.username) {
      return res.status(403).send('Acesso negado.');
  }

  try {
    console.log('📦 Gerando backup manual...');

    const backup = {
      sistema: 'Sistema de Estoque',
      data: new Date().toISOString(),
      gerado_por: res.locals.user.username,
      dados: {}
    };

    const tabelas = ['produtos', 'fornecedores', 'movimentacoes', 'fluxo_caixa', 'usuarios'];
    let tabelasProcessadas = 0;

    tabelas.forEach(tabela => {
      // Usuários não tem senha, então a query é diferente
      const query = tabela === 'usuarios'
        ? 'SELECT id, username, email, nome_completo, ativo FROM usuarios ORDER BY id'
        : `SELECT * FROM ${tabela} ORDER BY id`;

      db.all(query, [], (err, rows) => {
        if (err) {
          throw new Error(`Erro ao fazer backup da tabela ${tabela}: ${err.message}`);
        }
        backup.dados[tabela] = rows;
        tabelasProcessadas++;

        // Quando todas as tabelas forem processadas, envia o arquivo
        if (tabelasProcessadas === tabelas.length) {
          const total = Object.values(backup.dados).reduce((sum, t) => sum + t.length, 0);
          console.log(`✅ Backup gerado: ${total} registros`);

          const arquivoNome = `backup_${new Date().toISOString().split('T')[0]}.json`;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${arquivoNome}"`);
          res.json(backup);
        }
      });
    });

  } catch (error) {
    console.error('❌ Erro no backup:', error);
    res.status(500).send('Erro no backup: ' + error.message);
  }
});

module.exports = router;