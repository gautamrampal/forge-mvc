const express = require('express');
const db = require('./db');
const lifecycle = require('./lifecycle');
const logger = require('./helpers/logger');

// Two endpoints that look similar and mean completely different things. Getting them mixed up
// is one of the most common causes of self-inflicted outages in a service architecture.
//
//   GET /health  — LIVENESS.  "Is this process alive?"  Checks NOTHING external.
//   GET /ready   — READINESS. "Should traffic be routed here right now?"  Checks dependencies.
//
// Why liveness must not check the database: a failed liveness probe means *restart this
// container*. If liveness checked the DB, then a 30-second database blip would fail the probe on
// every instance simultaneously, and the orchestrator would restart your entire fleet — turning
// a brief dependency wobble into a full outage, with a thundering herd of reconnects on top.
// Readiness failing just removes an instance from the load balancer, which is recoverable and
// reverses itself automatically.

const START_TIME = Date.now();
const SERVICE_NAME = process.env.SERVICE_NAME || process.env.APP_NAME || 'forge-mvc';
const VERSION = process.env.SERVICE_VERSION || require('../package.json').version;
const READY_CHECK_TIMEOUT_MS = Number(process.env.READY_CHECK_TIMEOUT_MS ?? 2000);

// A dependency check must never hang — a readiness probe that never answers is read as a
// failure anyway, but it also ties up a connection each time the orchestrator polls.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} check timed out after ${ms}ms`)), ms)),
  ]);
}

async function checkDatabase() {
  const started = Date.now();
  try {
    if (db.driver === 'mongodb') {
      const conn = await withTimeout(db.connect(), READY_CHECK_TIMEOUT_MS, 'database');
      await withTimeout(conn.command({ ping: 1 }), READY_CHECK_TIMEOUT_MS, 'database');
    } else {
      await withTimeout(db.query('SELECT 1'), READY_CHECK_TIMEOUT_MS, 'database');
    }
    return { name: 'database', driver: db.driver, status: 'up', latencyMs: Date.now() - started };
  } catch (err) {
    return { name: 'database', driver: db.driver, status: 'down', error: err.message, latencyMs: Date.now() - started };
  }
}

/**
 * createHealthRouter({ checks }) — mount at the app root, BEFORE auth.
 * Probes come from the orchestrator, which has no credentials and must not be rate limited.
 *
 * `checks` lets you add your own dependencies:
 *   createHealthRouter({ checks: [async () => ({ name: 'redis', status: 'up' })] })
 */
function createHealthRouter({ checks = [] } = {}) {
  const router = express.Router();

  // LIVENESS — deliberately trivial. If the event loop can answer this, the process is healthy
  // enough to keep. Answering 200 here while dependencies are down is correct behaviour.
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: SERVICE_NAME,
      version: VERSION,
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    });
  });

  // READINESS — checks everything needed to serve a real request.
  router.get('/ready', async (req, res) => {
    // During shutdown we report not-ready immediately, without touching the database. This is
    // what lets the load balancer drain us before the server stops accepting (see
    // core/lifecycle.js — the pre-stop delay exists precisely so this has time to be polled).
    if (lifecycle.isShuttingDown()) {
      return res.status(503).json({ status: 'shutting_down', service: SERVICE_NAME, checks: [] });
    }

    const results = await Promise.all([checkDatabase(), ...checks.map((fn) => runCheck(fn))]);
    const healthy = results.every((r) => r.status === 'up');

    // 503, not 500: "I am temporarily unable to serve", which is what a load balancer acts on.
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'not_ready',
      service: SERVICE_NAME,
      version: VERSION,
      checks: results,
    });
  });

  return router;
}

// A custom check that throws must degrade to "down", never crash the probe itself.
async function runCheck(fn) {
  try {
    const result = await withTimeout(Promise.resolve(fn()), READY_CHECK_TIMEOUT_MS, 'dependency');
    return { status: 'up', ...result };
  } catch (err) {
    logger.warn(`Readiness check failed: ${err.message}`);
    return { name: fn.name || 'custom', status: 'down', error: err.message };
  }
}

module.exports = { createHealthRouter, checkDatabase };
