const express = require('express');
const router = express.Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const ano = new Date().getFullYear();
        const query = `
            SELECT 
                cf.nome as categoria,
                SUM(fc.valor) as total
            FROM fluxo_caixa fc
            JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
            WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
            GROUP BY cf.nome
        `;
        const result = await pool.query(query, [ano]);

        const dados = {};
        result.rows.forEach(d => {
            dados[d.categoria] = parseFloat(d.total);
        });

        const get = (nome) => dados[nome] || 0;

        const estrutura = [
            { label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item' },
            { label: 'Receita de Fretes e Entregas', tipo: 'item' },
            { label: 'Receita Bruta de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Impostos Sobre Vendas', tipo: 'item' },
            { label: 'Comissões Sobre Vendas', tipo: 'item' },
            { label: 'Receita Líquida de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Lucro / Prejuízo Final', tipo: 'total', css: 'dre-total-final' },
        ];

        const resultados = {};

        // Lógica de cálculo sequencial e segura
        const recVendas = get('Receita de Vendas de Produtos e Serviços');
        const recFretes = get('Receita de Fretes e Entregas');
        resultados['Receita de Vendas de Produtos e Serviços'] = recVendas;
        resultados['Receita de Fretes e Entregas'] = recFretes;
        const receitaBruta = recVendas + recFretes;
        resultados['Receita Bruta de Vendas'] = receitaBruta;

        const impVendas = get('Impostos Sobre Vendas');
        const comissoes = get('Comissões Sobre Vendas');
        resultados['Impostos Sobre Vendas'] = -impVendas;
        resultados['Comissões Sobre Vendas'] = -comissoes;
        const receitaLiquida = receitaBruta - impVendas - comissoes;
        resultados['Receita Líquida de Vendas'] = receitaLiquida;

        // ... (Adicionar outros cálculos aqui no futuro)

        // Por enquanto, o resultado final é a Receita Líquida
        resultados['Lucro / Prejuízo Final'] = receitaLiquida;

        res.render('dre', { 
            user: res.locals.user, 
            ano, 
            estrutura, 
            resultados 
        });

    } catch (err) {
        console.error("Erro ao gerar DRE:", err);
        res.status(500).send('Erro ao gerar relatório DRE.');
    }
});

module.exports = router;