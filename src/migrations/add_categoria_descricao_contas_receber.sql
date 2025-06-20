-- Adiciona campo categoria_id na tabela contas_a_receber
ALTER TABLE contas_a_receber 
ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias_financeiras(id);

-- Adiciona campo descricao na tabela contas_a_receber
ALTER TABLE contas_a_receber 
ADD COLUMN IF NOT EXISTS descricao TEXT;

-- Define categoria padrão para contas existentes (categoria 1 = Vendas)
UPDATE contas_a_receber 
SET categoria_id = 1 
WHERE categoria_id IS NULL;