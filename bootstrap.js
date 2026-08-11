// Builds the Express app and returns it WITHOUT listening on a port. Kept separate from
// server.js so tests can drive the real app in-process (supertest binds an ephemeral port
// itself) instead of having to spawn a server and poll a URL.
//
// Named bootstrap.js rather than the conventional app.js because this project already has an
// app/ directory — `require('./app')` would be ambiguous to read even though Node resolves it.
const path = require('path');
const { createApp } = require('./core/Application');
const notFound = require('./core/middlewares/notFound');
const errorHandler = require('./core/middlewares/errorHandler');

require('./app/config/mail'); // registers mail templates as a side effect

function buildApp() {
  const app = createApp({
    appDir: path.join(__dirname, 'app'),
    publicDir: path.join(__dirname, 'app', 'public'),
  });

  const mode = app.get('mode');

  // ORDER MATTERS: mount /api BEFORE the web tree. The web router is mounted at '/', so its
  // router.use() middleware (session, flash, csrfProtect) would otherwise run for /api/*
  // requests too — they'd be rejected by CSRF long before reaching the API router where markApi
  // flags them as exempt. Matching /api first means API requests never enter the web chain.
  if (mode !== 'mvc') {
    app.use('/api', require('./app/routes/api'));
  }
  if (mode !== 'api') {
    app.use('/', require('./app/routes/web'));
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { buildApp };
