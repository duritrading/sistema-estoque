// SISTEMA DE ESTOQUE COMPLETO + LOGIN INTEGRADO
// Versão final com todas as funcionalidades + autenticação

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Configuração de Sessões (CORRIGIDA)
app.use(session({
  secret: process.env.SESSION_SECRET || 'sistema-estoque-2024-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // SEMPRE false para desenvolvimento local
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  },
  name: 'sessionId' // Nome personalizado para o cookie
}));

// Configuração PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para executar SQL (compatível com seu código atual)
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

// ========================================
// SISTEMA DE LOGIN
// ========================================

// CSS para Login
const loginStyles = `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-container {
    background: white;
    padding: 3rem;
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    width: 100%;
    max-width: 400px;
    text-align: center;
  }
  .login-header {
    margin-bottom: 2rem;
  }
  .login-header h1 {
    color: #2d3748;
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  .login-header p {
    color: #718096;
    font-size: 1rem;
  }
  .form-group {
    margin-bottom: 1.5rem;
    text-align: left;
  }
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #4a5568;
  }
  .form-group input {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }
  .form-group input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  .btn-login {
    width: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 1rem;
  }
  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
  }
  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-weight: 500;
  }
  .alert-danger {
    background: #fed7d7;
    color: #742a2a;
    border: 1px solid #feb2b2;
  }
  .alert-success {
    background: #f0fff4;
    color: #22543d;
    border: 1px solid #9ae6b4;
  }
  .footer-info {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
    color: #718096;
    font-size: 0.9rem;
  }
  @media (max-width: 480px) {
    .login-container {
      margin: 1rem;
      padding: 2rem;
    }
  }
</style>
`;

// ...
app.use(express.static('public'));
app.use(session({ /* ... */ }));

// ========================================
// ROTA DE HEALTH CHECK PARA O RENDER
// ========================================
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middleware de autenticação (CORRIGIDO)
app.use((req, res, next) => {
  console.log('🛡️ Middleware auth - URL:', req.path, 'Method:', req.method);
  console.log('🎫 Session ID:', req.sessionID);
  console.log('👤 User ID na sessão:', req.session?.userId);
  
  // Rotas públicas (não precisam de login)
  const publicRoutes = ['/login', '/health', '/debug/usuarios', '/debug/test-login', '/debug/recriar-admin'];
  
  // Verificar se é rota pública
  if (publicRoutes.includes(req.path)) {
    console.log('✅ Rota pública permitida:', req.path);
    return next();
  }
  
  // Verificar se tem sessão para outras rotas
  if (req.session && req.session.userId) {
    console.log('✅ Usuário autenticado:', req.session.username, 'ID:', req.session.userId);
    return next();
  } else {
    console.log('❌ Acesso negado - Session:', !!req.session, 'UserID:', req.session?.userId);
    console.log('❌ Redirecionando para login');
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
});

// Função para criar tabela de usuários
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

    // Verificar se existe usuário admin
    const adminCheck = await pool.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length === 0) {
      // Criar usuário admin padrão
      const defaultPassword = 'adminofdistribuidora987';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      
      await pool.query(`
        INSERT INTO usuarios (username, email, password_hash, nome_completo)
        VALUES ($1, $2, $3, $4)
      `, ['admin', 'admin@sistema.com', hashedPassword, 'Administrador do Sistema']);
      
      console.log('✅ Usuário admin criado: admin / admin123');
    }
  } catch (error) {
    console.error('Erro criar tabela usuários:', error);
  }
}

// Middleware para adicionar informações do usuário
app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    res.locals.user = {
      id: req.session.userId,
      username: req.session.username,
      nomeCompleto: req.session.nomeCompleto
    };
  }
  next();
});

// Middleware de autenticação (CORRIGIDO)
app.use((req, res, next) => {
  console.log('🛡️ Middleware auth - URL:', req.path, 'Method:', req.method);
  
  // Rotas públicas (não precisam de login)
  const publicRoutes = ['/login', '/health', '/debug/usuarios', '/debug/test-login'];
  
  // Verificar se é rota pública
  if (publicRoutes.includes(req.path)) {
    console.log('✅ Rota pública permitida:', req.path);
    return next();
  }
  
  // Verificar se tem sessão para outras rotas
  if (req.session && req.session.userId) {
    console.log('✅ Usuário autenticado:', req.session.username);
    return next();
  } else {
    console.log('❌ Acesso negado, redirecionando para login');
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
});

// ========================================
// ROTAS DE LOGIN (CORRIGIDAS)
// ========================================
// Página de Login
app.get('/login', (req, res) => {
  const redirectUrl = req.query.redirect || '/';
  const error = req.query.error;
  const success = req.query.success;

  // A mágica acontece aqui!
  res.render('login', {
    error,
    success,
    redirectUrl
  });
});

// Processar Login (VERSÃO ÚNICA)
app.post('/login', async (req, res) => {
  const { username, password, redirect } = req.body;
  
  console.log('🔐 === INÍCIO DO LOGIN ===');
  console.log('  - Username:', username);
  console.log('  - Password length:', password ? password.length : 0);
  console.log('  - Redirect:', redirect);
  console.log('  - Session exists:', !!req.session);
  
  try {
    console.log('🔍 Buscando usuário no banco...');
    
    // Buscar usuário
    const userResult = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1 AND ativo = true',
      [username]
    );

    console.log('👥 Usuários encontrados:', userResult.rows.length);

    if (userResult.rows.length === 0) {
      console.log('❌ Usuário não encontrado ou inativo');
      return res.redirect('/login?error=' + encodeURIComponent('Usuário não encontrado ou inativo'));
    }

    const user = userResult.rows[0];
    console.log('👤 Usuário encontrado:', {
      id: user.id,
      username: user.username,
      ativo: user.ativo,
      temSenha: user.password_hash ? 'SIM' : 'NÃO'
    });

    console.log('🔒 Verificando senha...');
    
    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    console.log('🔑 Senha correta:', passwordMatch);

    if (!passwordMatch) {
      console.log('❌ Senha incorreta para usuário:', username);
      return res.redirect('/login?error=' + encodeURIComponent('Senha incorreta'));
    }

    console.log('✅ Login bem-sucedido! Criando sessão...');

    // Atualizar último login
    await pool.query(
      'UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    console.log('📝 Último login atualizado');

    // Criar sessão
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.nomeCompleto = user.nome_completo;

    console.log('🎫 Sessão criada:', {
      userId: req.session.userId,
      username: req.session.username,
      sessionId: req.sessionID
    });

    // Salvar sessão explicitamente
    req.session.save((err) => {
      if (err) {
        console.error('❌ Erro ao salvar sessão:', err);
        return res.redirect('/login?error=' + encodeURIComponent('Erro ao criar sessão'));
      }
      
      console.log('💾 Sessão salva com sucesso');
      
      // Redirecionar
      const redirectUrl = redirect && redirect !== '/' ? redirect : '/';
      
      console.log('🔄 Redirecionando para:', redirectUrl);
      console.log('=== FIM DO LOGIN ===');
      
      res.redirect(redirectUrl);
    });

  } catch (error) {
    console.error('💥 Erro no login:', error);
    console.error('Stack:', error.stack);
    res.redirect('/login?error=' + encodeURIComponent('Erro interno do servidor'));
  }
});

// ========================================
// SEU SISTEMA ATUAL (COM LOGIN INTEGRADO)
// ========================================
// Função auxiliar para obter saldo de produto (SUA FUNÇÃO ATUAL)
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

// Inicializar banco de dados (SUA FUNÇÃO + USUÁRIOS)
async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');
    
    // Criar tabela de usuários PRIMEIRO
    await createUsersTable();
    
    // Suas tabelas atuais
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fluxo_caixa (
        id SERIAL PRIMARY KEY,
        data_operacao DATE NOT NULL,
        tipo VARCHAR(10) CHECK (tipo IN ('CREDITO', 'DEBITO')),
        valor DECIMAL(10,2) NOT NULL,
        descricao TEXT,
        categoria_id INTEGER REFERENCES categorias_financeiras(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inserir categorias padrão se não existirem
    const checkCategorias = await pool.query('SELECT COUNT(*) as count FROM categorias_financeiras');
    if (checkCategorias.rows[0].count == 0) {
      await pool.query(`
        INSERT INTO categorias_financeiras (nome, tipo) VALUES 
        ('Vendas', 'CREDITO'),
        ('Recebimentos', 'CREDITO'), 
        ('Despesas Operacionais', 'DEBITO'),
        ('Compras', 'DEBITO'),
        ('Outros', 'CREDITO')
      `);
    }

    const countProdutos = await pool.query('SELECT COUNT(*) as count FROM produtos');
    console.log(`✅ Banco PostgreSQL inicializado! Produtos: ${countProdutos.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

// ========================================
// SUAS ROTAS ATUAIS (TODAS PROTEGIDAS + HEADER ATUALIZADO)
// ========================================

// Página principal - Dashboard (COM HEADER DE USUÁRIO)
app.get('/', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      COALESCE(SUM(
        CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
             WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
             ELSE 0 END
      ), 0) as saldo_atual
    FROM produtos p
    LEFT JOIN movimentacoes m ON p.id = m.produto_id
    GROUP BY p.id
    ORDER BY p.codigo
  `, [], (err, produtos) => {
    if (err) {
      console.error('Erro na dashboard:', err);
      return res.status(500).send('Erro: ' + err.message);
    }

    const produtosSeguros = Array.isArray(produtos) ? produtos : [];
    const totalProdutos = produtosSeguros.length;
    const totalEmEstoque = produtosSeguros.reduce((sum, p) => sum + (p.saldo_atual || 0), 0);
    const valorEstoque = produtosSeguros.reduce((sum, p) => sum + ((p.saldo_atual || 0) * (p.preco_custo || 0)), 0);
    const alertas = produtosSeguros.filter(p => (p.saldo_atual || 0) <= (p.estoque_minimo || 0));
    const categorias = [...new Set(produtosSeguros.map(p => p.categoria).filter(c => c))];

    res.render('dashboard', {
      user: res.locals.user,
      produtos: produtosSeguros,
      totalProdutos,
      totalEmEstoque,
      valorEstoque,
      alertas,
      categorias
    });
  });
});

// Produtos JSON
app.get('/produtos', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      COALESCE(SUM(
        CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
             WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
             ELSE 0 END
      ), 0) as saldo_atual
    FROM produtos p
    LEFT JOIN movimentacoes m ON p.id = m.produto_id
    GROUP BY p.id
    ORDER BY p.codigo
  `, [], (err, rows) => {
    if (err) {
      console.error('Erro em /produtos:', err);
      return res.status(500).json({ erro: err.message });
    }
    return res.json(rows);
  });
});

// Criar produto
app.post('/produtos', (req, res) => {
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  db.run(`
    INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [codigo, descricao, unidade, categoria, estoque_minimo || 0, preco_custo], 
  function(err) {
    if (err) {
      console.error('Erro criar produto:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/');
  });
});

// ... outras importações de rotas
const movimentacoesRoutes = require('./routes/movimentacoes');
const fornecedoresRoutes = require('./routes/fornecedores'); // ADICIONE ESTA LINHA
const usuariosRoutes = require('./routes/usuarios'); // ADICIONE ESTA LINHA
const financeiroRoutes = require('./routes/financeiro'); // ADICIONE ESTA LINHA
const gerenciarRoutes = require('./routes/gerenciar'); // ADICIONE ESTA LINHA
const backupRoutes = require('./routes/backup'); // GARANTA QUE ESTA LINHA EXISTE
const clientesRoutes = require('./routes/clientes');

// ...
app.use('/movimentacoes', movimentacoesRoutes);
app.use('/fornecedores', fornecedoresRoutes); // ADICIONE ESTA LINHA
app.use('/usuarios', usuariosRoutes); // ADICIONE ESTA LINHA
app.use('/financeiro', financeiroRoutes); // ADICIONE ESTA LINHA
app.use('/gerenciar', gerenciarRoutes); // ADICIONE ESTA LINHA
app.use('/backup', backupRoutes); // GARANTA QUE ESTA LINHA EXISTE
app.use('/clientes', clientesRoutes);


// Inicializar servidor
// ========================================
// ENDPOINTS DE DEBUG (TEMPORÁRIOS)
// ========================================

// Debug - verificar usuários
app.get('/debug/usuarios', async (req, res) => {
  try {
    console.log('🔍 Verificando tabela usuarios...');
    
    // Verificar se a tabela existe
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'usuarios'
    `);
    
    console.log('📋 Tabela usuarios existe:', tableCheck.rows.length > 0);
    
    if (tableCheck.rows.length === 0) {
      return res.json({
        erro: 'Tabela usuarios não existe',
        solucao: 'Reiniciar servidor para criar tabela'
      });
    }
    
    // Buscar usuários
    const usuarios = await pool.query('SELECT id, username, email, ativo, created_at FROM usuarios');
    console.log('👥 Usuários encontrados:', usuarios.rows.length);
    
    // Verificar usuário admin especificamente
    const adminUser = await pool.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);
    console.log('👑 Admin existe:', adminUser.rows.length > 0);
    
    if (adminUser.rows.length > 0) {
      console.log('👑 Admin detalhes:', {
        id: adminUser.rows[0].id,
        username: adminUser.rows[0].username,
        email: adminUser.rows[0].email,
        ativo: adminUser.rows[0].ativo,
        tem_senha: adminUser.rows[0].password_hash ? 'SIM' : 'NÃO'
      });
    }
    
    return res.json({
      tabelaExiste: tableCheck.rows.length > 0,
      totalUsuarios: usuarios.rows.length,
      adminExiste: adminUser.rows.length > 0,
      usuarios: usuarios.rows,
      adminDetalhes: adminUser.rows[0] || null
    });
    
  } catch (error) {
    console.error('❌ Erro no debug:', error);
    return res.status(500).json({ 
      erro: error.message,
      stack: error.stack 
    });
  }
});

// Debug - testar login direto
app.get('/debug/test-login', async (req, res) => {
  try {
    // Buscar admin
    const adminUser = await pool.query('SELECT * FROM usuarios WHERE username = $1', ['admin']);
    
    if (adminUser.rows.length === 0) {
      return res.json({ erro: 'Usuário admin não encontrado' });
    }
    
    const user = adminUser.rows[0];
    
    // Testar senha
    const senhaCorreta = await bcrypt.compare('admin123', user.password_hash);
    
    return res.json({
      usuarioEncontrado: true,
      senhaCorreta: senhaCorreta,
      hashSenha: user.password_hash.substring(0, 20) + '...',
      ativo: user.ativo,
      userId: user.id,
      username: user.username
    });
    
  } catch (error) {
    return res.json({ erro: error.message });
  }
});

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sistema rodando na porta ${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`👤 Admin padrão: admin / admin123`);
    console.log(`🌍 Acesso: https://seu-dominio.railway.app`);
  });
}

startServer().catch(console.error);