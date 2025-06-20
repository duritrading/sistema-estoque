const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

router.get('/', async (req, res) => {
    try {
        res.render('backup', {
            user: res.locals.user,
            message: null
        });
    } catch (error) {
        console.error('Erro ao carregar página de backup:', error);
        res.status(500).send('Erro ao carregar página de backup');
    }
});

router.post('/gerar', async (req, res) => {
    if (!pool) {
        return res.render('backup', {
            user: res.locals.user,
            message: { type: 'error', text: 'Erro de configuração do banco de dados.' }
        });
    }

    try {
        const backupDir = path.join(__dirname, '../../backups');
        try {
            await fs.access(backupDir);
        } catch {
            await fs.mkdir(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_completo_${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);

        let backupContent = `-- Backup COMPLETO do Sistema de Estoque
-- Gerado em: ${new Date().toLocaleString('pt-BR')}
-- Este backup contém estrutura e dados de TODAS as tabelas

-- Desabilitar verificações temporariamente
SET session_replication_role = 'replica';

`;

        // 1. OBTER TODAS AS TABELAS DO BANCO
        const tablesResult = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename
        `);
        
        const tables = tablesResult.rows.map(row => row.tablename);

        // 2. CRIAR ESTRUTURA DAS TABELAS
        backupContent += `-- =============================================
-- ESTRUTURA DAS TABELAS
-- =============================================\n\n`;

        for (const table of tables) {
            // Obter CREATE TABLE statement
            const createTableResult = await pool.query(`
                SELECT 
                    'CREATE TABLE IF NOT EXISTS ' || tablename || ' (' || 
                    string_agg(
                        column_name || ' ' || 
                        data_type || 
                        CASE 
                            WHEN character_maximum_length IS NOT NULL 
                            THEN '(' || character_maximum_length || ')'
                            ELSE ''
                        END ||
                        CASE 
                            WHEN is_nullable = 'NO' THEN ' NOT NULL'
                            ELSE ''
                        END ||
                        CASE 
                            WHEN column_default IS NOT NULL 
                            THEN ' DEFAULT ' || column_default
                            ELSE ''
                        END,
                        ', '
                    ) || ');' as create_statement
                FROM information_schema.columns
                WHERE table_name = $1 AND table_schema = 'public'
                GROUP BY tablename
            `, [table]);

            if (createTableResult.rows[0]) {
                backupContent += `-- Tabela: ${table}\n`;
                backupContent += `DROP TABLE IF EXISTS ${table} CASCADE;\n`;
                backupContent += createTableResult.rows[0].create_statement + '\n\n';
            }
        }

        // 3. CRIAR SEQUÊNCIAS
        backupContent += `-- =============================================
-- SEQUÊNCIAS (AUTO INCREMENT)
-- =============================================\n\n`;

        const sequencesResult = await pool.query(`
            SELECT sequence_name, start_value, increment_by
            FROM information_schema.sequences
            WHERE sequence_schema = 'public'
        `);

        for (const seq of sequencesResult.rows) {
            backupContent += `DROP SEQUENCE IF EXISTS ${seq.sequence_name} CASCADE;\n`;
            backupContent += `CREATE SEQUENCE ${seq.sequence_name} START ${seq.start_value} INCREMENT ${seq.increment_by};\n\n`;
        }

        // 4. INSERIR DADOS
        backupContent += `-- =============================================
-- DADOS DAS TABELAS
-- =============================================\n\n`;

        for (const table of tables) {
            const dataResult = await pool.query(`SELECT * FROM ${table}`);
            
            if (dataResult.rows.length > 0) {
                backupContent += `-- Dados da tabela: ${table}\n`;
                
                for (const row of dataResult.rows) {
                    const columns = Object.keys(row).filter(key => row[key] !== null);
                    const values = columns.map(col => {
                        const val = row[col];
                        if (val === null) return 'NULL';
                        if (typeof val === 'boolean') return val;
                        if (typeof val === 'number') return val;
                        if (val instanceof Date) return `'${val.toISOString()}'`;
                        if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                        return `'${String(val).replace(/'/g, "''")}'`;
                    });
                    
                    backupContent += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
                }
                backupContent += '\n';
            }
        }

        // 5. CRIAR CONSTRAINTS E FOREIGN KEYS
        backupContent += `-- =============================================
-- CONSTRAINTS E FOREIGN KEYS
-- =============================================\n\n`;

        const constraintsResult = await pool.query(`
            SELECT 
                tc.table_name, 
                tc.constraint_name, 
                tc.constraint_type,
                pg_get_constraintdef(c.oid) as definition
            FROM information_schema.table_constraints tc
            JOIN pg_constraint c ON c.conname = tc.constraint_name
            WHERE tc.table_schema = 'public'
            AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
            ORDER BY tc.table_name, tc.constraint_type
        `);

        for (const constraint of constraintsResult.rows) {
            backupContent += `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} ${constraint.definition};\n`;
        }

        // 6. CRIAR ÍNDICES
        backupContent += `\n-- =============================================
-- ÍNDICES
-- =============================================\n\n`;

        const indexesResult = await pool.query(`
            SELECT 
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            AND indexname NOT LIKE '%_pkey'
            ORDER BY tablename, indexname
        `);

        for (const index of indexesResult.rows) {
            backupContent += `${index.indexdef};\n`;
        }

        // 7. ATUALIZAR SEQUÊNCIAS
        backupContent += `\n-- =============================================
-- ATUALIZAR VALORES DAS SEQUÊNCIAS
-- =============================================\n\n`;

        for (const table of tables) {
            const seqResult = await pool.query(`
                SELECT 
                    column_name,
                    column_default
                FROM information_schema.columns
                WHERE table_name = $1
                AND column_default LIKE 'nextval%'
            `, [table]);

            for (const seq of seqResult.rows) {
                backupContent += `SELECT setval(pg_get_serial_sequence('${table}', '${seq.column_name}'), COALESCE(MAX(${seq.column_name}), 1)) FROM ${table};\n`;
            }
        }

        backupContent += `\n-- Reabilitar verificações
SET session_replication_role = 'origin';

-- Backup concluído com sucesso!`;

        // Salvar arquivo
        await fs.writeFile(filepath, backupContent, 'utf8');

        // Enviar arquivo para download
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

// NOVA ROTA: Restaurar backup
router.post('/restaurar', async (req, res) => {
    res.render('backup', {
        user: res.locals.user,
        message: { 
            type: 'info', 
            text: 'Para restaurar um backup, execute o arquivo SQL diretamente no seu banco de dados PostgreSQL.' 
        }
    });
});

module.exports = router;