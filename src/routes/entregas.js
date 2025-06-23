const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// GET / - Página principal de entregas
router.get('/', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        // Buscar entregas do dia
        const entregasResult = await pool.query(`
            SELECT e.*, c.telefone, c.email 
            FROM entregas e
            LEFT JOIN clientes c ON e.cliente_id = c.id
            WHERE e.data_entrega = $1
            ORDER BY COALESCE(e.ordem_entrega, 999), e.created_at
        `, [hoje]);

        // Buscar clientes para o formulário
        const clientesResult = await pool.query(`
            SELECT id, nome, endereco, cep 
            FROM clientes 
            WHERE endereco IS NOT NULL 
            ORDER BY nome
        `);

        // Estatísticas do dia
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_entregas,
                COUNT(CASE WHEN status = 'ENTREGUE' THEN 1 END) as entregues,
                COUNT(CASE WHEN status = 'PENDENTE' THEN 1 END) as pendentes,
                COALESCE(SUM(valor_entrega), 0) as valor_total
            FROM entregas 
            WHERE data_entrega = $1
        `, [hoje]);

        res.render('entregas', {
            user: res.locals.user,
            entregas: entregasResult.rows || [],
            clientes: clientesResult.rows || [],
            stats: statsResult.rows[0] || { total_entregas: 0, entregues: 0, pendentes: 0, valor_total: 0 },
            dataFiltro: hoje
        });
    } catch (error) {
        console.error('Erro ao carregar entregas:', error);
        res.status(500).send('Erro ao carregar página de entregas');
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

        res.redirect('/entregas');
    } catch (error) {
        console.error('Erro ao criar entrega:', error);
        res.status(500).send('Erro ao criar entrega');
    }
});

// POST /otimizar-rota - Otimizar rota do dia
router.post('/otimizar-rota', async (req, res) => {
    try {
        const { data_entrega } = req.body;
        
        // Buscar entregas pendentes
        const entregas = await pool.query(`
            SELECT id, endereco_completo, latitude, longitude
            FROM entregas 
            WHERE data_entrega = $1 AND status = 'PENDENTE'
            ORDER BY created_at
        `, [data_entrega]);

        if (entregas.rows.length === 0) {
            return res.json({ success: false, message: 'Nenhuma entrega pendente encontrada' });
        }

        // Aqui você implementaria o algoritmo de otimização
        // Por enquanto, vamos fazer uma ordenação simples por proximidade
        const rotaOtimizada = await otimizarRotaSimples(entregas.rows);

        // Atualizar ordem das entregas
        for (let i = 0; i < rotaOtimizada.length; i++) {
            await pool.query(`
                UPDATE entregas 
                SET ordem_entrega = $1 
                WHERE id = $2
            `, [i + 1, rotaOtimizada[i].id]);
        }

        res.json({ 
            success: true, 
            message: `Rota otimizada com ${rotaOtimizada.length} entregas`,
            rota: rotaOtimizada
        });
    } catch (error) {
        console.error('Erro ao otimizar rota:', error);
        res.json({ success: false, message: 'Erro ao otimizar rota' });
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

// ===== FUNÇÕES AUXILIARES =====

// Algoritmo simples de otimização de rota (nearest neighbor)
async function otimizarRotaSimples(entregas) {
    if (entregas.length <= 1) return entregas;

    // Ponto de partida (sede da empresa) - você deve configurar isso
    const pontoInicial = { latitude: -8.0476, longitude: -34.8770 }; // Recife, PE

    const rotaOtimizada = [];
    const entregasRestantes = [...entregas];
    let pontoAtual = pontoInicial;

    while (entregasRestantes.length > 0) {
        let menorDistancia = Infinity;
        let proximaEntregaIndex = 0;

        // Encontrar a entrega mais próxima
        entregasRestantes.forEach((entrega, index) => {
            if (entrega.latitude && entrega.longitude) {
                const distancia = calcularDistancia(
                    pontoAtual.latitude, 
                    pontoAtual.longitude,
                    entrega.latitude, 
                    entrega.longitude
                );
                
                if (distancia < menorDistancia) {
                    menorDistancia = distancia;
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
        // Usando OpenStreetMap Nominatim (gratuito)
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`;
        
        const response = await fetch(url);
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