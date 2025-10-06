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
    .valid('UN', 'KG', 'LT', 'MT', 'CX', 'PC', 'DZ')
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
    .valid('UN', 'KG', 'LT', 'MT', 'CX', 'PC', 'DZ')
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
}).min(1); // Pelo menos 1 campo deve ser fornecido

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
    .optional()
    .allow(null, ''),
  cliente_nome: Joi.string()
    .max(200)
    .required()
    .trim(),
  numero_parcela: Joi.number()
    .integer()
    .min(1)
    .max(999)
    .required(),
  total_parcelas: Joi.number()
    .integer()
    .min(1)
    .max(999)
    .required(),
  valor: Joi.number()
    .positive()
    .precision(2)
    .max(9999999.99)
    .required(),
  data_vencimento: Joi.date()
    .iso()
    .required()
    .messages({
      'any.required': 'Data de vencimento é obrigatória',
      'date.format': 'Data de vencimento inválida'
    }),
  categoria_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .allow(null, ''),
  descricao: Joi.string()
    .max(500)
    .optional()
    .allow('')
    .trim()
});

// ========================================
// SCHEMAS DE CONTAS A PAGAR
// ========================================

const createContaPagarSchema = Joi.object({
  fornecedor_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .allow(null, ''),
  descricao: Joi.string()
    .max(500)
    .required()
    .trim(),
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
    .optional()
    .allow(null, '')
});

// ========================================
// SCHEMAS DE CLIENTES
// ========================================

const createClienteSchema = Joi.object({
  codigo: Joi.string()
    .max(50)
    .optional()
    .allow('')
    .trim(),
  nome: Joi.string()
    .max(200)
    .required()
    .trim(),
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
  cep: Joi.string()
    .max(10)
    .optional()
    .allow('')
    .trim(),
  cpf_cnpj: Joi.string()
    .max(20)
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
  
  // Contas
  createContaReceberSchema,
  createContaPagarSchema,
  
  // Clientes e RCAs
  createClienteSchema,
  createRcaSchema
};