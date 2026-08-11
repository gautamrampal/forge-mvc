// Session-bound CSRF for the web (cookie/session) route tree only. The API tree doesn't need
// this: it's authenticated with a Bearer token the browser never attaches automatically, so
// there's no ambient credential for a forged cross-site request to ride along on.
const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfProtect(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.isApi) return next(); // JWT-authenticated routes carry no ambient credential to forge

  // multipart/form-data bodies aren't parsed yet at this point in the global middleware chain
  // (multer runs later, per-route) — those routes must call csrfProtect again themselves, after
  // upload, via markMulterProcessed below. See app/routes/web.js for the pattern.
  if (req.is('multipart/form-data') && !req._multerProcessed) return next();
  const sent = req.body._csrf || req.headers['x-csrf-token'];
  if (!sent || sent !== req.session.csrfToken) {
    const err = new Error('Invalid or expired form token (CSRF). Please refresh and try again.');
    err.status = 403;
    return next(err);
  }
  next();
}

function markMulterProcessed(req, res, next) {
  req._multerProcessed = true;
  next();
}

module.exports = { csrfMiddleware, csrfProtect, markMulterProcessed };
