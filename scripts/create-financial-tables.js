const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/estoque.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro:', err);
  } else {
    console.log('✅ Conectado ao banco para criar tabelas financeiras');
  }
});

db.serialize(() => {
  console.log('🔧 Criando tabelas financeiras...');

  // Criar tabela categorias_financeiras
  db.run(`
    CREATE TABLE IF NOT EXISTS categorias_financeiras (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
      ativo INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar categorias_financeiras:', err);
    } else {
      console.log('✅ Tabela categorias_financeiras criada');
    }
  });

  // Criar tabela formas_pagamento
  db.run(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      ativo INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar formas_pagamento:', err);
    } else {
      console.log('✅ Tabela formas_pagamento criada');
    }
  });

  // Criar tabela fluxo_caixa
  db.run(`
    CREATE TABLE IF NOT EXISTS fluxo_caixa (
      id INTEGER PRIMARY KEY,
      data_operacao DATE NOT NULL,
      tipo TEXT CHECK (tipo IN ('CREDITO', 'DEBITO')) NOT NULL,
      valor REAL NOT NULL,
      categoria_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      forma_pagamento_id INTEGER,
      movimentacao_id INTEGER,
      status TEXT CHECK (status IN ('PAGO', 'PENDENTE')) DEFAULT 'PAGO',
      observacao TEXT,
      saldo_acumulado REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoria_id) REFERENCES categorias_financeiras (id),
      FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento (id),
      FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes (id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar fluxo_caixa:', err);
    } else {
      console.log('✅ Tabela fluxo_caixa criada');
    }
  });

  // Inserir categorias básicas
  setTimeout(() => {
    console.log('📋 Inserindo dados básicos...');
    
    db.run(`
      INSERT OR IGNORE INTO categorias_financeiras (id, nome, tipo) VALUES 
        (1, 'Receita de Vendas de Produtos e Serviços', 'RECEITA'),
        (2, 'Receitas e Rendimentos Financeiros', 'RECEITA'),
        (3, 'Custo dos Produtos Vendidos', 'DESPESA'),
        (4, 'Comissões Sobre Vendas', 'DESPESA'),
        (5, 'Despesas Administrativas', 'DESPESA'),
        (6, 'Despesas Operacionais', 'DESPESA'),
        (7, 'Despesas Financeiras', 'DESPESA'),
        (8, 'Impostos Sobre Vendas', 'DESPESA')
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao inserir categorias:', err);
      } else {
        console.log('✅ Categorias inseridas');
      }
    });

    db.run(`
      INSERT OR IGNORE INTO formas_pagamento (id, nome) VALUES 
        (1, 'Dinheiro'),
        (2, 'PIX'),
        (3, 'Cartão Débito'),
        (4, 'Cartão Crédito'),
        (5, 'Boleto'),
        (6, 'Transferência'),
        (7, 'Cheque')
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao inserir formas de pagamento:', err);
      } else {
        console.log('✅ Formas de pagamento inseridas');
      }
    });

    setTimeout(() => {
      console.log('🎉 Setup financeiro concluído! Reinicie o servidor.');
      db.close();
    }, 500);
  }, 500);
});