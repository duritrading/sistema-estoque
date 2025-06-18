// Auto-detectar qual banco usar
if (process.env.DATABASE_URL) {
  // PostgreSQL em produção
  console.log('🐘 Usando PostgreSQL (produção)');
  // O require agora retorna um objeto com 'db' e 'pool'
  const { db, pool } = require('./database-postgres');
  // Exportamos um objeto que contém ambos para o resto da aplicação
  module.exports = { db, pool };
} else {
  // SQLite em desenvolvimento
  console.log('🗄️ Usando SQLite (desenvolvimento)');
  const db = require('./database-sqlite');
  // Para manter a compatibilidade, exportamos o mesmo formato de objeto
  module.exports = { db: db, pool: null }; // pool é nulo em dev
}