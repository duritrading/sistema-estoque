const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams } = require('../middleware/validation');
const { createLancamentoFluxoSchema } = require('../schemas/validation.schemas');
const Joi = require('joi');

// ========================================
// SCHEMAS DE VALIDAÇÃO
// ========================================

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const bulkDeleteSchema = Joi.object({
  ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(100)
    .required()
});

// ========================================
// HELPER: Preservar query params no redirect
// ========================================

function buildRedirectUrl(baseUrl, referer) {
  try {
    if (referer) {
      const url = new URL(referer);
      const queryString = url.search; // Pega ?param1=value1&param2=value2
      return baseUrl + queryString;
    }
  } catch (e) {
    // Se falhar parsing, retorna URL base
  }
  return baseUrl;
}

// ========================================
// GET / - Lista lançamentos com filtros
// ========================================

router.get('/', async (req, res) => {
  if (!pool) return res.status(500).send('Erro de configuração.');
  
  try {
    const { periodo, pesquisar, tipo, data_inicio, data_fim } = req.query;
    const hoje = new Date().toISOString().split('T')[0];
    let dataInicio, dataFim;

    // Lógica de filtros por período (mantida 100%)
    if (periodo === 'custom' && data_inicio && data_fim) {
      dataInicio = data_inicio;
      dataFim = data_fim;
    } else if (periodo === 'hoje') {
      dataInicio = hoje;
      dataFim = hoje;
    } else if (periodo === 'ontem') {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      dataInicio = ontem.toISOString().split('T')[0];
      dataFim = dataInicio;
    } else if (periodo === 'semana-atual') {
      const primeiroDia = new Date();
      primeiroDia.setDate(primeiroDia.getDate() - primeiroDia.getDay());
      dataInicio = primeiroDia.toISOString().split('T')[0];
      dataFim = hoje;
    } else if (periodo === 'mes-passado') {
      const inicioMesPassado = new Date();
      inicioMesPassado.setMonth(inicioMesPassado.getMonth() - 1);
      inicioMesPassado.setDate(1);
      dataInicio = inicioMesPassado.toISOString().split('T')[0];
      
      const fimMesPassado = new Date();
      fimMesPassado.setDate(0);
      dataFim = fimMesPassado.toISOString().split('T')[0];
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

// ========================================
// POST /lancamento - Criar novo lançamento
// ========================================

router.post('/lancamento', validateBody(createLancamentoFluxoSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        // Dados já validados e sanitizados pelo Joi
        const { data_operacao, tipo, valor, descricao, categoria_id } = req.body;

        await pool.query(`
            INSERT INTO fluxo_caixa (data_operacao, tipo, valor, descricao, categoria_id, status) 
            VALUES ($1, $2, $3, $4, $5, 'PAGO')
        `, [data_operacao, tipo, valor, descricao, categoria_id]);
        
        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/fluxo-caixa', req.get('Referer'));
        res.redirect(redirectUrl);
    } catch(err) {
        console.error("Erro ao criar lançamento:", err);
        
        if (err.code === '23503') {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Validação',
                mensagem: 'Categoria financeira não encontrada.',
                voltar_url: '/fluxo-caixa'
            });
        }
        
        res.status(500).send('Erro ao criar lançamento: ' + err.message);
    }
});

// ========================================
// POST /estornar/:id - Estornar lançamento
// ========================================

router.post('/estornar/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { id } = req.params; // Já validado
        
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
        
        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/fluxo-caixa?success=estorno', req.get('Referer'));
        res.redirect(redirectUrl);
        
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

// ========================================
// POST /delete/:id - Excluir lançamento
// ========================================

router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        const { id } = req.params; // Já validado
        
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
        
        // Preserva filtros no redirect
        const redirectUrl = buildRedirectUrl('/fluxo-caixa', req.get('Referer'));
        res.redirect(redirectUrl);
        
    } catch (err) {
        console.error("Erro ao excluir lançamento:", err);
        res.status(500).send('Erro ao excluir lançamento: ' + err.message);
    }
});

// ========================================
// POST /bulk-delete - Exclusão em massa
// ========================================

router.post('/bulk-delete', validateBody(bulkDeleteSchema), async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');
    
    try {
        // Dados já validados pelo Joi
        const { ids } = req.body;

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

module.exports = router;