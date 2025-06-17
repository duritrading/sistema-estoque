const db = require('./config/database');

const reports = {
  // Posição atual de estoque
  posicaoEstoque: () => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          p.*,
          COALESCE(SUM(
            CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                 WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                 ELSE 0 END
          ), 0) as saldo_atual,
          COALESCE(SUM(
            CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade * COALESCE(m.preco_unitario, 0)
                 ELSE 0 END
          ), 0) as valor_entradas,
          COALESCE(SUM(
            CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                 ELSE 0 END
          ), 0) as total_entradas
        FROM produtos p
        LEFT JOIN movimentacoes m ON p.id = m.produto_id
        GROUP BY p.id
        ORDER BY p.codigo
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Movimentações por período
  movimentacoesPeriodo: (dataInicio, dataFim) => {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          m.*,
          p.codigo,
          p.descricao,
          p.categoria,
          f.nome as fornecedor_nome
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (dataInicio) {
        query += ` AND date(m.created_at) >= date(?)`;
        params.push(dataInicio);
      }
      
      if (dataFim) {
        query += ` AND date(m.created_at) <= date(?)`;
        params.push(dataFim);
      }
      
      query += ` ORDER BY m.created_at DESC`;
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Análise ABC - produtos por volume de movimentação
  analiseABC: () => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          p.codigo,
          p.descricao,
          p.categoria,
          SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade ELSE 0 END) as total_vendido,
          SUM(CASE WHEN m.tipo = 'SAIDA' THEN m.quantidade * COALESCE(m.preco_unitario, p.preco_custo, 0) ELSE 0 END) as faturamento,
          COUNT(CASE WHEN m.tipo = 'SAIDA' THEN 1 END) as freq_vendas,
          COALESCE(SUM(
            CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                 WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                 ELSE 0 END
          ), 0) as saldo_atual
        FROM produtos p
        LEFT JOIN movimentacoes m ON p.id = m.produto_id
        GROUP BY p.id
        HAVING total_vendido > 0
        ORDER BY total_vendido DESC
      `, (err, rows) => {
        if (err) reject(err);
        else {
          // Classificar ABC
          const total = rows.reduce((sum, item) => sum + item.total_vendido, 0);
          let acumulado = 0;
          
          const result = rows.map(item => {
            acumulado += item.total_vendido;
            const percentual = total > 0 ? (acumulado / total) * 100 : 0;
            
            let classe;
            if (percentual <= 80) classe = 'A';
            else if (percentual <= 95) classe = 'B';
            else classe = 'C';
            
            return {
              ...item,
              classe_abc: classe,
              percentual_acumulado: percentual.toFixed(1)
            };
          });
          
          resolve(result);
        }
      });
    });
  },

  // Performance por fornecedor
  performanceFornecedores: () => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          f.codigo,
          f.nome,
          COUNT(m.id) as total_compras,
          SUM(m.quantidade) as total_quantidade,
          SUM(m.quantidade * COALESCE(m.preco_unitario, 0)) as valor_total,
          AVG(m.preco_unitario) as preco_medio,
          MAX(m.created_at) as ultima_compra
        FROM fornecedores f
        LEFT JOIN movimentacoes m ON f.id = m.fornecedor_id AND m.tipo = 'ENTRADA'
        GROUP BY f.id
        ORDER BY valor_total DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Resumo executivo
  resumoExecutivo: () => {
    return new Promise((resolve, reject) => {
      const queries = [
        // Total produtos
        `SELECT COUNT(*) as total_produtos FROM produtos`,
        
        // Total fornecedores  
        `SELECT COUNT(*) as total_fornecedores FROM fornecedores`,
        
        // Valor total do estoque
        `SELECT 
          COALESCE(SUM(saldo_atual * COALESCE(preco_custo, 0)), 0) as valor_estoque
          FROM (
            SELECT 
              p.preco_custo,
              COALESCE(SUM(
                CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                     WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                     ELSE 0 END
              ), 0) as saldo_atual
            FROM produtos p
            LEFT JOIN movimentacoes m ON p.id = m.produto_id
            GROUP BY p.id
          )`,
        
        // Movimentações este mês
        `SELECT 
          COUNT(CASE WHEN tipo = 'ENTRADA' THEN 1 END) as entradas_mes,
          COUNT(CASE WHEN tipo = 'SAIDA' THEN 1 END) as saidas_mes
          FROM movimentacoes 
          WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
          
        // Produtos com estoque baixo
        `SELECT COUNT(*) as alertas_estoque
          FROM (
            SELECT 
              p.estoque_minimo,
              COALESCE(SUM(
                CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade 
                     WHEN m.tipo = 'SAIDA' THEN -m.quantidade 
                     ELSE 0 END
              ), 0) as saldo_atual
            FROM produtos p
            LEFT JOIN movimentacoes m ON p.id = m.produto_id
            GROUP BY p.id
            HAVING saldo_atual <= p.estoque_minimo
          )`
      ];
      
      Promise.all(queries.map(query => 
        new Promise((res, rej) => {
          db.get(query, (err, row) => {
            if (err) rej(err);
            else res(row);
          });
        })
      )).then(results => {
        resolve({
          totalProdutos: results[0].total_produtos || 0,
          totalFornecedores: results[1].total_fornecedores || 0,
          valorEstoque: results[2].valor_estoque || 0,
          entradasMes: results[3].entradas_mes || 0,
          saidasMes: results[3].saidas_mes || 0,
          alertasEstoque: results[4].alertas_estoque || 0
        });
      }).catch(reject);
    });
  }
};

module.exports = reports;