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
    
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div>
              <h1>🏪 Sistema da OF Distribuidora</h1>
              <p>Gestão completa de produtos, movimentações e fornecedores</p>
            </div>
            <div class="user-info">
              <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
              <a href="/logout" class="btn-logout">Sair</a>
            </div>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
            <a href="/usuarios">👥 Usuários</a>
            <a href="/backup">📦 Backup</a>
          </div>

          <div class="stats">
            <div class="stat-card">
              <h3>${totalProdutos}</h3>
              <p>Total de Produtos</p>
            </div>
            <div class="stat-card">
              <h3>${totalEmEstoque.toLocaleString()}</h3>
              <p>Unidades em Estoque</p>
            </div>
            <div class="stat-card">
              <h3>R$ ${valorEstoque.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
              <p>Valor do Estoque</p>
            </div>
            <div class="stat-card">
              <h3>${alertas.length}</h3>
              <p>Alertas de Estoque</p>
            </div>
          </div>

          ${alertas.length > 0 ? `
          <div class="card">
            <h2>⚠️ Alertas de Estoque Baixo</h2>
            <div class="alert alert-warning">
              <strong>Produtos com estoque abaixo do mínimo:</strong>
              ${alertas.map(p => `${p.codigo} - ${p.descricao} (Saldo: ${p.saldo_atual}, Mínimo: ${p.estoque_minimo})`).join(', ')}
            </div>
          </div>
          ` : ''}

          <div class="card">
            <h2>📝 Cadastrar Novo Produto</h2>
            <form action="/produtos" method="POST">
              <div class="form-row">
                <div class="form-group">
                  <label for="codigo">Código *</label>
                  <input type="text" id="codigo" name="codigo" required>
                </div>
                <div class="form-group">
                  <label for="descricao">Descrição *</label>
                  <input type="text" id="descricao" name="descricao" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="unidade">Unidade</label>
                  <select id="unidade" name="unidade">
                    <option value="UN">Unidade</option>
                    <option value="KG">Quilograma</option>
                    <option value="LT">Litro</option>
                    <option value="MT">Metro</option>
                    <option value="CX">Caixa</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="categoria">Categoria</label>
                  <input type="text" id="categoria" name="categoria" list="categorias">
                  <datalist id="categorias">
                    ${categorias.map(cat => `<option value="${cat}">`).join('')}
                  </datalist>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="estoque_minimo">Estoque Mínimo</label>
                  <input type="number" id="estoque_minimo" name="estoque_minimo" min="0" value="0">
                </div>
                <div class="form-group">
                  <label for="preco_custo">Preço de Custo (R$)</label>
                  <input type="number" id="preco_custo" name="preco_custo" step="0.01" min="0">
                </div>
              </div>
              <button type="submit" class="btn">Cadastrar Produto</button>
            </form>
          </div>

          <div class="card">
            <h2>📋 Produtos Cadastrados</h2>
            <div class="produtos-grid">
              ${produtosSeguros.map(produto => `
                <div class="produto-card">
                  <div class="produto-header">
                    <div class="produto-codigo">${produto.codigo}</div>
                    <div class="produto-saldo ${
                      produto.saldo_atual > 0 ? 'saldo-positivo' : 
                      produto.saldo_atual === 0 ? 'saldo-zero' : 'saldo-negativo'
                    }">${produto.saldo_atual}</div>
                  </div>
                  <h3>${produto.descricao}</h3>
                  <p><strong>Unidade:</strong> ${produto.unidade || 'UN'}</p>
                  ${produto.categoria ? `<p><strong>Categoria:</strong> ${produto.categoria}</p>` : ''}
                  <p><strong>Estoque Mínimo:</strong> ${produto.estoque_minimo || 0}</p>
                  ${produto.preco_custo ? `<p><strong>Preço:</strong> R$ ${parseFloat(produto.preco_custo).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>` : ''}
                  ${produto.saldo_atual <= produto.estoque_minimo ? '<span class="badge badge-warning">Estoque Baixo</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
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

// Página de movimentações (COM HEADER DE USUÁRIO)
app.get('/movimentacoes', (req, res) => {
  db.all('SELECT * FROM produtos ORDER BY codigo', [], (err, produtos) => {
    if (err) {
      console.error('Erro buscar produtos:', err);
      return res.status(500).send('Erro: ' + err.message);
    }

    const produtosSeguros = Array.isArray(produtos) ? produtos : [];

    db.all('SELECT * FROM fornecedores ORDER BY nome', [], (err2, fornecedores) => {
      if (err2) {
        console.error('Erro buscar fornecedores:', err2);
        return res.status(500).send('Erro: ' + err2.message);
      }

      const fornecedoresSeguros = Array.isArray(fornecedores) ? fornecedores : [];

      db.all(`
        SELECT 
          m.*,
          p.codigo,
          p.descricao,
          f.nome as fornecedor_nome
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY m.created_at DESC
        LIMIT 20
      `, [], (err3, movimentacoes) => {
        if (err3) {
          console.error('Erro buscar movimentações:', err3);
          return res.status(500).send('Erro: ' + err3.message);
        }

        const movimentacoesSeguros = Array.isArray(movimentacoes) ? movimentacoes : [];

        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Movimentações - Sistema da OF Distribuidora</title>
            ${styles}
          </head>
          <body>
            <div class="header">
              <div class="header-content">
                <div>
                  <h1>📦 Movimentações de Estoque</h1>
                  <p>Entradas e saídas de produtos</p>
                </div>
                <div class="user-info">
                  <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
                  <a href="/logout" class="btn-logout">Sair</a>
                </div>
              </div>
            </div>

            <div class="container">
              <div class="nav">
                <a href="/">📊 Dashboard</a>
                <a href="/movimentacoes">📦 Movimentações</a>
                <a href="/fornecedores">🏭 Fornecedores</a>
                <a href="/financeiro">💰 Financeiro</a>
                <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
                <a href="/usuarios">👥 Usuários</a>
              </div>

              <div class="card">
                <h2>➕ Nova Movimentação</h2>
                <form action="/movimentacoes" method="POST">
                  <div class="form-row">
                    <div class="form-group">
                      <label for="produto_id">Produto *</label>
                      <select id="produto_id" name="produto_id" required>
                        <option value="">Selecione um produto</option>
                        ${produtosSeguros.map(p => `<option value="${p.id}">${p.codigo} - ${p.descricao}</option>`).join('')}
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="tipo">Tipo *</label>
                      <select id="tipo" name="tipo" required onchange="toggleFields()">
                        <option value="">Selecione o tipo</option>
                        <option value="ENTRADA">Entrada</option>
                        <option value="SAIDA">Saída</option>
                      </select>
                    </div>
                  </div>
                  
                  <div class="form-row">
                    <div class="form-group">
                      <label for="quantidade">Quantidade *</label>
                      <input type="number" id="quantidade" name="quantidade" step="0.001" min="0.001" required>
                    </div>
                    <div class="form-group">
                      <label for="preco_unitario">Preço Unitário (R$)</label>
                      <input type="number" id="preco_unitario" name="preco_unitario" step="0.01" min="0">
                    </div>
                  </div>

                  <div id="entrada-fields" style="display: none;">
                    <div class="form-group">
                      <label for="fornecedor_id">Fornecedor</label>
                      <select id="fornecedor_id" name="fornecedor_id">
                        <option value="">Selecione um fornecedor</option>
                        ${fornecedoresSeguros.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}
                      </select>
                    </div>
                  </div>

                  <div id="saida-fields" style="display: none;">
                    <div class="form-row">
                      <div class="form-group">
                        <label for="cliente_nome">Cliente *</label>
                        <input type="text" id="cliente_nome" name="cliente_nome">
                      </div>
                      <div class="form-group">
                        <label for="rca">RCA</label>
                        <input type="text" id="rca" name="rca">
                      </div>
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label for="documento">Documento</label>
                      <input type="text" id="documento" name="documento" placeholder="NF, Pedido, etc.">
                    </div>
                    <div class="form-group">
                      <label for="valor_total">Valor Total (R$)</label>
                      <input type="number" id="valor_total" name="valor_total" step="0.01" min="0">
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="observacao">Observações</label>
                    <textarea id="observacao" name="observacao" rows="3"></textarea>
                  </div>

                  <button type="submit" class="btn">Registrar Movimentação</button>
                </form>
              </div>

              <div class="card">
                <h2>📋 Últimas Movimentações</h2>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th>Tipo</th>
                      <th>Quantidade</th>
                      <th>Cliente/Fornecedor</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${movimentacoesSeguros.map(m => `
                      <tr>
                        <td>${new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                        <td>${m.codigo} - ${m.descricao}</td>
                        <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-success' : 'badge-danger'}">${m.tipo}</span></td>
                        <td>${m.quantidade}</td>
                        <td>${m.tipo === 'ENTRADA' ? (m.fornecedor_nome || '-') : (m.cliente_nome || '-')}</td>
                        <td>${m.documento || '-'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <script>
              function toggleFields() {
                const tipo = document.getElementById('tipo').value;
                const entradaFields = document.getElementById('entrada-fields');
                const saidaFields = document.getElementById('saida-fields');
                const clienteNome = document.getElementById('cliente_nome');
                
                if (tipo === 'ENTRADA') {
                  entradaFields.style.display = 'block';
                  saidaFields.style.display = 'none';
                  clienteNome.required = false;
                } else if (tipo === 'SAIDA') {
                  entradaFields.style.display = 'none';
                  saidaFields.style.display = 'block';
                  clienteNome.required = true;
                } else {
                  entradaFields.style.display = 'none';
                  saidaFields.style.display = 'none';
                  clienteNome.required = false;
                }
              }
            </script>
          </body>
          </html>
        `);
      });
    });
  });
});

// Processar movimentações
app.post('/movimentacoes', async (req, res) => {
  const { produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, preco_unitario, valor_total, documento, observacao } = req.body;
  
  try {
    if (tipo === 'SAIDA') {
      const saldo = await getSaldoProduto(produto_id);
      if (saldo < quantidade) {
        return res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Erro - Sistema da OF Distribuidora</title>
            ${styles}
          </head>
          <body>
            <div class="container">
              <div class="alert alert-warning">
                <h1>❌ Estoque Insuficiente</h1>
                <p><strong>Saldo atual:</strong> ${saldo} unidades</p>
                <p><strong>Quantidade solicitada:</strong> ${quantidade} unidades</p>
              </div>
              <a href="/movimentacoes" class="btn btn-primary">← Voltar às Movimentações</a>
            </div>
          </body>
          </html>
        `);
      }
    }

    if (tipo === 'SAIDA' && !cliente_nome) {
      return res.status(400).send('Cliente é obrigatório para saídas');
    }

    db.run(`
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, 
        preco_unitario, valor_total, documento, observacao
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      produto_id, 
      fornecedor_id || null, 
      cliente_nome || null, 
      rca || null, 
      tipo, 
      quantidade, 
      preco_unitario || null, 
      valor_total || null, 
      documento || null, 
      observacao || null
    ], 
    function(err) {
      if (err) {
        console.error('Erro inserir movimentação:', err);
        return res.status(500).send('Erro: ' + err.message);
      }
      return res.redirect('/movimentacoes');
    });
  } catch (error) {
    console.error('Erro processar movimentação:', error);
    return res.status(500).send('Erro: ' + error.message);
  }
});

// Página de fornecedores (COM HEADER DE USUÁRIO)
app.get('/fornecedores', (req, res) => {
  db.all('SELECT * FROM fornecedores ORDER BY nome', [], (err, fornecedores) => {
    if (err) {
      console.error('Erro buscar fornecedores:', err);
      return res.status(500).send('Erro: ' + err.message);
    }

    const fornecedoresSeguros = Array.isArray(fornecedores) ? fornecedores : [];

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fornecedores - Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div>
              <h1>🏭 Fornecedores</h1>
              <p>Gestão de fornecedores e parceiros</p>
            </div>
            <div class="user-info">
              <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
              <a href="/logout" class="btn-logout">Sair</a>
            </div>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
            <a href="/usuarios">👥 Usuários</a>
          </div>

          <div class="card">
            <h2>➕ Cadastrar Fornecedor</h2>
            <form action="/fornecedores" method="POST">
              <div class="form-row">
                <div class="form-group">
                  <label for="codigo">Código</label>
                  <input type="text" id="codigo" name="codigo">
                </div>
                <div class="form-group">
                  <label for="nome">Nome/Razão Social *</label>
                  <input type="text" id="nome" name="nome" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="contato">Contato</label>
                  <input type="text" id="contato" name="contato">
                </div>
                <div class="form-group">
                  <label for="telefone">Telefone</label>
                  <input type="text" id="telefone" name="telefone">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="email">E-mail</label>
                  <input type="email" id="email" name="email">
                </div>
                <div class="form-group">
                  <label for="cnpj">CNPJ</label>
                  <input type="text" id="cnpj" name="cnpj">
                </div>
              </div>
              <div class="form-group">
                <label for="endereco">Endereço</label>
                <input type="text" id="endereco" name="endereco">
              </div>
              <div class="form-group">
                <label for="observacao">Observações</label>
                <textarea id="observacao" name="observacao" rows="3"></textarea>
              </div>
              <button type="submit" class="btn">Cadastrar Fornecedor</button>
            </form>
          </div>

          <div class="card">
            <h2>📋 Fornecedores Cadastrados</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                </tr>
              </thead>
              <tbody>
                ${fornecedoresSeguros.map(f => `
                  <tr>
                    <td>${f.codigo || '-'}</td>
                    <td><strong>${f.nome}</strong></td>
                    <td>${f.contato || '-'}</td>
                    <td>${f.telefone || '-'}</td>
                    <td>${f.email || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Criar fornecedor
app.post('/fornecedores', (req, res) => {
  const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
  
  db.run(`
    INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [codigo, nome, contato, telefone, email, endereco, cnpj, observacao], 
  function(err) {
    if (err) {
      console.error('Erro criar fornecedor:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/fornecedores');
  });
});

// Página financeiro simples
app.get('/financeiro', (req, res) => {
  return res.redirect('/financeiro/completo');
});

// Setup financeiro
app.get('/financeiro/setup', (req, res) => {
  return res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Setup Financeiro - Sistema da OF Distribuidora</title>
      ${styles}
    </head>
    <body>
      <div class="header">
        <div class="header-content">
          <div>
            <h1>💰 Setup Financeiro</h1>
            <p>Configuração inicial do módulo financeiro</p>
          </div>
          <div class="user-info">
            <div class="user-name">👤 ${res.locals.user ? (res.locals.user.nomeCompleto || res.locals.user.username) : 'Usuário'}</div>
            <a href="/logout" class="btn-logout">Sair</a>
          </div>
        </div>
      </div>

      <div class="container">
        <div class="card">
          <h2>✅ Módulo Financeiro Configurado!</h2>
          <p>O sistema financeiro já está pronto para uso com PostgreSQL.</p>
          <a href="/financeiro/completo" class="btn">Acessar Financeiro</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Financeiro completo (COM HEADER DE USUÁRIO)
app.get('/financeiro/completo', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    db.get("SELECT table_name FROM information_schema.tables WHERE table_name='fluxo_caixa'", [], async (err, row) => {
      if (!row) {
        return res.redirect('/financeiro/setup');
      }

      db.all(`
        SELECT * FROM fluxo_caixa 
        ORDER BY data_operacao DESC, created_at DESC 
        LIMIT 20
      `, [], (err, fluxoCaixa) => {
        if (err) {
          console.error('Erro buscar fluxo:', err);
          return res.status(500).send('Erro fluxo: ' + err.message);
        }

        const fluxoCaixaSeguro = Array.isArray(fluxoCaixa) ? fluxoCaixa : [];

        db.get(`
          SELECT 
            COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
            COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
          FROM fluxo_caixa
        `, [], (err2, totais) => {
          const saldoAtual = totais ? (totais.total_credito - totais.total_debito) : 0;

          return res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Financeiro - Sistema da OF Distribuidora</title>
              ${styles}
            </head>
            <body>
              <div class="header">
                <div class="header-content">
                  <div>
                    <h1>💰 Controle Financeiro</h1>
                    <p>Fluxo de caixa e controle financeiro</p>
                  </div>
                  <div class="user-info">
                    <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
                    <a href="/logout" class="btn-logout">Sair</a>
                  </div>
                </div>
              </div>

              <div class="container">
                <div class="nav">
                  <a href="/">📊 Dashboard</a>
                  <a href="/movimentacoes">📦 Movimentações</a>
                  <a href="/fornecedores">🏭 Fornecedores</a>
                  <a href="/financeiro">💰 Financeiro</a>
                  <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
                  <a href="/usuarios">👥 Usuários</a>
                </div>

                <div class="stats">
                  <div class="stat-card">
                    <h3>R$ ${(totais ? totais.total_credito : 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
                    <p>Total de Entradas</p>
                  </div>
                  <div class="stat-card">
                    <h3>R$ ${(totais ? totais.total_debito : 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
                    <p>Total de Saídas</p>
                  </div>
                  <div class="stat-card ${saldoAtual >= 0 ? '' : 'badge-danger'}">
                    <h3>R$ ${saldoAtual.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
                    <p>Saldo Atual</p>
                  </div>
                  <div class="stat-card">
                    <h3>${fluxoCaixaSeguro.length}</h3>
                    <p>Lançamentos</p>
                  </div>
                </div>

                <div class="card">
                  <h2>➕ Novo Lançamento</h2>
                  <form action="/financeiro/lancamento" method="POST">
                    <div class="form-row">
                      <div class="form-group">
                        <label for="data_operacao">Data *</label>
                        <input type="date" id="data_operacao" name="data_operacao" value="${hoje}" required>
                      </div>
                      <div class="form-group">
                        <label for="tipo">Tipo *</label>
                        <select id="tipo" name="tipo" required>
                          <option value="">Selecione</option>
                          <option value="CREDITO">💰 Entrada (Crédito)</option>
                          <option value="DEBITO">💸 Saída (Débito)</option>
                        </select>
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label for="valor">Valor (R$) *</label>
                        <input type="number" id="valor" name="valor" step="0.01" min="0.01" required>
                      </div>
                      <div class="form-group">
                        <label for="descricao">Descrição *</label>
                        <input type="text" id="descricao" name="descricao" required>
                      </div>
                    </div>
                    <button type="submit" class="btn">Registrar Lançamento</button>
                  </form>
                </div>

                <div class="card">
                  <h2>📋 Últimos Lançamentos</h2>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${fluxoCaixaSeguro.map(item => `
                        <tr>
                          <td>${new Date(item.data_operacao).toLocaleDateString('pt-BR')}</td>
                          <td><span class="badge ${item.tipo === 'CREDITO' ? 'badge-success' : 'badge-danger'}">${item.tipo}</span></td>
                          <td>${item.descricao}</td>
                          <td class="${item.tipo === 'CREDITO' ? 'saldo-positivo' : 'saldo-negativo'}">
                            ${item.tipo === 'CREDITO' ? '+' : '-'} R$ ${parseFloat(item.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </body>
            </html>
          `);
        });
      });
    });
  } catch (error) {
    console.error('Erro geral financeiro:', error);
    return res.status(500).send('Erro: ' + error.message);
  }
});

// Processar lançamento simples
app.post('/financeiro/lancamento', (req, res) => {
  const { data_operacao, tipo, valor, descricao } = req.body;
  
  const categoriaId = tipo === 'CREDITO' ? 1 : 3;
  
  db.run(`
    INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id)
    VALUES ($1, $2, $3, $4, $5)
  `, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId], (err) => {
    if (err) {
      console.error('Erro lançamento financeiro:', err);
      return res.status(500).send('Erro: ' + err.message);
    }
    return res.redirect('/financeiro/completo');
  });
});

// Página de gerenciamento de produtos (COM HEADER DE USUÁRIO)
app.get('/gerenciar/produtos', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      COALESCE(SUM(
        CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
             WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
             ELSE 0 END
      ), 0) as saldo_atual,
      COUNT(m.id) as total_movimentacoes
    FROM produtos p
    LEFT JOIN movimentacoes m ON p.id = m.produto_id
    GROUP BY p.id
    ORDER BY p.codigo
  `, [], (err, produtos) => {
    if (err) {
      console.error('Erro gerenciar produtos:', err);
      return res.status(500).send('Erro: ' + err.message);
    }

    const produtosSeguros = Array.isArray(produtos) ? produtos : [];

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerenciar Produtos - Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div>
              <h1>⚙️ Gerenciar Produtos</h1>
              <p>Administração e controle de produtos</p>
            </div>
            <div class="user-info">
              <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
              <a href="/logout" class="btn-logout">Sair</a>
            </div>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
            <a href="/usuarios">👥 Usuários</a>
          </div>

          <div class="card">
            <h2>📋 Produtos Cadastrados (${produtosSeguros.length})</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Unidade</th>
                  <th>Saldo Atual</th>
                  <th>Estoque Mín.</th>
                  <th>Preço Custo</th>
                  <th>Movimentações</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${produtosSeguros.map(p => `
                  <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descricao}</td>
                    <td>${p.categoria || '-'}</td>
                    <td>${p.unidade || 'UN'}</td>
                    <td class="${p.saldo_atual > 0 ? 'saldo-positivo' : p.saldo_atual === 0 ? 'saldo-zero' : 'saldo-negativo'}">${p.saldo_atual}</td>
                    <td>${p.estoque_minimo || 0}</td>
                    <td>${p.preco_custo ? 'R$ ' + parseFloat(p.preco_custo).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                    <td>${p.total_movimentacoes || 0}</td>
                    <td>
                      ${p.saldo_atual <= (p.estoque_minimo || 0) ? '<span class="badge badge-warning">Estoque Baixo</span>' : '<span class="badge badge-success">Normal</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Página de gerenciamento de movimentações (COM HEADER DE USUÁRIO)
app.get('/gerenciar/movimentacoes', (req, res) => {
  db.all(`
    SELECT 
      m.*,
      p.codigo,
      p.descricao
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    ORDER BY m.created_at DESC
    LIMIT 200
  `, [], (err, movimentacoes) => {
    if (err) {
      console.error('Erro gerenciar movimentações:', err);
      return res.status(500).send('Erro: ' + err.message);
    }

    const movimentacoesSeguros = Array.isArray(movimentacoes) ? movimentacoes : [];

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerenciar Movimentações - Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div>
              <h1>📦 Gerenciar Movimentações</h1>
              <p>Histórico completo de movimentações</p>
            </div>
            <div class="user-info">
              <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
              <a href="/logout" class="btn-logout">Sair</a>
            </div>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
            <a href="/usuarios">👥 Usuários</a>
          </div>

          <div class="card">
            <h2>📋 Histórico de Movimentações (${movimentacoesSeguros.length})</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Preço Unit.</th>
                  <th>Valor Total</th>
                  <th>Cliente/Fornecedor</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                ${movimentacoesSeguros.map(m => `
                  <tr>
                    <td>${new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                    <td><strong>${m.codigo}</strong><br><small>${m.descricao}</small></td>
                    <td><span class="badge ${m.tipo === 'ENTRADA' ? 'badge-success' : 'badge-danger'}">${m.tipo}</span></td>
                    <td>${m.quantidade}</td>
                    <td>${m.preco_unitario ? 'R$ ' + parseFloat(m.preco_unitario).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                    <td>${m.valor_total ? 'R$ ' + parseFloat(m.valor_total).toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                    <td>${m.cliente_nome || m.fornecedor_nome || '-'}</td>
                    <td>${m.documento || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// ========================================
// NOVA FUNCIONALIDADE: GERENCIAMENTO DE USUÁRIOS
// ========================================

// Página de usuários
app.get('/usuarios', async (req, res) => {
  try {
    const usuarios = await pool.query(`
      SELECT id, username, email, nome_completo, ativo, ultimo_login, created_at 
      FROM usuarios 
      ORDER BY created_at DESC
    `);

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Usuários - Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="header-content">
            <div>
              <h1>👥 Gerenciar Usuários</h1>
              <p>Controle de acesso ao sistema</p>
            </div>
            <div class="user-info">
              <div class="user-name">👤 ${res.locals.user.nomeCompleto || res.locals.user.username}</div>
              <a href="/logout" class="btn-logout">Sair</a>
            </div>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
            <a href="/usuarios">👥 Usuários</a>
          </div>

          <div class="card">
            <h2>➕ Criar Novo Usuário</h2>
            <form action="/usuarios" method="POST">
              <div class="form-row">
                <div class="form-group">
                  <label for="username">Nome de Usuário *</label>
                  <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                  <label for="email">E-mail *</label>
                  <input type="email" id="email" name="email" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="nome_completo">Nome Completo</label>
                  <input type="text" id="nome_completo" name="nome_completo">
                </div>
                <div class="form-group">
                  <label for="password">Senha *</label>
                  <input type="password" id="password" name="password" required minlength="6">
                </div>
              </div>
              <button type="submit" class="btn">Criar Usuário</button>
            </form>
          </div>

          <div class="card">
            <h2>📋 Usuários Cadastrados</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Nome Completo</th>
                  <th>E-mail</th>
                  <th>Status</th>
                  <th>Último Login</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                ${usuarios.rows.map(user => `
                  <tr>
                    <td><strong>${user.username}</strong></td>
                    <td>${user.nome_completo || '-'}</td>
                    <td>${user.email}</td>
                    <td>
                      <span class="badge ${user.ativo ? 'badge-success' : 'badge-danger'}">
                        ${user.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>${user.ultimo_login ? new Date(user.ultimo_login).toLocaleDateString('pt-BR') : 'Nunca'}</td>
                    <td>${new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Erro buscar usuários:', error);
    res.status(500).send('Erro interno');
  }
});

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

// ========================================
// BACKUP MANUAL SIMPLES (ADICIONAR NO SEU APP.JS)
// ========================================

// Rota para backup manual
app.get('/backup', async (req, res) => {
  try {
    console.log('📦 Gerando backup manual...');
    
    const backup = {
      sistema: 'Sistema de Estoque',
      data: new Date().toISOString(),
      gerado_por: res.locals.user.username,
      dados: {}
    };

    // Backup das tabelas principais
    const tabelas = ['produtos', 'fornecedores', 'movimentacoes', 'fluxo_caixa'];
    
    for (const tabela of tabelas) {
      const result = await pool.query(`SELECT * FROM ${tabela} ORDER BY id`);
      backup.dados[tabela] = result.rows;
    }

    // Usuarios (sem senhas)
    const usuarios = await pool.query('SELECT id, username, email, nome_completo, ativo FROM usuarios');
    backup.dados.usuarios = usuarios.rows;

    const total = Object.values(backup.dados).reduce((sum, t) => sum + t.length, 0);
    console.log(`✅ Backup gerado: ${total} registros`);

    // Download do arquivo
    const arquivo = `backup_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.json(backup);

  } catch (error) {
    console.error('❌ Erro backup:', error);
    res.status(500).send('Erro no backup: ' + error.message);
  }
});
