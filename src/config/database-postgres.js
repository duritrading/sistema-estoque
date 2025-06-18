const { Pool } = require('pg');

// Configuração do PostgreSQL com tratamento de erro robusto
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log de conexão
pool.on('connect', () => {
  console.log('✅ Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err) => {
  console.error('❌ Erro no pool PostgreSQL:', err);
});

// Wrapper SUPER compatível com SQLite
const db = {
  // Função para executar queries simples
  run: (query, params = [], callback) => {
    // Converter query SQLite para PostgreSQL se necessário
    const pgQuery = query
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    pool.query(pgQuery, params)
      .then(result => {
        if (callback) {
          const mockThis = { 
            lastID: (result.rows && result.rows[0] && result.rows[0].id) || result.insertId || null,
            changes: result.rowCount || 0
          };
          callback.call(mockThis, null);
        }
      })
      .catch(err => {
        console.error('❌ Erro na query run:', err.message);
        if (callback) callback(err);
      });
  },

  // Função para buscar uma linha
  get: (query, params = [], callback) => {
    // Converter query SQLite para PostgreSQL se necessário
    const pgQuery = query
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    pool.query(pgQuery, params)
      .then(result => {
        if (callback) {
          const row = (result.rows && result.rows.length > 0) ? result.rows[0] : null;
          callback(null, row);
        }
      })
      .catch(err => {
        console.error('❌ Erro na query get:', err.message);
        if (callback) callback(err, null);
      });
  },

  // Função para buscar múltiplas linhas - SUPER ROBUSTA
  all: (query, params = [], callback) => {
    // Converter query SQLite para PostgreSQL se necessário
    const pgQuery = query
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    pool.query(pgQuery, params)
      .then(result => {
        if (callback) {
          // SEMPRE garantir que retorna array
          const rows = (result && result.rows && Array.isArray(result.rows)) ? result.rows : [];
          console.log(`✅ Query retornou ${rows.length} registros`);
          callback(null, rows);
        }
      })
      .catch(err => {
        console.error('❌ Erro na query all:', err.message);
        console.error('Query que falhou:', pgQuery);
        if (callback) callback(err, []);
      });
  },

  // Função para executar múltiplas queries em série
  serialize: (callback) => {
    if (callback && typeof callback === 'function') {
      callback();
    }
  },

  // Função adicional para debug
  exec: (query, callback) => {
    pool.query(query)
      .then(result => {
        if (callback) callback(null);
      })
      .catch(err => {
        console.error('❌ Erro na query exec:', err.message);
        if (callback) callback(err);
      });
  }
};

// Função para inicializar as tabelas com mais logs
const initializeDatabase = async () => {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');

    // Testar conexão primeiro
    await pool.query('SELECT NOW()');
    console.log('✅ Conexão PostgreSQL confirmada');

    // Criar tabela produtos
    console.log('📝 Criando tabela produtos...');
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
    console.log('📝 Criando tabela fornecedores...');
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
    console.log('📝 Criando tabela movimentacoes...');
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
    console.log('📝 Criando tabelas financeiras...');
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
    console.log('🔧 Verificando dados iniciais...');
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM categorias_financeiras');
    if (parseInt(rows[0].count) === 0) {
      console.log('📝 Inserindo dados iniciais...');
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
    console.log('🎯 Sistema pronto para uso com dados permanentes!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar banco PostgreSQL:', error.message);
    console.error('Stack:', error.stack);
    // Não fazer throw para não quebrar o sistema
  }
};

// Inicializar banco na primeira execução
if (process.env.DATABASE_URL) {
  console.log('🔌 DATABASE_URL detectada, inicializando PostgreSQL...');
  initializeDatabase();
} else {
  console.log('⚠️ DATABASE_URL não encontrada');
}

module.exports = db;
