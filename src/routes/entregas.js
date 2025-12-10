// ========================================
// ENTREGAS - COM VALIDAÇÃO JOI
// ========================================

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { validateBody, validateParams, validateQuery } = require('../middleware/validation');
const Joi = require('joi');

// ========================================
// SCHEMAS DE VALIDAÇÃO
// ========================================

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
    .messages({
      'number.base': 'ID deve ser um número',
      'number.positive': 'ID deve ser positivo',
      'any.required': 'ID é obrigatório'
    })
});

const criarEntregaSchema = Joi.object({
  cliente_nome: Joi.string()
    .max(200)
    .required()
    .trim()
    .messages({
      'any.required': 'Nome do cliente é obrigatório',
      'string.max': 'Nome muito longo (máx 200 caracteres)'
    }),
  endereco_completo: Joi.string()
    .max(500)
    .required()
    .trim()
    .messages({
      'any.required': 'Endereço é obrigatório',
      'string.max': 'Endereço muito longo (máx 500 caracteres)'
    }),
  telefone: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  data_entrega: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Data de entrega é obrigatória',
      'date.base': 'Data de entrega inválida'
    }),
  observacao: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .trim(),
  _csrf: Joi.string().optional()
});

const configWarehouseSchema = Joi.object({
  nome: Joi.string()
    .max(200)
    .required()
    .trim()
    .messages({
      'any.required': 'Nome do armazém é obrigatório'
    }),
  endereco: Joi.string()
    .max(500)
    .required()
    .trim()
    .messages({
      'any.required': 'Endereço do armazém é obrigatório'
    }),
  velocidade_media_kmh: Joi.number()
    .integer()
    .min(10)
    .max(120)
    .default(40)
    .messages({
      'number.min': 'Velocidade mínima: 10 km/h',
      'number.max': 'Velocidade máxima: 120 km/h'
    }),
  tempo_entrega_minutos: Joi.number()
    .integer()
    .min(1)
    .max(120)
    .default(15)
    .messages({
      'number.min': 'Tempo mínimo: 1 minuto',
      'number.max': 'Tempo máximo: 120 minutos'
    }),
  horario_inicio: Joi.string()
    .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .default('08:00')
    .messages({
      'string.pattern.base': 'Horário de início inválido (formato HH:MM)'
    }),
  horario_fim: Joi.string()
    .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .default('18:00')
    .messages({
      'string.pattern.base': 'Horário de fim inválido (formato HH:MM)'
    }),
  _csrf: Joi.string().optional()
});

const otimizarRotaSchema = Joi.object({
  data_entrega: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Data de entrega é obrigatória'
    }),
  _csrf: Joi.string().optional()
});

const filtroDataSchema = Joi.object({
  data: Joi.date()
    .iso()
    .optional()
});

// ========================================
// HELPERS
// ========================================

async function inicializarTabelaWarehouse() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouse_config (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(200) DEFAULT 'Armazém Principal',
        endereco VARCHAR(500),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        velocidade_media_kmh INTEGER DEFAULT 40,
        tempo_entrega_minutos INTEGER DEFAULT 15,
        horario_inicio TIME DEFAULT '08:00',
        horario_fim TIME DEFAULT '18:00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Erro ao criar tabela warehouse_config:', err.message);
  }
}

async function obterConfiguracaoWarehouse() {
  try {
    const result = await pool.query('SELECT * FROM warehouse_config ORDER BY id DESC LIMIT 1');
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return {
      nome: 'Armazém Principal',
      endereco: '',
      velocidade_media_kmh: 40,
      tempo_entrega_minutos: 15,
      horario_inicio: '08:00',
      horario_fim: '18:00'
    };
  } catch (err) {
    console.error('Erro ao obter config warehouse:', err.message);
    return {
      nome: 'Armazém Principal',
      endereco: '',
      velocidade_media_kmh: 40,
      tempo_entrega_minutos: 15,
      horario_inicio: '08:00',
      horario_fim: '18:00'
    };
  }
}

async function geocodificarEndereco(endereco) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SistemaEstoque/1.0' }
    });
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }
    return { error: 'Endereço não encontrado' };
  } catch (err) {
    console.error('Erro ao geocodificar:', err.message);
    return { error: 'Erro na geocodificação' };
  }
}

function calcularHorarioConclusao(warehouse, totalEntregas) {
  const [hora, minuto] = warehouse.horario_inicio.split(':').map(Number);
  const tempoTotal = totalEntregas * (warehouse.tempo_entrega_minutos || 15);
  const horaFim = hora + Math.floor((minuto + tempoTotal) / 60);
  const minutoFim = (minuto + tempoTotal) % 60;
  return `${String(horaFim).padStart(2, '0')}:${String(minutoFim).padStart(2, '0')}`;
}

// ========================================
// GET / - Lista entregas do dia
// ========================================

router.get('/', validateQuery(filtroDataSchema), async (req, res) => {
  try {
    await inicializarTabelaWarehouse();
    const warehouse = await obterConfiguracaoWarehouse();

    const dataFiltro = req.query.data || new Date().toISOString().split('T')[0];

    const entregasResult = await pool.query(`
      SELECT * FROM entregas 
      WHERE data_entrega = $1 
      ORDER BY ordem_entrega ASC, created_at ASC
    `, [dataFiltro]);

    const entregas = entregasResult.rows;
    const pendentes = entregas.filter(e => e.status === 'PENDENTE');
    const entregues = entregas.filter(e => e.status === 'ENTREGUE');

    const tempoEstimado = pendentes.length * (warehouse.tempo_entrega_minutos || 15);
    const horarioConclusao = calcularHorarioConclusao(warehouse, pendentes.length);

    res.render('entregas', {
      user: res.locals.user,
      entregas,
      dataFiltro,
      warehouse,
      estatisticas: {
        total: entregas.length,
        pendentes: pendentes.length,
        entregues: entregues.length,
        tempoEstimado,
        horarioConclusao
      }
    });

  } catch (error) {
    console.error('Erro ao carregar entregas:', error);
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao carregar página de entregas.',
      voltarUrl: '/'
    });
  }
});

// ========================================
// GET /config - Configuração do armazém
// ========================================

router.get('/config', async (req, res) => {
  try {
    await inicializarTabelaWarehouse();
    const warehouse = await obterConfiguracaoWarehouse();

    res.render('entregas-config', {
      user: res.locals.user,
      warehouse
    });

  } catch (error) {
    console.error('Erro ao carregar config:', error);
    res.status(500).render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao carregar configuração.',
      voltarUrl: '/entregas'
    });
  }
});

// ========================================
// POST /config - Salvar configuração
// ========================================

router.post('/config', validateBody(configWarehouseSchema), async (req, res) => {
  try {
    await inicializarTabelaWarehouse();

    const {
      nome,
      endereco,
      velocidade_media_kmh,
      tempo_entrega_minutos,
      horario_inicio,
      horario_fim
    } = req.body;

    // Geocodificar endereço
    const coords = await geocodificarEndereco(endereco);

    if (coords.error) {
      return res.render('error', {
        user: res.locals.user,
        titulo: 'Erro de Geocodificação',
        mensagem: 'Não foi possível encontrar as coordenadas do endereço informado.',
        voltarUrl: '/entregas/config'
      });
    }

    // Verificar se já existe config
    const existing = await pool.query('SELECT id FROM warehouse_config LIMIT 1');

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE warehouse_config SET
          nome = $1,
          endereco = $2,
          latitude = $3,
          longitude = $4,
          velocidade_media_kmh = $5,
          tempo_entrega_minutos = $6,
          horario_inicio = $7,
          horario_fim = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [nome, endereco, coords.latitude, coords.longitude, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim, existing.rows[0].id]);
    } else {
      await pool.query(`
        INSERT INTO warehouse_config (nome, endereco, latitude, longitude, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [nome, endereco, coords.latitude, coords.longitude, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim]);
    }

    console.log(`✅ Configuração do armazém atualizada: ${nome}`);
    res.redirect('/entregas');

  } catch (error) {
    console.error('Erro ao salvar config:', error);
    res.render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao salvar configuração: ' + error.message,
      voltarUrl: '/entregas/config'
    });
  }
});

// ========================================
// POST / - Criar entrega
// ========================================

router.post('/', validateBody(criarEntregaSchema), async (req, res) => {
  try {
    const { cliente_nome, endereco_completo, telefone, data_entrega, observacao } = req.body;

    // Geocodificar endereço da entrega
    const coords = await geocodificarEndereco(endereco_completo);

    await pool.query(`
      INSERT INTO entregas (cliente_nome, endereco_completo, telefone, data_entrega, observacao, latitude, longitude, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDENTE')
    `, [
      cliente_nome,
      endereco_completo,
      telefone || null,
      data_entrega,
      observacao || null,
      coords.latitude || null,
      coords.longitude || null
    ]);

    console.log(`✅ Entrega criada: ${cliente_nome} - ${data_entrega}`);
    res.redirect('/entregas?data=' + data_entrega);

  } catch (error) {
    console.error('Erro ao criar entrega:', error);
    res.render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao criar entrega: ' + error.message,
      voltarUrl: '/entregas'
    });
  }
});

// ========================================
// POST /otimizar-rota - Ordenar entregas
// ========================================

router.post('/otimizar-rota', validateBody(otimizarRotaSchema), async (req, res) => {
  try {
    const { data_entrega } = req.body;

    const entregas = await pool.query(`
      SELECT id, endereco_completo, cliente_nome
      FROM entregas 
      WHERE data_entrega = $1 AND status = 'PENDENTE'
      ORDER BY created_at
    `, [data_entrega]);

    if (entregas.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Nenhuma entrega pendente encontrada'
      });
    }

    // Atualizar ordem das entregas
    for (let i = 0; i < entregas.rows.length; i++) {
      await pool.query(`
        UPDATE entregas SET ordem_entrega = $1 WHERE id = $2
      `, [i + 1, entregas.rows[i].id]);
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

  } catch (error) {
    console.error('Erro ao otimizar rota:', error);
    res.json({
      success: false,
      message: 'Erro ao otimizar rota: ' + error.message
    });
  }
});

// ========================================
// POST /marcar-entregue/:id - Marcar como entregue
// ========================================

router.post('/marcar-entregue/:id', validateParams(idParamSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const agora = new Date();

    const result = await pool.query(`
      UPDATE entregas 
      SET status = 'ENTREGUE', hora_entrega = $1
      WHERE id = $2
      RETURNING data_entrega
    `, [agora, id]);

    if (result.rows.length === 0) {
      return res.status(404).render('error', {
        user: res.locals.user,
        titulo: 'Erro',
        mensagem: 'Entrega não encontrada.',
        voltarUrl: '/entregas'
      });
    }

    console.log(`✅ Entrega ID ${id} marcada como entregue`);
    res.redirect('/entregas?data=' + result.rows[0].data_entrega.toISOString().split('T')[0]);

  } catch (error) {
    console.error('Erro ao marcar entregue:', error);
    res.render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao marcar entrega: ' + error.message,
      voltarUrl: '/entregas'
    });
  }
});

// ========================================
// POST /delete/:id - Excluir entrega
// ========================================

router.post('/delete/:id', validateParams(idParamSchema), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM entregas WHERE id = $1 RETURNING data_entrega
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).render('error', {
        user: res.locals.user,
        titulo: 'Erro',
        mensagem: 'Entrega não encontrada.',
        voltarUrl: '/entregas'
      });
    }

    console.log(`✅ Entrega ID ${id} excluída`);
    res.redirect('/entregas?data=' + result.rows[0].data_entrega.toISOString().split('T')[0]);

  } catch (error) {
    console.error('Erro ao excluir entrega:', error);
    res.render('error', {
      user: res.locals.user,
      titulo: 'Erro',
      mensagem: 'Erro ao excluir entrega: ' + error.message,
      voltarUrl: '/entregas'
    });
  }
});

module.exports = router;