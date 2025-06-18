const express = require('express');
const db = require('./config/database');
const fs = require('fs');
const path = require('path');
const styles = require('./styles');
const { createBackup, listBackups, restoreBackup } = require('../scripts/backup');
const reports = require('./reports');
const importCSV = require('./import');
const deleteManager = require('./delete');
const financeiro = require('./financeiro');  // ← Esta linha

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Função para calcular saldo atual
const getSaldoProduto = (produtoId) => {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COALESCE(SUM(
          CASE WHEN tipo = 'ENTRADA' THEN quantidade 
               WHEN tipo = 'SAIDA' THEN -quantidade 
               ELSE 0 END
        ), 0) as saldo
      FROM movimentacoes 
      WHERE produto_id = ?
    `, [produtoId], (err, row) => {
      if (err) reject(err);
      else resolve(row.saldo);
    });
  });
};

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
  `, (err, produtos) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
      return;
    }

    // Garantir que produtos é sempre um array
const produtosSeguros = Array.isArray(produtos) ? produtos : [];

// Calcular estatísticas usando array seguro
const totalProdutos = produtosSeguros.length;
const totalEmEstoque = produtosSeguros.reduce((sum, p) => sum + (p.saldo_atual || 0), 0);
const valorEstoque = produtosSeguros.reduce((sum, p) => sum + ((p.saldo_atual || 0) * (p.preco_custo || 0)), 0);

// Alertas de estoque baixo
const alertas = produtosSeguros.filter(p => (p.saldo_atual || 0) <= (p.estoque_minimo || 0));

// Obter categorias únicas para filtro
const categorias = [...new Set(produtosSeguros.map(p => p.categoria).filter(c => c))];
    
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sistema da OF Distribuidora</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Sistema da OF Distribuidora</h1>
            <p style="text-align: center; opacity: 0.9;">Controle inteligente de estoque para distribuidoras</p>
          </div>

          <div class="nav-buttons">
            <a href="/produtos" class="btn btn-primary">📋 Ver Produtos</a>
            <a href="/movimentacoes" class="btn btn-success">📦 Movimentações</a>
            <a href="/novo-produto" class="btn btn-warning">➕ Novo Produto</a>
            <a href="/fornecedores" class="btn btn-primary">🏢 Fornecedores</a>
            <a href="/relatorios" class="btn btn-warning">📊 Relatórios</a>
            <a href="/financeiro" class="btn btn-success">💰 Financeiro</a>
            <a href="/gerenciar/produtos" class="btn btn-danger">🗑️ Gerenciar</a>
            <a href="/importar" class="btn btn-success">📥 Importar CSV</a>
            <a href="/backup" class="btn btn-secondary">🛡️ Backup</a>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${totalProdutos}</div>
              <div class="stat-label">Total de Produtos</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${totalEmEstoque}</div>
              <div class="stat-label">Unidades em Estoque</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">R$ ${valorEstoque.toFixed(2)}</div>
              <div class="stat-label">Valor do Estoque</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${alertas.length}</div>
              <div class="stat-label">Alertas de Estoque</div>
            </div>
          </div>

          ${alertas.length > 0 ? `
            <div class="alert alert-warning">
              <h3>⚠️ Alertas de Estoque Baixo</h3>
              ${alertas.map(p => `
                <div><strong>${p.codigo}</strong> - ${p.descricao}: 
                Saldo <strong>${p.saldo_atual}</strong> ≤ Mínimo <strong>${p.estoque_minimo}</strong></div>
              `).join('')}
            </div>
          ` : ''}

          <div class="card">
            <h2>📋 Produtos em Estoque</h2>
            
            <div class="search-container">
              <input type="text" id="searchInput" class="search-input" placeholder="🔍 Buscar produtos... (Ctrl+K)" onkeyup="searchTable()">
              <select id="categoryFilter" class="filter-select" onchange="filterByCategory()">
                <option value="">Todas as categorias</option>
                ${categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
            </div>

            <table id="dataTable">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th>Categoria</th>
                  <th>Saldo Atual</th>
                  <th>Estoque Mín.</th>
                  <th>Valor Unit.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${produtos.map(p => `
                  <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descricao}</td>
                    <td>${p.unidade}</td>
                    <td>${p.categoria || '-'}</td>
                    <td style="text-align: center;"><strong>${p.saldo_atual}</strong></td>
                    <td style="text-align: center;">${p.estoque_minimo}</td>
                    <td style="text-align: right;">R$ ${(p.preco_custo || 0).toFixed(2)}</td>
                    <td>
                      ${p.saldo_atual <= p.estoque_minimo ? 
                        '<span class="status-warning">⚠️ Baixo</span>' : 
                        '<span class="status-ok">✅ OK</span>'
                      }
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${produtos.length === 0 ? '<div class="no-results">Nenhum produto cadastrado</div>' : ''}
          </div>

          <div style="text-align: center; margin: 40px 0; color: #7f8c8d; font-size: 14px;">
            <p>💡 <strong>Atalhos:</strong> Ctrl+K (Buscar) | Ctrl+N (Novo Produto) | Ctrl+M (Movimentações)</p>
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
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ erro: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Página para adicionar produto
app.get('/novo-produto', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Novo Produto - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>➕ Novo Produto</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/" class="btn btn-secondary">← Voltar ao Dashboard</a>
        </div>
        
        <div class="card">
          <form action="/produtos" method="post">
            <div class="form-row">
              <div class="form-group">
                <label>Código *</label>
                <input name="codigo" class="form-control" required>
              </div>
              <div class="form-group">
                <label>Unidade *</label>
                <input name="unidade" class="form-control" placeholder="PC, KG, UN, etc." required>
              </div>
            </div>
            
            <div class="form-group">
              <label>Descrição *</label>
              <input name="descricao" class="form-control" required>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Categoria</label>
                <input name="categoria" class="form-control" placeholder="Alimentos, Bebidas, etc.">
              </div>
              <div class="form-group">
                <label>Estoque Mínimo</label>
                <input name="estoque_minimo" type="number" class="form-control" value="0">
              </div>
              <div class="form-group">
                <label>Preço de Custo</label>
                <input name="preco_custo" type="number" step="0.01" class="form-control" placeholder="0.00">
              </div>
            </div>
            
            <button type="submit" class="btn btn-success">💾 Salvar Produto</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Criar produto
app.post('/produtos', (req, res) => {
  const { codigo, descricao, unidade, categoria, estoque_minimo, preco_custo } = req.body;
  
  db.run(`
    INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [codigo, descricao, unidade, categoria, estoque_minimo || 0, preco_custo], 
  function(err) {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
    } else {
      res.redirect('/');
    }
  });
});

// Página de movimentações
app.get('/movimentacoes', (req, res) => {
  // Buscar produtos para dropdown
  db.all('SELECT * FROM produtos ORDER BY codigo', (err, produtos) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
      return;
    }

    // Buscar fornecedores para dropdown
    db.all('SELECT * FROM fornecedores ORDER BY nome', (err2, fornecedores) => {
      if (err2) {
        res.status(500).send('Erro: ' + err2.message);
        return;
      }

      // Buscar últimas movimentações
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
      `, (err3, movimentacoes) => {
        if (err3) {
          res.status(500).send('Erro: ' + err3.message);
          return;
        }

        res.send(`
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Movimentações - Sistema de Estoque</title>
            ${styles}
            <script>
              function calcularValorTotal(inputQtd, inputPreco, spanTotal) {
                const quantidade = parseFloat(document.querySelector(inputQtd).value) || 0;
                const precoUnitario = parseFloat(document.querySelector(inputPreco).value) || 0;
                const valorTotal = quantidade * precoUnitario;
                document.querySelector(spanTotal).textContent = 'R$ ' + valorTotal.toFixed(2);
                document.querySelector(inputQtd.replace('_qtd', '_total')).value = valorTotal.toFixed(2);
              }
            </script>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📦 Movimentações de Estoque</h1>
              </div>
              
              <div class="nav-buttons">
                <a href="/" class="btn btn-secondary">← Voltar ao Dashboard</a>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0;">
                
                <!-- ENTRADA -->
                <div class="card" style="border-left: 4px solid #2ecc71;">
                  <h2 style="color: #2ecc71;">📥 Entrada de Estoque</h2>
                  <form action="/movimentacoes" method="post">
                    <input type="hidden" name="tipo" value="ENTRADA">
                    <input type="hidden" id="entrada_total" name="valor_total" value="0">
                    
                    <div class="form-group">
                      <label>Produto *</label>
                      <select name="produto_id" class="form-control" required>
                        <option value="">Selecione um produto...</option>
                        ${produtos.map(p => `<option value="${p.id}">${p.codigo} - ${p.descricao}</option>`).join('')}
                      </select>
                    </div>

                    <div class="form-group">
                      <label>Fornecedor</label>
                      <select name="fornecedor_id" class="form-control">
                        <option value="">Selecione um fornecedor...</option>
                        ${fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('')}
                      </select>
                    </div>
                    
                    <div class="form-row">
                      <div class="form-group">
                        <label>Quantidade *</label>
                        <input id="entrada_qtd" name="quantidade" type="number" min="1" class="form-control" required 
                               onchange="calcularValorTotal('#entrada_qtd', '#entrada_preco', '#entrada_valor_display')">
                      </div>
                      <div class="form-group">
                        <label>Preço Unitário</label>
                        <input id="entrada_preco" name="preco_unitario" type="number" step="0.01" class="form-control"
                               onchange="calcularValorTotal('#entrada_qtd', '#entrada_preco', '#entrada_valor_display')">
                      </div>
                    </div>

                    <div class="form-group">
                      <label>Valor Total</label>
                      <div style="background: #f8f9fa; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-weight: bold; font-size: 18px;">
                        <span id="entrada_valor_display">R$ 0,00</span>
                      </div>
                    </div>
                    
                    <div class="form-group">
                      <label>Documento (NF, etc)</label>
                      <input name="documento" class="form-control">
                    </div>
                    
                    <div class="form-group">
                      <label>Observação</label>
                      <textarea name="observacao" class="form-control" rows="3"></textarea>
                    </div>
                    
                    <button type="submit" class="btn btn-success">📥 Registrar Entrada</button>
                  </form>
                </div>

                <!-- SAÍDA -->
                <div class="card" style="border-left: 4px solid #e74c3c;">
                  <h2 style="color: #e74c3c;">📤 Saída de Estoque</h2>
                  <form action="/movimentacoes" method="post">
                    <input type="hidden" name="tipo" value="SAIDA">
                    <input type="hidden" id="saida_total" name="valor_total" value="0">
                    
                    <div class="form-group">
                      <label>Produto *</label>
                      <select name="produto_id" class="form-control" required>
                        <option value="">Selecione um produto...</option>
                        ${produtos.map(p => `<option value="${p.id}">${p.codigo} - ${p.descricao}</option>`).join('')}
                      </select>
                    </div>

                    <div class="form-group">
                      <label>Cliente *</label>
                      <input name="cliente_nome" class="form-control" placeholder="Nome do cliente" required>
                    </div>

                    <div class="form-group">
                      <label>RCA (Vendedor)</label>
                      <input name="rca" class="form-control" placeholder="Nome do vendedor">
                    </div>
                    
                    <div class="form-row">
                      <div class="form-group">
                        <label>Quantidade *</label>
                        <input id="saida_qtd" name="quantidade" type="number" min="1" class="form-control" required
                               onchange="calcularValorTotal('#saida_qtd', '#saida_preco', '#saida_valor_display')">
                      </div>
                      <div class="form-group">
                        <label>Preço Unitário</label>
                        <input id="saida_preco" name="preco_unitario" type="number" step="0.01" class="form-control"
                               onchange="calcularValorTotal('#saida_qtd', '#saida_preco', '#saida_valor_display')">
                      </div>
                    </div>

                    <div class="form-group">
                      <label>Valor Total</label>
                      <div style="background: #f8f9fa; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-weight: bold; font-size: 18px; color: #e74c3c;">
                        <span id="saida_valor_display">R$ 0,00</span>
                      </div>
                    </div>
                    
                    <div class="form-group">
                      <label>Documento (NF, etc)</label>
                      <input name="documento" class="form-control">
                    </div>
                    
                    <div class="form-group">
                      <label>Observação</label>
                      <textarea name="observacao" class="form-control" rows="3"></textarea>
                    </div>
                    
                    <button type="submit" class="btn btn-danger">📤 Registrar Saída</button>
                  </form>
                </div>
              </div>

              <div class="card">
                <h2>📋 Últimas Movimentações</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Produto</th>
                      <th>Tipo</th>
                      <th>Cliente/Fornecedor</th>
                      <th>RCA</th>
                      <th>Qtd</th>
                      <th>Preço Unit.</th>
                      <th>Valor Total</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${movimentacoes.map(m => `
                      <tr>
                        <td>${new Date(m.created_at).toLocaleString('pt-BR')}</td>
                        <td><strong>${m.codigo}</strong> - ${m.descricao}</td>
                        <td>
                          ${m.tipo === 'ENTRADA' ? 
                            '<span class="status-ok">📥 ENTRADA</span>' : 
                            '<span class="status-warning">📤 SAÍDA</span>'
                          }
                        </td>
                        <td>
                          ${m.tipo === 'ENTRADA' ? 
                            (m.fornecedor_nome || '-') : 
                            (m.cliente_nome || '-')
                          }
                        </td>
                        <td>${m.rca || '-'}</td>
                        <td style="text-align: center;"><strong>${m.quantidade}</strong></td>
                        <td style="text-align: right;">R$ ${m.preco_unitario ? m.preco_unitario.toFixed(2) : '-'}</td>
                        <td style="text-align: right; font-weight: bold; color: ${m.tipo === 'ENTRADA' ? '#2ecc71' : '#e74c3c'};">
                          R$ ${m.valor_total ? m.valor_total.toFixed(2) : '-'}
                        </td>
                        <td>${m.documento || '-'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                
                ${movimentacoes.length === 0 ? '<div class="no-results">Nenhuma movimentação encontrada</div>' : ''}
              </div>
            </div>
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
    // Para saídas, verificar estoque
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

    // Validar campos obrigatórios para saída
    if (tipo === 'SAIDA' && !cliente_nome) {
      return res.status(400).send('Cliente é obrigatório para saídas');
    }

    // Inserir movimentação
    db.run(`
      INSERT INTO movimentacoes (
        produto_id, fornecedor_id, cliente_nome, rca, tipo, quantidade, 
        preco_unitario, valor_total, documento, observacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        res.status(500).send('Erro: ' + err.message);
      } else {
        res.redirect('/movimentacoes');
      }
    });
  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// === SISTEMA DE BACKUP ===

// Página de backup
app.get('/backup', (req, res) => {
  const backups = listBackups();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Backup - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛡️ Sistema de Backup</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/" class="btn btn-secondary">← Voltar ao Dashboard</a>
        </div>

        <div class="card">
          <h2>📥 Criar Backup</h2>
          <p>Criar uma cópia de segurança do banco de dados atual:</p>
          <form action="/backup/create" method="post">
            <button type="submit" class="btn btn-success">📥 Criar Backup Agora</button>
          </form>
        </div>

        <div class="card">
          <h2>📋 Backups Disponíveis</h2>
          ${backups.length === 0 ? '<div class="no-results">Nenhum backup encontrado</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Data</th>
                  <th>Tamanho</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${backups.map(backup => `
                  <tr>
                    <td>${backup.filename}</td>
                    <td>${backup.date}</td>
                    <td>${(backup.size / 1024).toFixed(1)} KB</td>
                    <td>
                      <a href="/backup/download/${backup.filename}" class="btn btn-primary" style="margin-right: 10px; font-size: 12px;">📥 Download</a>
                      <form action="/backup/restore" method="post" style="display: inline;">
                        <input type="hidden" name="filename" value="${backup.filename}">
                        <button type="submit" onclick="return confirm('Tem certeza? Isso substituirá o banco atual!')" 
                                class="btn btn-danger" style="font-size: 12px;">🔄 Restaurar</button>
                      </form>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="alert alert-warning">
          <h3>ℹ️ Instruções</h3>
          <ul>
            <li><strong>Criar Backup:</strong> Gera cópia do banco de dados atual</li>
            <li><strong>Download:</strong> Baixa arquivo de backup para seu computador</li>
            <li><strong>Restaurar:</strong> Substitui banco atual pelo backup selecionado</li>
            <li><strong>Frequência recomendada:</strong> Backup diário ou antes de grandes operações</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Criar backup
app.post('/backup/create', (req, res) => {
  const result = createBackup();
  
  if (result.success) {
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Backup Criado - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="alert alert-success">
            <h1>✅ Backup Criado com Sucesso</h1>
            <p><strong>Arquivo:</strong> ${result.filename}</p>
            <p><strong>Tamanho:</strong> ${(result.size / 1024).toFixed(1)} KB</p>
            <p><strong>Data:</strong> ${result.date}</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/backup" class="btn btn-secondary">← Voltar aos Backups</a>
            <a href="/backup/download/${result.filename}" class="btn btn-primary">📥 Download Backup</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.status(500).send(`
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
            <h1>❌ Erro ao Criar Backup</h1>
            <p>Erro: ${result.error}</p>
          </div>
          <a href="/backup" class="btn btn-secondary">← Voltar aos Backups</a>
        </div>
      </body>
      </html>
    `);
  }
});

// Download backup
app.get('/backup/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../backups', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename);
  } else {
    res.status(404).send('Arquivo não encontrado');
  }
});

// Restaurar backup
app.post('/backup/restore', (req, res) => {
  const { filename } = req.body;
  const result = restoreBackup(filename);
  
  if (result.success) {
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Backup Restaurado - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="alert alert-success">
            <h1>✅ Backup Restaurado com Sucesso</h1>
            <p>${result.message}</p>
            <p><strong>⚠️ Importante:</strong> Reinicie o servidor para garantir que todas as conexões sejam renovadas.</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/" class="btn btn-primary">← Voltar ao Dashboard</a>
            <a href="/backup" class="btn btn-secondary">Ver Backups</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } else {
    res.status(500).send(`
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
            <h1>❌ Erro ao Restaurar Backup</h1>
            <p>Erro: ${result.error}</p>
          </div>
          <a href="/backup" class="btn btn-secondary">← Voltar aos Backups</a>
        </div>
      </body>
      </html>
    `);
  }
});

// === GESTÃO DE FORNECEDORES ===

// Página de fornecedores
app.get('/fornecedores', (req, res) => {
  db.all('SELECT * FROM fornecedores ORDER BY nome', (err, fornecedores) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fornecedores - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏢 Gestão de Fornecedores</h1>
          </div>
          
          <div class="nav-buttons">
            <a href="/" class="btn btn-secondary">← Dashboard</a>
            <a href="/fornecedores/novo" class="btn btn-success">➕ Novo Fornecedor</a>
          </div>

          <div class="card">
            <h2>📋 Fornecedores Cadastrados</h2>
            
            <div class="search-container">
              <input type="text" id="searchInput" class="search-input" placeholder="🔍 Buscar fornecedores..." onkeyup="searchTable()">
            </div>

            <table id="dataTable">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Email</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${fornecedores.map(f => `
                  <tr>
                    <td><strong>${f.codigo}</strong></td>
                    <td>${f.nome}</td>
                    <td>${f.contato || '-'}</td>
                    <td>${f.telefone || '-'}</td>
                    <td>${f.email || '-'}</td>
                    <td>
                      <a href="/fornecedores/editar/${f.id}" class="btn btn-primary" style="font-size: 12px;">✏️ Editar</a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${fornecedores.length === 0 ? '<div class="no-results">Nenhum fornecedor cadastrado</div>' : ''}
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Página novo fornecedor
app.get('/fornecedores/novo', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Novo Fornecedor - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>➕ Novo Fornecedor</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/fornecedores" class="btn btn-secondary">← Voltar aos Fornecedores</a>
        </div>
        
        <div class="card">
          <form action="/fornecedores" method="post">
            <div class="form-row">
              <div class="form-group">
                <label>Código *</label>
                <input name="codigo" class="form-control" required>
              </div>
              <div class="form-group">
                <label>Nome da Empresa *</label>
                <input name="nome" class="form-control" required>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Pessoa de Contato</label>
                <input name="contato" class="form-control">
              </div>
              <div class="form-group">
                <label>Telefone</label>
                <input name="telefone" class="form-control" placeholder="(11) 99999-9999">
              </div>
              <div class="form-group">
                <label>Email</label>
                <input name="email" type="email" class="form-control">
              </div>
            </div>
            
            <div class="form-group">
              <label>Endereço</label>
              <input name="endereco" class="form-control">
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>CNPJ</label>
                <input name="cnpj" class="form-control" placeholder="00.000.000/0000-00">
              </div>
              <div class="form-group">
                <label>Observações</label>
                <textarea name="observacao" class="form-control" rows="3"></textarea>
              </div>
            </div>
            
            <button type="submit" class="btn btn-success">💾 Salvar Fornecedor</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Criar fornecedor
app.post('/fornecedores', (req, res) => {
  const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
  
  db.run(`
    INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [codigo, nome, contato, telefone, email, endereco, cnpj, observacao], 
  function(err) {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
    } else {
      res.redirect('/fornecedores');
    }
  });
});

// === SISTEMA DE RELATÓRIOS ===

// Página de relatórios
app.get('/relatorios', async (req, res) => {
  try {
    const resumo = await reports.resumoExecutivo();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatórios - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Relatórios Gerenciais</h1>
          </div>
          
          <div class="nav-buttons">
            <a href="/" class="btn btn-secondary">← Dashboard</a>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${resumo.totalProdutos}</div>
              <div class="stat-label">Produtos Ativos</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${resumo.totalFornecedores}</div>
              <div class="stat-label">Fornecedores</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">R$ ${resumo.valorEstoque.toFixed(2)}</div>
              <div class="stat-label">Valor do Estoque</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${resumo.entradasMes}/${resumo.saidasMes}</div>
              <div class="stat-label">Mov. Este Mês</div>
            </div>
          </div>

          <div class="card">
            <h2>📋 Relatórios Disponíveis</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
              
              <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h3>📦 Posição de Estoque</h3>
                <p>Saldo atual de todos os produtos com valorização</p>
                <a href="/relatorios/posicao-estoque" class="btn btn-primary">Ver Relatório</a>
              </div>
              
              <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h3>📈 Análise ABC</h3>
                <p>Classificação de produtos por volume de vendas</p>
                <a href="/relatorios/analise-abc" class="btn btn-primary">Ver Relatório</a>
              </div>
              
              <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h3>📊 Movimentações</h3>
                <p>Histórico detalhado de entradas e saídas</p>
                <a href="/relatorios/movimentacoes" class="btn btn-primary">Ver Relatório</a>
              </div>
              
              <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
                <h3>🏢 Performance Fornecedores</h3>
                <p>Análise de compras por fornecedor</p>
                <a href="/relatorios/fornecedores" class="btn btn-primary">Ver Relatório</a>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// Relatório de posição de estoque
app.get('/relatorios/posicao-estoque', async (req, res) => {
  try {
    const dados = await reports.posicaoEstoque();
    const valorTotal = dados.reduce((sum, item) => sum + (item.saldo_atual * (item.preco_custo || 0)), 0);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Posição de Estoque - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Posição de Estoque</h1>
            <p style="text-align: center; opacity: 0.9;">Relatório gerado em ${new Date().toLocaleString('pt-BR')}</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/relatorios" class="btn btn-secondary">← Relatórios</a>
            <button onclick="window.print()" class="btn btn-primary">🖨️ Imprimir</button>
          </div>

          <div class="alert alert-success">
            <h3>💰 Valor Total do Estoque: R$ ${valorTotal.toFixed(2)}</h3>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Saldo</th>
                  <th>Preço Unit.</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${dados.map(item => `
                  <tr>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descricao}</td>
                    <td>${item.categoria || '-'}</td>
                    <td style="text-align: center;">${item.saldo_atual}</td>
                    <td style="text-align: right;">R$ ${(item.preco_custo || 0).toFixed(2)}</td>
                    <td style="text-align: right;"><strong>R$ ${(item.saldo_atual * (item.preco_custo || 0)).toFixed(2)}</strong></td>
                    <td>
                      ${item.saldo_atual <= item.estoque_minimo ? 
                        '<span class="status-warning">⚠️ Baixo</span>' : 
                        '<span class="status-ok">✅ OK</span>'
                      }
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
  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// Relatório análise ABC
app.get('/relatorios/analise-abc', async (req, res) => {
  try {
    const dados = await reports.analiseABC();
    
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Análise ABC - Sistema de Estoque</title>
        ${styles}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📈 Análise ABC - Produtos</h1>
            <p style="text-align: center; opacity: 0.9;">Classificação por volume de vendas</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/relatorios" class="btn btn-secondary">← Relatórios</a>
            <button onclick="window.print()" class="btn btn-primary">🖨️ Imprimir</button>
          </div>

          <div class="alert alert-warning">
            <h3>ℹ️ Como interpretar:</h3>
            <p><strong>Classe A:</strong> 80% do volume - Produtos estratégicos</p>
            <p><strong>Classe B:</strong> 15% do volume - Produtos importantes</p>
            <p><strong>Classe C:</strong> 5% do volume - Produtos complementares</p>
          </div>

          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Qtd Vendida</th>
                  <th>Faturamento</th>
                  <th>Freq. Vendas</th>
                  <th>% Acumulado</th>
                </tr>
              </thead>
              <tbody>
                ${dados.map(item => `
                  <tr>
                    <td>
                      <span style="background: ${item.classe_abc === 'A' ? '#e74c3c' : item.classe_abc === 'B' ? '#f39c12' : '#95a5a6'}; 
                                   color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;">
                        ${item.classe_abc}
                      </span>
                    </td>
                    <td><strong>${item.codigo}</strong></td>
                    <td>${item.descricao}</td>
                    <td style="text-align: center;">${item.total_vendido}</td>
                    <td style="text-align: right;">R$ ${item.faturamento.toFixed(2)}</td>
                    <td style="text-align: center;">${item.freq_vendas}</td>
                    <td style="text-align: right;">${item.percentual_acumulado}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${dados.length === 0 ? '<div class="no-results">Nenhuma venda registrada</div>' : ''}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// === IMPORTAÇÃO DE CSV ===

// Página de importação
app.get('/importar', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Importar CSV - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📥 Importar Planilha CSV</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/" class="btn btn-secondary">← Dashboard</a>
        </div>

        <div class="card">
          <h2>📋 Upload de Arquivo CSV</h2>
          <p>Importe dados de estoque a partir de arquivo CSV (Excel → Salvar como CSV)</p>
          
          <form id="csvForm" enctype="multipart/form-data">
            <div class="form-group">
              <label>Selecionar arquivo CSV:</label>
              <input type="file" id="csvFile" accept=".csv" class="form-control" required>
            </div>
            
            <button type="button" onclick="processarCSV()" class="btn btn-success">📥 Processar Arquivo</button>
          </form>
          
          <div id="resultado" style="margin-top: 20px;"></div>
        </div>

        <div class="card">
          <h3>📄 Formato Esperado do CSV</h3>
          <p>O arquivo deve conter as seguintes colunas:</p>
          <ul>
            <li><strong>DATA</strong> - Data da movimentação (DD/MM/AAAA)</li>
            <li><strong>CLIENTE</strong> - Nome do cliente</li>
            <li><strong>PRODUTO</strong> - Código do produto</li>
            <li><strong>DESCRIÇÃO</strong> - Descrição do produto</li>
            <li><strong>QUANTIDADE</strong> - Quantidade movimentada</li>
            <li><strong>VALOR</strong> - Valor total (R$ 100,00)</li>
            <li><strong>RCA</strong> - Vendedor responsável</li>
            <li><strong>NF</strong> - Número da nota fiscal</li>
            <li><strong>OBSERVAÇÕES</strong> - Observações adicionais</li>
          </ul>
        </div>
      </div>

      <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js"></script>
      <script>
        function processarCSV() {
          const fileInput = document.getElementById('csvFile');
          const resultado = document.getElementById('resultado');
          
          if (!fileInput.files[0]) {
            alert('Selecione um arquivo CSV primeiro!');
            return;
          }

          resultado.innerHTML = '<div class="loading">📥 Processando arquivo...</div>';

          Papa.parse(fileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            encoding: 'UTF-8',
            complete: function(results) {
              if (results.errors.length > 0) {
                resultado.innerHTML = '<div class="alert alert-warning">❌ Erro ao ler CSV: ' + results.errors[0].message + '</div>';
                return;
              }

              // Enviar dados para o servidor
              fetch('/importar/processar', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ dados: results.data })
              })
              .then(response => response.json())
              .then(data => {
                if (data.sucesso) {
                  resultado.innerHTML = gerarRelatorioSucesso(data.resultados);
                } else {
                  resultado.innerHTML = '<div class="alert alert-warning">❌ Erro: ' + data.erro + '</div>';
                }
              })
              .catch(error => {
                resultado.innerHTML = '<div class="alert alert-warning">❌ Erro de conexão: ' + error.message + '</div>';
              });
            }
          });
        }

        function gerarRelatorioSucesso(resultados) {
          return \`
            <div class="alert alert-success">
              <h3>✅ Importação Concluída!</h3>
              <p><strong>Produtos criados:</strong> \${resultados.produtosCriados}</p>
              <p><strong>Movimentações importadas:</strong> \${resultados.movimentacoesImportadas}</p>
              <p><strong>Erros:</strong> \${resultados.erros.length}</p>
            </div>
            
            \${resultados.erros.length > 0 ? \`
              <div class="card">
                <h3>⚠️ Erros Encontrados</h3>
                <ul>
                  \${resultados.erros.map(erro => '<li>' + erro + '</li>').join('')}
                </ul>
              </div>
            \` : ''}
            
            <div style="margin: 20px 0;">
              <a href="/" class="btn btn-primary">🏠 Voltar ao Dashboard</a>
              <a href="/produtos" class="btn btn-success">📋 Ver Produtos Importados</a>
            </div>
          \`;
        }
      </script>
    </body>
    </html>
  `);
});

// Processar dados do CSV
app.post('/importar/processar', async (req, res) => {
  try {
    const { dados } = req.body;
    
    if (!dados || !Array.isArray(dados)) {
      return res.json({ sucesso: false, erro: 'Dados inválidos' });
    }

    const resultados = await importCSV.processarCSV(dados);
    
    res.json({ 
      sucesso: true, 
      resultados: resultados 
    });
  } catch (error) {
    res.json({ 
      sucesso: false, 
      erro: error.message 
    });
  }
});

// === SISTEMA FINANCEIRO BÁSICO ===

// Página principal do financeiro (versão simples)
app.get('/financeiro', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Fluxo de Caixa - Sistema de Estoque</title>
      ${styles}
      <style>
        .saldo-atual {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 10px;
          text-align: center;
          margin: 20px 0;
        }
        .credito { color: #27ae60; font-weight: bold; }
        .debito { color: #e74c3c; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💰 Fluxo de Caixa</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/" class="btn btn-secondary">← Dashboard</a>
          <a href="/financeiro/setup" class="btn btn-warning">⚙️ Configurar Financeiro</a>
        </div>

        <div class="saldo-atual">
          <h2>Sistema Financeiro</h2>
          <div style="font-size: 1.5rem;">
            Configuração necessária
          </div>
        </div>

        <div class="card">
          <h2>📋 Setup do Módulo Financeiro</h2>
          <p>O módulo financeiro precisa ser configurado. Clique no botão abaixo para criar as tabelas necessárias.</p>
          
          <form action="/financeiro/setup" method="post">
            <button type="submit" class="btn btn-success">🔧 Configurar Sistema Financeiro</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Setup do sistema financeiro
app.get('/financeiro/setup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Setup Financeiro - Sistema de Estoque</title>
      ${styles}
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚙️ Configurar Sistema Financeiro</h1>
        </div>
        
        <div class="nav-buttons">
          <a href="/financeiro" class="btn btn-secondary">← Voltar</a>
        </div>

        <div class="card">
          <h2>🔧 Criar Tabelas Financeiras</h2>
          <p>Este processo vai criar todas as tabelas necessárias para o módulo financeiro funcionar.</p>
          
          <form action="/financeiro/setup" method="post">
            <button type="submit" class="btn btn-success">✅ Criar Tabelas Agora</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Processar setup financeiro (VERSÃO CORRIGIDA)
app.post('/financeiro/setup', (req, res) => {
  console.log('🔧 Iniciando setup financeiro...');
  
  db.serialize(() => {
    // Primeiro, deletar tabela se existir
    db.run(`DROP TABLE IF EXISTS fluxo_caixa`);
    
    // Criar categorias_financeiras
    db.run(`
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        tipo TEXT CHECK (tipo IN ('RECEITA', 'DESPESA')) NOT NULL,
        ativo INTEGER DEFAULT 1
      )
    `, (err) => {
      if (err) console.error('❌ Erro categorias_financeiras:', err);
      else console.log('✅ Tabela categorias_financeiras criada');
    });

    // Criar formas_pagamento
    db.run(`
      CREATE TABLE IF NOT EXISTS formas_pagamento (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        ativo INTEGER DEFAULT 1
      )
    `, (err) => {
      if (err) console.error('❌ Erro formas_pagamento:', err);
      else console.log('✅ Tabela formas_pagamento criada');
    });

    // Criar fluxo_caixa SEM constraint NOT NULL
    db.run(`
      CREATE TABLE fluxo_caixa (
        id INTEGER PRIMARY KEY,
        data_operacao DATE NOT NULL,
        tipo TEXT CHECK (tipo IN ('CREDITO', 'DEBITO')) NOT NULL,
        valor REAL NOT NULL,
        categoria_id INTEGER DEFAULT 1,
        descricao TEXT NOT NULL,
        forma_pagamento_id INTEGER,
        status TEXT DEFAULT 'PAGO',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('❌ Erro fluxo_caixa:', err);
      else console.log('✅ Tabela fluxo_caixa criada');
    });

    // Inserir dados básicos
    setTimeout(() => {
      db.run(`
        INSERT OR IGNORE INTO categorias_financeiras (id, nome, tipo) VALUES 
          (1, 'Receita de Vendas', 'RECEITA'),
          (2, 'Receitas Financeiras', 'RECEITA'),
          (3, 'Despesas Operacionais', 'DESPESA'),
          (4, 'Despesas Administrativas', 'DESPESA')
      `);

      db.run(`
        INSERT OR IGNORE INTO formas_pagamento (id, nome) VALUES 
          (1, 'Dinheiro'),
          (2, 'PIX'),
          (3, 'Cartão'),
          (4, 'Transferência')
      `);

      setTimeout(() => {
        console.log('✅ Setup financeiro concluído');
        res.redirect('/financeiro/completo');
      }, 500);
    }, 500);
  });
});

// Financeiro completo (após setup)
app.get('/financeiro/completo', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    // Verificar se tabelas existem
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fluxo_caixa'", async (err, row) => {
      if (!row) {
        return res.redirect('/financeiro/setup');
      }

      // Buscar lançamentos
      db.all(`
        SELECT * FROM fluxo_caixa 
        ORDER BY data_operacao DESC, created_at DESC 
        LIMIT 20
      `, (err, fluxoCaixa) => {
        if (err) {
          return res.status(500).send('Erro fluxo: ' + err.message);
        }

        // Calcular saldo total
        db.get(`
          SELECT 
            COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
            COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
          FROM fluxo_caixa
        `, (err2, totais) => {
          const saldoAtual = totais ? (totais.total_credito - totais.total_debito) : 0;

          res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Fluxo de Caixa - Sistema de Estoque</title>
              ${styles}
              <style>
                .saldo-atual {
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 20px;
                  border-radius: 10px;
                  text-align: center;
                  margin: 20px 0;
                }
                .credito { color: #27ae60; font-weight: bold; }
                .debito { color: #e74c3c; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>💰 Fluxo de Caixa</h1>
                </div>
                
                <div class="nav-buttons">
                  <a href="/" class="btn btn-secondary">← Dashboard</a>
                </div>

                <div class="saldo-atual">
                  <h2>Saldo Atual</h2>
                  <div style="font-size: 2.5rem; font-weight: bold;">
                    R$ ${saldoAtual.toFixed(2)}
                  </div>
                  <div style="font-size: 1rem; opacity: 0.8;">
                    Entradas: R$ ${totais ? totais.total_credito.toFixed(2) : '0,00'} | 
                    Saídas: R$ ${totais ? totais.total_debito.toFixed(2) : '0,00'}
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                  
                  <!-- ENTRADA -->
                  <div class="card" style="border-left: 4px solid #27ae60;">
                    <h2 style="color: #27ae60;">💰 Entrada</h2>
                    <form action="/financeiro/lancamento" method="post">
                      <input type="hidden" name="tipo" value="CREDITO">
                      
                      <div class="form-group">
                        <label>Data</label>
                        <input name="data_operacao" type="date" class="form-control" value="${hoje}" required>
                      </div>
                      
                      <div class="form-group">
                        <label>Valor</label>
                        <input name="valor" type="number" step="0.01" class="form-control" placeholder="0.00" required>
                      </div>
                      
                      <div class="form-group">
                        <label>Descrição</label>
                        <input name="descricao" class="form-control" placeholder="Ex: Venda Batata - Cliente João" required>
                      </div>
                      
                      <button type="submit" class="btn btn-success">💰 Registrar Entrada</button>
                    </form>
                  </div>

                  <!-- SAÍDA -->
                  <div class="card" style="border-left: 4px solid #e74c3c;">
                    <h2 style="color: #e74c3c;">💸 Saída</h2>
                    <form action="/financeiro/lancamento" method="post">
                      <input type="hidden" name="tipo" value="DEBITO">
                      
                      <div class="form-group">
                        <label>Data</label>
                        <input name="data_operacao" type="date" class="form-control" value="${hoje}" required>
                      </div>
                      
                      <div class="form-group">
                        <label>Valor</label>
                        <input name="valor" type="number" step="0.01" class="form-control" placeholder="0.00" required>
                      </div>
                      
                      <div class="form-group">
                        <label>Descrição</label>
                        <input name="descricao" class="form-control" placeholder="Ex: Comissão Gabriel" required>
                      </div>
                      
                      <button type="submit" class="btn btn-danger">💸 Registrar Saída</button>
                    </form>
                  </div>
                </div>

                <div class="card">
                  <h2>📋 Últimos Lançamentos</h2>
                  ${fluxoCaixa.length > 0 ? `
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Tipo</th>
                          <th>Valor</th>
                          <th>Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${fluxoCaixa.map(f => `
                          <tr>
                            <td>${new Date(f.data_operacao).toLocaleDateString('pt-BR')}</td>
                            <td>
                              <span class="${f.tipo.toLowerCase()}">
                                ${f.tipo === 'CREDITO' ? '💰 ENTRADA' : '💸 SAÍDA'}
                              </span>
                            </td>
                            <td class="${f.tipo.toLowerCase()}">R$ ${f.valor.toFixed(2)}</td>
                            <td>${f.descricao}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : '<div class="no-results">Nenhum lançamento encontrado</div>'}
                </div>
              </div>
            </body>
            </html>
          `);
        });
      });
    });
  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// Processar lançamento simples (COM categoria_id padrão)
app.post('/financeiro/lancamento', (req, res) => {
  const { data_operacao, tipo, valor, descricao } = req.body;
  
  // INSERT com categoria_id padrão (1 para entrada, 3 para saída)
  const categoriaId = tipo === 'CREDITO' ? 1 : 3;
  
  db.run(`
    INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id)
    VALUES (?, ?, ?, ?, ?)
  `, [data_operacao, tipo, parseFloat(valor), descricao, categoriaId], (err) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
    } else {
      res.redirect('/financeiro/completo');
    }
  });
});

// === SISTEMA DE EXCLUSÕES ===

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
  `, (err, produtos) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerenciar Produtos - Sistema de Estoque</title>
        ${styles}
        <style>
          .btn-delete {
            background: #e74c3c;
            color: white;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
            margin-left: 5px;
          }
          .btn-delete:hover {
            background: #c0392b;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗑️ Gerenciar Produtos</h1>
            <p style="text-align: center; opacity: 0.9;">Editar e excluir produtos cadastrados</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/" class="btn btn-secondary">← Dashboard</a>
            <a href="/gerenciar/movimentacoes" class="btn btn-warning">📦 Gerenciar Movimentações</a>
          </div>

          <div class="alert alert-warning">
            <h3>⚠️ Atenção</h3>
            <p>Produtos com movimentações só podem ser deletados forçando a exclusão (remove todas as movimentações também).</p>
          </div>

          <div class="card">
            <h2>📋 Produtos Cadastrados</h2>
            
            <div class="search-container">
              <input type="text" id="searchInput" class="search-input" placeholder="🔍 Buscar produtos..." onkeyup="searchTable()">
            </div>

            <table id="dataTable">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th>Saldo</th>
                  <th>Movimentações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${produtos.map(p => `
                  <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.descricao}</td>
                    <td style="text-align: center;">${p.saldo_atual}</td>
                    <td style="text-align: center;">${p.total_movimentacoes}</td>
                    <td>
                      ${p.total_movimentacoes > 0 ? `
                        <button onclick="deletarProduto(${p.id}, '${p.codigo}', true)" class="btn-delete">
                          🗑️ Forçar Exclusão
                        </button>
                      ` : `
                        <button onclick="deletarProduto(${p.id}, '${p.codigo}', false)" class="btn-delete">
                          🗑️ Deletar
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${produtos.length === 0 ? '<div class="no-results">Nenhum produto cadastrado</div>' : ''}
          </div>
        </div>

        <script>
          function deletarProduto(id, codigo, forcar) {
            const mensagem = forcar ? 
              \`Tem certeza que deseja DELETAR o produto "\${codigo}" e TODAS as suas movimentações?\\n\\nEsta ação NÃO pode ser desfeita!\` :
              \`Tem certeza que deseja deletar o produto "\${codigo}"?\`;
            
            if (confirm(mensagem)) {
              fetch('/gerenciar/produtos/deletar', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  produtoId: id, 
                  forcarExclusao: forcar 
                })
              })
              .then(response => response.json())
              .then(data => {
                if (data.sucesso) {
                  alert('Produto deletado com sucesso!');
                  location.reload();
                } else {
                  alert('Erro: ' + data.erro);
                }
              })
              .catch(error => {
                alert('Erro de conexão: ' + error.message);
              });
            }
          }
        </script>
      </body>
      </html>
    `);
  });
});

// Deletar produto
app.post('/gerenciar/produtos/deletar', async (req, res) => {
  try {
    const { produtoId, forcarExclusao } = req.body;
    
    const resultado = await deleteManager.deletarProduto(produtoId, forcarExclusao);
    
    res.json(resultado);
  } catch (error) {
    res.json({ 
      sucesso: false, 
      erro: error.message 
    });
  }
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
  `, (err, movimentacoes) => {
    if (err) {
      res.status(500).send('Erro: ' + err.message);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerenciar Movimentações - Sistema de Estoque</title>
        ${styles}
        <style>
          .btn-delete {
            background: #e74c3c;
            color: white;
            padding: 5px 10px;
            border: none;
            border-radius: 3px;
            font-size: 12px;
            cursor: pointer;
          }
          .btn-delete:hover {
            background: #c0392b;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Gerenciar Movimentações</h1>
            <p style="text-align: center; opacity: 0.9;">Editar e excluir movimentações de estoque</p>
          </div>
          
          <div class="nav-buttons">
            <a href="/" class="btn btn-secondary">← Dashboard</a>
            <a href="/gerenciar/produtos" class="btn btn-warning">📋 Gerenciar Produtos</a>
          </div>

          <div class="alert alert-warning">
            <h3>⚠️ Atenção</h3>
            <p>Deletar movimentações afeta o saldo atual dos produtos. Use com cuidado!</p>
          </div>

          <div class="card">
            <h2>📋 Movimentações (Últimas 200)</h2>
            
            <div class="search-container">
              <input type="text" id="searchInput" class="search-input" placeholder="🔍 Buscar movimentações..." onkeyup="searchTable()">
            </div>

            <table id="dataTable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Documento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${movimentacoes.map(m => `
                  <tr>
                    <td>${new Date(m.created_at).toLocaleDateString('pt-BR')}</td>
                    <td><strong>${m.codigo}</strong> - ${m.descricao}</td>
                    <td>
                      ${m.tipo === 'ENTRADA' ? 
                        '<span class="status-ok">📥 ENTRADA</span>' : 
                        '<span class="status-warning">📤 SAÍDA</span>'
                      }
                    </td>
                    <td style="text-align: center;">${m.quantidade}</td>
                    <td>${m.documento || '-'}</td>
                    <td>
                      <button onclick="deletarMovimentacao(${m.id}, '${m.codigo}', '${m.tipo}', ${m.quantidade})" class="btn-delete">
                        🗑️ Deletar
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            ${movimentacoes.length === 0 ? '<div class="no-results">Nenhuma movimentação encontrada</div>' : ''}
          </div>
        </div>

        <script>
          function deletarMovimentacao(id, codigo, tipo, quantidade) {
            const mensagem = \`Tem certeza que deseja deletar esta movimentação?\\n\\nProduto: \${codigo}\\nTipo: \${tipo}\\nQuantidade: \${quantidade}\\n\\nEsta ação NÃO pode ser desfeita e afetará o saldo atual!\`;
            
            if (confirm(mensagem)) {
              fetch('/gerenciar/movimentacoes/deletar', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ movimentacaoId: id })
              })
              .then(response => response.json())
              .then(data => {
                if (data.sucesso) {
                  alert('Movimentação deletada com sucesso!');
                  location.reload();
                } else {
                  alert('Erro: ' + data.erro);
                }
              })
              .catch(error => {
                alert('Erro de conexão: ' + error.message);
              });
            }
          }
        </script>
      </body>
      </html>
    `);
  });
});

// Deletar movimentação
app.post('/gerenciar/movimentacoes/deletar', async (req, res) => {
  try {
    const { movimentacaoId } = req.body;
    
    const sucesso = await deleteManager.deletarMovimentacao(movimentacaoId);
    
    res.json({ 
      sucesso: sucesso,
      erro: sucesso ? null : 'Movimentação não encontrada'
    });
  } catch (error) {
    res.json({ 
      sucesso: false, 
      erro: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sistema rodando na porta ${PORT}`);
  console.log('🌐 Acesso: https://seu-dominio.railway.app');
});
