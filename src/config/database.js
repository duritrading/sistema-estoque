if (process.env.DATABASE_URL) {
  // Produção: Exporta a pool do PostgreSQL
  console.log('🐘 Usando PostgreSQL (produção)');
  module.exports = require('./database-postgres');
} else {
  // Desenvolvimento: Exporta a conexão do SQLite
  console.log('🗄️ Usando SQLite (desenvolvimento)');
  module.exports = require('./database-sqlite');
}