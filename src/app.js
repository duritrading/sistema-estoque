// SISTEMA DE ESTOQUE COMPLETO + LOGIN INTEGRADO
// Versão final com todas as funcionalidades + autenticação

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const pool = require('./config/database');

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
  const publicRoutes = ['/login', '/logout', '/health', '/debug/usuarios', '/debug/test-login', '/debug/recriar-admin'];
  
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
// ROTA DE LOGOUT
// ========================================
app.get('/logout', (req, res) => {
  console.log('🚪 Logout iniciado para usuário:', req.session?.username);
  
  if (req.session) {
    // Destruir a sessão
    req.session.destroy((err) => {
      if (err) {
        console.error('❌ Erro ao destruir sessão:', err);
        return res.redirect('/?error=' + encodeURIComponent('Erro ao fazer logout'));
      }
      
      console.log('✅ Sessão destruída com sucesso');
      
      // Limpar o cookie da sessão
      res.clearCookie('sessionId');
      
      // Redirecionar para login com mensagem de sucesso
      res.redirect('/login?success=' + encodeURIComponent('Logout realizado com sucesso'));
    });
  } else {
    // Se não há sessão, redirecionar direto para login
    console.log('ℹ️ Tentativa de logout sem sessão ativa');
    res.redirect('/login');
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

// Dentro de src/app.js

async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');

    // Criar tabela de usuários PRIMEIRO
    await createUsersTable();

    // Suas tabelas originais
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

    console.log('📝 Criando tabela contas_a_pagar...');
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  console.log('🔧 Verificando e atualizando tabela contas_a_pagar...');
  await pool.query('ALTER TABLE contas_a_pagar ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias_financeiras(id)');
  console.log('✅ Tabela "contas_a_pagar" atualizada com sucesso.');
} catch (err) {
  console.error('⚠️  Não foi possível atualizar a tabela contas_a_pagar:', err.message);
}



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
        status VARCHAR(20) DEFAULT 'PAGO',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);


// ... (após o CREATE TABLE IF NOT EXISTS fluxo_caixa)
try {
    console.log('📝 Inserindo/Atualizando categorias financeiras...');
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
        ON CONFLICT (id) DO UPDATE SET 
            nome = EXCLUDED.nome,
            tipo = EXCLUDED.tipo;
    `);
    console.log('✅ Categorias financeiras verificadas/atualizadas.');
} catch (err) {
    console.error('⚠️  Não foi possível inserir/atualizar categorias:', err.message);
}

// ===== SISTEMA DE ENTREGAS =====
    console.log('🚚 Criando tabelas do sistema de entregas...');
    
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

    console.log('✅ Tabelas de entregas criadas!');

console.log('📝 Criando tabela clientes...');
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
  // ADICIONE ESTE BLOCO PARA ATUALIZAR A TABELA 'clientes'
try {
  console.log('🔧 Verificando e atualizando tabela clientes...');
  // Adiciona a coluna rca_id se ela não existir
  await pool.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS rca_id INTEGER REFERENCES rcas(id)');
  // Adiciona a coluna cep se ela não existir
  await pool.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep VARCHAR(10)');
  console.log('✅ Tabela "clientes" atualizada com sucesso.');
} catch (err) {
  console.error('⚠️  Não foi possível atualizar a tabela clientes:', err.message);
}

    console.log('📝 Criando tabela contas_a_receber...');
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Após criar a tabela contas_a_receber
try {
    console.log('🔧 Verificando e atualizando tabela contas_a_receber...');
    await pool.query('ALTER TABLE contas_a_receber ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias_financeiras(id)');
    await pool.query('ALTER TABLE contas_a_receber ADD COLUMN IF NOT EXISTS descricao TEXT');
    await pool.query('ALTER TABLE contas_a_receber ALTER COLUMN movimentacao_id DROP NOT NULL');
    console.log('✅ Tabela "contas_a_receber" atualizada com sucesso.');
} catch (err) {
    console.error('⚠️  Não foi possível atualizar a tabela contas_a_receber:', err.message);
}

    // Criar tabela rcas (ATUALIZADA)
console.log('📝 Criando/Verificando tabela rcas...');
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

// ADICIONE ESTE BLOCO PARA ATUALIZAR A TABELA CASO AS COLUNAS NÃO EXISTAM
try {
  console.log('🔧 Verificando e atualizando tabela rcas...');
  await pool.query('ALTER TABLE rcas ADD COLUMN IF NOT EXISTS praca VARCHAR(150)');
  await pool.query('ALTER TABLE rcas ADD COLUMN IF NOT EXISTS cpf VARCHAR(20)');
  await pool.query('ALTER TABLE rcas ADD COLUMN IF NOT EXISTS endereco TEXT');
  await pool.query('ALTER TABLE rcas ADD COLUMN IF NOT EXISTS cep VARCHAR(10)');
  console.log('✅ Tabela "rcas" atualizada com sucesso.');
} catch (err) {
  console.error('⚠️  Não foi possível atualizar a tabela rcas (pode já estar atualizada):', err.message);
}
    // ==========================================================

    const countProdutos = await pool.query('SELECT COUNT(*) as count FROM produtos');
    console.log(`✅ Banco PostgreSQL inicializado! Produtos: ${countProdutos.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

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

// ...
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
   // ADICIONE ESTAS 3 LINHAS PARA DEPURAR AS ROTAS
  console.log('--- ROTAS REGISTRADAS ---');
  app._router.stack.forEach(r => { if (r.route && r.route.path) console.log(r.route.path, r.route.methods) });
  console.log('-------------------------');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sistema rodando na porta ${PORT}`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`👤 Admin padrão: admin / admin123`);
    console.log(`🌍 Acesso: https://seu-dominio.railway.app`);
  });
}

startServer().catch(console.error);