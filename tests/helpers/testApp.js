require('./env');
const path = require('path');
const request = require('supertest');

// Modules that own a process-wide singleton. They must survive cache-busting, for two reasons:
//
//   Handles — core/db (a connection pool) and core/helpers/logger (winston file transports).
//   Reloading these leaks a new pool/transport on every makeApp() call, and the open sockets
//   keep the event loop alive so the test runner never exits.
//
//   Shared state — core/context (one AsyncLocalStorage that the requestId middleware writes and
//   the logger reads), core/lifecycle (the ready/shuttingDown flags) and core/helpers/httpClient
//   (the circuit-breaker registry). Two copies of these means the writer and the reader are
//   looking at different objects, and the value silently never propagates.
//
// In production nothing busts the cache, so there is exactly one of each — this list keeps the
// test harness faithful to that.
const STATEFUL = [
  path.join('core', 'db'),
  path.join('core', 'context'),
  path.join('core', 'lifecycle'),
  path.join('core', 'helpers', 'logger'),
  path.join('core', 'helpers', 'httpClient'),
];

// Builds the real app in-process. Because bootstrap.js reads APP_MODE/VIEW_ENGINE at
// require-time, switching either one means dropping the modules that captured it.
function makeApp({ mode, viewEngine } = {}) {
  if (mode) process.env.APP_MODE = mode;
  if (viewEngine) process.env.VIEW_ENGINE = viewEngine;

  for (const key of Object.keys(require.cache)) {
    if (!key.includes('forge-mvc') || key.includes('node_modules')) continue;
    if (STATEFUL.some((frag) => key.includes(frag))) continue;
    delete require.cache[key];
  }

  const { buildApp } = require('../../bootstrap');
  return buildApp();
}

// --- Web (session + CSRF) helpers -------------------------------------------------------
// The web tree requires a valid CSRF token tied to the session cookie, so tests can't just
// POST blind — they have to GET the form first and reuse both the cookie and the token.

function extractCsrf(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return match ? match[1] : null;
}

// Returns { agent, csrfToken } — the agent persists cookies across requests like a browser.
async function webAgent(app, formPath = '/login') {
  const agent = request.agent(app);
  const res = await agent.get(formPath);
  return { agent, csrfToken: extractCsrf(res.text) };
}

// Logs in over the web tree and returns the cookie-carrying agent.
async function loginWeb(app, { username, password }) {
  const { agent, csrfToken } = await webAgent(app, '/login');
  await agent
    .post('/login')
    .type('form')
    .send({ _csrf: csrfToken, username, password })
    .expect(302);
  return agent;
}

// --- API (JWT) helpers ------------------------------------------------------------------

async function loginApi(app, { username, password }) {
  const res = await request(app).post('/api/auth/login').send({ username, password }).expect(200);
  return res.body.token;
}

module.exports = { makeApp, webAgent, loginWeb, loginApi, extractCsrf, request };
