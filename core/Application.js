// Framework bootstrap. Builds the parts of an Express app that are always the same regardless
// of what you're building on top: security headers, body parsing, method-override, static
// assets, and (for mvc/hybrid apps) the view engine. Session/flash/CSRF are deliberately NOT
// wired up here — see app/routes/web.js. They're mounted only on the web route tree, because
// mounting them globally runs into an ordering problem: markApi (which flags a request so
// csrfProtect knows to skip it) only runs once Express has already routed into the /api
// sub-router, which is *after* any globally-mounted middleware would have already run.
// Keeping each route tree's middleware scoped to that tree sidesteps the problem entirely.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const methodOverride = require('method-override');
const { configureViews } = require('./views');
const requestId = require('./middlewares/requestId');
const cors = require('./middlewares/cors');
const { createRateLimiter } = require('./middlewares/rateLimit');
const { createHealthRouter } = require('./health');

// `appDir` is your app/ folder; the view engine picks views/ or views-tsx/ under it based on
// VIEW_ENGINE. APP_MODE=api skips view setup entirely — there's nothing to render.
// `healthChecks` are extra readiness probes beyond the database — see core/health.js.
function createApp({ appDir, publicDir, healthChecks = [] } = {}) {
  const mode = (process.env.APP_MODE || 'hybrid').toLowerCase(); // mvc | api | hybrid
  const app = express();
  app.set('mode', mode);

  if (mode !== 'api' && appDir) {
    configureViews(app, { appDir });
  }

  // FIRST, before anything that logs: mints/propagates the correlation id and puts it on the
  // async context, so every log line downstream carries it automatically.
  app.use(requestId);

  app.use(
    helmet({
      contentSecurityPolicy: false, // enable + configure a nonce policy once you know your asset origins
      // 'no-referrer' (helmet's default) strips the Referer header even on same-origin form
      // posts, which breaks validate.js's redirect-back-to-the-form behavior on failed
      // submissions (see core/middlewares/validate.js for the full story). 'same-origin' fixes
      // that while still sending nothing to external sites.
      referrerPolicy: { policy: 'same-origin' },
    })
  );

  // CORS is a no-op unless CORS_ORIGINS is set, so this is safe to always mount.
  app.use(cors());

  // Health probes are mounted BEFORE the rate limiter, auth, sessions and CORS: the orchestrator
  // has no credentials, and throttling a liveness probe gets your container restarted.
  app.use(createHealthRouter({ checks: healthChecks }));

  // Global abuse brake. Per-route limits (e.g. login) are applied in the route trees.
  if (process.env.RATE_LIMIT_ENABLED !== 'false') {
    app.use(createRateLimiter());
  }

  // Log the correlation id alongside each access-log line so they join to the app logs.
  morgan.token('reqId', (req) => req.id || '-');
  app.use(
    morgan(
      process.env.NODE_ENV === 'production'
        ? ':remote-addr :reqId :method :url :status :res[content-length] - :response-time ms'
        : 'dev'
    )
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  // method-override@3's string-getter mode only reads the query string, not the body (its own
  // JSDoc is stale on this point) — a custom getter is required for HTML forms that carry a
  // hidden `_method` field, which is how every PUT/PATCH/DELETE form in the web tree works.
  app.use(
    methodOverride((req) => {
      if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        const method = req.body._method;
        delete req.body._method;
        return method;
      }
    })
  );

  if (publicDir && fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  return app;
}

module.exports = { createApp };
