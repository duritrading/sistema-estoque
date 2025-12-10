// src/routes/backup.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/backup';

// Lista de tabelas (ordem respeita foreign keys)
const TABLES = [
  'categorias_financeiras',
  'fornecedores',
  'rcas',
  'clientes',
  'produtos',
  'movimentacoes',
  'fluxo_caixa',
  'contas_a_receber',
  'contas_a_pagar',
  'usuarios',
  'entregas',
  'warehouse_config',
  'comissoes_rca',
  'comissoes_rca_itens'
];

// Helper: Formatar valor para SQL
function formatSqlValue(val) {
  if (val === null) return 'NULL';
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val;
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Helper: Gerar CREATE TABLE statement
async function gerarCreateTable(table) {
  const columnsResult = await pool.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `, [table]);

  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
  const columns = columnsResult.rows.map(col => {
    let def = `  ${col.column_name} ${col.data_type}`;
    if (col.character_maximum_length) def += `(${col.character_maximum_length})`;
    if (col.is_nullable === 'NO') def += ' NOT NULL';
    if (col.column_default) def += ` DEFAULT ${col.column_default}`;
    return def;
  });
  sql += columns.join(',\n');
  sql += '\n);\n\n';
  return sql;
}

// Helper: Gerar INSERT statements para uma tabela
async function gerarInserts(table) {
  const dataResult = await pool.query(`SELECT * FROM ${table}`);
  if (dataResult.rows.length === 0) return '';

  let sql = `-- Dados da tabela ${table}\n`;
  for (const row of dataResult.rows) {
    const columns = Object.keys(row);
    const values = Object.values(row).map(formatSqlValue);
    sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  }
  return sql + '\n';
}

// GET / - Página de backup
router.get('/', asyncHandler(async (req, res) => {
  res.render('backup', { user: res.locals.user, message: null });
}, ROUTE));

// POST /gerar - Gerar e baixar backup
router.post('/gerar', async (req, res) => {
  try {
    // Diretório de backup
    const backupDir = path.join(__dirname, '../../backups');
    try {
      await fs.access(backupDir);
    } catch {
      await fs.mkdir(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;
    const filepath = path.join(backupDir, filename);

    // Header do backup
    let backupContent = `-- =============================================
-- BACKUP DO SISTEMA DE ESTOQUE - OF DISTRIBUIDORA
-- Gerado em: ${new Date().toLocaleString('pt-BR')}
-- =============================================

`;

    // Processar cada tabela
    for (const table of TABLES) {
      try {
        // Verificar se tabela existe
        const tableExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )
        `, [table]);

        if (!tableExists.rows[0].exists) continue;

        backupContent += `\n-- Tabela: ${table}\n`;
        backupContent += `-- -----------------------------------------\n`;
        backupContent += await gerarCreateTable(table);
        backupContent += await gerarInserts(table);

      } catch (err) {
        console.error(`Erro ao processar tabela ${table}:`, err);
        backupContent += `-- Erro ao processar tabela ${table}: ${err.message}\n\n`;
      }
    }

    // Sequências
    backupContent += `\n-- =============================================
-- SEQUÊNCIAS
-- =============================================\n\n`;

    for (const table of TABLES) {
      try {
        const seqResult = await pool.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = $1 AND column_default LIKE 'nextval%'
        `, [table]);

        for (const seq of seqResult.rows) {
          backupContent += `SELECT setval(pg_get_serial_sequence('${table}', '${seq.column_name}'), COALESCE(MAX(${seq.column_name}), 1)) FROM ${table};\n`;
        }
      } catch (err) {
        // Ignora erros de sequência
      }
    }

    backupContent += `\n-- Backup concluído com sucesso!`;

    // Salvar arquivo
    await fs.writeFile(filepath, backupContent, 'utf8');

    // Enviar para download
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo:', err);
        res.render('backup', {
          user: res.locals.user,
          message: { type: 'error', text: 'Erro ao baixar o arquivo de backup.' }
        });
      }
    });

  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    res.render('backup', {
      user: res.locals.user,
      message: { type: 'error', text: 'Erro ao gerar backup: ' + error.message }
    });
  }
});

module.exports = router;