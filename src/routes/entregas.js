// src/routes/entregas.js - REFATORADO
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateParams } = require('../middleware/validation');
const { idParamSchema, renderError } = require('../utils/helpers');
const asyncHandler = require('../middleware/asyncHandler');

const ROUTE = '/entregas';

// ========================================
// FUNÇÕES AUXILIARES (específicas de entregas)
// ========================================

// Calcular horário de conclusão estimado
function calcularHorarioConclusao(minutos) {
  if (minutos <= 0) return null;
  const conclusao = new Date(Date.now() + (minutos * 60000));
  return conclusao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Inicializar tabela warehouse_config se não existir
async function inicializarTabelaWarehouse() {
  try {
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'warehouse_config'
      )
    `);

    if (!checkTable.rows[0].exists) {
      await pool.query(`
        CREATE TABLE warehouse_config (
          id SERIAL PRIMARY KEY,
          nome VARCHAR(200) NOT NULL DEFAULT 'Armazém Principal',
          endereco TEXT NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          velocidade_media_kmh INTEGER DEFAULT 30,
          tempo_entrega_minutos INTEGER DEFAULT 5,
          horario_inicio TIME DEFAULT '08:00',
          horario_fim TIME DEFAULT '18:00',
          is_active BOOLEAN DEFAULT true,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO warehouse_config (nome, endereco, latitude, longitude, velocidade_media_kmh, tempo_entrega_minutos)
        VALUES ('OF Distribuidora - Sede', 'Recife, PE, Brasil', -8.0476, -34.8770, 25, 8)
      `);
    }
  } catch (error) {
    console.error('Erro ao inicializar warehouse_config:', error);
  }
}

// Obter configuração do armazém com fallback
async function obterConfiguracaoWarehouse() {
  try {
    const result = await pool.query('SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1');
    if (result.rows.length > 0) return result.rows[0];
  } catch (error) {
    console.error('Erro ao obter configuração warehouse:', error);
  }
  
  return {
    id: null,
    nome: 'OF Distribuidora - Sede',
    endereco: 'Recife, PE, Brasil',
    latitude: -8.0476,
    longitude: -34.8770,
    velocidade_media_kmh: 25,
    tempo_entrega_minutos: 8,
    horario_inicio: '08:00',
    horario_fim: '18:00',
    is_active: true
  };
}

// Geocodificar endereço usando API externa
async function geocodificarEndereco(endereco) {
  try {
    const enderecoCompleto = endereco.includes('Brasil') ? endereco : `${endereco}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(enderecoCompleto)}&limit=1&countrycodes=br`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'OF-Distribuidora-Sistema/1.0' } });
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        endereco_formatado: data[0].display_name
      };
    }
    return { error: 'Endereço não encontrado' };
  } catch (error) {
    console.error('Erro na geocodificação:', error);
    return { error: 'Erro ao buscar coordenadas' };
  }
}

// ========================================
// ROTAS
// ========================================

// GET / - Página principal de entregas
router.get('/', asyncHandler(async (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  
  await inicializarTabelaWarehouse();
  const warehouse = await obterConfiguracaoWarehouse();
  
  const [entregasResult, clientesResult] = await Promise.all([
    pool.query(`
      SELECT e.*, c.telefone, c.email
      FROM entregas e
      LEFT JOIN clientes c ON e.cliente_id = c.id
      WHERE e.data_entrega = $1
      ORDER BY COALESCE(e.ordem_entrega, 999), e.created_at
    `, [hoje]),
    pool.query('SELECT id, nome, endereco, cep FROM clientes WHERE endereco IS NOT NULL ORDER BY nome')
  ]);

  const entregas = entregasResult.rows;
  const pendentes = entregas.filter(e => e.status === 'PENDENTE');
  
  const stats = {
    total_entregas: entregas.length,
    entregues: entregas.filter(e => e.status === 'ENTREGUE').length,
    pendentes: pendentes.length,
    valor_total: entregas.reduce((sum, e) => sum + parseFloat(e.valor_entrega || 0), 0),
    distancia_total_km: 'N/A',
    tempo_total_estimado_minutos: pendentes.length * warehouse.tempo_entrega_minutos,
    tempo_total_estimado_horas: Math.round(pendentes.length * warehouse.tempo_entrega_minutos / 60 * 10) / 10,
    horario_conclusao_estimado: calcularHorarioConclusao(pendentes.length * warehouse.tempo_entrega_minutos),
    velocidade_media: warehouse.velocidade_media_kmh,
    tempo_por_entrega: warehouse.tempo_entrega_minutos
  };

  res.render('entregas', {
    user: res.locals.user,
    entregas,
    clientes: clientesResult.rows,
    stats,
    warehouse,
    dataFiltro: hoje
  });
}, ROUTE));

// GET /config - Página de configuração do armazém
router.get('/config', asyncHandler(async (req, res) => {
  await inicializarTabelaWarehouse();
  const warehouse = await obterConfiguracaoWarehouse();
  res.render('entregas-config', { user: res.locals.user, warehouse });
}, ROUTE));

// POST /config - Salvar configuração do armazém
router.post('/config', asyncHandler(async (req, res) => {
  await inicializarTabelaWarehouse();
  
  const { nome, endereco, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim } = req.body;
  
  const coords = await geocodificarEndereco(endereco);
  
  if (coords.error) {
    return renderError(res, {
      titulo: 'Erro de Geocodificação',
      mensagem: 'Não foi possível encontrar as coordenadas do endereço informado.',
      voltar_url: '/entregas/config'
    });
  }

  await pool.query('UPDATE warehouse_config SET is_active = false WHERE is_active = true');

  await pool.query(`
    INSERT INTO warehouse_config (nome, endereco, latitude, longitude, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
  `, [
    nome,
    endereco,
    coords.latitude,
    coords.longitude,
    parseInt(velocidade_media_kmh) || 25,
    parseInt(tempo_entrega_minutos) || 8,
    horario_inicio || '08:00',
    horario_fim || '18:00'
  ]);

  res.redirect(ROUTE);
}, ROUTE));

// POST / - Criar nova entrega
router.post('/', asyncHandler(async (req, res) => {
  const { data_entrega, cliente_id, cliente_nome, endereco_completo, valor_entrega, observacoes } = req.body;

  await pool.query(`
    INSERT INTO entregas (data_entrega, cliente_id, cliente_nome, endereco_completo, valor_entrega, observacoes)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [data_entrega, cliente_id || null, cliente_nome, endereco_completo, parseFloat(valor_entrega) || 0, observacoes]);

  res.redirect(ROUTE);
}, ROUTE));

// POST /otimizar-rota - Otimizar rota básica
router.post('/otimizar-rota', asyncHandler(async (req, res) => {
  const { data_entrega } = req.body;
  
  const entregas = await pool.query(`
    SELECT id, endereco_completo, cliente_nome
    FROM entregas WHERE data_entrega = $1 AND status = 'PENDENTE'
    ORDER BY created_at
  `, [data_entrega]);

  if (entregas.rows.length === 0) {
    return res.json({ success: false, message: 'Nenhuma entrega pendente encontrada' });
  }

  for (let i = 0; i < entregas.rows.length; i++) {
    await pool.query('UPDATE entregas SET ordem_entrega = $1 WHERE id = $2', [i + 1, entregas.rows[i].id]);
  }

  res.json({
    success: true,
    message: `Rota organizada: ${entregas.rows.length} entregas`,
    estatisticas: {
      total_entregas: entregas.rows.length,
      distancia_total_km: 'N/A',
      tempo_total_minutos: entregas.rows.length * 15,
      tempo_total_horas: Math.round(entregas.rows.length * 15 / 60 * 10) / 10
    }
  });
}, ROUTE));

// POST /marcar-entregue/:id - Marcar entrega como realizada
router.post('/marcar-entregue/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  const agora = new Date();
  await pool.query('UPDATE entregas SET status = $1, hora_entrega = $2 WHERE id = $3', ['ENTREGUE', agora, req.params.id]);
  res.redirect(ROUTE);
}, ROUTE));

// POST /delete/:id - Excluir entrega
router.post('/delete/:id', validateParams(idParamSchema), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM entregas WHERE id = $1', [req.params.id]);
  res.redirect(ROUTE);
}, ROUTE));

module.exports = router;