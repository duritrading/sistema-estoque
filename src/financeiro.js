const db = require('./config/database');

const financeiro = {
  // Calcular saldo atual
  calcularSaldoAtual: () => {
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COALESCE(SUM(
            CASE WHEN tipo = 'CREDITO' THEN valor 
                 WHEN tipo = 'DEBITO' THEN -valor 
                 ELSE 0 END
          ), 0) as saldo_atual
        FROM fluxo_caixa 
        WHERE status = 'PAGO'
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row.saldo_atual);
      });
    });
  },

  // Inserir lançamento no fluxo de caixa
  inserirLancamento: (dataOperacao, tipo, valor, categoriaId, descricao, formaPagamentoId, movimentacaoId, status, observacao) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Calcular novo saldo
        const saldoAtual = await financeiro.calcularSaldoAtual();
        const novoSaldo = tipo === 'CREDITO' ? saldoAtual + valor : saldoAtual - valor;

        db.run(`
          INSERT INTO fluxo_caixa (
            data_operacao, tipo, valor, categoria_id, descricao, 
            forma_pagamento_id, movimentacao_id, status, observacao, saldo_acumulado
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dataOperacao, tipo, valor, categoriaId, descricao, 
          formaPagamentoId, movimentacaoId, status || 'PAGO', observacao, novoSaldo
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Registrar venda no fluxo de caixa
  registrarVenda: (movimentacaoId, valorTotal, dataVenda, formaPagamentoId, descricao) => {
    return financeiro.inserirLancamento(
      dataVenda, 
      'CREDITO', 
      valorTotal, 
      1, // Receita de Vendas
      descricao, 
      formaPagamentoId, 
      movimentacaoId, 
      'PAGO'
    );
  },

  // Registrar comissão
  registrarComissao: (valor, dataOperacao, rca, formaPagamentoId) => {
    return financeiro.inserirLancamento(
      dataOperacao,
      'DEBITO',
      valor,
      4, // Comissões Sobre Vendas
      `${rca} - comissão`,
      formaPagamentoId,
      null,
      'PAGO'
    );
  },

  // Obter fluxo de caixa por período
  obterFluxoCaixa: (dataInicio, dataFim, limite = 100) => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          fc.*,
          cf.nome as categoria_nome,
          cf.tipo as categoria_tipo,
          fp.nome as forma_pagamento_nome
        FROM fluxo_caixa fc
        JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
        LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
        WHERE date(fc.data_operacao) BETWEEN date(?) AND date(?)
        ORDER BY fc.data_operacao DESC, fc.created_at DESC
        LIMIT ?
      `, [dataInicio, dataFim, limite], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Relatório resumido por categoria
  relatorioResumo: (dataInicio, dataFim) => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          cf.nome as categoria,
          cf.tipo,
          SUM(CASE WHEN fc.tipo = 'CREDITO' THEN fc.valor ELSE 0 END) as total_credito,
          SUM(CASE WHEN fc.tipo = 'DEBITO' THEN fc.valor ELSE 0 END) as total_debito,
          COUNT(*) as total_lancamentos
        FROM fluxo_caixa fc
        JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
        WHERE date(fc.data_operacao) BETWEEN date(?) AND date(?)
          AND fc.status = 'PAGO'
        GROUP BY cf.id, cf.nome, cf.tipo
        ORDER BY cf.tipo, total_credito + total_debito DESC
      `, [dataInicio, dataFim], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = financeiro;