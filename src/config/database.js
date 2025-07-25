// src/config/database.js - POSTGRESQL ÚNICO E LIMPO

const { Pool } = require('pg');

console.log('🔧 Configurando PostgreSQL...');

// Configuração de desenvolvimento local
const developmentConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost', 
  database: process.env.DB_NAME || 'sistema_estoque',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
};

// Configuração de produção (Railway, Render, etc.)
const productionConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
};

// Escolher configuração baseada no ambiente
const config = process.env.DATABASE_URL 
  ? productionConfig 
  : developmentConfig;

console.log('🎯 Modo:', process.env.DATABASE_URL ? 'PRODUÇÃO' : 'DESENVOLVIMENTO');
console.log('🔗 Host:', config.host || 'Railway/Render');
console.log('📂 Database:', config.database || 'Produção');

// Criar pool de conexões
const pool = new Pool(config);

// Testar conexão
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL conectado com sucesso!');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar PostgreSQL:');
    console.error('📝 Detalhes:', err.message);
    console.log('');
    console.log('💡 SOLUÇÕES:');
    console.log('   1. Verificar se PostgreSQL está rodando');
    console.log('   2. Instalar PostgreSQL: https://www.postgresql.org/download/');
    console.log('   3. Usar Docker: docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres');
    console.log('   4. Configurar variáveis de ambiente no .env');
    console.log('');
    process.exit(1);
  });

// Log de queries em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  const originalQuery = pool.query;
  pool.query = function(...args) {
    const [text, params] = args;
    console.log('🔍 Query:', text.slice(0, 100) + (text.length > 100 ? '...' : ''));
    if (params && params.length > 0) {
      console.log('📝 Params:', params);
    }
    return originalQuery.apply(this, args);
  };
}

module.exports = pool;