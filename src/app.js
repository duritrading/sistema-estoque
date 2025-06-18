const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Configuração PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para executar SQL
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

// CSS styles
const styles = `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #2d3748; line-height: 1.6; }
  .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem 0; margin-bottom: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
  .header h1 { text-align: center; font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem; }
  .header p { text-align: center; font-size: 1.1rem; opacity: 0.9; }
  .nav { display: flex; justify-content: center; gap: 1rem; margin: 2rem 0; flex-wrap: wrap; }
  .nav a { background: white; color: #4a5568; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.2s; border: 2px solid transparent; }
  .nav a:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: #667eea; border-color: #667eea; }
  .card { background: white; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
  .card h2 { color: #2d3748; margin-bottom: 1.5rem; font-size: 1.8rem; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
  .stat-card { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 1.5rem; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(79, 172, 254, 0.3); }
  .stat-card h3 { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem; }
  .stat-card p { font-size: 1rem; opacity: 0.9; }
  .form-group { margin-bottom: 1.5rem; }
  .form-group label { display: block; margin-bottom: 0.5rem; font-weight: 600; color: #4a5568; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; transition: border-color 0.2s; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
  .btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-block; text-align: center; }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); }
  .btn-success { background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); }
  .btn-danger { background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%); }
  .btn-warning { background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); }
  .alert { padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: 500; }
  .alert-success { background: #f0fff4; color: #22543d; border: 1px solid #9ae6b4; }
  .alert-warning { background: #fffaf0; color: #744210; border: 1px solid #fbd38d; }
  .alert-danger { background: #fed7d7; color: #742a2a; border: 1px solid #feb2b2; }
  .table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .table th { background: #f7fafc; font-weight: 600; color: #4a5568; }
  .table tbody tr:hover { background: #f7fafc; }
  .badge { padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-warning { background: #fef5e7; color: #744210; }
  .badge-danger { background: #fed7d7; color: #742a2a; }
  .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .mt-2 { margin-top: 1rem; }
  .mb-2 { margin-bottom: 1rem; }
  .filter-section { background: #f8f9fa; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; }
  .produtos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
  .produto-card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 4px solid #667eea; }
  .produto-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
  .produto-codigo { font-size: 1.2rem; font-weight: 700; color: #2d3748; }
  .produto-saldo { font-size: 1.5rem; font-weight: 700; }
  .saldo-positivo { color: #38a169; }
  .saldo-zero { color: #ed8936; }
  .saldo-negativo { color: #e53e3e; }
  @media (max-width: 768px) { .container { padding: 10px; } .nav { flex-direction: column; align-items: center; } .form-row { grid-template-columns: 1fr; } .stats { grid-template-columns: 1fr; } }
</style>
`;

// Função auxiliar para obter saldo de produto
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

// Inicializar banco de dados
async function initializeDatabase() {
  try {
    console.log('🔧 Inicializando banco PostgreSQL...');
    
    // Criar tabelas se não existirem
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

    // Verificar dados iniciais
    const countProdutos = await pool.query('SELECT COUNT(*) as count FROM produtos');
    console.log(`✅ Banco PostgreSQL inicializado! Produtos: ${countProdutos.rows[0].count}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

// Página principal - Dashboard
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
        <title>Dashboard - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>🏪 Sistema de Estoque</h1>
            <p>Gestão completa de produtos, movimentações e fornecedores</p>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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

// Página de movimentações
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
            <title>Movimentações - Sistema de Estoque</title>
            ${styles}
          </head>
          <body>
            <div class="header">
              <div class="container">
                <h1>📦 Movimentações de Estoque</h1>
                <p>Entradas e saídas de produtos</p>
              </div>
            </div>

            <div class="container">
              <div class="nav">
                <a href="/">📊 Dashboard</a>
                <a href="/movimentacoes">📦 Movimentações</a>
                <a href="/fornecedores">🏭 Fornecedores</a>
                <a href="/financeiro">💰 Financeiro</a>
                <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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
            <title>Erro - Sistema de Estoque</title>
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

// Página de fornecedores
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
        <title>Fornecedores - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>🏭 Fornecedores</h1>
            <p>Gestão de fornecedores e parceiros</p>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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
      <title>Setup Financeiro - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="header">
        <div class="container">
          <h1>💰 Setup Financeiro</h1>
          <p>Configuração inicial do módulo financeiro</p>
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

// Financeiro completo
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
              <title>Financeiro - Sistema de Estoque</title>
              ${styles}
            </head>
            <body>
              <div class="header">
                <div class="container">
                  <h1>💰 Controle Financeiro</h1>
                  <p>Fluxo de caixa e controle financeiro</p>
                </div>
              </div>

              <div class="container">
                <div class="nav">
                  <a href="/">📊 Dashboard</a>
                  <a href="/movimentacoes">📦 Movimentações</a>
                  <a href="/fornecedores">🏭 Fornecedores</a>
                  <a href="/financeiro">💰 Financeiro</a>
                  <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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

// Página de gerenciamento de produtos
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
        <title>Gerenciar Produtos - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>⚙️ Gerenciar Produtos</h1>
            <p>Administração e controle de produtos</p>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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

// Página de gerenciamento de movimentações
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
        <title>Gerenciar Movimentações - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>📦 Gerenciar Movimentações</h1>
            <p>Histórico completo de movimentações</p>
          </div>
        </div>

        <div class="container">
          <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/movimentacoes">📦 Movimentações</a>
            <a href="/fornecedores">🏭 Fornecedores</a>
            <a href="/financeiro">💰 Financeiro</a>
            <a href="/gerenciar/produtos">⚙️ Gerenciar</a>
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

// Inicializar servidor
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sistema rodando na porta ${PORT}`);
    console.log(`🌍 Acesso: https://seu-dominio.railway.app`);
  });
}

startServer().catch(console.error);
