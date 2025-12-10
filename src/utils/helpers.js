// src/utils/helpers.js
// Helpers centralizados - elimina duplicação

const Joi = require('joi');

// ============================================
// SCHEMAS COMPARTILHADOS
// ============================================

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

const dateRangeSchema = Joi.object({
  data_inicio: Joi.date().iso().optional(),
  data_fim: Joi.date().iso().optional()
});

// ============================================
// HELPERS DE REDIRECT
// ============================================

function buildRedirectUrl(baseUrl, referer) {
  try {
    if (referer) {
      const url = new URL(referer);
      return baseUrl + url.search;
    }
  } catch (e) {}
  return baseUrl;
}

function redirectWithFilters(res, baseUrl, referer) {
  res.redirect(buildRedirectUrl(baseUrl, referer));
}

// ============================================
// HELPERS DE RESPOSTA
// ============================================

function renderError(res, { titulo, mensagem, voltar_url, status = 400 }) {
  return res.status(status).render('error', {
    user: res.locals.user,
    titulo,
    mensagem,
    voltar_url
  });
}

function notFound(res, entidade, voltar_url) {
  return renderError(res, {
    titulo: `${entidade} Não Encontrado`,
    mensagem: `O registro que você procura não existe.`,
    voltar_url,
    status: 404
  });
}

function duplicateError(res, campo, voltar_url) {
  return renderError(res, {
    titulo: 'Registro Duplicado',
    mensagem: `Já existe um registro com este ${campo}.`,
    voltar_url
  });
}

function dependencyError(res, entidade, dependencias, voltar_url) {
  return renderError(res, {
    titulo: 'Ação Bloqueada',
    mensagem: `${entidade} possui ${dependencias} e não pode ser excluído.`,
    voltar_url
  });
}

// ============================================
// HANDLER DE ERROS DE DB
// ============================================

function handleDbError(res, err, voltar_url, context = '') {
  console.error(`❌ Erro ${context}:`, err.message);
  
  // Duplicate key
  if (err.code === '23505') {
    return duplicateError(res, 'dado', voltar_url);
  }
  
  // Foreign key violation
  if (err.code === '23503') {
    return renderError(res, {
      titulo: 'Erro de Referência',
      mensagem: 'Registro referenciado não existe.',
      voltar_url
    });
  }
  
  // Generic error
  return renderError(res, {
    titulo: 'Erro',
    mensagem: 'Ocorreu um erro. Tente novamente.',
    voltar_url,
    status: 500
  });
}

module.exports = {
  // Schemas
  idParamSchema,
  paginationSchema,
  dateRangeSchema,
  
  // Helpers
  buildRedirectUrl,
  redirectWithFilters,
  
  // Responses
  renderError,
  notFound,
  duplicateError,
  dependencyError,
  handleDbError
};