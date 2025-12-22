-- =============================================
-- BACKUP DO SISTEMA DE ESTOQUE - OF DISTRIBUIDORA
-- Gerado em: 22/12/2025, 20:39:17
-- =============================================


-- Tabela: categorias_financeiras
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id integer NOT NULL DEFAULT nextval('categorias_financeiras_id_seq'::regclass),
  nome character varying(100) NOT NULL,
  tipo character varying(20) NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Dados da tabela categorias_financeiras
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (1, 'Receita de Vendas', 'RECEITA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (2, 'Receitas Financeiras', 'RECEITA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (3, 'Compra de Produtos', 'DESPESA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (4, 'Despesas Operacionais', 'DESPESA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (5, 'Comissões Sobre Vendas', 'DESPESA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (6, 'Despesas Administrativas', 'DESPESA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (7, 'Despesas Financeiras', 'DESPESA', true, '2025-12-09T21:15:16.502Z');
INSERT INTO categorias_financeiras (id, nome, tipo, ativo, created_at) VALUES (8, 'Impostos Sobre Vendas', 'DESPESA', true, '2025-12-09T21:15:16.502Z');


-- Tabela: fornecedores
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS fornecedores (
  id integer NOT NULL DEFAULT nextval('fornecedores_id_seq'::regclass),
  codigo character varying(50),
  nome character varying(200) NOT NULL,
  contato character varying(150),
  telefone character varying(20),
  email character varying(150),
  endereco text,
  cnpj character varying(20),
  observacao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: rcas
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS rcas (
  id integer NOT NULL DEFAULT nextval('rcas_id_seq'::regclass),
  nome character varying(200) NOT NULL,
  praca character varying(150),
  cpf character varying(20),
  endereco text,
  cep character varying(10),
  telefone character varying(20),
  email character varying(150),
  observacao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: clientes
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id integer NOT NULL DEFAULT nextval('clientes_id_seq'::regclass),
  nome character varying(200) NOT NULL,
  cpf_cnpj character varying(20),
  endereco text,
  cep character varying(10),
  telefone character varying(20),
  email character varying(150),
  observacao text,
  rca_id integer,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: produtos
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS produtos (
  id integer NOT NULL DEFAULT nextval('produtos_id_seq'::regclass),
  codigo character varying(50) NOT NULL,
  descricao text NOT NULL,
  unidade character varying(20) DEFAULT 'UN'::character varying,
  categoria character varying(100),
  estoque_minimo integer DEFAULT 0,
  preco_custo numeric,
  percentual_comissao numeric DEFAULT 5.00,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: movimentacoes
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS movimentacoes (
  id integer NOT NULL DEFAULT nextval('movimentacoes_id_seq'::regclass),
  produto_id integer,
  fornecedor_id integer,
  cliente_nome character varying(200),
  rca character varying(50),
  tipo character varying(10),
  quantidade numeric NOT NULL,
  preco_unitario numeric,
  valor_total numeric,
  documento character varying(100),
  observacao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: fluxo_caixa
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS fluxo_caixa (
  id integer NOT NULL DEFAULT nextval('fluxo_caixa_id_seq'::regclass),
  data_operacao date NOT NULL,
  tipo character varying(10) NOT NULL,
  valor numeric NOT NULL,
  categoria_id integer,
  descricao text NOT NULL,
  movimentacao_id integer,
  status character varying(20) DEFAULT 'PAGO'::character varying,
  observacao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: contas_a_receber
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS contas_a_receber (
  id integer NOT NULL DEFAULT nextval('contas_a_receber_id_seq'::regclass),
  movimentacao_id integer,
  cliente_nome character varying(200),
  numero_parcela integer NOT NULL,
  total_parcelas integer NOT NULL,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  status character varying(20) NOT NULL DEFAULT 'Pendente'::character varying,
  fluxo_caixa_id integer,
  categoria_id integer,
  descricao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: contas_a_pagar
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS contas_a_pagar (
  id integer NOT NULL DEFAULT nextval('contas_a_pagar_id_seq'::regclass),
  fornecedor_id integer,
  descricao text NOT NULL,
  valor numeric NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  status character varying(20) NOT NULL DEFAULT 'Pendente'::character varying,
  fluxo_caixa_id integer,
  categoria_id integer,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: usuarios
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id integer NOT NULL DEFAULT nextval('usuarios_id_seq'::regclass),
  username character varying(50) NOT NULL,
  email character varying(150) NOT NULL,
  password_hash character varying(255) NOT NULL,
  nome_completo character varying(200),
  ativo boolean DEFAULT true,
  ultimo_login timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Dados da tabela usuarios
INSERT INTO usuarios (id, username, email, password_hash, nome_completo, ativo, ultimo_login, created_at) VALUES (3, 'diretoria', 'joao@ofdistribuidora.com.br', '$2b$10$4UFnoJj7W3guXprrcr/7Kuipr.kOShjZfZl1t3U/PxliBL0ywaTxW', 'Joao Vitor de Oliveira Figueiredo', true, '2025-12-10T13:36:23.482Z', '2025-12-10T13:36:13.041Z');
INSERT INTO usuarios (id, username, email, password_hash, nome_completo, ativo, ultimo_login, created_at) VALUES (1, 'admin', 'admin@sistema.com', '$2b$10$So0aHMa7LD3KsGqalnh8zOkfNMZ/1ODqFJGPN4wAxcDWMuTUwuQ5.', 'Administrador do Sistema', true, '2025-12-22T20:33:53.785Z', '2025-12-09T21:15:36.802Z');


-- Tabela: entregas
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS entregas (
  id integer NOT NULL DEFAULT nextval('entregas_id_seq'::regclass),
  data_entrega date NOT NULL,
  cliente_id integer,
  cliente_nome character varying(200) NOT NULL,
  endereco_completo text NOT NULL,
  latitude numeric,
  longitude numeric,
  observacoes text,
  valor_entrega numeric,
  status character varying(20) DEFAULT 'PENDENTE'::character varying,
  ordem_entrega integer,
  hora_prevista time without time zone,
  hora_entrega timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: warehouse_config
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_config (
  id integer NOT NULL DEFAULT nextval('warehouse_config_id_seq'::regclass),
  nome character varying(200) NOT NULL DEFAULT 'Armazém Principal'::character varying,
  endereco text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  velocidade_media_kmh integer DEFAULT 30,
  tempo_entrega_minutos integer DEFAULT 5,
  horario_inicio time without time zone DEFAULT '08:00:00'::time without time zone,
  horario_fim time without time zone DEFAULT '18:00:00'::time without time zone,
  is_active boolean DEFAULT true,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Dados da tabela warehouse_config
INSERT INTO warehouse_config (id, nome, endereco, latitude, longitude, velocidade_media_kmh, tempo_entrega_minutos, horario_inicio, horario_fim, is_active, updated_at) VALUES (1, 'OF Distribuidora - Sede', 'Recife, PE, Brasil', '-8.04760000', '-34.87700000', 25, 8, '08:00:00', '18:00:00', true, '2025-12-09T21:15:16.502Z');


-- Tabela: comissoes_rca
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS comissoes_rca (
  id integer NOT NULL DEFAULT nextval('comissoes_rca_id_seq'::regclass),
  rca_id integer NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  valor_vendas numeric NOT NULL DEFAULT 0,
  valor_comissao numeric NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'PENDENTE'::character varying,
  data_pagamento date,
  observacao text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


-- Tabela: comissoes_rca_itens
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS comissoes_rca_itens (
  id integer NOT NULL DEFAULT nextval('comissoes_rca_itens_id_seq'::regclass),
  comissao_id integer NOT NULL,
  produto_id integer NOT NULL,
  quantidade_vendida numeric NOT NULL,
  valor_vendido numeric NOT NULL,
  percentual_aplicado numeric NOT NULL,
  valor_comissao_item numeric NOT NULL
);


-- =============================================
-- SEQUÊNCIAS
-- =============================================

SELECT setval(pg_get_serial_sequence('categorias_financeiras', 'id'), COALESCE(MAX(id), 1)) FROM categorias_financeiras;
SELECT setval(pg_get_serial_sequence('fornecedores', 'id'), COALESCE(MAX(id), 1)) FROM fornecedores;
SELECT setval(pg_get_serial_sequence('rcas', 'id'), COALESCE(MAX(id), 1)) FROM rcas;
SELECT setval(pg_get_serial_sequence('clientes', 'id'), COALESCE(MAX(id), 1)) FROM clientes;
SELECT setval(pg_get_serial_sequence('produtos', 'id'), COALESCE(MAX(id), 1)) FROM produtos;
SELECT setval(pg_get_serial_sequence('movimentacoes', 'id'), COALESCE(MAX(id), 1)) FROM movimentacoes;
SELECT setval(pg_get_serial_sequence('fluxo_caixa', 'id'), COALESCE(MAX(id), 1)) FROM fluxo_caixa;
SELECT setval(pg_get_serial_sequence('contas_a_receber', 'id'), COALESCE(MAX(id), 1)) FROM contas_a_receber;
SELECT setval(pg_get_serial_sequence('contas_a_pagar', 'id'), COALESCE(MAX(id), 1)) FROM contas_a_pagar;
SELECT setval(pg_get_serial_sequence('usuarios', 'id'), COALESCE(MAX(id), 1)) FROM usuarios;
SELECT setval(pg_get_serial_sequence('entregas', 'id'), COALESCE(MAX(id), 1)) FROM entregas;
SELECT setval(pg_get_serial_sequence('warehouse_config', 'id'), COALESCE(MAX(id), 1)) FROM warehouse_config;
SELECT setval(pg_get_serial_sequence('comissoes_rca', 'id'), COALESCE(MAX(id), 1)) FROM comissoes_rca;
SELECT setval(pg_get_serial_sequence('comissoes_rca_itens', 'id'), COALESCE(MAX(id), 1)) FROM comissoes_rca_itens;

-- Backup concluído com sucesso!