const logger = require('./helpers/logger');

// Process lifecycle: come up cleanly, go down cleanly.
//
// Why this matters more in a service architecture than in a single app: orchestrators
// (Kubernetes, ECS, PM2, docker compose) restart your process constantly — every deploy, every
// scale event, every node drain. Each one sends SIGTERM and then SIGKILLs you after a grace
// period. Without a handler, Node dies on the spot: in-flight requests are dropped mid-response,
// database connections are left dangling, and a rolling deploy produces a burst of 502s.

// Shutdown runs in this order, and the order is the whole point:
//
//   1. Flip readiness to false, then WAIT (PRE_STOP_DELAY).
//      A load balancer only notices you're going away on its next readiness poll. If you stop
//      accepting connections before it has re-checked, it keeps routing to a dead socket. This
//      pause is what turns a rolling deploy from "some 502s" into "none".
//   2. Stop accepting new connections; let in-flight ones finish.
//   3. Close idle keep-alive sockets — otherwise a client holding an open connection keeps the
//      server alive until its own timeout.
//   4. Close the DB pool.
//   5. Exit. If any of that overruns SHUTDOWN_TIMEOUT, force it — a hung shutdown is worse than
//      an abrupt one, because the orchestrator SIGKILLs you anyway and you've lost the chance
//      to close anything at all.

const PRE_STOP_DELAY_MS = Number(process.env.PRE_STOP_DELAY_MS ?? 5000);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 15000);

const state = {
  ready: false,      // is this instance willing to receive traffic?
  shuttingDown: false,
};

function isReady() {
  return state.ready && !state.shuttingDown;
}
function isShuttingDown() {
  return state.shuttingDown;
}
function setReady(value) {
  state.ready = Boolean(value);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Promisified server.close() — resolves once every in-flight request has completed.
function closeServer(server) {
  return new Promise((resolve) => {
    let sweeper;
    server.close(() => {
      clearInterval(sweeper);
      resolve();
    });

    // `server.close()` stops accepting new connections but waits for existing ones to END — and
    // a keep-alive socket doesn't end just because its response finished. closeIdleConnections()
    // reaps those, but a connection that is still mid-request now becomes idle a moment LATER,
    // after we'd already swept. Calling it once therefore leaves the last connection hanging
    // until the client's own timeout (measured: ~4s of dead wait on a request that took 800ms).
    // Sweeping on an interval catches each connection as it goes idle.
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
      sweeper = setInterval(() => server.closeIdleConnections(), 50);
      sweeper.unref();
    }
  });
}

/**
 * install({ server, db, onShutdown }) — wires signal handlers and returns a shutdown() you can
 * also call directly (useful in tests).
 */
function install({ server, db, onShutdown } = {}) {
  let shutdownPromise = null;

  async function shutdown(signal) {
    // Signals can arrive more than once (a impatient operator hits Ctrl-C twice). Run once.
    if (shutdownPromise) return shutdownPromise;
    state.shuttingDown = true;

    shutdownPromise = (async () => {
      logger.info(`${signal} received — starting graceful shutdown`);

      // A hard deadline that wins no matter what hangs below.
      const forceExit = setTimeout(() => {
        logger.error(`Shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`);
        if (server && typeof server.closeAllConnections === 'function') server.closeAllConnections();
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);
      forceExit.unref(); // don't let the timer itself keep the process alive

      try {
        // 1. Fail readiness first, and give the load balancer time to notice.
        if (PRE_STOP_DELAY_MS > 0) {
          logger.info(`Readiness set to false; draining for ${PRE_STOP_DELAY_MS}ms before closing`);
          await sleep(PRE_STOP_DELAY_MS);
        }

        // 2 + 3. Stop accepting, let in-flight finish, release idle sockets.
        if (server) {
          logger.info('Closing HTTP server (waiting for in-flight requests)');
          await closeServer(server);
        }

        // App-specific teardown: flush a queue, deregister from service discovery, etc.
        if (typeof onShutdown === 'function') {
          logger.info('Running application shutdown hooks');
          await onShutdown();
        }

        // 4. Release database connections.
        if (db) {
          logger.info('Closing database connections');
          if (db.pool && typeof db.pool.end === 'function') await db.pool.end();
          else if (typeof db.close === 'function') await db.close();
        }

        clearTimeout(forceExit);
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        clearTimeout(forceExit);
        logger.error(`Error during shutdown: ${err.stack || err.message}`);
        process.exit(1);
      }
    })();

    return shutdownPromise;
  }

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => shutdown(signal));
  }

  // An unhandled rejection or uncaught exception leaves the process in an unknown state — its
  // invariants may already be broken. Log loudly and shut down rather than limping on serving
  // corrupt responses; the orchestrator will start a clean replacement.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : reason}`);
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.stack || err.message}`);
    shutdown('uncaughtException');
  });

  return shutdown;
}

module.exports = { install, isReady, isShuttingDown, setReady, PRE_STOP_DELAY_MS, SHUTDOWN_TIMEOUT_MS };
