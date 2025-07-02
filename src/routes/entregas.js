// src/routes/entregas.js - VERSÃO COMPLETA ATUALIZADA
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET / - Página principal de entregas com cálculos em tempo real
router.get('/', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Buscar configuração do armazém
        const warehouseResult = await pool.query(`
            SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1
        `);
        
        if (!warehouseResult.rows.length) {
            return res.render('error', {
                user: res.locals.user,
                titulo: 'Configuração Necessária',
                mensagem: 'Configure primeiro a localização do armazém em /entregas/config'
            });
        }
        
        const warehouse = warehouseResult.rows[0];
        
        // Buscar entregas do dia com cálculos
        const entregasResult = await pool.query(`
            SELECT e.*, c.telefone, c.email,
                   CASE 
                       WHEN e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
                           ROUND(
                               (6371 * acos(
                                   cos(radians($2)) * cos(radians(e.latitude)) * 
                                   cos(radians(e.longitude) - radians($3)) + 
                                   sin(radians($2)) * sin(radians(e.latitude))
                               ))::numeric, 2
                           )
                       ELSE NULL
                   END as distancia_km_calculada
            FROM entregas e
            LEFT JOIN clientes c ON e.cliente_id = c.id
            WHERE e.data_entrega = $1
            ORDER BY COALESCE(e.ordem_entrega, 999), e.created_at
        `, [hoje, warehouse.latitude, warehouse.longitude]);

        // Calcular estatísticas avançadas
        const entregas = entregasResult.rows || [];
        const stats = calcularEstatisticasCompletas(entregas, warehouse);

        // Buscar clientes para o formulário
        const clientesResult = await pool.query(`
            SELECT id, nome, endereco, cep 
            FROM clientes 
            WHERE endereco IS NOT NULL 
            ORDER BY nome
        `);

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
        res.status(500).send('Erro ao carregar página de entregas');
    }
});

// GET /config - Página de configuração do armazém
router.get('/config', async (req, res) => {
    try {
        const warehouseResult = await pool.query(`
            SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1
        `);
        
        res.render('entregas-config', {
            user: res.locals.user,
            warehouse: warehouseResult.rows[0] || null
        });
    } catch (error) {
        console.error('Erro ao carregar config:', error);
        res.status(500).send('Erro ao carregar configuração');
    }
});

// POST /config - Salvar configuração do armazém
router.post('/config', async (req, res) => {
    try {
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
        await pool.query('UPDATE warehouse_config SET is_active = false');

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
        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao salvar config:', error);
        res.status(500).send('Erro ao salvar configuração');
    }
});

// POST / - Criar nova entrega com geocodificação automática
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

        // Geocodificar endereço da entrega
        const coords = await geocodificarEndereco(endereco_completo);
        
        // Buscar configuração do armazém para calcular distância
        const warehouse = await pool.query(`
            SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1
        `);

        let distancia_km = null;
        let tempo_estimado = null;

        if (!coords.error && warehouse.rows.length > 0) {
            const w = warehouse.rows[0];
            distancia_km = calcularDistancia(
                w.latitude, w.longitude,
                coords.latitude, coords.longitude
            );
            tempo_estimado = Math.round(
                (distancia_km / w.velocidade_media_kmh * 60) + w.tempo_entrega_minutos
            );
        }

        await pool.query(`
            INSERT INTO entregas (
                data_entrega, cliente_id, cliente_nome, 
                endereco_completo, valor_entrega, observacoes,
                latitude, longitude, distancia_km, tempo_estimado_minutos
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            data_entrega,
            cliente_id || null,
            cliente_nome,
            endereco_completo,
            parseFloat(valor_entrega) || 0,
            observacoes,
            coords.latitude || null,
            coords.longitude || null,
            distancia_km,
            tempo_estimado
        ]);

        console.log(`✅ Entrega criada: ${cliente_nome} - ${distancia_km}km - ${tempo_estimado}min`);
        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao criar entrega:', error);
        res.status(500).send('Erro ao criar entrega');
    }
});

// POST /otimizar-rota - Otimizar rota com base no armazém real
router.post('/otimizar-rota', async (req, res) => {
    try {
        const { data_entrega } = req.body;
        
        // Buscar configuração do armazém
        const warehouseResult = await pool.query(`
            SELECT * FROM warehouse_config WHERE is_active = true LIMIT 1
        `);
        
        if (!warehouseResult.rows.length) {
            return res.json({ 
                success: false, 
                message: 'Configure primeiro a localização do armazém' 
            });
        }
        
        const warehouse = warehouseResult.rows[0];
        
        // Buscar entregas pendentes
        const entregas = await pool.query(`
            SELECT id, endereco_completo, latitude, longitude,
                   cliente_nome, valor_entrega
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

        // Otimizar rota usando coordenadas reais do armazém
        const rotaOtimizada = await otimizarRotaAvancada(
            entregas.rows, 
            warehouse
        );

        // Atualizar ordem das entregas e recalcular tempos
        let tempoTotal = 0;
        let distanciaTotal = 0;
        let pontoAtual = { latitude: warehouse.latitude, longitude: warehouse.longitude };

        for (let i = 0; i < rotaOtimizada.length; i++) {
            const entrega = rotaOtimizada[i];
            
            // Calcular distância do ponto atual até esta entrega
            const distancia = calcularDistancia(
                pontoAtual.latitude, pontoAtual.longitude,
                entrega.latitude, entrega.longitude
            );
            
            // Tempo = deslocamento + tempo de entrega
            const tempoDeslocamento = (distancia / warehouse.velocidade_media_kmh) * 60;
            const tempoEntrega = tempoDeslocamento + warehouse.tempo_entrega_minutos;
            
            tempoTotal += tempoEntrega;
            distanciaTotal += distancia;
            
            await pool.query(`
                UPDATE entregas 
                SET ordem_entrega = $1, 
                    distancia_km = $2,
                    tempo_estimado_minutos = $3
                WHERE id = $4
            `, [i + 1, distancia.toFixed(2), Math.round(tempoEntrega), entrega.id]);
            
            pontoAtual = { latitude: entrega.latitude, longitude: entrega.longitude };
        }

        res.json({ 
            success: true, 
            message: `Rota otimizada: ${rotaOtimizada.length} entregas`,
            estatisticas: {
                total_entregas: rotaOtimizada.length,
                distancia_total_km: distanciaTotal.toFixed(2),
                tempo_total_minutos: Math.round(tempoTotal),
                tempo_total_horas: Math.round(tempoTotal / 60 * 10) / 10,
                velocidade_media: warehouse.velocidade_media_kmh,
                tempo_por_entrega: warehouse.tempo_entrega_minutos
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

// GET /geocode/:endereco - Buscar coordenadas de um endereço
router.get('/geocode/:endereco', async (req, res) => {
    try {
        const { endereco } = req.params;
        const coords = await geocodificarEndereco(endereco);
        res.json(coords);
    } catch (error) {
        console.error('Erro ao geocodificar:', error);
        res.json({ error: 'Erro ao buscar coordenadas' });
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

// ===== FUNÇÕES AUXILIARES MELHORADAS =====

// Calcular estatísticas completas das entregas
function calcularEstatisticasCompletas(entregas, warehouse) {
    const total_entregas = entregas.length;
    const entregues = entregas.filter(e => e.status === 'ENTREGUE').length;
    const pendentes = entregas.filter(e => e.status === 'PENDENTE').length;
    const valor_total = entregas.reduce((sum, e) => sum + parseFloat(e.valor_entrega || 0), 0);
    
    // Cálculos de tempo e distância
    const entregasPendentes = entregas.filter(e => e.status === 'PENDENTE');
    const distancia_total = entregasPendentes.reduce((sum, e) => sum + parseFloat(e.distancia_km_calculada || 0), 0);
    
    // Tempo estimado total considerando otimização de rota
    let tempo_total_estimado = 0;
    if (entregasPendentes.length > 0) {
        // Tempo base: soma das distâncias / velocidade + tempo por entrega
        const tempo_deslocamento = (distancia_total / warehouse.velocidade_media_kmh) * 60;
        const tempo_entregas = entregasPendentes.length * warehouse.tempo_entrega_minutos;
        tempo_total_estimado = tempo_deslocamento + tempo_entregas;
    }
    
    // Horário estimado de conclusão
    let horario_conclusao = null;
    if (tempo_total_estimado > 0) {
        const agora = new Date();
        const conclusao = new Date(agora.getTime() + (tempo_total_estimado * 60000));
        horario_conclusao = conclusao.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    return {
        total_entregas,
        entregues,
        pendentes,
        valor_total,
        distancia_total_km: distancia_total.toFixed(2),
        tempo_total_estimado_minutos: Math.round(tempo_total_estimado),
        tempo_total_estimado_horas: Math.round(tempo_total_estimado / 60 * 10) / 10,
        horario_conclusao_estimado: horario_conclusao,
        velocidade_media: warehouse.velocidade_media_kmh,
        tempo_por_entrega: warehouse.tempo_entrega_minutos
    };
}

// Algoritmo melhorado de otimização de rota (nearest neighbor aprimorado)
async function otimizarRotaAvancada(entregas, warehouse) {
    if (entregas.length <= 1) return entregas;

    const rotaOtimizada = [];
    const entregasRestantes = [...entregas];
    let pontoAtual = { latitude: warehouse.latitude, longitude: warehouse.longitude };

    while (entregasRestantes.length > 0) {
        let menorCusto = Infinity;
        let proximaEntregaIndex = 0;

        // Encontrar a entrega com menor custo (distância + prioridade)
        entregasRestantes.forEach((entrega, index) => {
            if (entrega.latitude && entrega.longitude) {
                const distancia = calcularDistancia(
                    pontoAtual.latitude, 
                    pontoAtual.longitude,
                    entrega.latitude, 
                    entrega.longitude
                );
                
                // Custo considera distância e valor da entrega (priorizar altos valores)
                const valorEntrega = parseFloat(entrega.valor_entrega || 0);
                const prioridadeValor = valorEntrega > 100 ? 0.8 : 1.0; // 20% desconto no custo
                const custo = distancia * prioridadeValor;
                
                if (custo < menorCusto) {
                    menorCusto = custo;
                    proximaEntregaIndex = index;
                }
            }
        });

        // Adicionar próxima entrega à rota
        const proximaEntrega = entregasRestantes[proximaEntregaIndex];
        rotaOtimizada.push(proximaEntrega);
        pontoAtual = { 
            latitude: proximaEntrega.latitude, 
            longitude: proximaEntrega.longitude 
        };
        entregasRestantes.splice(proximaEntregaIndex, 1);
    }

    return rotaOtimizada;
}

// Calcular distância entre dois pontos (fórmula de Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Geocodificar endereço usando API externa
async function geocodificarEndereco(endereco) {
    try {
        // Adicionar ", Brasil" se não estiver presente para melhor precisão
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