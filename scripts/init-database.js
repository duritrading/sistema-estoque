// scripts/init-database.js - Setup completo do banco PostgreSQL
// Execute: node scripts/init-database.js

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

console.log('🚀 Inicializando Sistema de Estoque - PostgreSQL');
console.log('================================================');

async function initDatabase() {
  const config = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sistema_estoque',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  };

  console.log('🔗 Configuração:', config.host + ':' + config.port + '/' + config.database);

  const pool = new Pool(config);

  try {
    // Testar conexão
    const client = await pool.connect();
    console.log('✅ PostgreSQL conectado!');
    client.release();

    // PASSO 1: Limpar banco (se existir)
    console.log('\n🧹 Limpando estrutura anterior...');
    await pool.query('DROP TABLE IF EXISTS contas_a_pagar CASCADE');
    await pool.query('DROP TABLE IF EXISTS contas_a_receber CASCADE');
    await pool.query('DROP TABLE IF EXISTS fluxo_caixa CASCADE');
    await pool.query('DROP TABLE IF EXISTS movimentacoes CASCADE');
    await pool.query('DROP TABLE IF EXISTS produtos CASCADE');
    await pool.query('DROP TABLE IF EXISTS clientes CASCADE');
    await pool.query('DROP TABLE IF EXISTS rcas CASCADE');
    await pool.query('DROP TABLE IF EXISTS fornecedores CASCADE');
    await pool.query('DROP TABLE IF EXISTS categorias_financeiras CASCADE');
    await pool.query('DROP TABLE IF EXISTS usuarios CASCADE');
    console.log('✅ Limpeza concluída');

    // PASSO 2: Criar tabelas na ordem correta (sem dependências primeiro)
    console.log('\n📋 Criando estrutura do banco...');

    // 1. Usuarios (sem dependências)
    await pool.query(`
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nome_completo VARCHAR(200),
        ativo BOOLEAN DEFAULT true,
        ultimo_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ usuarios');

    // 2. Categorias financeiras (sem dependências)
    await pool.query(`
      CREATE TABLE categorias_financeiras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ categorias_financeiras');

    // 3. Fornecedores (sem dependências)
    await pool.query(`
      CREATE TABLE fornecedores (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE,
        nome VARCHAR(200) NOT NULL,
        contato VARCHAR(150),
        telefone VARCHAR(20),
        email VARCHAR(150),
        endereco TEXT,
        cnpj VARCHAR(20),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ fornecedores');

    // 4. Produtos (sem dependências)
    await pool.query(`
      CREATE TABLE produtos (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE NOT NULL,
        descricao TEXT NOT NULL,
        unidade VARCHAR(20) DEFAULT 'UN',
        categoria VARCHAR(100),
        estoque_minimo INTEGER DEFAULT 0,
        preco_custo DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ produtos');

    // 5. RCAs (sem dependências)
    await pool.query(`
      CREATE TABLE rcas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        praca VARCHAR(150),
        cpf VARCHAR(20),
        endereco TEXT,
        cep VARCHAR(10),
        telefone VARCHAR(20),
        email VARCHAR(150),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ rcas');

    // 6. Clientes (referencia rcas)
    await pool.query(`
      CREATE TABLE clientes (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cpf_cnpj VARCHAR(20),
        endereco TEXT,
        cep VARCHAR(10),
        telefone VARCHAR(20),
        email VARCHAR(150),
        observacao TEXT,
        rca_id INTEGER REFERENCES rcas(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ clientes');

    // 7. Movimentações (referencia produtos e fornecedores)
    await pool.query(`
      CREATE TABLE movimentacoes (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER REFERENCES produtos(id),
        fornecedor_id INTEGER REFERENCES fornecedores(id),
        cliente_nome VARCHAR(200),
        rca VARCHAR(50),
        tipo VARCHAR(10) CHECK (tipo IN ('ENTRADA', 'SAIDA')),
        quantidade DECIMAL(10,3) NOT NULL,
        preco_unitario DECIMAL(10,2),
        valor_total DECIMAL(10,2),
        documento VARCHAR(100),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ movimentacoes');

    // 8. Fluxo de caixa (referencia categorias e movimentações)
    await pool.query(`
      CREATE TABLE fluxo_caixa (
        id SERIAL PRIMARY KEY,
        data_operacao DATE NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO')) NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        descricao TEXT NOT NULL,
        movimentacao_id INTEGER REFERENCES movimentacoes(id),
        status VARCHAR(20) CHECK (status IN ('PAGO', 'PENDENTE')) DEFAULT 'PAGO',
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ fluxo_caixa');

    // 9. Contas a receber (referencia movimentações, fluxo_caixa e categorias)
    await pool.query(`
      CREATE TABLE contas_a_receber (
        id SERIAL PRIMARY KEY,
        movimentacao_id INTEGER REFERENCES movimentacoes(id) ON DELETE CASCADE,
        cliente_nome VARCHAR(200),
        numero_parcela INTEGER NOT NULL,
        total_parcelas INTEGER NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        data_vencimento DATE NOT NULL,
        data_pagamento DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
        fluxo_caixa_id INTEGER REFERENCES fluxo_caixa(id),
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        descricao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ contas_a_receber');

    // 10. Contas a pagar (referencia fornecedores, fluxo_caixa e categorias)
    await pool.query(`
      CREATE TABLE contas_a_pagar (
        id SERIAL PRIMARY KEY,
        fornecedor_id INTEGER REFERENCES fornecedores(id),
        descricao TEXT NOT NULL,
        valor DECIMAL(10,2) NOT NULL,
        data_vencimento DATE NOT NULL,
        data_pagamento DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'Pendente',
        fluxo_caixa_id INTEGER REFERENCES fluxo_caixa(id),
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ contas_a_pagar');

    // PASSO 3: Inserir dados iniciais
    console.log('\n📋 Inserindo dados iniciais...');

    // Categorias financeiras
    await pool.query(`
      INSERT INTO categorias_financeiras (id, nome, tipo) VALUES 
      (1, 'Receita de Vendas', 'RECEITA'),
      (2, 'Receitas Financeiras', 'RECEITA'),
      (3, 'Compra de Produtos', 'DESPESA'),
      (4, 'Despesas Operacionais', 'DESPESA')
    `);
    console.log('✅ Categorias financeiras inseridas');

    // Usuário admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO usuarios (username, email, password_hash, nome_completo)
      VALUES ('admin', 'admin@sistema.com', $1, 'Administrador do Sistema')
    `, [adminPassword]);
    console.log('✅ Usuário admin criado');

    // Fornecedor de exemplo
    await pool.query(`
      INSERT INTO fornecedores (codigo, nome, contato, telefone, email)
      VALUES ('FORN001', 'Fornecedor Exemplo Ltda', 'João Silva', '(11) 99999-9999', 'contato@fornecedor.com')
    `);
    console.log('✅ Fornecedor exemplo inserido');

    // Produto de exemplo
    await pool.query(`
      INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
      VALUES ('PROD001', 'Produto Exemplo', 'UN', 'Categoria Exemplo', 10, 25.50)
    `);
    console.log('✅ Produto exemplo inserido');

    console.log('\n🎉 SETUP COMPLETO!');
    console.log('====================');
    console.log('🔐 Login: admin');
    console.log('🔑 Senha: admin123');
    console.log('🌐 URL: http://localhost:10000');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.log('\n💡 SOLUÇÕES:');
    console.log('   1. Verificar se PostgreSQL está rodando');
    console.log('   2. Verificar credenciais no .env');
    console.log('   3. docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres');
  } finally {
    await pool.end();
  }
}

initDatabase();