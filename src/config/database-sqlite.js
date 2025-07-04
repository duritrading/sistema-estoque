const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../data/estoque.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro:', err);
  } else {
    console.log('✅ Banco conectado:', dbPath);
  }
});

db.serialize(() => {
  // Tabelas existentes (produtos, fornecedores, movimentacoes)
  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY,
      codigo TEXT UNIQUE,
      descricao TEXT,
      unidade TEXT,
      categoria TEXT,
      estoque_minimo INTEGER,
      preco_custo REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY,
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
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY,
      produto_id INTEGER,
      fornecedor_id INTEGER,
      cliente_nome TEXT,
      rca TEXT,
      tipo TEXT CHECK (tipo IN ('ENTRADA', 'SAIDA')),
      quantidade INTEGER,
      preco_unitario REAL,
      valor_total REAL,
      documento TEXT,
      observacao TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (produto_id) REFERENCES produtos (id),
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id)
    )
  `);

  // === SISTEMA FINANCEIRO SIMPLIFICADO ===

  // Categorias financeiras
  db.run(`
    CREATE TABLE IF NOT EXISTS categorias_financeiras (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
      ativo INTEGER DEFAULT 1
    )
  `);

  // Formas de pagamento
  db.run(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      sigla TEXT,
      ativo INTEGER DEFAULT 1
    )
  `);

  // Fluxo de caixa (tabela principal)
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

// Tabela para contas a receber (faturamento e inadimplência)
db.run(`
  CREATE TABLE IF NOT EXISTS contas_a_receber (
    id INTEGER PRIMARY KEY,
    movimentacao_id INTEGER NOT NULL,
    cliente_nome TEXT,
    numero_parcela INTEGER NOT NULL,
    total_parcelas INTEGER NOT NULL,
    valor REAL NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status TEXT CHECK (status IN ('Pendente', 'Pago', 'Atrasado')) NOT NULL DEFAULT 'Pendente',
    fluxo_caixa_id INTEGER,
    FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes (id) ON DELETE CASCADE,
    FOREIGN KEY (fluxo_caixa_id) REFERENCES fluxo_caixa (id) ON DELETE SET NULL
  )
`);

  // Inserir categorias baseadas na planilha
  db.run(`
  INSERT OR IGNORE INTO categorias_financeiras (id, nome, tipo) VALUES 
    (1, 'Receita de Vendas de Produtos e Serviços', 'RECEITA'),
    (2, 'Receitas e Rendimentos Financeiros', 'RECEITA'),
    (3, 'Custo dos Produtos Vendidos', 'DESPESA'),
    (4, 'Comissões Sobre Vendas', 'DESPESA'),
    (5, 'Despesas Administrativas', 'DESPESA'),
    (6, 'Despesas Operacionais', 'DESPESA'),
    (7, 'Despesas Financeiras', 'DESPESA'),
    (8, 'Impostos Sobre Vendas', 'DESPESA'),
    (9, 'Receita de Fretes e Entregas', 'RECEITA'),
    (10, 'Descontos Incondicionais', 'DESPESA'),
    (11, 'Devoluções de Vendas', 'DESPESA'),
    (12, 'Custo das Vendas de Produtos', 'DESPESA'),
    (13, 'Custo dos Serviços Prestados', 'DESPESA'),
    (14, 'Despesas Comerciais', 'DESPESA'),
    (15, 'Outras Receitas Não Operacionais', 'RECEITA'),
    (16, 'Outras Despesas Não Operacionais', 'DESPESA'),
    (17, 'Investimentos em Imobilizado', 'DESPESA'),
    (18, 'Empréstimos e Dívidas', 'DESPESA')
`);

  // Inserir formas de pagamento
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

// Tabela para clientes
db.run(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY,
    codigo TEXT UNIQUE,
    nome TEXT NOT NULL,
    contato TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cpf_cnpj TEXT,
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Tabela para RCAs (ATUALIZADA)
db.run(`
  CREATE TABLE IF NOT EXISTS rcas (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    praca TEXT,
    cpf TEXT,
    endereco TEXT,
    cep TEXT,
    telefone TEXT,
    email TEXT,
    observacao TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
//...

  // Dados de exemplo existentes
  db.run(`
    INSERT OR IGNORE INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
    VALUES ('001', 'Arroz 5kg', 'PC', 'Alimentos', 20, 12.50)
  `);

  db.run(`
    INSERT OR IGNORE INTO fornecedores (codigo, nome, contato, telefone, email)
    VALUES 
      ('FORN001', 'Distribuidora ABC Ltda', 'João Silva', '(11) 99999-9999', 'joao@abc.com'),
      ('FORN002', 'Atacado XYZ S/A', 'Maria Santos', '(11) 88888-8888', 'maria@xyz.com')
  `);
});

db.run(`
  CREATE TABLE IF NOT EXISTS contas_a_pagar (
    id INTEGER PRIMARY KEY,
    fornecedor_id INTEGER,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status TEXT CHECK (status IN ('Pendente', 'Pago', 'Atrasado')) NOT NULL DEFAULT 'Pendente',
    fluxo_caixa_id INTEGER,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id),
    FOREIGN KEY (fluxo_caixa_id) REFERENCES fluxo_caixa (id)
  )
`);

module.exports = db;
