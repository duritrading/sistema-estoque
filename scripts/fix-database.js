const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/estoque.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro:', err);
  } else {
    console.log('✅ Conectado ao banco para correção');
  }
});

db.serialize(() => {
  console.log('🔧 Corrigindo estrutura do banco...');

  // Verificar e adicionar coluna sigla se não existir
  db.all("PRAGMA table_info(formas_pagamento)", (err, columns) => {
    if (!err) {
      const columnNames = columns.map(col => col.name);
      
      if (!columnNames.includes('sigla')) {
        console.log('➕ Adicionando coluna sigla...');
        db.run(`ALTER TABLE formas_pagamento ADD COLUMN sigla TEXT`);
        
        // Atualizar dados existentes com siglas
        db.run(`UPDATE formas_pagamento SET sigla = 'DIN' WHERE nome = 'Dinheiro'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'PIX' WHERE nome = 'PIX'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'CD' WHERE nome = 'Cartão Débito'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'CC' WHERE nome = 'Cartão Crédito'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'BOL' WHERE nome = 'Boleto'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'TED' WHERE nome = 'Transferência'`);
        db.run(`UPDATE formas_pagamento SET sigla = 'CHQ' WHERE nome = 'Cheque'`);
        
        console.log('✅ Coluna sigla adicionada e dados atualizados');
      } else {
        console.log('✅ Coluna sigla já existe');
      }
    }
  });

  // Verificar e adicionar coluna ativo se não existir
  db.all("PRAGMA table_info(categorias_financeiras)", (err, columns) => {
    if (!err) {
      const columnNames = columns.map(col => col.name);
      
      if (!columnNames.includes('ativo')) {
        console.log('➕ Adicionando coluna ativo em categorias_financeiras...');
        db.run(`ALTER TABLE categorias_financeiras ADD COLUMN ativo INTEGER DEFAULT 1`);
        console.log('✅ Coluna ativo adicionada');
      } else {
        console.log('✅ Coluna ativo já existe em categorias_financeiras');
      }
    }
  });

  // Verificar se tabelas financeiras existem
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fluxo_caixa'", (err, row) => {
    if (!row) {
      console.log('🔧 Criando tabelas financeiras...');
      
      // Criar tabelas financeiras
      db.run(`
        CREATE TABLE IF NOT EXISTS categorias_financeiras (
          id INTEGER PRIMARY KEY,
          nome TEXT NOT NULL,
          tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
          ativo INTEGER DEFAULT 1
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS formas_pagamento (
          id INTEGER PRIMARY KEY,
          nome TEXT NOT NULL,
          sigla TEXT,
          ativo INTEGER DEFAULT 1
        )
      `);

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
      `);

      // Inserir dados básicos
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
      `);

      db.run(`
        INSERT OR IGNORE INTO formas_pagamento (id, nome, sigla) VALUES 
          (1, 'Dinheiro', 'DIN'),
          (2, 'PIX', 'PIX'),
          (3, 'Cartão Débito', 'CD'),
          (4, 'Cartão Crédito', 'CC'),
          (5, 'Boleto', 'BOL'),
          (6, 'Transferência', 'TED'),
          (7, 'Cheque', 'CHQ')
      `);

      console.log('✅ Tabelas financeiras criadas e dados inseridos');
    } else {
      console.log('✅ Tabelas financeiras já existem');
    }
    
    setTimeout(() => {
      console.log('🎉 Correção concluída! Reinicie o servidor.');
      db.close();
    }, 1000);
  });
});