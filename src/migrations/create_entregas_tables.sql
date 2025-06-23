-- Tabela de entregas
CREATE TABLE IF NOT EXISTS entregas (
    id SERIAL PRIMARY KEY,
    data_entrega DATE NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id),
    cliente_nome VARCHAR(200) NOT NULL,
    endereco_completo TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    observacoes TEXT,
    valor_entrega DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_ROTA', 'ENTREGUE', 'CANCELADA')),
    ordem_entrega INTEGER,
    hora_prevista TIME,
    hora_entrega TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de rotas (agrupamento de entregas)
CREATE TABLE IF NOT EXISTS rotas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    data_rota DATE NOT NULL,
    motorista VARCHAR(100),
    veiculo VARCHAR(100),
    km_total DECIMAL(8,2),
    tempo_total_minutos INTEGER,
    status VARCHAR(20) DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA')),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relacionamento entregas <-> rotas
CREATE TABLE IF NOT EXISTS rota_entregas (
    id SERIAL PRIMARY KEY,
    rota_id INTEGER REFERENCES rotas(id) ON DELETE CASCADE,
    entrega_id INTEGER REFERENCES entregas(id) ON DELETE CASCADE,
    ordem_na_rota INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);