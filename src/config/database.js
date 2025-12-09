// src/config/database.js - SUPABASE CONFIGURATION
// Migrado de Render PostgreSQL para Supabase

const { Pool } = require('pg');

console.log('🔧 Configurando Supabase PostgreSQL...');

// Configuração de desenvolvimento local (opcional - para testes)
const developmentConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sistema_estoque',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
};

// Configuração Supabase (Produção)
// Connection string formato: postgresql://postgres.[ref]:[pass]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
const productionConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requer SSL
  max: 20,                            // Pool máximo de conexões
  idleTimeoutMillis: 30000,           // Timeout de conexão ociosa
  connectionTimeoutMillis: 10000,     // Timeout para nova conexão
};

// Escolher configuração baseada no ambiente
const config = process.env.DATABASE_URL 
  ? productionConfig 
  : developmentConfig;

const isProduction = !!process.env.DATABASE_URL;

console.log('🎯 Modo:', isProduction ? 'SUPABASE (Produção)' : 'LOCAL (Desenvolvimento)');

if (!isProduction) {
  console.log('🔗 Host:', config.host || 'N/A');
  console.log('📂 Database:', config.database || 'N/A');
}

// Criar pool de conexões
const pool = new Pool(config);

// Testar conexão
pool.connect()
  .then(client => {
    console.log('✅ Supabase PostgreSQL conectado com sucesso!');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar Supabase:');
    console.error('📝 Detalhes:', err.message);
    console.log('');
    console.log('💡 SOLUÇÕES:');
    console.log('   1. Verificar DATABASE_URL no .env ou variáveis de ambiente');
    console.log('   2. Confirmar que o projeto Supabase está ativo');
    console.log('   3. Verificar se a senha do banco está correta');
    console.log('   4. Testar conexão no Supabase Dashboard');
    console.log('');
    // Não fazer process.exit em produção para permitir retry
    if (!isProduction) {
      process.exit(1);
    }
  });

// Handler para erros de conexão no pool
pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err.message);
});

// Log de queries apenas em desenvolvimento
if (!isProduction && process.env.DEBUG_SQL === 'true') {
  const originalQuery = pool.query.bind(pool);
  pool.query = function(...args) {
    const [text, params] = args;
    if (typeof text === 'string') {
      console.log('🔍 Query:', text.slice(0, 100) + (text.length > 100 ? '...' : ''));
      if (params && params.length > 0) {
        console.log('📝 Params:', params);
      }
    }
    return originalQuery(...args);
  };
}

module.exports = pool;