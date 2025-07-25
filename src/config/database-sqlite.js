// src/config/database-sqlite.js - SQLite compatível com código PostgreSQL

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Criar diretório data se não existir
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Diretório data criado');
}

const dbPath = path.join(dataDir, 'estoque.db');
console.log('📍 Conectando SQLite:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro SQLite:', err.message);
    process.exit(1);
  } else {
    console.log('✅ SQLite conectado:', dbPath);
  }
});

// Função para converter queries PostgreSQL para SQLite
function convertQuery(text, params = []) {
  let query = text;
  
  // Converter placeholders PostgreSQL ($1, $2) para SQLite (?, ?)
  let paramIndex = 1;
  query = query.replace(/\$\d+/g, () => '?');
  
  // Converter tipos PostgreSQL para SQLite
  query = query.replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  query = query.replace(/DECIMAL\(\d+,\d+\)/gi, 'REAL');
  query = query.replace(/VARCHAR\(\d+\)/gi, 'TEXT');
  query = query.replace(/TIMESTAMP/gi, 'DATETIME');
  query = query.replace(/BOOLEAN/gi, 'INTEGER');
  query = query.replace(/DEFAULT CURRENT_TIMESTAMP/gi, "DEFAULT CURRENT_TIMESTAMP");
  query = query.replace(/DEFAULT true/gi, 'DEFAULT 1');
  query = query.replace(/DEFAULT false/gi, 'DEFAULT 0');
  
  // Converter CURRENT_DATE para SQLite
  query = query.replace(/CURRENT_DATE/gi, "date('now')");
  
  // Converter operadores específicos do PostgreSQL
  query = query.replace(/ILIKE/gi, 'LIKE');
  
  return { query, params };
}

// Wrapper para compatibilidade com PostgreSQL
const sqlitePool = {
  query: (text, params = []) => {
    return new Promise((resolve, reject) => {
      try {
        const { query, params: convertedParams } = convertQuery(text, params);
        
        console.log('🔍 SQLite Query:', query);
        console.log('📝 Params:', convertedParams);
        
        // Para INSERT, UPDATE, DELETE usar db.run
        if (/^(INSERT|UPDATE|DELETE)/i.test(query.trim())) {
          db.run(query, convertedParams, function(err) {
            if (err) {
              console.error('❌ SQLite Error:', err.message);
              console.error('📝 Query:', query);
              reject(err);
              return;
            }
            
            // Retornar formato compatível com PostgreSQL
            const result = {
              rows: [],
              rowCount: this.changes || 0,
              lastInsertId: this.lastID || null
            };
            
            // Para INSERT com RETURNING, simular retorno
            if (/RETURNING/i.test(text) && this.lastID) {
              result.rows = [{ id: this.lastID }];
            }
            
            resolve(result);
          });
        } else {
          // Para SELECT usar db.all
          db.all(query, convertedParams, (err, rows) => {
            if (err) {
              console.error('❌ SQLite Error:', err.message);
              console.error('📝 Query:', query);
              reject(err);
              return;
            }
            
            // Retornar formato compatível com PostgreSQL
            resolve({
              rows: rows || [],
              rowCount: rows ? rows.length : 0
            });
          });
        }
        
      } catch (error) {
        console.error('❌ Query conversion error:', error.message);
        reject(error);
      }
    });
  },
  
  connect: () => {
    return Promise.resolve({
      release: () => {}
    });
  },
  
  end: () => {
    return new Promise((resolve) => {
      db.close((err) => {
        if (err) console.error('Erro ao fechar SQLite:', err.message);
        else console.log('✅ SQLite desconectado');
        resolve();
      });
    });
  }
};

// Inicializar tabelas básicas do sistema
db.serialize(() => {
  console.log('🔧 Inicializando tabelas SQLite...');
  
  // Criar tabela de usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nome_completo TEXT,
      ativo INTEGER DEFAULT 1,
      ultimo_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Erro tabela usuarios:', err.message);
    else console.log('✅ Tabela usuarios OK');
  });
  
  // Criar tabela de produtos
  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      descricao TEXT NOT NULL,
      unidade TEXT DEFAULT 'UN',
      categoria TEXT,
      estoque_minimo INTEGER DEFAULT 0,
      preco_custo REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Erro tabela produtos:', err.message);
    else console.log('✅ Tabela produtos OK');
  });
  
  // Criar tabela de fornecedores
  db.run(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
      nome TEXT NOT NULL,
      contato TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      cnpj TEXT,
      observacao TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Erro tabela fornecedores:', err.message);
    else console.log('✅ Tabela fornecedores OK');
  });
  
  // Criar tabela de categorias financeiras
  db.run(`
    CREATE TABLE IF NOT EXISTS categorias_financeiras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
      ativo INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) console.error('Erro tabela categorias_financeiras:', err.message);
    else console.log('✅ Tabela categorias_financeiras OK');
  });
  
  // Inserir categorias padrão
  db.run(`
    INSERT OR IGNORE INTO categorias_financeiras (id, nome, tipo) VALUES 
    (1, 'Receita de Vendas', 'RECEITA'),
    (2, 'Receitas Financeiras', 'RECEITA'),
    (3, 'Compra de Produtos', 'DESPESA'),
    (4, 'Despesas Operacionais', 'DESPESA')
  `);
  
  // Criar usuário admin padrão
  const bcrypt = require('bcrypt');
  const adminPassword = bcrypt.hashSync('admin123', 10);
  
  db.run(`
    INSERT OR IGNORE INTO usuarios (username, email, password_hash, nome_completo)
    VALUES ('admin', 'admin@sistema.com', ?, 'Administrador do Sistema')
  `, [adminPassword], (err) => {
    if (err) console.error('Erro criar admin:', err.message);
    else console.log('✅ Usuário admin criado/verificado');
  });
  
  console.log('🎯 Inicialização SQLite concluída');
});

module.exports = sqlitePool;