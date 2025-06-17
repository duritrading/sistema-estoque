// Auto-detectar qual banco usar
if (process.env.DATABASE_URL) {
  // PostgreSQL em produção
  console.log('🐘 Usando PostgreSQL (produção)');
  module.exports = require('./database-postgres');
} else {
  // SQLite em desenvolvimento
  console.log('🗄️ Usando SQLite (desenvolvimento)');
  module.exports = require('./database-sqlite');
}
