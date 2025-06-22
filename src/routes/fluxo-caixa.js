const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Mostra a página com filtros funcionais
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    // Capturar parâmetros de filtros da URL
    const { periodo, pesquisar, tipo, data_inicio, data_fim } = req.query;
    
    // Definir período baseado no filtro
    let dataInicio, dataFim;
    const agora = new Date();
    
    switch (periodo) {
      case 'mes-atual':
        dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().split('T')[0];
        dataFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().split('T')[0];
        break;
      case 'mes-passado':
        dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString().split('T')[0];
        dataFim = new Date(agora.getFullYear(), agora.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'ultimos-30':
        dataFim = hoje;
        dataInicio = new Date(agora.setDate(agora.getDate() - 30)).toISOString().split('T')[0];
        break;
      case 'custom':
        dataInicio = data_inicio || hoje;
        dataFim = data_fim || hoje;
        break;
      default:
        // Padrão: mês atual
        dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().split('T')[0];
        dataFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().split('T')[0];
    }
    
    // Construir WHERE clause para lançamentos
    let whereConditions = ['fc.data_operacao >= $1', 'fc.data_operacao <= $2'];
    let queryParams = [dataInicio, dataFim];
    let paramCount = 2;
    
    // Filtro por tipo
    if (tipo && (tipo === 'CREDITO' || tipo === 'DEBITO')) {
      paramCount++;
      whereConditions.push(`fc.tipo = $${paramCount}`);
      queryParams.push(tipo);
    }
    
    // Filtro por pesquisa
    if (pesquisar && pesquisar.trim()) {
      paramCount++;
      whereConditions.push(`(LOWER(fc.descricao) LIKE $${paramCount} OR LOWER(cf.nome) LIKE $${paramCount})`);
      queryParams.push(`%${pesquisar.toLowerCase()}%`);
    }
    
    // Buscar lançamentos do fluxo de caixa com filtros
    const lancamentosQuery = `
      SELECT fc.*, cf.nome as categoria_nome 
      FROM fluxo_caixa fc 
      LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id 
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY fc.data_operacao DESC, fc.created_at DESC 
      LIMIT 100
    `;
    
    const lancamentosResult = await pool.query(lancamentosQuery, queryParams);

    // Calcular totais do fluxo de caixa (realizados) com filtros de período
    const totaisFluxoQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END), 0) as total_credito,
        COALESCE(SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END), 0) as total_debito
      FROM fluxo_caixa 
      WHERE status = 'PAGO' 
        AND data_operacao >= $1 
        AND data_operacao <= $2
    `;
    
    const totaisFluxoResult = await pool.query(totaisFluxoQuery, [dataInicio, dataFim]);

    // Calcular receitas em aberto (contas a receber pendentes) no período
    const receitasAbertasQuery = `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_receber 
      WHERE status = 'Pendente'
        AND data_vencimento >= $1 
        AND data_vencimento <= $2
    `;
    
    const receitasAbertasResult = await pool.query(receitasAbertasQuery, [dataInicio, dataFim]);

    // Calcular despesas em aberto (contas a pagar pendentes) no período
    const despesasAbertasQuery = `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_pagar 
      WHERE status = 'Pendente'
        AND data_vencimento >= $1 
        AND data_vencimento <= $2
    `;
    
    const despesasAbertasResult = await pool.query(despesasAbertasQuery, [dataInicio, dataFim]);

    // Buscar categorias para o formulário
    const categoriasResult = await pool.query(`
      SELECT * FROM categorias_financeiras ORDER BY nome
    `);

    // Preparar dados para a view
    const totaisFluxo = totaisFluxoResult.rows[0] || { total_credito: 0, total_debito: 0 };
    const receitasAbertas = parseFloat(receitasAbertasResult.rows[0].total || 0);
    const despesasAbertas = parseFloat(despesasAbertasResult.rows[0].total || 0);
    const receitasRealizadas = parseFloat(totaisFluxo.total_credito || 0);
    const despesasRealizadas = parseFloat(totaisFluxo.total_debito || 0);
    
    // Calcular saldo total (realizadas + abertas)
    const saldoTotal = (receitasRealizadas + receitasAbertas) - (despesasRealizadas + despesasAbertas);

    const metricas = {
      receitasAbertas,
      receitasRealizadas,
      despesasAbertas,
      despesasRealizadas,
      saldoTotal
    };
    
    // Preparar filtros para a view
    const filtros = {
      periodo: periodo || 'mes-atual',
      pesquisar: pesquisar || '',
      tipo: tipo || '',
      data_inicio: dataInicio,
      data_fim: dataFim
    };

    res.render('fluxo-caixa', {
      user: res.locals.user,
      lancamentos: lancamentosResult.rows || [],
      totais: totaisFluxo,
      saldoAtual: saldoTotal,
      metricas: metricas,
      hoje,
      categorias: categoriasResult.rows || [],
      filtros: filtros
    });

  } catch (error) {
    console.error("Erro ao carregar fluxo de caixa:", error);
    res.status(500).send('Erro ao carregar a página de fluxo de caixa: ' + error.message);
  }
});

// Rota POST /fluxo-caixa/lancamento - Cria um novo lançamento
router.post('/lancamento', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { data_operacao, tipo, valor, descricao, categoria_id } = req.body;
        
        // Validação básica
        if (!data_operacao || !tipo || !valor || !descricao || !categoria_id) {
            return res.status(400).send('Todos os campos obrigatórios devem ser preenchidos.');
        }

        // Inserir lançamento
        await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
            VALUES ($1, $2, $3, $4, $5, 'PAGO')
        `, [data_operacao, tipo, parseFloat(valor), descricao, categoria_id]);
        
        res.redirect('/fluxo-caixa');
    } catch(err) {
        console.error("Erro ao criar lançamento:", err);
        res.status(500).send('Erro ao criar lançamento: ' + err.message);
    }
});

// ROTA DELETE ATUALIZADA - com mensagem melhor para lançamentos vinculados
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;
        
        // Verificar se o lançamento está vinculado a alguma conta
        const checkContas = await pool.query(`
            SELECT COUNT(*) as count 
            FROM contas_a_receber 
            WHERE fluxo_caixa_id = $1
            UNION ALL
            SELECT COUNT(*) as count 
            FROM contas_a_pagar 
            WHERE fluxo_caixa_id = $1
        `, [id]);
        
        const totalVinculado = checkContas.rows.reduce((total, row) => total + parseInt(row.count), 0);
        
        if (totalVinculado > 0) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: `Este lançamento está vinculado a contas a receber/pagar. 
                          <br><br>
                          <strong>Use o botão "Estornar"</strong> ao lado do lançamento para reverter o pagamento e excluir o registro.`,
                voltar_url: '/fluxo-caixa'
            });
        }
        
        // Excluir o lançamento (se não estiver vinculado)
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        res.redirect('/fluxo-caixa');
        
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento: ' + err.message);
    }
});

// NOVA ROTA: Estornar lançamento vinculado
router.post('/estornar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { id } = req.params;
        
        // Buscar o lançamento
        const lancamento = await pool.query('SELECT * FROM fluxo_caixa WHERE id = $1', [id]);
        
        if (!lancamento.rows[0]) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Lançamento não encontrado.',
                voltar_url: '/fluxo-caixa'
            });
        }
        
        const dadosLancamento = lancamento.rows[0];
        
        // Verificar se está vinculado a conta a receber
        const contaReceber = await pool.query(`
            SELECT * FROM contas_a_receber WHERE fluxo_caixa_id = $1
        `, [id]);
        
        // Verificar se está vinculado a conta a pagar  
        const contaPagar = await pool.query(`
            SELECT * FROM contas_a_pagar WHERE fluxo_caixa_id = $1
        `, [id]);
        
        // ESTORNAR CONTA A RECEBER
        if (contaReceber.rows.length > 0) {
            const conta = contaReceber.rows[0];
            
            // 1. Atualizar conta a receber para pendente
            await pool.query(`
                UPDATE contas_a_receber 
                SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL 
                WHERE id = $1
            `, [conta.id]);
            
            console.log(`✅ Conta a receber ID ${conta.id} estornada para pendente`);
        }
        
        // ESTORNAR CONTA A PAGAR
        if (contaPagar.rows.length > 0) {
            const conta = contaPagar.rows[0];
            
            // 1. Atualizar conta a pagar para pendente
            await pool.query(`
                UPDATE contas_a_pagar 
                SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL 
                WHERE id = $1
            `, [conta.id]);
            
            console.log(`✅ Conta a pagar ID ${conta.id} estornada para pendente`);
        }
        
        // 2. Excluir o lançamento do fluxo de caixa
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        
        console.log(`✅ Lançamento do fluxo de caixa ID ${id} excluído`);
        
        res.redirect('/fluxo-caixa?success=' + encodeURIComponent('Lançamento estornado com sucesso!'));
        
    } catch (err) {
        console.error("Erro ao estornar lançamento:", err);
        res.render('error', { 
            user: res.locals.user, 
            titulo: 'Erro', 
            mensagem: 'Erro ao estornar lançamento: ' + err.message,
            voltar_url: '/fluxo-caixa'
        });
    }
});

module.exports = router;