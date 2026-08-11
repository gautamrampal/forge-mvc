const rateLimit = require('express-rate-limit');
const { wantsJson } = require('../Controller');

// Rate limiting, wired to answer in the right format for whichever route tree it's on.
//
// ⚠️ THE DEFAULT STORE IS PER-PROCESS MEMORY. With three instances behind a load balancer,
// a limit of 100 becomes an effective 300, and a restart resets every counter. That's usually
// fine as a crude abuse brake, but it is NOT a correct limit. For real enforcement across a
// fleet, pass a shared store:
//
//   npm install rate-limit-redis ioredis
//   const RedisStore = require('rate-limit-redis');
//   createRateLimiter({ store: new RedisStore({ sendCommand: (...a) => redis.call(...a) }) })

function createRateLimiter({
  windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  limit = Number(process.env.RATE_LIMIT_MAX ?? 300),
  message = 'Too many requests — please slow down.',
  store,
  skip,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7', // RateLimit-* headers so clients can back off politely
    legacyHeaders: false,
    store,
    // Never rate limit the orchestrator's health probes — throttling those makes Kubernetes
    // think the service is unhealthy and restart it, which is a self-inflicted outage.
    skip: skip || ((req) => req.path === '/health' || req.path === '/ready'),
    handler: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      if (wantsJson(req)) {
        return res.status(429).json({ success: false, message, retryAfter });
      }
      res.status(429).send(message);
    },
  });
}

// A much tighter limit for login and password-reset routes. Credential stuffing is a volume
// game; the general API limit is far too generous to slow it down.
function createAuthRateLimiter(options = {}) {
  return createRateLimiter({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
    message: 'Too many sign-in attempts — please try again later.',
    ...options,
  });
}

module.exports = { createRateLimiter, createAuthRateLimiter };
