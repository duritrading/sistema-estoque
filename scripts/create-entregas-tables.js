const { Pool } = require('pg');

async function createEntregasTables() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🚚 Criando tabelas do sistema de entregas...');

        // Tabela de entregas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS entregas (
                id SERIAL PRIMARY KEY,
                data_entrega DATE NOT NULL,
                cliente_id INTEGER REFERENCES clientes(id),
                cliente_nome VARCHAR(200) NOT NULL,
                endereco_completo TEXT NOT NULL,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                observacoes TEXT,
                valor_entrega DECIMAL(10,2),
                status VARCHAR(20) DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ROTA', 'ENTREGUE', 'CANCELADA')),
                ordem_entrega INTEGER,
                hora_prevista TIME,
                hora_entrega TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de rotas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rotas (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                data_rota DATE NOT NULL,
                motorista VARCHAR(100),
                veiculo VARCHAR(100),
                km_total DECIMAL(8,2),
                tempo_total_minutos INTEGER,
                status VARCHAR(20) DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA')),
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de relacionamento rotas <-> entregas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rota_entregas (
                id SERIAL PRIMARY KEY,
                rota_id INTEGER REFERENCES rotas(id) ON DELETE CASCADE,
                entrega_id INTEGER REFERENCES entregas(id) ON DELETE CASCADE,
                ordem_na_rota INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Adicionar índices para performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_entrega);
            CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas(status);
            CREATE INDEX IF NOT EXISTS idx_entregas_cliente ON entregas(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_rotas_data ON rotas(data_rota);
        `);

        console.log('✅ Tabelas de entregas criadas com sucesso!');

        // Inserir dados de exemplo (opcional)
        const hoje = new Date().toISOString().split('T')[0];
        
        await pool.query(`
            INSERT INTO entregas (data_entrega, cliente_nome, endereco_completo, valor_entrega, observacoes)
            VALUES 
                ($1, 'Cliente Exemplo 1', 'Rua das Flores, 123, Boa Viagem, Recife-PE', 150.00, 'Entregar pela manhã'),
                ($1, 'Cliente Exemplo 2', 'Av. Bernardo Vieira, 456, Tirol, Natal-RN', 220.50, 'Cliente prefere entrega após 14h')
            ON CONFLICT DO NOTHING
        `, [hoje]);

        console.log('✅ Dados de exemplo inseridos!');

    } catch (error) {
        console.error('❌ Erro ao criar tabelas de entregas:', error);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    createEntregasTables();
}

module.exports = { createEntregasTables };

// ===== ATUALIZAÇÃO NO HEADER.EJS =====
// Adicionar este item no menu de navegação em src/views/partials/header.ejs

// Dentro do nav-content, adicionar:
/*
<div class="nav-item">
    <a href="/entregas" class="<%= locals.currentPage === 'entregas' ? 'active' : '' %>">
        <span class="menu-icon">🚚</span> Entregas
    </a>
</div>
*/