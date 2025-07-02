-- migrations/add_warehouse_config.sql
-- Tabela para configurações do armazém
CREATE TABLE IF NOT EXISTS warehouse_config (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL DEFAULT 'Armazém Principal',
    endereco TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    velocidade_media_kmh INTEGER DEFAULT 30, -- velocidade média urbana
    tempo_entrega_minutos INTEGER DEFAULT 5, -- tempo médio por entrega
    horario_inicio TIME DEFAULT '08:00',
    horario_fim TIME DEFAULT '18:00',
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir configuração padrão (Recife - ajustar conforme sua localização)
INSERT INTO warehouse_config (
    nome, endereco, latitude, longitude, 
    velocidade_media_kmh, tempo_entrega_minutos
) VALUES (
    'OF Distribuidora - Sede', 
    'Recife, PE, Brasil', 
    -8.0476, 
    -34.8770,
    25, -- 25 km/h média urbana
    8   -- 8 minutos por entrega
) ON CONFLICT DO NOTHING;

-- Adicionar campos úteis na tabela entregas
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS distancia_km DECIMAL(8,2);
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS tempo_estimado_minutos INTEGER;