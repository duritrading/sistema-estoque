const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ROTA DRE

router.get('/dre', async (req, res) => {
    if (!pool) return res.status(500).send('Erro de configuração.');

    try {
        const ano = new Date().getFullYear();
        const query = `
            SELECT 
                cf.nome as categoria,
                cf.tipo as categoria_tipo,
                SUM(fc.valor) as total
            FROM fluxo_caixa fc
            JOIN categorias_financeiras cf ON fc.categoria_id = cf.id
            WHERE EXTRACT(YEAR FROM data_operacao) = $1 AND fc.status = 'PAGO'
            GROUP BY cf.nome, cf.tipo
        `;
        const result = await pool.query(query, [ano]);
        const dadosBrutos = result.rows;

        const dados = {};
        dadosBrutos.forEach(d => {
            dados[d.categoria] = parseFloat(d.total);
        });

        const get = (nome) => dados[nome] || 0;

        // Estrutura da DRE com fórmulas
        const estrutura = [
            { label: 'Receita de Vendas de Produtos e Serviços', tipo: 'item' },
            { label: 'Receita de Fretes e Entregas', tipo: 'item' },
            { label: 'Receita Bruta de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Impostos Sobre Vendas', tipo: 'item' },
            { label: 'Comissões Sobre Vendas', tipo: 'item' },
            { label: 'Descontos Incondicionais', tipo: 'item' },
            { label: 'Devoluções de Vendas', tipo: 'item' },
            { label: 'Receita Líquida de Vendas', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Custo dos Produtos Vendidos', tipo: 'item' },
            { label: 'Custo das Vendas de Produtos', tipo: 'item' },
            { label: 'Custo dos Serviços Prestados', tipo: 'item' },
            { label: 'Lucro Bruto', tipo: 'total', css: 'dre-total-l2' },
            { label: 'Despesas Comerciais', tipo: 'item' },
            { label: 'Despesas Administrativas', tipo: 'item' },
            { label: 'Despesas Operacionais', tipo: 'item' },
            { label: 'Lucro / Prejuízo Operacional', tipo: 'total', css: 'dre-total-l1' },
            { label: 'Receitas e Rendimentos Financeiros', tipo: 'item' },
            { label: 'Despesas Financeiras', tipo: 'item' },
            { label: 'Outras Receitas Não Operacionais', tipo: 'item' },
            { label: 'Outras Despesas Não Operacionais', tipo: 'item' },
            { label: 'Lucro / Prejuízo Líquido', tipo: 'total', css: 'dre-total-l3' },
            { label: 'Investimentos em Imobilizado', tipo: 'item' },
            { label: 'Empréstimos e Dívidas', tipo: 'item' },
            { label: 'Lucro / Prejuízo Final', tipo: 'total', css: 'dre-total-final' },
        ];

        const resultados = {};

        // Calcula os valores de forma sequencial e segura
        const recVendas = get('Receita de Vendas de Produtos e Serviços');
        const recFretes = get('Receita de Fretes e Entregas');
        resultados['Receita de Vendas de Produtos e Serviços'] = recVendas;
        resultados['Receita de Fretes e Entregas'] = recFretes;
        resultados['Receita Bruta de Vendas'] = recVendas + recFretes;

        const impVendas = get('Impostos Sobre Vendas');
        const comissoes = get('Comissões Sobre Vendas');
        const descontos = get('Descontos Incondicionais');
        const devolucoes = get('Devoluções de Vendas');
        resultados['Impostos Sobre Vendas'] = -impVendas;
        resultados['Comissões Sobre Vendas'] = -comissoes;
        resultados['Descontos Incondicionais'] = -descontos;
        resultados['Devoluções de Vendas'] = -devolucoes;
        resultados['Receita Líquida de Vendas'] = resultados['Receita Bruta de Vendas'] - impVendas - comissoes - descontos - devolucoes;

        const custoProdutos = get('Custo dos Produtos Vendidos');
        const custoVendas = get('Custo das Vendas de Produtos');
        const custoServicos = get('Custo dos Serviços Prestados');
        resultados['Custo dos Produtos Vendidos'] = -custoProdutos;
        resultados['Custo das Vendas de Produtos'] = -custoVendas;
        resultados['Custo dos Serviços Prestados'] = -custoServicos;
        resultados['Lucro Bruto'] = resultados['Receita Líquida de Vendas'] - custoProdutos - custoVendas - custoServicos;

        const despComerciais = get('Despesas Comerciais');
        const despAdmin = get('Despesas Administrativas');
        const despOperacionais = get('Despesas Operacionais');
        resultados['Despesas Comerciais'] = -despComerciais;
        resultados['Despesas Administrativas'] = -despAdmin;
        resultados['Despesas Operacionais'] = -despOperacionais;
        resultados['Lucro / Prejuízo Operacional'] = resultados['Lucro Bruto'] - despComerciais - despAdmin - despOperacionais;

        const recFinanceiras = get('Receitas e Rendimentos Financeiros');
        const despFinanceiras = get('Despesas Financeiras');
        resultados['Receitas e Rendimentos Financeiros'] = recFinanceiras;
        resultados['Despesas Financeiras'] = -despFinanceiras;

        const outrasRec = get('Outras Receitas Não Operacionais');
        const outrasDesp = get('Outras Despesas Não Operacionais');
        resultados['Outras Receitas Não Operacionais'] = outrasRec;
        resultados['Outras Despesas Não Operacionais'] = -outrasDesp;
        resultados['Lucro / Prejuízo Líquido'] = resultados['Lucro / Prejuízo Operacional'] + (recFinanceiras - despFinanceiras) + (outrasRec - outrasDesp);

        const invest = get('Investimentos em Imobilizado');
        const emprestimos = get('Empréstimos e Dívidas');
        resultados['Investimentos em Imobilizado'] = -invest;
        resultados['Empréstimos e Dívidas'] = -emprestimos;
        resultados['Lucro / Prejuízo Final'] = resultados['Lucro / Prejuízo Líquido'] - invest - emprestimos;

        res.render('dre', { user: res.locals.user, ano, estrutura, resultados });

    } catch (err) {
        console.error("Erro ao gerar DRE:", err);
        res.status(500).send('Erro ao gerar relatório DRE.');
    }
});

module.exports = router;