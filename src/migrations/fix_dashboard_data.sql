-- migrations/fix_dashboard_data.sql
-- Script para verificar e corrigir dados do dashboard

-- Verificar movimentações
SELECT 
    'Movimentações' as tabela,
    COUNT(*) as total_registros,
    COUNT(CASE WHEN tipo = 'ENTRADA' THEN 1 END) as entradas,
    COUNT(CASE WHEN tipo = 'SAIDA' THEN 1 END) as saidas,
    SUM(CASE WHEN tipo = 'SAIDA' THEN valor_total ELSE 0 END) as faturamento_total
FROM movimentacoes;

-- Verificar fluxo de caixa
SELECT 
    'Fluxo de Caixa' as tabela,
    COUNT(*) as total_registros,
    COUNT(CASE WHEN tipo = 'CREDITO' THEN 1 END) as creditos,
    COUNT(CASE WHEN tipo = 'DEBITO' THEN 1 END) as debitos,
    SUM(CASE WHEN tipo = 'CREDITO' THEN valor ELSE 0 END) as total_creditos,
    SUM(CASE WHEN tipo = 'DEBITO' THEN valor ELSE 0 END) as total_debitos
FROM fluxo_caixa;

-- Verificar contas a receber
SELECT 
    'Contas a Receber' as tabela,
    COUNT(*) as total_registros,
    COUNT(CASE WHEN status = 'Pendente' THEN 1 END) as pendentes,
    COUNT(CASE WHEN status = 'Pago' THEN 1 END) as pagas,
    COUNT(CASE WHEN status = 'Pendente' AND data_vencimento < CURRENT_DATE THEN 1 END) as vencidas
FROM contas_a_receber;

-- Inserir dados de exemplo se tabelas estiverem vazias
INSERT INTO movimentacoes (produto_id, tipo, quantidade, preco_unitario, valor_total, created_at)
SELECT 1, 'SAIDA', 10, 15.50, 155.00, CURRENT_DATE - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM movimentacoes LIMIT 1);

INSERT INTO fluxo_caixa (tipo, valor, descricao, data_operacao, status)
VALUES 
    ('CREDITO', 1000.00, 'Venda produtos', CURRENT_DATE - INTERVAL '3 days', 'PAGO'),
    ('DEBITO', 300.00, 'Despesas operacionais', CURRENT_DATE - INTERVAL '2 days', 'PAGO')
WHERE NOT EXISTS (SELECT 1 FROM fluxo_caixa LIMIT 1);