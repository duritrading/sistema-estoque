// src/schemas/validation.schemas.js - CORRIGIDO
const Joi = require('joi');

// ========================================
// SCHEMAS DE AUTENTICAÇÃO
// ========================================

const loginSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.alphanum': 'Username deve conter apenas letras e números',
      'string.min': 'Username deve ter no mínimo 3 caracteres',
      'string.max': 'Username deve ter no máximo 50 caracteres',
      'any.required': 'Username é obrigatório'
    }),
  password: Joi.string()
    .min(6)
    .max(100)
    .required()
    .messages({
      'string.min': 'Senha deve ter no mínimo 6 caracteres',
      'string.max': 'Senha inválida',
      'any.required': 'Senha é obrigatória'
    }),
  redirect: Joi.string()
    .uri({ relativeOnly: true })
    .optional()
    .default('/')
});

const createUserSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required(),
  email: Joi.string()
    .email()
    .max(150)
    .required()
    .messages({
      'string.email': 'Email inválido'
    }),
  password: Joi.string()
    .min(6)
    .max(100)
    .required(),
  nome_completo: Joi.string()
    .max(200)
    .optional()
    .allow('')
});

// ========================================
// SCHEMAS DE PRODUTOS
// ========================================

const createProdutoSchema = Joi.object({
  codigo: Joi.string()
    .max(50)
    .required()
    .trim()
    .messages({
      'any.required': 'Código do produto é obrigatório'
    }),
  descricao: Joi.string()
    .max(1000)
    .required()
    .trim()
    .messages({
      'any.required': 'Descrição do produto é obrigatória',
      'string.max': 'Descrição muito longa (máximo 1000 caracteres)'
    }),
  unidade: Joi.string()
    .valid('UN', 'KG', 'LT', 'MT', 'CX', 'CT', 'PC', 'DZ') // ✅ ADICIONADO 'CT'
    .default('UN')
    .optional(),
  categoria: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .trim(),
  estoque_minimo: Joi.number()
    .integer()
    .min(0)
    .max(999999)
    .default(0)
    .optional(),
  preco_custo: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999.99)
    .optional()
    .allow(null, '')
});

const updateProdutoSchema = Joi.object({
  codigo: Joi.string()
    .max(50)
    .optional()
    .trim(),
  descricao: Joi.string()
    .max(1000)
    .optional()
    .trim(),
  unidade: Joi.string()
    .valid('UN', 'KG', 'LT', 'MT', 'CX', 'CT', 'PC', 'DZ') // ✅ ADICIONADO 'CT'
    .optional(),
  categoria: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .trim(),
  estoque_minimo: Joi.number()
    .integer()
    .min(0)
    .max(999999)
    .optional(),
  preco_custo: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999.99)
    .optional()
    .allow(null, '')
}).min(1);

// ========================================
// SCHEMAS DE FORNECEDORES
// ========================================

const createFornecedorSchema = Joi.object({
  codigo: Joi.string()
    .max(50)
    .optional()
    .allow('')
    .trim(),
  nome: Joi.string()
    .max(200)
    .required()
    .trim()
    .messages({
      'any.required': 'Nome do fornecedor é obrigatório'
    }),
  contato: Joi.string()
    .max(150)
    .optional()
    .allow('')
    .trim(),
  telefone: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  email: Joi.string()
    .email()
    .max(150)
    .optional()
    .allow('')
    .trim(),
  endereco: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .trim(),
  cnpj: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  observacao: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .trim()
});

// ========================================
// SCHEMAS DE MOVIMENTAÇÕES
// ========================================

const createMovimentacaoSchema = Joi.object({
  produto_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'any.required': 'Produto é obrigatório',
      'number.positive': 'ID do produto inválido'
    }),
  fornecedor_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .allow(null, ''),
  cliente_nome: Joi.string()
    .max(200)
    .optional()
    .allow('')
    .trim(),
  rca: Joi.string()
    .max(50)
    .optional()
    .allow('')
    .trim(),
  tipo: Joi.string()
    .valid('ENTRADA', 'SAIDA')
    .required()
    .messages({
      'any.required': 'Tipo de movimentação é obrigatório',
      'any.only': 'Tipo deve ser ENTRADA ou SAIDA'
    }),
  quantidade: Joi.number()
    .positive()
    .precision(3)
    .max(999999.999)
    .required()
    .messages({
      'any.required': 'Quantidade é obrigatória',
      'number.positive': 'Quantidade deve ser maior que zero'
    }),
  preco_unitario: Joi.number()
    .min(0)
    .precision(2)
    .max(9999999.99)
    .optional()
    .allow(null, ''),
  valor_total: Joi.number()
    .min(0)
    .precision(2)
    .max(9999999.99)
    .optional()
    .allow(null, ''),
  documento: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .trim(),
  observacao: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .trim()
});

// ========================================
// SCHEMAS DE CONTAS A RECEBER
// ========================================

const createContaReceberSchema = Joi.object({
  movimentacao_id: Joi.number()
    .integer()
    .positive()
    .required(),
  cliente_nome: Joi.string()
    .max(200)
    .required()
    .trim(),
  numero_parcela: Joi.number()
    .integer()
    .min(1)
    .max(999)
    .default(1),
  total_parcelas: Joi.number()
    .integer()
    .min(1)
    .max(999)
    .default(1),
  valor: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
  data_vencimento: Joi.date()
    .iso()
    .required(),
  categoria_id: Joi.number()
    .integer()
    .positive()
    .required()
});

const createContaReceberManualSchema = Joi.object({
  cliente_nome: Joi.string()
    .max(200)
    .required()
    .trim()
    .messages({
      'any.required': 'Nome do cliente é obrigatório'
    }),
  valor: Joi.alternatives()
    .try(
      Joi.number()
        .positive()
        .precision(2)
        .max(9999999.99)
        .required(),
      Joi.string()
        .pattern(/^\d+(\.\d{1,2})?$/)
        .custom((value, helpers) => {
          const num = parseFloat(value);
          if (num <= 0 || num > 9999999.99) {
            return helpers.error('any.invalid');
          }
          return num;
        })
    )
    .messages({
      'any.required': 'Valor é obrigatório',
      'number.positive': 'Valor deve ser maior que zero'
    }),
  data_vencimento: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Data de vencimento é obrigatória'
    }),
  categoria_id: Joi.alternatives()
    .try(
      Joi.number().integer().positive().required(),
      Joi.string().pattern(/^\d+$/).custom((value, helpers) => {
        const num = parseInt(value, 10);
        if (num <= 0) return helpers.error('any.invalid');
        return num;
      })
    )
    .messages({
      'any.required': 'Categoria é obrigatória'
    }),
  descricao: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .trim()
});

const marcarPagaSchema = Joi.object({
  data_pagamento: Joi.date()
    .iso()
    .max('now')
    .required()
    .messages({
      'any.required': 'Data de pagamento é obrigatória',
      'date.max': 'Data não pode ser futura'
    })
});

// ========================================
// SCHEMAS DE CONTAS A PAGAR
// ========================================

const createContaPagarSchema = Joi.object({
  descricao: Joi.string()
    .max(500)
    .required()
    .trim()
    .messages({
      'any.required': 'Descrição é obrigatória'
    }),
  fornecedor_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .allow(null, ''),
  valor: Joi.alternatives()
    .try(
      Joi.number()
        .positive()
        .precision(2)
        .max(9999999.99)
        .required(),
      Joi.string()
        .pattern(/^\d+(\.\d{1,2})?$/)
        .custom((value, helpers) => {
          const num = parseFloat(value);
          if (num <= 0 || num > 9999999.99) {
            return helpers.error('any.invalid');
          }
          return num;
        })
    )
    .messages({
      'any.required': 'Valor é obrigatório',
      'number.positive': 'Valor deve ser maior que zero'
    }),
  data_vencimento: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Data de vencimento é obrigatória'
    }),
  categoria_id: Joi.alternatives()
    .try(
      Joi.number().integer().positive().required(),
      Joi.string().pattern(/^\d+$/).custom((value, helpers) => {
        const num = parseInt(value, 10);
        if (num <= 0) return helpers.error('any.invalid');
        return num;
      })
    )
    .messages({
      'any.required': 'Categoria é obrigatória'
    })
});

// ========================================
// SCHEMAS DE FLUXO DE CAIXA
// ========================================

const createLancamentoFluxoSchema = Joi.object({
  data_operacao: Joi.date()
    .iso()
    .max('now')
    .required()
    .messages({
      'any.required': 'Data da operação é obrigatória',
      'date.max': 'Data não pode ser futura'
    }),
  tipo: Joi.string()
    .valid('CREDITO', 'DEBITO')
    .required()
    .messages({
      'any.required': 'Tipo de lançamento é obrigatório',
      'any.only': 'Tipo deve ser CREDITO ou DEBITO'
    }),
  valor: Joi.alternatives()
    .try(
      Joi.number()
        .positive()
        .precision(2)
        .max(9999999.99)
        .required(),
      Joi.string()
        .pattern(/^\d+(\.\d{1,2})?$/)
        .custom((value, helpers) => {
          const num = parseFloat(value);
          if (num <= 0 || num > 9999999.99) {
            return helpers.error('any.invalid');
          }
          return num;
        })
    )
    .messages({
      'any.required': 'Valor é obrigatório',
      'number.positive': 'Valor deve ser maior que zero'
    }),
  descricao: Joi.string()
    .max(500)
    .required()
    .trim()
    .messages({
      'any.required': 'Descrição é obrigatória'
    }),
  categoria_id: Joi.alternatives()
    .try(
      Joi.number().integer().positive().required(),
      Joi.string().pattern(/^\d+$/).custom((value, helpers) => {
        const num = parseInt(value, 10);
        if (num <= 0) return helpers.error('any.invalid');
        return num;
      })
    )
    .messages({
      'any.required': 'Categoria é obrigatória'
    })
});

// ========================================
// SCHEMAS DE CLIENTES
// ========================================

const createClienteSchema = Joi.object({
  nome: Joi.string()
    .max(200)
    .required()
    .trim(),
  cpf_cnpj: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  endereco: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .trim(),
  cep: Joi.string()
    .max(10)
    .optional()
    .allow('')
    .trim(),
  telefone: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  email: Joi.string()
    .email()
    .max(150)
    .optional()
    .allow('')
    .trim(),
  rca_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .allow(null, ''),
  observacao: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .trim()
});

// ========================================
// SCHEMAS DE RCA
// ========================================

const createRcaSchema = Joi.object({
  nome: Joi.string()
    .max(200)
    .required()
    .trim(),
  praca: Joi.string()
    .max(150)
    .optional()
    .allow('')
    .trim(),
  cpf: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  endereco: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .trim(),
  cep: Joi.string()
    .max(10)
    .optional()
    .allow('')
    .trim(),
  telefone: Joi.string()
    .max(20)
    .optional()
    .allow('')
    .trim(),
  email: Joi.string()
    .email()
    .max(150)
    .optional()
    .allow('')
    .trim(),
  observacao: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .trim()
});

// ========================================
// EXPORTS
// ========================================

module.exports = {
  // Autenticação
  loginSchema,
  createUserSchema,
  
  // Produtos
  createProdutoSchema,
  updateProdutoSchema,
  
  // Fornecedores
  createFornecedorSchema,
  
  // Movimentações
  createMovimentacaoSchema,
  
  // Contas a Receber
  createContaReceberSchema,
  createContaReceberManualSchema,
  marcarPagaSchema,
  
  // Contas a Pagar
  createContaPagarSchema,
  
  // Fluxo de Caixa
  createLancamentoFluxoSchema,
  
  // Clientes e RCAs
  createClienteSchema,
  createRcaSchema
};