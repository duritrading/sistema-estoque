// SISTEMA DE ESTOQUE - VERSÃO PRODUCTION-READY

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 10000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// SECURITY MIDDLEWARES

// 1. Helmet - Security Headers (OWASP)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 2. Rate Limiting - DDoS Protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Rate limit agressivo para login (5 tentativas)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  skipSuccessfulRequests: true,
});

// VIEW ENGINE & MIDDLEWARE

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// SESSION CONFIGURATION (SECURE)

if (!process.env.SESSION_SECRET && IS_PRODUCTION) {
  console.error('❌ ERRO CRÍTICO: SESSION_SECRET não configurado em produção!');
  console.error('Execute: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: IS_PRODUCTION,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  },
  name: 'sid'
}));

// DATABASE HELPERS

const db = {
  all: (query, params, callback) => {
    pool.query(query, params, (err, result) => {
      if (callback) callback(err, result ? result.rows : null);
    });
  },
  get: (query, params, callback) => {
    pool.query(query, params, (err, result) => {
      if (callback) callback(err, result && result.rows.length > 0 ? result.rows[0] : null);
    });
  },
  run: function(query, params, callback) {
    pool.query(query, params, (err, result) => {
      if (callback) {
        const ctx = { lastID: result && result.rows.length > 0 ? result.rows[0].id : null };
        callback.call(ctx, err);
      }
    });
  }
};

function getSaldoProduto(produtoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(
        CASE WHEN tipo = 'ENTRADA' THEN quantidade 
             WHEN tipo = 'SAIDA' THEN -quantidade 
             ELSE 0 END
      ), 0) as saldo 
      FROM movimentacoes 
      WHERE produto_id = $1`,
      [produtoId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.saldo : 0);
      }
    );
  });
}

// HEALTH CHECK

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// AUTHENTICATION MIDDLEWARE

app.use((req, res, next) => {
  const publicRoutes = ['/login', '/logout', '/health'];
  
  if (publicRoutes.includes(req.path)) {
    return next();
  }

  if (req.session && req.session.userId) {
    res.locals.user = {
      id: req.session.userId,
      username: req.session.username,
      nomeCompleto: req.session.nomeCompleto
    };
    return next();
  }

  if (req.session) {
    req.session.destroy(() => {
      res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    });
  } else {
    res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
});

// DATABASE INITIALIZATION

async function createUsersTable() {
  try {
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

    const adminCheck = await pool.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO usuarios (username, email, password_hash, nome_completo)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@sistema.com', hashedPassword, 'Administrador do Sistema']);
      
      if (!IS_PRODUCTION) {
        console.log('✅ Usuário admin criado: admin / admin123');
      }
    }
  } catch (error) {
    console.error('Erro criar tabela usuários:', error.message);
  }
}

async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');

    await createUsersTable();

    // Produtos
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

    // Fornecedores
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

    // RCAs
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

    // Clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(50) UNIQUE,
        nome VARCHAR(200) NOT NULL,
        contato VARCHAR(150),
        telefone VARCHAR(20),
        email VARCHAR(150),
        endereco TEXT,
        cep VARCHAR(10),
        cpf_cnpj VARCHAR(20),
        rca_id INTEGER REFERENCES rcas(id),
        observacao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Movimentações
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

    // Categorias Financeiras
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO', 'RECEITA', 'DESPESA')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fluxo de Caixa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fluxo_caixa (
        id SERIAL PRIMARY KEY,
        data_operacao DATE NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO')),
        valor DECIMAL(10,2) NOT NULL,
        descricao TEXT,
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        status VARCHAR(20) DEFAULT 'PAGO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Contas a Receber
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
        fluxo_caixa_id INTEGER,
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        descricao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Contas a Pagar
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

    // Sistema de Entregas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entregas (
        id SERIAL PRIMARY KEY,
        data_entrega DATE NOT NULL,
        cliente_id INTEGER,
        cliente_nome VARCHAR(200) NOT NULL,
        endereco_completo TEXT NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        observacoes TEXT,
        valor_entrega DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'PENDENTE',
        ordem_entrega INTEGER,
        hora_prevista TIME,
        hora_entrega TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rotas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        data_rota DATE NOT NULL,
        motorista VARCHAR(100),
        veiculo VARCHAR(100),
        km_total DECIMAL(8,2),
        tempo_total_minutos INTEGER,
        status VARCHAR(20) DEFAULT 'PLANEJADA',
        observacoes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rota_entregas (
        id SERIAL PRIMARY KEY,
        rota_id INTEGER REFERENCES rotas(id) ON DELETE CASCADE,
        entrega_id INTEGER REFERENCES entregas(id) ON DELETE CASCADE,
        ordem_na_rota INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inserir categorias financeiras padrão
    await pool.query(`
      INSERT INTO categorias_financeiras (id, nome, tipo) VALUES
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
      ON CONFLICT (id) DO NOTHING
    `);

    const countProdutos = await pool.query('SELECT COUNT(*) as count FROM produtos');
    console.log(`✅ Banco inicializado! Produtos: ${countProdutos.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
  }
}

// LOGIN ROUTES

app.get('/login', (req, res) => {
  const redirectUrl = req.query.redirect || '/';
  const error = req.query.error;
  const success = req.query.success;

  res.render('login', { error, success, redirectUrl });
});

app.post('/login', loginLimiter, async (req, res) => {
  const { username, password, redirect } = req.body;
  
  try {
    const userResult = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 AND ativo = true',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.redirect('/login?error=' + encodeURIComponent('Usuário não encontrado'));
    }

    const user = userResult.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.redirect('/login?error=' + encodeURIComponent('Senha incorreta'));
    }

    await pool.query(
      'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nomeCompleto = user.nome_completo;

    req.session.save((err) => {
      if (err) {
        return res.redirect('/login?error=' + encodeURIComponent('Erro ao criar sessão'));
      }
      
      const redirectUrl = redirect && redirect !== '/' ? redirect : '/';
      res.redirect(redirectUrl);
    });

  } catch (error) {
    console.error('Erro no login:', error.message);
    res.redirect('/login?error=' + encodeURIComponent('Erro interno'));
  }
});

app.get('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        return res.redirect('/?error=' + encodeURIComponent('Erro ao fazer logout'));
      }
      res.clearCookie('sid');
      res.redirect('/login?success=' + encodeURIComponent('Logout realizado'));
    });
  } else {
    res.redirect('/login');
  }
});

// BUSINESS ROUTES

app.post('/produtos', (req, res) => {
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  db.run(`
    INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [codigo, descricao, unidade, categoria, estoque_minimo || 0, preco_custo], 
  function(err) {
    if (err) {
      console.error('Erro criar produto:', err.message);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/');
  });
});

// IMPORT ROUTES

const movimentacoesRoutes = require('./routes/movimentacoes');
const fornecedoresRoutes = require('./routes/fornecedores');
const usuariosRoutes = require('./routes/usuarios'); 
const backupRoutes = require('./routes/backup'); 
const clientesRoutes = require('./routes/clientes');
const rcaRoutes = require('./routes/rcas');
const dashboardRoutes = require('./routes/dashboard'); 
const produtosRoutes = require('./routes/produtos');
const fluxoCaixaRoutes = require('./routes/fluxo-caixa');
const dreRoutes = require('./routes/dre');
const contasAReceberRoutes = require('./routes/contas-a-receber');
const contasAPagarRoutes = require('./routes/contas-a-pagar');
const inadimplenciaRoutes = require('./routes/inadimplencia');
const entregasRoutes = require('./routes/entregas');

app.use('/movimentacoes', movimentacoesRoutes);
app.use('/fornecedores', fornecedoresRoutes);
app.use('/backup', backupRoutes); 
app.use('/clientes', clientesRoutes);
app.use('/rcas', rcaRoutes);
app.use('/', dashboardRoutes); 
app.use('/produtos', produtosRoutes);
app.use('/fluxo-caixa', fluxoCaixaRoutes);
app.use('/dre', dreRoutes);
app.use('/contas-a-receber', contasAReceberRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/contas-a-pagar', contasAPagarRoutes);
app.use('/inadimplencia', inadimplenciaRoutes);
app.use('/entregas', entregasRoutes);

// SERVER START

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    if (!IS_PRODUCTION) {
      console.log(`🚀 Sistema rodando: http://localhost:${PORT}`);
      console.log(`🔐 Login: admin / admin123`);
    } else {
      console.log(`🚀 Sistema em produção na porta ${PORT}`);
    }
  });
}

startServer().catch(console.error);