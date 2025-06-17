const db = require('./config/database');

const deleteManager = {
  // Verificar se produto tem movimentações
  verificarMovimentacoesProduto: (produtoId) => {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as total FROM movimentacoes WHERE produto_id = ?
      `, [produtoId], (err, row) => {
        if (err) reject(err);
        else resolve(row.total > 0);
      });
    });
  },

  // Deletar produto (com validação)
  deletarProduto: (produtoId, forcarExclusao = false) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se tem movimentações
        const temMovimentacoes = await deleteManager.verificarMovimentacoesProduto(produtoId);
        
        if (temMovimentacoes && !forcarExclusao) {
          resolve({
            sucesso: false,
            erro: 'Produto possui movimentações. Use força para deletar tudo.',
            temMovimentacoes: true
          });
          return;
        }

        // Se forçar, deletar movimentações primeiro
        if (forcarExclusao) {
          await deleteManager.deletarMovimentacoesProduto(produtoId);
        }

        // Deletar produto
        db.run('DELETE FROM produtos WHERE id = ?', [produtoId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              sucesso: true,
              movimentacoesDeletadas: forcarExclusao,
              linhasAfetadas: this.changes
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Deletar todas movimentações de um produto
  deletarMovimentacoesProduto: (produtoId) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM movimentacoes WHERE produto_id = ?', [produtoId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },

  // Deletar movimentação específica
  deletarMovimentacao: (movimentacaoId) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM movimentacoes WHERE id = ?', [movimentacaoId], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  },

  // Obter detalhes do produto
  obterProduto: (produtoId) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM produtos WHERE id = ?', [produtoId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Obter detalhes da movimentação
  obterMovimentacao: (movimentacaoId) => {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT m.*, p.codigo, p.descricao 
        FROM movimentacoes m 
        JOIN produtos p ON m.produto_id = p.id 
        WHERE m.id = ?
      `, [movimentacaoId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

module.exports = deleteManager;