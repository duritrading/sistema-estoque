// scripts/create-entregas-tables-manual.js
const { Pool } = require('pg');

async function createEntregasTables() {
    console.log('🔧 Iniciando criação das tabelas de entregas...');
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });

    try {
        // 1. Criar tabela de entregas
        console.log('📦 Criando tabela entregas...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS entregas (
                id SERIAL PRIMARY KEY,
                data_entrega DATE NOT NULL,
                cliente_id INTEGER,
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
        console.log('✅ Tabela entregas criada!');

        // 2. Criar tabela de rotas
        console.log('🚚 Criando tabela rotas...');
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
        console.log('✅ Tabela rotas criada!');

        // 3. Criar tabela de relacionamento
        console.log('🔗 Criando tabela rota_entregas...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rota_entregas (
                id SERIAL PRIMARY KEY,
                rota_id INTEGER REFERENCES rotas(id) ON DELETE CASCADE,
                entrega_id INTEGER REFERENCES entregas(id) ON DELETE CASCADE,
                ordem_na_rota INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela rota_entregas criada!');

        // 4. Criar índices para performance
        console.log('📊 Criando índices...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_entrega);
            CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas(status);
            CREATE INDEX IF NOT EXISTS idx_entregas_cliente ON entregas(cliente_id);
            CREATE INDEX IF NOT EXISTS idx_rotas_data ON rotas(data_rota);
        `);
        console.log('✅ Índices criados!');

        // 5. Verificar se as tabelas foram criadas
        const tabelas = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('entregas', 'rotas', 'rota_entregas')
            ORDER BY table_name
        `);
        
        console.log('\n🎉 SUCESSO! Tabelas criadas:');
        tabelas.rows.forEach(row => {
            console.log(`✅ ${row.table_name}`);
        });

        // 6. Inserir dados de exemplo (opcional)
        console.log('\n📋 Inserindo dados de exemplo...');
        const hoje = new Date().toISOString().split('T')[0];
        
        await pool.query(`
            INSERT INTO entregas (data_entrega, cliente_nome, endereco_completo, valor_entrega, observacoes)
            VALUES 
                ($1, 'Cliente Exemplo 1', 'Rua das Flores, 123, Boa Viagem, Recife-PE, 51030-230', 150.00, 'Entregar pela manhã'),
                ($1, 'Cliente Exemplo 2', 'Av. Bernardo Vieira, 456, Tirol, Natal-RN, 59075-250', 220.50, 'Cliente prefere entrega após 14h')
            ON CONFLICT DO NOTHING
        `, [hoje]);

        console.log('✅ Dados de exemplo inseridos!');
        console.log('\n🚀 Sistema de entregas pronto para usar!');
        console.log('🔄 Agora você pode acessar /entregas no sistema');

    } catch (error) {
        console.error('❌ Erro ao criar tabelas de entregas:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('\n✨ Processo concluído!');
        process.exit(0);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    createEntregasTables();
}

module.exports = { createEntregasTables };