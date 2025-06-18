const { Pool } = require('pg');

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Wrapper para compatibilidade com SQLite
const db = {
  // Função para executar queries simples
  run: (query, params = [], callback) => {
    pool.query(query, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          // Simular comportamento do SQLite
          callback.call({ 
            lastID: result.insertId || (result.rows && result.rows[0] && result.rows[0].id),
            changes: result.rowCount || 0
          });
        }
      }
    });
  },

  // Função para buscar uma linha
  get: (query, params = [], callback) => {
    pool.query(query, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          callback(null, (result.rows && result.rows[0]) || null);
        }
      }
    });
  },

  // Função para buscar múltiplas linhas - CORRIGIDA
  all: (query, params = [], callback) => {
    pool.query(query, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          // GARANTIR que sempre retorna um array
          callback(null, (result && result.rows) || []);
        }
      }
    });
  },

  // Função para executar múltiplas queries em série
  serialize: (callback) => {
    if (callback) callback();
  }
};

// Função para inicializar as tabelas
const initializeDatabase = async () => {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');

    // Criar tabela produtos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        descricao TEXT NOT NULL,
        unidade VARCHAR(10) NOT NULL,
        categoria VARCHAR(100),
        estoque_minimo INTEGER DEFAULT 0,
        preco_custo DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela fornecedores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fornecedores (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nome VARCHAR(200) NOT NULL,
        contato VARCHAR(100),
        telefone VARCHAR(20),
        email VARCHAR(100),
        endereco TEXT,
        cnpj VARCHAR(20),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela movimentacoes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movimentacoes (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        fornecedor_id INTEGER REFERENCES fornecedores(id),
        cliente_nome VARCHAR(200),
        rca VARCHAR(100),
        tipo VARCHAR(10) CHECK (tipo IN ('ENTRADA', 'SAIDA')) NOT NULL,
        quantidade INTEGER NOT NULL,
        preco_unitario DECIMAL(10,2),
        valor_total DECIMAL(10,2),
        documento VARCHAR(100),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabelas financeiras
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
        ativo INTEGER DEFAULT 1
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS formas_pagamento (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        ativo INTEGER DEFAULT 1
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fluxo_caixa (
        id SERIAL PRIMARY KEY,
        data_operacao DATE NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO')) NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        categoria_id INTEGER DEFAULT 1,
        descricao TEXT NOT NULL,
        forma_pagamento_id INTEGER,
        status VARCHAR(20) DEFAULT 'PAGO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inserir dados iniciais se não existirem
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM categorias_financeiras');
    if (rows[0].count == 0) {
      await pool.query(`
        INSERT INTO categorias_financeiras (nome, tipo) VALUES 
          ('Receita de Vendas', 'RECEITA'),
          ('Receitas Financeiras', 'RECEITA'),
          ('Despesas Operacionais', 'DESPESA'),
          ('Despesas Administrativas', 'DESPESA')
      `);

      await pool.query(`
        INSERT INTO formas_pagamento (nome) VALUES 
          ('Dinheiro'),
          ('PIX'),
          ('Cartão'),
          ('Transferência')
      `);
    }

    console.log('✅ Banco PostgreSQL inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
};

// Inicializar banco na primeira execução
if (process.env.DATABASE_URL) {
  initializeDatabase();
}

module.exports = db;
