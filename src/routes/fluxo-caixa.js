const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Rota GET /fluxo-caixa - Lista lançamentos
router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  
  try {
    const { periodo, pesquisar, tipo } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    
    let dataInicio, dataFim;
    
    // IMPLEMENTAÇÃO CORRIGIDA DE TODOS OS PERÍODOS
    if (periodo === 'hoje') {
      dataInicio = dataFim = hoje;
      
    } else if (periodo === 'semana-atual') {
      const inicioSemana = new Date();
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
      dataInicio = inicioSemana.toISOString().split('T')[0];
      dataFim = hoje;
      
    } else if (periodo === 'mes-atual') {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      dataInicio = inicioMes.toISOString().split('T')[0];
      dataFim = hoje;
      
    } else if (periodo === 'mes-passado') {
      // NOVO: Implementação mês passado
      const hoje_date = new Date();
      const primeiroDiaMesPassado = new Date(hoje_date.getFullYear(), hoje_date.getMonth() - 1, 1);
      const ultimoDiaMesPassado = new Date(hoje_date.getFullYear(), hoje_date.getMonth(), 0);
      dataInicio = primeiroDiaMesPassado.toISOString().split('T')[0];
      dataFim = ultimoDiaMesPassado.toISOString().split('T')[0];
      
    } else if (periodo === 'ultimos-30') {
      // NOVO: Implementação últimos 30 dias
      const data30DiasAtras = new Date();
      data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
      dataInicio = data30DiasAtras.toISOString().split('T')[0];
      dataFim = hoje;
      
    } else if (periodo === 'ano-atual') {
      dataInicio = `${new Date().getFullYear()}-01-01`;
      dataFim = hoje;
      
    } else if (periodo === 'custom' && req.query.data_inicio && req.query.data_fim) {
      // FIX CRÍTICO: Mudou de 'personalizado' para 'custom'
      dataInicio = req.query.data_inicio;
      dataFim = req.query.data_fim;
      
      // VALIDAÇÃO: Garantir que data_inicio <= data_fim
      if (new Date(dataInicio) > new Date(dataFim)) {
        return res.render('error', {
          user: res.locals.user,
          titulo: 'Filtro Inválido',
          mensagem: 'A data inicial não pode ser maior que a data final.',
          voltar_url: '/fluxo-caixa'
        });
      }
      
    } else {
      // DEFAULT: Mês atual
      const inicioMes = new Date();
      inicioMes.setDate(1);
      dataInicio = inicioMes.toISOString().split('T')[0];
      dataFim = hoje;
    }

    const whereConditions = ['fc.data_operacao >= $1', 'fc.data_operacao <= $2'];
    const queryParams = [dataInicio, dataFim];
    let paramCount = 2;

    if (pesquisar) {
      paramCount++;
      whereConditions.push(`(fc.descricao ILIKE $${paramCount} OR cf.nome ILIKE $${paramCount})`);
      queryParams.push(`%${pesquisar}%`);
    }

    if (tipo) {
      paramCount++;
      whereConditions.push(`fc.tipo = $${paramCount}`);
      queryParams.push(tipo);
    }

    const lancamentosQuery = `
      SELECT fc.*, cf.nome as categoria_nome 
      FROM fluxo_caixa fc 
      LEFT JOIN categorias_financeiras cf ON fc.categoria_id = cf.id 
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY fc.data_operacao DESC, fc.created_at DESC 
      LIMIT 100
    `;
    
    const lancamentosResult = await pool.query(lancamentosQuery, queryParams);

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

    const receitasAbertasQuery = `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_receber 
      WHERE status = 'Pendente'
        AND data_vencimento >= $1 
        AND data_vencimento <= $2
    `;
    
    const receitasAbertasResult = await pool.query(receitasAbertasQuery, [dataInicio, dataFim]);

    const despesasAbertasQuery = `
      SELECT COALESCE(SUM(valor), 0) as total
      FROM contas_a_pagar 
      WHERE status = 'Pendente'
        AND data_vencimento >= $1 
        AND data_vencimento <= $2
    `;
    
    const despesasAbertasResult = await pool.query(despesasAbertasQuery, [dataInicio, dataFim]);

    const categoriasResult = await pool.query(`
      SELECT * FROM categorias_financeiras ORDER BY nome
    `);

    const totaisFluxo = totaisFluxoResult.rows[0] || { total_credito: 0, total_debito: 0 };
    const receitasAbertas = parseFloat(receitasAbertasResult.rows[0].total || 0);
    const despesasAbertas = parseFloat(despesasAbertasResult.rows[0].total || 0);
    const receitasRealizadas = parseFloat(totaisFluxo.total_credito || 0);
    const despesasRealizadas = parseFloat(totaisFluxo.total_debito || 0);
    
    const saldoTotal = (receitasRealizadas + receitasAbertas) - (despesasRealizadas + despesasAbertas);

    const metricas = {
      receitasAbertas,
      receitasRealizadas,
      despesasAbertas,
      despesasRealizadas,
      saldoTotal
    };
    
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
        
        if (!data_operacao || !tipo || !valor || !descricao || !categoria_id) {
            return res.status(400).send('Todos os campos obrigatórios devem ser preenchidos.');
        }

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

// NOVA ROTA: Exclusão em massa
router.post('/bulk-delete', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum lançamento selecionado.'
            });
        }

        if (ids.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 100 lançamentos por operação.'
            });
        }

        const resultados = {
            total: ids.length,
            excluidos: 0,
            bloqueados: 0,
            erros: 0,
            detalhes: []
        };

        for (const id of ids) {
            try {
                const checkContas = await pool.query(`
                    SELECT COUNT(*) as count 
                    FROM contas_a_receber 
                    WHERE fluxo_caixa_id = $1
                    UNION ALL
                    SELECT COUNT(*) as count 
                    FROM contas_a_pagar 
                    WHERE fluxo_caixa_id = $1
                `, [id]);
                
                const totalVinculado = checkContas.rows.reduce((total, row) => 
                    total + parseInt(row.count), 0
                );

                if (totalVinculado > 0) {
                    resultados.bloqueados++;
                    resultados.detalhes.push({
                        id,
                        status: 'bloqueado',
                        motivo: 'Lançamento vinculado a contas'
                    });
                    continue;
                }

                await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
                resultados.excluidos++;
                resultados.detalhes.push({
                    id,
                    status: 'excluido'
                });

            } catch (error) {
                resultados.erros++;
                resultados.detalhes.push({
                    id,
                    status: 'erro',
                    motivo: error.message
                });
            }
        }

        return res.json({
            success: true,
            resultados
        });

    } catch (err) {
        console.error("Erro na exclusão em massa:", err);
        return res.status(500).json({
            success: false,
            message: 'Erro ao processar exclusão em massa: ' + err.message
        });
    }
});

// Rota DELETE individual (mantida para compatibilidade)
router.post('/delete/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    try {
        const { id } = req.params;
        
        const checkContas = await pool.query(`
            SELECT COUNT(*) as count 
            FROM contas_a_receber 
            WHERE fluxo_caixa_id = $1
            UNION ALL
            SELECT COUNT(*) as count 
            FROM contas_a_pagar 
            WHERE fluxo_caixa_id = $1
        `, [id]);
        
        const totalVinculado = checkContas.rows.reduce((total, row) => 
            total + parseInt(row.count), 0
        );
        
        if (totalVinculado > 0) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Ação Bloqueada', 
                mensagem: `Este lançamento está vinculado a contas a receber/pagar.<br><br>
                          <strong>Use o botão "Estornar"</strong> ao lado do lançamento para reverter o pagamento e excluir o registro.`,
                voltar_url: '/fluxo-caixa'
            });
        }
        
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        res.redirect('/fluxo-caixa');
        
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento: ' + err.message);
    }
});

// Rota ESTORNAR (mantida)
router.post('/estornar/:id', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { id } = req.params;
        
        const lancamento = await pool.query('SELECT * FROM fluxo_caixa WHERE id = $1', [id]);
        
        if (!lancamento.rows[0]) {
            return res.render('error', { 
                user: res.locals.user, 
                titulo: 'Erro', 
                mensagem: 'Lançamento não encontrado.',
                voltar_url: '/fluxo-caixa'
            });
        }
        
        const contaReceber = await pool.query(`
            SELECT * FROM contas_a_receber WHERE fluxo_caixa_id = $1
        `, [id]);
        
        const contaPagar = await pool.query(`
            SELECT * FROM contas_a_pagar WHERE fluxo_caixa_id = $1
        `, [id]);
        
        if (contaReceber.rows.length > 0) {
            const conta = contaReceber.rows[0];
            await pool.query(`
                UPDATE contas_a_receber 
                SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL 
                WHERE id = $1
            `, [conta.id]);
        }
        
        if (contaPagar.rows.length > 0) {
            const conta = contaPagar.rows[0];
            await pool.query(`
                UPDATE contas_a_pagar 
                SET status = 'Pendente', data_pagamento = NULL, fluxo_caixa_id = NULL 
                WHERE id = $1
            `, [conta.id]);
        }
        
        await pool.query('DELETE FROM fluxo_caixa WHERE id = $1', [id]);
        
        res.redirect('/fluxo-caixa?success=estorno');
        
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