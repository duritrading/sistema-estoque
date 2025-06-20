const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

// Rota GET para mostrar a página
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

// Rota POST para gerar o backup
router.post('/gerar', async (req, res) => {
    if (!pool) {
        return res.render('backup', {
            user: res.locals.user,
            message: { type: 'error', text: 'Erro de configuração do banco de dados.' }
        });
    }

    try {
        // Criar diretório de backups se não existir
        const backupDir = path.join(__dirname, '../../backups');
        try {
            await fs.access(backupDir);
        } catch {
            await fs.mkdir(backupDir, { recursive: true });
        }

        // Nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);

        // Consultar todas as tabelas e seus dados
        const tables = [
            'categorias_financeiras',
            'fornecedores',
            'produtos',
            'movimentacoes',
            'fluxo_caixa',
            'contas_a_receber',
            'rcas'
        ];

        let backupContent = `-- Backup do Sistema de Estoque\n-- Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;

        for (const table of tables) {
            try {
                // Obter estrutura da tabela
                const structureResult = await pool.query(`
                    SELECT column_name, data_type, is_nullable, column_default 
                    FROM information_schema.columns 
                    WHERE table_name = $1 
                    ORDER BY ordinal_position
                `, [table]);

                // Obter dados da tabela
                const dataResult = await pool.query(`SELECT * FROM ${table}`);

                backupContent += `\n-- Tabela: ${table}\n`;
                backupContent += `-- Estrutura e dados\n\n`;

                if (dataResult.rows.length > 0) {
                    // Gerar INSERTs
                    for (const row of dataResult.rows) {
                        const columns = Object.keys(row).join(', ');
                        const values = Object.values(row).map(val => {
                            if (val === null) return 'NULL';
                            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                            if (val instanceof Date) return `'${val.toISOString()}'`;
                            return val;
                        }).join(', ');
                        
                        backupContent += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
                    }
                }
                backupContent += '\n';
            } catch (err) {
                console.error(`Erro ao fazer backup da tabela ${table}:`, err);
                backupContent += `-- Erro ao fazer backup da tabela ${table}\n\n`;
            }
        }

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
            // Opcional: remover arquivo após download
            // fs.unlink(filepath).catch(console.error);
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