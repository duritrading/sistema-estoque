// src/middleware/asyncHandler.js
// Elimina try/catch repetitivo

const { handleDbError } = require('../utils/helpers');

// Wrapper para rotas async - elimina try/catch em cada rota
const asyncHandler = (fn, voltar_url) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => {
    if (voltar_url) {
      handleDbError(res, err, typeof voltar_url === 'function' ? voltar_url(req) : voltar_url);
    } else {
      next(err);
    }
  });
};

module.exports = asyncHandler;