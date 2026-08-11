require('dotenv').config();
const { buildApp } = require('./bootstrap');
const logger = require('./core/helpers/logger');
const lifecycle = require('./core/lifecycle');
const db = require('./core/db');

const app = buildApp();
const PORT = process.env.PORT || 5010;

async function start() {
  // Fail fast on a bad DB config rather than on the first request. In an orchestrator this is
  // what makes a misconfigured deploy crash-loop visibly instead of serving 500s.
  if (db.connect) await db.connect();

  const server = app.listen(PORT, () => {
    // Only now do we report ready — /ready returns 503 until this line, so a load balancer
    // won't route to an instance that is still starting up.
    lifecycle.setReady(true);
    logger.info(
      `Forge MVC (mode=${app.get('mode')}, db=${db.driver}, views=${app.get('viewEngine') || 'n/a'}) ` +
        `listening on http://localhost:${PORT}`
    );
  });

  // Keep-alive must outlive the load balancer's own idle timeout, or the LB can reuse a socket
  // at the exact moment Node closes it — which surfaces as random, unreproducible 502s.
  server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 65000);
  server.headersTimeout = server.keepAliveTimeout + 5000;

  // SIGTERM/SIGINT -> fail readiness, drain, close the pool, exit. See core/lifecycle.js.
  lifecycle.install({ server, db });
}

start().catch((err) => {
  logger.error(`Failed to start: ${err.stack || err.message}`);
  process.exit(1);
});
