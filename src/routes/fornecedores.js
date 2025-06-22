const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fornecedores ORDER BY nome');
    res.render('fornecedores', {
      user: res.locals.user,
      fornecedores: result.rows || []
    });
  } catch (err) {
    console.error("Erro ao buscar fornecedores:", err);
    res.status(500).send('Erro ao buscar fornecedores.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { codigo, nome, contato, telefone, email, endereco, cnpj, observacao } = req.body;
    const query = `INSERT INTO fornecedores (codigo, nome, contato, telefone, email, endereco, cnpj, observacao) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    await pool.query(query, [codigo, nome, contato, telefone, email, endereco, cnpj, observacao]);
    res.redirect('/fornecedores');
  } catch (err) {
    console.error("Erro ao criar fornecedor:", err);
    res.status(500).send('Erro ao criar fornecedor.');
  }
});

router.post('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar se o ID é válido
    if (!id || isNaN(id)) {
      return res.render('error', { 
        user: res.locals.user, 
        titulo: 'Erro de Validação', 
        mensagem: 'ID do fornecedor inválido.',
        voltar_url: '/fornecedores'
      });
    }
    
    // Verificar se o fornecedor existe
    const fornecedorCheck = await pool.query('SELECT nome FROM fornecedores WHERE id = $1', [id]);
    
    if (fornecedorCheck.rows.length === 0) {
      return res.render('error', { 
        user: res.locals.user, 
        titulo: 'Fornecedor Não Encontrado', 
        mensagem: 'O fornecedor que você está tentando excluir não existe.',
        voltar_url: '/fornecedores'
      });
    }
    
    const fornecedorNome = fornecedorCheck.rows[0].nome;
    
    // Verificar se há movimentações associadas
    const movimentacoesCheck = await pool.query('SELECT COUNT(*) as count FROM movimentacoes WHERE fornecedor_id = $1', [id]);
    
    if (parseInt(movimentacoesCheck.rows[0].count) > 0) {
      return res.render('error', { 
        user: res.locals.user, 
        titulo: 'Ação Bloqueada', 
        mensagem: `O fornecedor "${fornecedorNome}" não pode ser excluído pois possui ${movimentacoesCheck.rows[0].count} movimentação(ões) associada(s).`,
        voltar_url: '/fornecedores'
      });
    }
    
    // Verificar se há contas a pagar associadas
    const contasAPagarCheck = await pool.query('SELECT COUNT(*) as count FROM contas_a_pagar WHERE fornecedor_id = $1', [id]);
    
    if (parseInt(contasAPagarCheck.rows[0].count) > 0) {
      return res.render('error', { 
        user: res.locals.user, 
        titulo: 'Ação Bloqueada', 
        mensagem: `O fornecedor "${fornecedorNome}" não pode ser excluído pois possui ${contasAPagarCheck.rows[0].count} conta(s) a pagar associada(s).`,
        voltar_url: '/fornecedores'
      });
    }
    
    // Se passou por todas as verificações, excluir o fornecedor
    await pool.query('DELETE FROM fornecedores WHERE id = $1', [id]);
    
    console.log(`Fornecedor "${fornecedorNome}" (ID: ${id}) excluído com sucesso.`);
    res.redirect('/fornecedores');
    
  } catch (err) {
    console.error("Erro detalhado ao excluir fornecedor:", err);
    
    // Tratamento específico para diferentes tipos de erro
    let mensagemErro = 'Erro ao excluir fornecedor.';
    
    if (err.code === '23503') {
      mensagemErro = 'Este fornecedor está sendo usado em outras partes do sistema e não pode ser excluído.';
    } else if (err.code === '22P02') {
      mensagemErro = 'ID do fornecedor inválido.';
    }
    
    res.render('error', { 
      user: res.locals.user, 
      titulo: 'Erro ao Excluir', 
      mensagem: mensagemErro + ' Detalhes: ' + err.message,
      voltar_url: '/fornecedores'
    });
  }
});

module.exports = router;