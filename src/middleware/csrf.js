// ============================================
// PATCH 2: CSRF PROTECTION MIDDLEWARE
// ============================================
// Localização: src/middleware/csrf.js (CRIAR NOVO ARQUIVO)
// ============================================

const crypto = require('crypto');

// Gera token CSRF
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware para adicionar token CSRF à sessão e res.locals
function csrfToken(req, res, next) {
  // Gerar token se não existir na sessão
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  
  // Disponibilizar para as views
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// Middleware para validar token CSRF em requisições POST/PUT/DELETE
function csrfProtection(req, res, next) {
  // Ignorar métodos seguros (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Rotas que não precisam de CSRF (APIs internas, health check)
  const excludedRoutes = ['/health', '/api/'];
  if (excludedRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }

  // Obter token do body ou header
  const token = req.body._csrf || req.headers['x-csrf-token'];
  
  // Validar token
  if (!token || token !== req.session.csrfToken) {
    console.warn(`CSRF token inválido - Path: ${req.path}, IP: ${req.ip}`);
    
    // Se for requisição AJAX, retornar JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Token CSRF inválido' });
    }
    
    // Se for form submit, redirecionar com erro
    return res.status(403).render('error', {
      user: res.locals.user || null,
      titulo: 'Erro de Segurança',
      mensagem: 'Token de segurança inválido. Por favor, recarregue a página e tente novamente.',
      voltarUrl: req.headers.referer || '/'
    });
  }

  next();
}

module.exports = { csrfToken, csrfProtection };