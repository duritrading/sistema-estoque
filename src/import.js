const db = require('./config/database');

const importCSV = {
  // Processar dados do CSV
  processarCSV: (csvData) => {
    return new Promise((resolve, reject) => {
      const resultados = {
        produtosCriados: 0,
        movimentacoesImportadas: 0,
        erros: [],
        detalhes: []
      };

      // Processar cada linha do CSV
      const processarLinha = (index) => {
        if (index >= csvData.length) {
          resolve(resultados);
          return;
        }

        const linha = csvData[index];
        
        // Pular linhas vazias ou inválidas
        if (!linha.PRODUTO || !linha.QUANTIDADE || linha.QUANTIDADE === '0') {
          processarLinha(index + 1);
          return;
        }

        // Extrair dados da linha
        const dadosLinha = {
          data: linha.DATA,
          cliente: linha.CLIENTE,
          codigo: linha.PRODUTO,
          descricao: linha['DESCRI‚ÌO'] || linha.PRODUTO,
          quantidade: parseInt(linha.QUANTIDADE) || 0,
          valor: extrairValor(linha.VALOR),
          rca: linha.RCA,
          nf: linha.NF,
          observacao: linha['OBSERVA‚ÍES']
        };

        // Verificar se produto existe, senão criar
        db.get('SELECT id FROM produtos WHERE codigo = ?', [dadosLinha.codigo], (err, produto) => {
          if (err) {
            resultados.erros.push(`Erro linha ${index + 1}: ${err.message}`);
            processarLinha(index + 1);
            return;
          }

          if (!produto) {
            // Criar produto
            criarProduto(dadosLinha, (produtoId) => {
              if (produtoId) {
                resultados.produtosCriados++;
                criarMovimentacao(dadosLinha, produtoId, index, resultados, () => {
                  processarLinha(index + 1);
                });
              } else {
                resultados.erros.push(`Erro ao criar produto linha ${index + 1}`);
                processarLinha(index + 1);
              }
            });
          } else {
            // Produto existe, criar movimentação
            criarMovimentacao(dadosLinha, produto.id, index, resultados, () => {
              processarLinha(index + 1);
            });
          }
        });
      };

      processarLinha(0);
    });
  }
};

// Função auxiliar para extrair valor monetário
function extrairValor(valorStr) {
  if (!valorStr || valorStr === '-') return null;
  
  // Remove símbolos e converte para número
  const numero = valorStr.replace(/[R$\s.,]/g, '').replace(',', '.');
  return parseFloat(numero) || null;
}

// Função para criar produto
function criarProduto(dados, callback) {
  const unidade = 'PC'; // Assumindo peças
  const categoria = 'Batatas'; // Categoria padrão
  
  db.run(`
    INSERT INTO produtos (codigo, descricao, unidade, categoria, estoque_minimo, preco_custo)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [dados.codigo, dados.descricao, unidade, categoria, 0, dados.valor], 
  function(err) {
    if (err) {
      callback(null);
    } else {
      callback(this.lastID);
    }
  });
}

// Função para criar movimentação
function criarMovimentacao(dados, produtoId, index, resultados, callback) {
  // Converter data brasileira para formato SQLite
  const dataFormatada = converterData(dados.data);
  
  // Determinar tipo de movimentação
  let tipo = 'SAIDA'; // Maioria são vendas
  if (dados.cliente === 'Descarte') {
    tipo = 'SAIDA'; // Descarte também é saída
  }

  // Calcular preço unitário se houver valor total
  let precoUnitario = null;
  if (dados.valor && dados.quantidade > 0) {
    precoUnitario = dados.valor / dados.quantidade;
  }

  // Observação completa
  let observacao = `Cliente: ${dados.cliente}`;
  if (dados.rca && dados.rca !== '-') observacao += ` | RCA: ${dados.rca}`;
  if (dados.nf && dados.nf !== '-') observacao += ` | NF: ${dados.nf}`;
  if (dados.observacao) observacao += ` | ${dados.observacao}`;

  db.run(`
    INSERT INTO movimentacoes (produto_id, tipo, quantidade, preco_unitario, documento, observacao, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [produtoId, tipo, dados.quantidade, precoUnitario, dados.nf, observacao, dataFormatada], 
  function(err) {
    if (err) {
      resultados.erros.push(`Erro movimentação linha ${index + 1}: ${err.message}`);
    } else {
      resultados.movimentacoesImportadas++;
      resultados.detalhes.push({
        linha: index + 1,
        produto: dados.codigo,
        cliente: dados.cliente,
        quantidade: dados.quantidade,
        valor: dados.valor
      });
    }
    callback();
  });
}

// Função para converter data brasileira
function converterData(dataStr) {
  if (!dataStr) return new Date().toISOString();
  
  try {
    const [dia, mes, ano] = dataStr.split('/');
    const data = new Date(ano, mes - 1, dia);
    return data.toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

module.exports = importCSV;