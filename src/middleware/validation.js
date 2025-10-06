// src/middleware/validation.js
// Middleware de validação centralizado

const Joi = require('joi');

/**
 * Middleware para validar request body
 * @param {Joi.ObjectSchema} schema - Schema Joi para validação
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Retorna todos os erros
      stripUnknown: true, // Remove campos não definidos no schema
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validação falhou',
        details: errors
      });
    }

    // Substitui req.body pelo valor validado e sanitizado
    req.body = value;
    next();
  };
};

/**
 * Middleware para validar query parameters
 * @param {Joi.ObjectSchema} schema - Schema Joi para validação
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validação de query falhou',
        details: errors
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Middleware para validar params da URL
 * @param {Joi.ObjectSchema} schema - Schema Joi para validação
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validação de parâmetros falhou',
        details: errors
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams
};