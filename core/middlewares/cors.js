// Cross-Origin Resource Sharing. Hand-rolled for the same reason as core/middlewares/csrf.js —
// it's ~40 readable lines, and CORS is a security control you should be able to see rather than
// trust to an opaque default.
//
// Read CORS_ORIGINS from .env as a comma-separated allowlist:
//   CORS_ORIGINS=https://app.example.com,https://admin.example.com
//   CORS_ORIGINS=*            (public read-only APIs only — see the credentials note below)
//   CORS_ORIGINS=             (unset: CORS off, same-origin only. The safe default.)

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = function cors(options = {}) {
  const allowed = options.origins || parseOrigins(process.env.CORS_ORIGINS);
  const allowCredentials = options.credentials ?? process.env.CORS_CREDENTIALS === 'true';
  const methods = options.methods || 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  const allowedHeaders = options.allowedHeaders || 'Content-Type,Authorization,X-Request-Id,X-CSRF-Token';
  const maxAge = options.maxAge ?? 86400; // cache the preflight for a day
  const wildcard = allowed.includes('*');

  // `Access-Control-Allow-Origin: *` and `Allow-Credentials: true` are mutually exclusive by
  // spec — browsers reject the combination. Failing loudly at boot beats debugging a silent
  // CORS error in production.
  if (wildcard && allowCredentials) {
    throw new Error(
      'CORS misconfigured: CORS_ORIGINS="*" cannot be combined with CORS_CREDENTIALS=true. ' +
        'List explicit origins when you need cookies or Authorization to be sent.'
    );
  }

  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    // No Origin header means a same-origin or non-browser request — nothing to negotiate.
    if (!origin || allowed.length === 0) return next();

    const isAllowed = wildcard || allowed.includes(origin);
    if (isAllowed) {
      // Echo the specific origin rather than '*' when credentials are in play, and always set
      // Vary so a shared cache can't serve one origin's response to another.
      res.setHeader('Access-Control-Allow-Origin', wildcard && !allowCredentials ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      if (allowCredentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
      // Without this the browser hides X-Request-Id from client JS, which defeats the point of
      // returning it.
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    }

    // Preflight: answer and stop. Never let an OPTIONS probe fall through to a route handler.
    if (req.method === 'OPTIONS') {
      if (!isAllowed) return res.status(403).end();
      res.setHeader('Access-Control-Allow-Methods', methods);
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
      res.setHeader('Access-Control-Max-Age', String(maxAge));
      return res.status(204).end();
    }

    next();
  };
};
