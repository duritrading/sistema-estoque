const express = require('express');
const router = express.Router();
const pool = require('../config/database');

async function getSaldoProduto(produtoId) {
    if (!pool) throw new Error("Database pool not configured");
    const result = await pool.query(`
        SELECT COALESCE(SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade WHEN tipo = 'SAIDA' THEN -quantidade ELSE 0 END), 0) as saldo 
        FROM movimentacoes WHERE produto_id = $1
    `, [produtoId]);
    return result.rows[0] ? parseFloat(result.rows[0].saldo) : 0;
}

router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const [produtosResult, fornecedoresResult, movimentacoesResult, rcasResult, clientesResult] = await Promise.all([
      pool.query('SELECT * FROM produtos ORDER BY codigo'),
      pool.query('SELECT * FROM fornecedores ORDER BY nome'),
      pool.query(`
        SELECT 
          m.*, 
          p.codigo, 
          p.descricao, 
          f.nome as fornecedor_nome,
          m.preco_unitario,
          m.valor_total,
          (SELECT MAX(cr.total_parcelas) FROM contas_a_receber cr WHERE cr.movimentacao_id = m.id) as total_parcelas
        FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        ORDER BY m.created_at DESC
        LIMIT 20
      `),
      pool.query('SELECT nome FROM rcas ORDER BY nome'),
      pool.query('SELECT id, nome FROM clientes ORDER BY nome')
    ]);

    res.render('movimentacoes', {
      user: res.locals.user,
      produtos: produtosResult.rows || [],
      fornecedores: fornecedoresResult.rows || [],
      movimentacoes: movimentacoesResult.rows || [],
      rcas: rcasResult.rows || [],
      clientes: clientesResult.rows || []
    });
  } catch (error) {
    console.error("Erro ao carregar página de movimentações:", error);
    res.status(500).send('Erro ao carregar a página.');
  }
});

// ROTA POST ATUALIZADA COM CONTROLE DE FLUXO DE CAIXA
router.post('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  
  try {
    const {
      data_movimentacao,
      produto_id,
      tipo,
      quantidade,
      preco_unitario,
      fornecedor_id,
      cliente_nome,
      rca,
      documento,
      observacao,
      total_parcelas,
      vencimentos,
      registrar_fluxo_caixa // NOVO CAMPO
    } = req.body;

    // Validações básicas
    if (!produto_id || !tipo || !quantidade || !data_movimentacao) {
      return res.status(400).send('Dados obrigatórios faltando (incluindo data da movimentação).');
    }

    // Validar data
    const dataMovimentacao = new Date(data_movimentacao);
    if (isNaN(dataMovimentacao.getTime())) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Validação',
        mensagem: 'Data da movimentação inválida.',
        voltar_url: '/movimentacoes'
      });
    }

    // Validar se a data não é muito futura (máximo 1 dia no futuro)
    const hoje = new Date();
    const umDiaDepois = new Date(hoje.getTime() + (24 * 60 * 60 * 1000));
    if (dataMovimentacao > umDiaDepois) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Validação',
        mensagem: 'A data da movimentação não pode ser mais de 1 dia no futuro.',
        voltar_url: '/movimentacoes'
      });
    }

    // VALIDAÇÕES DE LIMITES NUMÉRICOS
    const qtd = parseFloat(quantidade);
    const preco = preco_unitario ? parseFloat(preco_unitario) : 0;
    
    // Verificar limites
    if (qtd > 9999999.999) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Validação',
        mensagem: 'Quantidade muito grande. Máximo permitido: 9.999.999,999',
        voltar_url: '/movimentacoes'
      });
    }
    
    if (preco > 99999999.99) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Validação',
        mensagem: 'Preço unitário muito grande. Máximo permitido: R$ 99.999.999,99',
        voltar_url: '/movimentacoes'
      });
    }

    // Calcular valor total
    const valor_total = preco > 0 ? (qtd * preco) : null;
    
    if (valor_total && valor_total > 99999999.99) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Validação',
        mensagem: 'Valor total muito grande. Máximo permitido: R$ 99.999.999,99',
        voltar_url: '/movimentacoes'
      });
    }

    // Se for SAÍDA, verifica saldo disponível
    if (tipo === 'SAIDA') {
      const saldoAtual = await getSaldoProduto(produto_id);
      if (saldoAtual < qtd) {
        return res.render('error', {
          user: res.locals.user,
          titulo: 'Saldo Insuficiente',
          mensagem: `Saldo insuficiente. Saldo atual: ${saldoAtual.toLocaleString('pt-BR')}`,
          voltar_url: '/movimentacoes'
        });
      }
    }

    // Insere a movimentação com DATA PERSONALIZADA
    const movimentacaoResult = await pool.query(`
      INSERT INTO movimentacoes (
        produto_id, tipo, quantidade, preco_unitario, valor_total,
        fornecedor_id, cliente_nome, rca, documento, observacao, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      produto_id,
      tipo,
      qtd,
      preco > 0 ? preco : null,
      valor_total,
      fornecedor_id || null,
      cliente_nome || null,
      rca || null,
      documento || null,
      observacao || null,
      dataMovimentacao
    ]);

    const movimentacaoId = movimentacaoResult.rows[0].id;

    // Se for SAÍDA com parcelas, cria as contas a receber
    if (tipo === 'SAIDA' && total_parcelas && parseInt(total_parcelas) > 0 && vencimentos && valor_total) {
      const numParcelas = parseInt(total_parcelas);
      const valorParcela = parseFloat((valor_total / numParcelas).toFixed(2));
      
      // Garante que vencimentos seja um array
      const vencimentosArray = Array.isArray(vencimentos) ? vencimentos : [vencimentos];
      
      for (let i = 0; i < numParcelas && i < vencimentosArray.length; i++) {
        await pool.query(`
          INSERT INTO contas_a_receber (
            movimentacao_id, cliente_nome, numero_parcela, total_parcelas,
            valor, data_vencimento, status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'Pendente')
        `, [
          movimentacaoId,
          cliente_nome,
          i + 1,
          numParcelas,
          valorParcela,
          vencimentosArray[i]
        ]);
      }
    }

    // CONTROLE DE FLUXO DE CAIXA PARA ENTRADAS
    // Só registra se for ENTRADA, tiver valor_total E o usuário marcou a opção
    if (tipo === 'ENTRADA' && valor_total && registrar_fluxo_caixa === 'on') {
      await pool.query(`
        INSERT INTO fluxo_caixa (
          data_operacao, tipo, valor, categoria_id, descricao, status
        ) VALUES ($1, 'DEBITO', $2, 3, $3, 'PAGO')
      `, [
        data_movimentacao,
        valor_total, 
        `Compra de produtos - Doc: ${documento || 'S/N'}`
      ]);
      
      console.log(`💰 Entrada registrada no fluxo de caixa: R$ ${valor_total.toLocaleString('pt-BR')}`);
    } else if (tipo === 'ENTRADA' && valor_total && !registrar_fluxo_caixa) {
      console.log(`📦 Entrada registrada APENAS no estoque (sem fluxo de caixa): R$ ${valor_total.toLocaleString('pt-BR')}`);
    }

    // Log da operação
    console.log(`✅ Movimentação criada: ${tipo} de ${qtd} unidades em ${data_movimentacao}`);

    res.redirect('/movimentacoes');
  } catch (error) {
    console.error('Erro ao criar movimentação:', error);
    res.status(500).send('Erro ao criar movimentação: ' + error.message);
  }
});

// ROTA PARA EXCLUIR
router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM movimentacoes WHERE id = $1', [id]);
    res.redirect('/movimentacoes');
  } catch (err) {
    console.error("Erro ao excluir movimentação:", err);
    res.status(500).send('Erro ao excluir movimentação.');
  }
});

module.exports = router;