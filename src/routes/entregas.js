// src/routes/entregas.js - VERSÃO CORRIGIDA COMPLETA
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET / - Página principal de entregas (SEMPRE mostra as entregas)
router.get('/', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Verificar se tabela warehouse_config existe e criar se necessário
        await inicializarTabelaWarehouse();
        
        // Buscar configuração do armazém (sem bloquear se não existir)
        let warehouse = await obterConfiguracaoWarehouse();
        
        // Buscar entregas do dia
        const entregasResult = await pool.query(`
            SELECT e.*, c.telefone, c.email
            FROM entregas e
            LEFT JOIN clientes c ON e.cliente_id = c.id
            WHERE e.data_entrega = $1
            ORDER BY COALESCE(e.ordem_entrega, 999), e.created_at
        `, [hoje]);

        const entregas = entregasResult.rows || [];
        
        // Buscar clientes para o formulário
        const clientesResult = await pool.query(`
            SELECT id, nome, endereco, cep 
            FROM clientes 
            WHERE endereco IS NOT NULL 
            ORDER BY nome
        `);

        // Calcular estatísticas básicas
        const stats = {
            total_entregas: entregas.length,
            entregues: entregas.filter(e => e.status === 'ENTREGUE').length,
            pendentes: entregas.filter(e => e.status === 'PENDENTE').length,
            valor_total: entregas.reduce((sum, e) => sum + parseFloat(e.valor_entrega || 0), 0),
            distancia_total_km: 'N/A',
            tempo_total_estimado_minutos: entregas.filter(e => e.status === 'PENDENTE').length * warehouse.tempo_entrega_minutos,
            tempo_total_estimado_horas: Math.round(entregas.filter(e => e.status === 'PENDENTE').length * warehouse.tempo_entrega_minutos / 60 * 10) / 10,
            horario_conclusao_estimado: calcularHorarioConclusao(entregas.filter(e => e.status === 'PENDENTE').length * warehouse.tempo_entrega_minutos),
            velocidade_media: warehouse.velocidade_media_kmh,
            tempo_por_entrega: warehouse.tempo_entrega_minutos
        };

        res.render('entregas', {
            user: res.locals.user,
            entregas: entregas,
            clientes: clientesResult.rows || [],
            stats: stats,
            warehouse: warehouse,
            dataFiltro: hoje
        });
    } catch (error) {
        console.error('Erro ao carregar entregas:', error);
        res.status(500).send('Erro ao carregar página de entregas: ' + error.message);
    }
});

// GET /config - Página de configuração do armazém
router.get('/config', async (req, res) => {
    try {
        await inicializarTabelaWarehouse();
        const warehouse = await obterConfiguracaoWarehouse();
        
        res.render('entregas-config', {
            user: res.locals.user,
            warehouse: warehouse
        });
    } catch (error) {
        console.error('Erro ao carregar config:', error);
        res.status(500).send('Erro ao carregar configuração');
    }
});

// POST /config - Salvar configuração do armazém
router.post('/config', async (req, res) => {
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

        // Geocodificar endereço do armazém
        const coords = await geocodificarEndereco(endereco);
        
        if (coords.error) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Erro de Geocodificação',
                mensagem: 'Não foi possível encontrar as coordenadas do endereço informado.',
                voltar_url: '/entregas/config'
            });
        }

        // Desativar configuração atual
        await pool.query('UPDATE warehouse_config SET is_active = false WHERE is_active = true');

        // Inserir nova configuração
        await pool.query(`
            INSERT INTO warehouse_config (
                nome, endereco, latitude, longitude,
                velocidade_media_kmh, tempo_entrega_minutos,
                horario_inicio, horario_fim, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
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

        console.log(`✅ Armazém configurado: ${endereco} (${coords.latitude}, ${coords.longitude})`);
        res.redirect('/entregas'); // SEMPRE volta para a página principal
    } catch (error) {
        console.error('Erro ao salvar config:', error);
        res.status(500).send('Erro ao salvar configuração: ' + error.message);
    }
});

// POST / - Criar nova entrega
router.post('/', async (req, res) => {
    try {
        const {
            data_entrega,
            cliente_id,
            cliente_nome,
            endereco_completo,
            valor_entrega,
            observacoes
        } = req.body;

        await pool.query(`
            INSERT INTO entregas (
                data_entrega, cliente_id, cliente_nome, 
                endereco_completo, valor_entrega, observacoes
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            data_entrega,
            cliente_id || null,
            cliente_nome,
            endereco_completo,
            parseFloat(valor_entrega) || 0,
            observacoes
        ]);

        console.log(`✅ Entrega criada: ${cliente_nome}`);
        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao criar entrega:', error);
        res.status(500).send('Erro ao criar entrega');
    }
});

// POST /otimizar-rota - Otimizar rota básica
router.post('/otimizar-rota', async (req, res) => {
    try {
        const { data_entrega } = req.body;
        
        // Buscar entregas pendentes
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

        // Atualizar ordem das entregas (simples por ordem de criação)
        for (let i = 0; i < entregas.rows.length; i++) {
            await pool.query(`
                UPDATE entregas 
                SET ordem_entrega = $1
                WHERE id = $2
            `, [i + 1, entregas.rows[i].id]);
        }

        res.json({ 
            success: true, 
            message: `Rota organizada: ${entregas.rows.length} entregas`,
            estatisticas: {
                total_entregas: entregas.rows.length,
                distancia_total_km: 'N/A',
                tempo_total_minutos: entregas.rows.length * 15, // 15 min por entrega
                tempo_total_horas: Math.round(entregas.rows.length * 15 / 60 * 10) / 10
            }
        });
    } catch (error) {
        console.error('Erro ao otimizar rota:', error);
        res.json({ success: false, message: 'Erro ao otimizar rota: ' + error.message });
    }
});

// POST /marcar-entregue/:id - Marcar entrega como realizada
router.post('/marcar-entregue/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const agora = new Date();

        await pool.query(`
            UPDATE entregas 
            SET status = 'ENTREGUE', hora_entrega = $1 
            WHERE id = $2
        `, [agora, id]);

        console.log(`✅ Entrega ID ${id} marcada como entregue às ${agora.toLocaleTimeString()}`);
        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao marcar entrega:', error);
        res.status(500).send('Erro ao marcar entrega');
    }
});

// DELETE /:id - Excluir entrega
router.post('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM entregas WHERE id = $1', [id]);
        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao excluir entrega:', error);
        res.status(500).send('Erro ao excluir entrega');
    }
});

// ===== FUNÇÕES AUXILIARES =====

// Calcular horário de conclusão estimado
function calcularHorarioConclusao(minutos) {
    if (minutos <= 0) return null;
    
    const agora = new Date();
    const conclusao = new Date(agora.getTime() + (minutos * 60000));
    return conclusao.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Inicializar tabela warehouse_config se não existir
async function inicializarTabelaWarehouse() {
    try {
        const checkTable = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'warehouse_config'
            )
        `);

        if (!checkTable.rows[0].exists) {
            console.log('📦 Criando tabela warehouse_config...');
            
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
                INSERT INTO warehouse_config (
                    nome, endereco, latitude, longitude, 
                    velocidade_media_kmh, tempo_entrega_minutos
                ) VALUES (
                    'OF Distribuidora - Sede', 
                    'Recife, PE, Brasil', 
                    -8.0476, 
                    -34.8770,
                    25,
                    8
                )
            `);

            console.log('✅ Tabela warehouse_config criada com configuração padrão');
        }
    } catch (error) {
        console.error('Erro ao inicializar warehouse_config:', error);
    }
}

// Obter configuração do armazém com fallback
async function obterConfiguracaoWarehouse() {
    try {
        const result = await pool.query(`
            SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1
        `);
        
        if (result.rows.length > 0) {
            return result.rows[0];
        }
    } catch (error) {
        console.error('Erro ao obter configuração warehouse:', error);
    }
    
    // Retornar configuração padrão
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
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'OF-Distribuidora-Sistema/1.0'
            }
        });
        
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

module.exports = router;