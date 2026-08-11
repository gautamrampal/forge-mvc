require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, request } = require('../helpers/testApp');
const lifecycle = require('../../core/lifecycle');

test.before(async () => { await migrateTestDb(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => {
  lifecycle.setReady(false);
  delete process.env.CORS_ORIGINS;
  await closeTestDb();
});

// --- Health & readiness --------------------------------------------------------------------------

test('GET /health is liveness only — no auth, no dependency checks', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').expect(200);

  assert.equal(res.body.status, 'ok');
  assert.ok(res.body.service);
  assert.ok(typeof res.body.uptimeSeconds === 'number');
  // Deliberately absent: if liveness checked the DB, a brief database blip would fail the probe
  // on every instance at once and the orchestrator would restart the whole fleet.
  assert.equal(res.body.checks, undefined);
});

test('GET /ready reports dependency health', async () => {
  const app = makeApp({ mode: 'hybrid' });
  lifecycle.setReady(true);

  const res = await request(app).get('/ready').expect(200);
  assert.equal(res.body.status, 'ready');

  const dbCheck = res.body.checks.find((c) => c.name === 'database');
  assert.equal(dbCheck.status, 'up');
  assert.ok(typeof dbCheck.latencyMs === 'number');
});

test('GET /ready returns 503 once shutdown has begun', async () => {
  // This is what lets a load balancer drain an instance BEFORE it stops accepting connections.
  const app = makeApp({ mode: 'hybrid' });
  lifecycle.setReady(true);
  await request(app).get('/ready').expect(200);

  // Simulate the state lifecycle.install() sets on SIGTERM, without exiting the test process.
  const original = lifecycle.isShuttingDown;
  lifecycle.isShuttingDown = () => true;
  try {
    const res = await request(app).get('/ready').expect(503);
    assert.equal(res.body.status, 'shutting_down');
    // Liveness must still pass — the process is alive and finishing its work; restarting it now
    // would kill the in-flight requests we're trying to drain.
    await request(app).get('/health').expect(200);
  } finally {
    lifecycle.isShuttingDown = original;
  }
});

test('probes are reachable without authentication', async () => {
  // The orchestrator has no credentials. If probes required auth they would fail permanently and
  // the container would be restarted forever.
  const app = makeApp({ mode: 'hybrid' });
  lifecycle.setReady(true);
  await request(app).get('/health').expect(200);
  await request(app).get('/ready').expect(200);
});

test('probes work in APP_MODE=api, where there is no view engine', async () => {
  const app = makeApp({ mode: 'api' });
  lifecycle.setReady(true);
  const res = await request(app).get('/health').expect(200);
  assert.match(res.headers['content-type'], /json/);
});

// --- Correlation id -------------------------------------------------------------------------------

test('every response carries an X-Request-Id', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').expect(200);
  assert.match(res.headers['x-request-id'], /^[\w.-]+$/);
});

test('a caller-supplied request id is echoed, not replaced', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').set('X-Request-Id', 'upstream-trace-42').expect(200);
  assert.equal(res.headers['x-request-id'], 'upstream-trace-42');
});

test('x-correlation-id is accepted as an alternative header', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').set('X-Correlation-Id', 'corr-99').expect(200);
  assert.equal(res.headers['x-request-id'], 'corr-99');
});

test('a hostile request id is sanitised before it reaches logs or headers', async () => {
  // Unsanitised, a header containing CR/LF could forge extra log lines or inject a response
  // header. Anything outside [\w.-] is stripped.
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').set('X-Request-Id', 'evil<>"; DROP').expect(200);
  assert.match(res.headers['x-request-id'], /^[\w.-]+$/);
  assert.equal(res.headers['x-request-id'].includes('<'), false);
});

test('an over-long request id is rejected and a fresh one minted', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const res = await request(app).get('/health').set('X-Request-Id', 'x'.repeat(500)).expect(200);
  assert.ok(res.headers['x-request-id'].length <= 128);
});

// --- CORS ---------------------------------------------------------------------------------------

test('CORS is off by default (same-origin only)', async () => {
  delete process.env.CORS_ORIGINS;
  const app = makeApp({ mode: 'api' });
  const res = await request(app).get('/health').set('Origin', 'https://evil.test').expect(200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('an allowlisted origin is echoed with Vary: Origin', async () => {
  process.env.CORS_ORIGINS = 'https://app.test,https://admin.test';
  const app = makeApp({ mode: 'api' });

  const res = await request(app).get('/health').set('Origin', 'https://app.test').expect(200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://app.test');
  // Without Vary, a shared cache could hand one origin's response to another.
  assert.match(res.headers['vary'], /Origin/);
  assert.match(res.headers['access-control-expose-headers'], /X-Request-Id/);
});

test('a non-allowlisted origin gets no CORS headers', async () => {
  process.env.CORS_ORIGINS = 'https://app.test';
  const app = makeApp({ mode: 'api' });
  const res = await request(app).get('/health').set('Origin', 'https://evil.test').expect(200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('preflight is answered and short-circuited', async () => {
  process.env.CORS_ORIGINS = 'https://app.test';
  const app = makeApp({ mode: 'api' });

  const res = await request(app)
    .options('/api/users')
    .set('Origin', 'https://app.test')
    .set('Access-Control-Request-Method', 'POST')
    .expect(204);

  assert.match(res.headers['access-control-allow-methods'], /POST/);
  assert.match(res.headers['access-control-allow-headers'], /Authorization/);
  assert.ok(res.headers['access-control-max-age']);
});

test('preflight from a disallowed origin is refused', async () => {
  process.env.CORS_ORIGINS = 'https://app.test';
  const app = makeApp({ mode: 'api' });
  await request(app).options('/api/users').set('Origin', 'https://evil.test').expect(403);
});

test('wildcard origin combined with credentials fails loudly at boot', () => {
  // The two are mutually exclusive per spec; browsers silently reject the combination, so
  // crashing at startup beats debugging a phantom CORS error in production.
  process.env.CORS_ORIGINS = '*';
  process.env.CORS_CREDENTIALS = 'true';
  try {
    assert.throws(() => makeApp({ mode: 'api' }), /cannot be combined with CORS_CREDENTIALS/);
  } finally {
    delete process.env.CORS_CREDENTIALS;
    delete process.env.CORS_ORIGINS;
  }
});
