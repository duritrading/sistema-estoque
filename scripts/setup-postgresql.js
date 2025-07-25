// scripts/setup-postgresql.js - Setup automático do PostgreSQL
// Execute: node scripts/setup-postgresql.js

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

console.log('🚀 Setup do Sistema de Estoque - PostgreSQL');
console.log('===============================================');

async function setupDatabase() {
  // Configuração de conexão
  const config = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sistema_estoque', 
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
  };

  console.log('🔗 Conectando ao PostgreSQL...');
  console.log(`   Host: ${config.host}:${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);

  const pool = new Pool(config);

  try {
    // Testar conexão
    const client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    client.release();

    // Criar tabelas
    console.log('\n📋 Criando estrutura do banco...');
    
    // 1. Tabela de usuários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
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
    console.log('✅ Tabela usuarios criada');

    // 2. Tabela de categorias financeiras
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        tipo VARCHAR(20) CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela categorias_financeiras criada');

    // 3. Tabela de fornecedores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fornecedores (
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
    console.log('✅ Tabela fornecedores criada');

    // 4. Tabela de produtos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS produtos (
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
    console.log('✅ Tabela produtos criada');

    // 5. Tabela de clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) NOT NULL,
        cpf_cnpj VARCHAR(20),
        endereco TEXT,
        cep VARCHAR(10),
        telefone VARCHAR(20),
        email VARCHAR(150),
        observacao TEXT,
        rca_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela clientes criada');

    // 6. Tabela de RCAs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rcas (
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
    console.log('✅ Tabela rcas criada');

    // 7. Tabela de movimentações
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movimentacoes (
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
    console.log('✅ Tabela movimentacoes criada');

    // 8. Tabela de fluxo de caixa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fluxo_caixa (
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
    console.log('✅ Tabela fluxo_caixa criada');

    // 9. Tabela de contas a receber
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contas_a_receber (
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
    console.log('✅ Tabela contas_a_receber criada');

    // 10. Tabela de contas a pagar
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contas_a_pagar (
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
    console.log('✅ Tabela contas_a_pagar criada');

    // Inserir dados iniciais
    console.log('\n📋 Inserindo dados iniciais...');

    // Categorias financeiras padrão
    await pool.query(`
      INSERT INTO categorias_financeiras (id, nome, tipo) VALUES 
      (1, 'Receita de Vendas', 'RECEITA'),
      (2, 'Receitas Financeiras', 'RECEITA'),
      (3, 'Compra de Produtos', 'DESPESA'),
      (4, 'Despesas Operacionais', 'DESPESA')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Categorias financeiras inseridas');

    // Usuário admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO usuarios (username, email, password_hash, nome_completo)
      VALUES ('admin', 'admin@sistema.com', $1, 'Administrador do Sistema')
      ON CONFLICT (username) DO NOTHING
    `, [adminPassword]);
    console.log('✅ Usuário admin criado');

    console.log('\n🎉 SETUP CONCLUÍDO COM SUCESSO!');
    console.log('===============================================');
    console.log('🔐 Login: admin');
    console.log('🔑 Senha: admin123');
    console.log('🌐 URL: http://localhost:10000');
    console.log('');
    console.log('💡 Para iniciar o sistema: npm run dev');

  } catch (error) {
    console.error('\n❌ ERRO NO SETUP:');
    console.error('📝 Detalhes:', error.message);
    console.log('\n💡 SOLUÇÕES:');
    console.log('   1. Verificar se PostgreSQL está rodando');
    console.log('   2. Verificar credenciais no .env');
    console.log('   3. Criar database manualmente: createdb sistema_estoque');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executar setup
setupDatabase();