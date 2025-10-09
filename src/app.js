// ========================================
// SISTEMA DE ESTOQUE - FIX CRÍTICO
// ========================================

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./config/database');
const { validateBody } = require('./middleware/validation');
const { loginSchema } = require('./schemas/validation.schemas');

const app = express();
const PORT = process.env.PORT || 10000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ========================================
// TRUST PROXY
// ========================================
app.set('trust proxy', 1);

// ========================================
// SECURITY MIDDLEWARES
// ========================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"]
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Muitas requisições. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  skipSuccessfulRequests: true,
});

// ========================================
// VIEW ENGINE & MIDDLEWARE
// ========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// ========================================
// SESSION CONFIGURATION
// ========================================
if (!process.env.SESSION_SECRET && IS_PRODUCTION) {
  console.error('❌ ERRO CRÍTICO: SESSION_SECRET não configurado em produção!');
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

// ========================================
// HEALTH CHECK
// ========================================
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================
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

// ========================================
// LOGIN ROUTES
// ========================================
app.get('/login', (req, res) => {
  const redirectUrl = req.query.redirect || '/';
  const error = req.query.error;
  const success = req.query.success;

  res.render('login', { error, success, redirectUrl });
});

app.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
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

// ========================================
// IMPORT ROUTES
// ========================================
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

// ========================================
// MOUNT ROUTES (ordem importa!)
// ========================================
app.use('/movimentacoes', movimentacoesRoutes);
app.use('/fornecedores', fornecedoresRoutes);
app.use('/backup', backupRoutes); 
app.use('/clientes', clientesRoutes);
app.use('/rcas', rcaRoutes);
app.use('/produtos', produtosRoutes); // ✅ ROUTER LIMPO - SEM ROTAS DUPLICADAS
app.use('/fluxo-caixa', fluxoCaixaRoutes);
app.use('/dre', dreRoutes);
app.use('/contas-a-receber', contasAReceberRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/contas-a-pagar', contasAPagarRoutes);
app.use('/inadimplencia', inadimplenciaRoutes);
app.use('/entregas', entregasRoutes);
app.use('/', dashboardRoutes); // Dashboard por último (catch-all)

// ========================================
// ERROR HANDLER (404)
// ========================================
app.use((req, res) => {
  res.status(404).render('error', {
    user: res.locals.user || null,
    titulo: 'Página Não Encontrada',
    mensagem: 'A página que você procura não existe.',
    voltar_url: '/'
  });
});

// ========================================
// DATABASE INITIALIZATION
// ========================================
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
    console.error('❌ Erro criar tabela usuários:', error.message);
  }
}

async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');
    await createUsersTable();

    const countProdutos = await pool.query('SELECT COUNT(*) as count FROM produtos');
    console.log(`✅ Banco inicializado! Produtos: ${countProdutos.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
  }
}

// ========================================
// SERVER START
// ========================================
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