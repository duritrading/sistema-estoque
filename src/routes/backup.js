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
        const filename = `backup_${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);

        let backupContent = `-- Backup do Sistema de Estoque
-- Gerado em: ${new Date().toLocaleString('pt-BR')}
-- Este backup contém todos os dados do sistema

`;

        // Lista de tabelas do sistema (ordem correta para respeitar foreign keys)
        const tables = [
            'categorias_financeiras',
            'fornecedores',
            'produtos',
            'movimentacoes',
            'fluxo_caixa',
            'contas_a_receber',
            'rcas',
            'users'
        ];

        // 1. Criar estrutura das tabelas
        backupContent += `-- =============================================
-- ESTRUTURA E DADOS DAS TABELAS
-- =============================================\n\n`;

        for (const table of tables) {
            try {
                // Verificar se a tabela existe
                const tableExists = await pool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    )
                `, [table]);

                if (!tableExists.rows[0].exists) {
                    console.log(`Tabela ${table} não existe, pulando...`);
                    continue;
                }

                backupContent += `\n-- Tabela: ${table}\n`;
                backupContent += `-- -----------------------------------------\n`;

                // Obter estrutura da tabela
                const columnsResult = await pool.query(`
                    SELECT 
                        column_name,
                        data_type,
                        character_maximum_length,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_name = $1 AND table_schema = 'public'
                    ORDER BY ordinal_position
                `, [table]);

                // Criar statement CREATE TABLE
                let createStatement = `CREATE TABLE IF NOT EXISTS ${table} (\n`;
                const columns = columnsResult.rows.map(col => {
                    let colDef = `  ${col.column_name} ${col.data_type}`;
                    
                    if (col.character_maximum_length) {
                        colDef += `(${col.character_maximum_length})`;
                    }
                    
                    if (col.is_nullable === 'NO') {
                        colDef += ' NOT NULL';
                    }
                    
                    if (col.column_default) {
                        colDef += ` DEFAULT ${col.column_default}`;
                    }
                    
                    return colDef;
                });
                
                createStatement += columns.join(',\n');
                createStatement += '\n);\n\n';
                
                backupContent += createStatement;

                // Obter dados da tabela
                const dataResult = await pool.query(`SELECT * FROM ${table}`);
                
                if (dataResult.rows.length > 0) {
                    backupContent += `-- Dados da tabela ${table}\n`;
                    
                    for (const row of dataResult.rows) {
                        const columns = Object.keys(row);
                        const values = Object.values(row).map(val => {
                            if (val === null) return 'NULL';
                            if (typeof val === 'boolean') return val;
                            if (typeof val === 'number') return val;
                            if (val instanceof Date) return `'${val.toISOString()}'`;
                            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                            return `'${String(val).replace(/'/g, "''")}'`;
                        });
                        
                        backupContent += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
                    }
                }
                
                backupContent += '\n';
                
            } catch (err) {
                console.error(`Erro ao processar tabela ${table}:`, err);
                backupContent += `-- Erro ao processar tabela ${table}: ${err.message}\n\n`;
            }
        }

        // 2. Adicionar constraints (chaves primárias e foreign keys)
        backupContent += `\n-- =============================================
-- CONSTRAINTS
-- =============================================\n\n`;

        try {
            const constraintsResult = await pool.query(`
                SELECT 
                    tc.table_name,
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                LEFT JOIN information_schema.constraint_column_usage AS ccu
                    ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_schema = 'public'
                    AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
                ORDER BY tc.table_name, tc.constraint_type DESC
            `);

            let currentTable = '';
            for (const constraint of constraintsResult.rows) {
                if (constraint.table_name !== currentTable) {
                    currentTable = constraint.table_name;
                    backupContent += `\n-- Constraints para ${currentTable}\n`;
                }

                if (constraint.constraint_type === 'PRIMARY KEY') {
                    backupContent += `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} PRIMARY KEY (${constraint.column_name});\n`;
                } else if (constraint.constraint_type === 'FOREIGN KEY') {
                    backupContent += `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} FOREIGN KEY (${constraint.column_name}) REFERENCES ${constraint.foreign_table_name}(${constraint.foreign_column_name});\n`;
                }
            }
        } catch (err) {
            console.error('Erro ao obter constraints:', err);
            backupContent += `-- Erro ao obter constraints: ${err.message}\n`;
        }

        // 3. Atualizar sequências
        backupContent += `\n-- =============================================
-- SEQUÊNCIAS
-- =============================================\n\n`;

        for (const table of tables) {
            try {
                const seqResult = await pool.query(`
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = $1
                    AND column_default LIKE 'nextval%'
                `, [table]);

                for (const seq of seqResult.rows) {
                    backupContent += `SELECT setval(pg_get_serial_sequence('${table}', '${seq.column_name}'), COALESCE(MAX(${seq.column_name}), 1)) FROM ${table};\n`;
                }
            } catch (err) {
                console.error(`Erro ao processar sequências da tabela ${table}:`, err);
            }
        }

        backupContent += `\n-- Backup concluído com sucesso!`;

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

module.exports = router;