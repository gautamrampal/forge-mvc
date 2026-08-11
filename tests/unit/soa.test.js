require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { runWithContext, getContext, getRequestId, setContextValue } = require('../../core/context');
const { createClient, HttpError, resetCircuits } = require('../../core/helpers/httpClient');
const lifecycle = require('../../core/lifecycle');

// --- Request context ---------------------------------------------------------------------------

test('context is visible across awaits without being passed', async () => {
  await runWithContext({ requestId: 'req-abc' }, async () => {
    assert.equal(getRequestId(), 'req-abc');
    await new Promise((r) => setTimeout(r, 5));
    // The whole point: still there after an await, three frames deep, with nothing threaded in.
    assert.equal(await nested(), 'req-abc');
  });

  async function nested() {
    await new Promise((r) => setImmediate(r));
    return getRequestId();
  }
});

test('contexts do not leak between concurrent requests', async () => {
  // The failure this guards: a module-level `currentRequestId` variable would have request B
  // overwrite request A's id mid-flight, and every log line would be attributed to the wrong one.
  const seen = await Promise.all([
    runWithContext({ requestId: 'A' }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      return getRequestId();
    }),
    runWithContext({ requestId: 'B' }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getRequestId();
    }),
  ]);
  assert.deepEqual(seen, ['A', 'B']);
});

test('getContext outside a request returns {} rather than throwing', () => {
  // Logging must never become a source of errors — a cron job or boot-time query has no request.
  assert.deepEqual(getContext(), {});
  assert.equal(getRequestId(), undefined);
});

test('setContextValue enriches the active context', async () => {
  await runWithContext({ requestId: 'r1' }, async () => {
    setContextValue('userId', 42);
    assert.equal(getContext().userId, 42);
  });
});

// --- HTTP client -------------------------------------------------------------------------------

// Spins up a throwaway server whose behaviour each test controls.
function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => resolve({ server, url: `http://localhost:${server.address().port}` }));
  });
}
const close = (server) => new Promise((r) => server.close(r));

test.beforeEach(() => resetCircuits());

test('client returns parsed JSON on success', async () => {
  const { server, url } = await startServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  const client = createClient({ name: 'json-svc', baseUrl: url });

  const body = await client.get('/thing');
  assert.equal(body.ok, true);
  assert.equal(body.path, '/thing');
  await close(server);
});

test('client propagates the correlation id to the downstream service', async () => {
  // This is what makes a distributed trace possible — without it, the downstream logs are
  // orphaned and you cannot follow one user action across services.
  let received = null;
  const { server, url } = await startServer((req, res) => {
    received = req.headers['x-request-id'];
    res.setHeader('content-type', 'application/json');
    res.end('{}');
  });
  const client = createClient({ name: 'trace-svc', baseUrl: url });

  await runWithContext({ requestId: 'trace-me-123' }, () => client.get('/x'));
  assert.equal(received, 'trace-me-123');
  await close(server);
});

test('client times out rather than hanging forever', async () => {
  // The failure mode this prevents: a bare fetch() has NO timeout, so a service that stops
  // responding (rather than refusing) holds the connection until the OS gives up.
  const { server, url } = await startServer(() => {
    /* deliberately never responds */
  });
  const client = createClient({ name: 'slow-svc', baseUrl: url, timeoutMs: 150, retries: 0 });

  const started = Date.now();
  await assert.rejects(() => client.get('/hang'), /timed out after 150ms/);
  assert.ok(Date.now() - started < 1000, 'must give up promptly, not hang');
  await close(server);
});

test('client retries a 503 and succeeds when the service recovers', async () => {
  let attempts = 0;
  const { server, url } = await startServer((req, res) => {
    attempts += 1;
    if (attempts < 3) {
      res.statusCode = 503;
      return res.end('unavailable');
    }
    res.setHeader('content-type', 'application/json');
    res.end('{"recovered":true}');
  });
  const client = createClient({ name: 'flaky-svc', baseUrl: url, retries: 2, retryDelayMs: 10 });

  const body = await client.get('/flaky');
  assert.equal(body.recovered, true);
  assert.equal(attempts, 3, 'should have taken three attempts');
  await close(server);
});

test('client does NOT retry a 4xx', async () => {
  // A 400 means the request itself is wrong; it will fail identically however many times you
  // send it. Retrying just multiplies load for no chance of success.
  let attempts = 0;
  const { server, url } = await startServer((req, res) => {
    attempts += 1;
    res.statusCode = 400;
    res.end('bad request');
  });
  const client = createClient({ name: 'four-oh-four', baseUrl: url, retries: 3, retryDelayMs: 5 });

  await assert.rejects(() => client.get('/bad'), (err) => err instanceof HttpError && err.status === 400);
  assert.equal(attempts, 1, '4xx must not be retried');
  await close(server);
});

test('client does NOT auto-retry a POST', async () => {
  // Retrying a non-idempotent write could create the resource twice. The caller must opt in.
  let attempts = 0;
  const { server, url } = await startServer((req, res) => {
    attempts += 1;
    res.statusCode = 503;
    res.end('nope');
  });
  const client = createClient({ name: 'post-svc', baseUrl: url, retries: 3, retryDelayMs: 5 });

  await assert.rejects(() => client.post('/orders', { item: 1 }));
  assert.equal(attempts, 1, 'POST must not be retried by default');
  await close(server);
});

test('circuit opens after repeated failures and then fails fast', async () => {
  let attempts = 0;
  const { server, url } = await startServer((req, res) => {
    attempts += 1;
    res.statusCode = 500;
    res.end('boom');
  });
  const client = createClient({
    name: 'dying-svc',
    baseUrl: url,
    retries: 0,
    failureThreshold: 3,
    resetTimeoutMs: 10_000,
  });

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => client.get('/x'));
  }
  assert.equal(client.breaker().state, 'open');

  const attemptsWhenOpen = attempts;
  const started = Date.now();
  // Now it must refuse WITHOUT making a network call — that's the "fail fast" that stops every
  // caller from queuing up behind a dead service.
  await assert.rejects(() => client.get('/x'), /Circuit open/);
  assert.equal(attempts, attemptsWhenOpen, 'no request should reach the server while open');
  assert.ok(Date.now() - started < 50, 'should fail immediately');
  await close(server);
});

test('circuit half-opens after the reset window and closes on success', async () => {
  let healthy = false;
  const { server, url } = await startServer((req, res) => {
    if (!healthy) {
      res.statusCode = 500;
      return res.end('boom');
    }
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  const client = createClient({
    name: 'recovering-svc',
    baseUrl: url,
    retries: 0,
    failureThreshold: 2,
    resetTimeoutMs: 100,
  });

  for (let i = 0; i < 2; i++) await assert.rejects(() => client.get('/x'));
  assert.equal(client.breaker().state, 'open');

  healthy = true;
  await new Promise((r) => setTimeout(r, 120)); // let the reset window elapse

  const body = await client.get('/x'); // the half-open probe
  assert.equal(body.ok, true);
  assert.equal(client.breaker().state, 'closed', 'a successful probe must close the circuit');
  await close(server);
});

test('a 4xx does not count toward opening the circuit', async () => {
  // Otherwise a burst of malformed client requests would trip the breaker on a perfectly
  // healthy service and take it out of rotation for everyone.
  const { server, url } = await startServer((req, res) => {
    res.statusCode = 404;
    res.end('not found');
  });
  const client = createClient({ name: 'healthy-svc', baseUrl: url, retries: 0, failureThreshold: 2 });

  for (let i = 0; i < 5; i++) await assert.rejects(() => client.get('/missing'));
  assert.equal(client.breaker().state, 'closed');
  await close(server);
});

test('each service gets its own circuit', async () => {
  // A failing billing service must not stop calls to a healthy users service.
  const bad = await startServer((req, res) => { res.statusCode = 500; res.end('x'); });
  const good = await startServer((req, res) => { res.setHeader('content-type','application/json'); res.end('{"ok":true}'); });

  const badClient = createClient({ name: 'svc-a', baseUrl: bad.url, retries: 0, failureThreshold: 2 });
  const goodClient = createClient({ name: 'svc-b', baseUrl: good.url, retries: 0, failureThreshold: 2 });

  for (let i = 0; i < 3; i++) await assert.rejects(() => badClient.get('/x'));
  assert.equal(badClient.breaker().state, 'open');
  assert.equal(goodClient.breaker().state, 'closed');
  assert.equal((await goodClient.get('/x')).ok, true, 'the healthy service is unaffected');

  await close(bad.server);
  await close(good.server);
});

// --- Lifecycle ----------------------------------------------------------------------------------

test('readiness reflects the ready flag and shutdown state', () => {
  lifecycle.setReady(false);
  assert.equal(lifecycle.isReady(), false, 'not ready before the server is listening');

  lifecycle.setReady(true);
  assert.equal(lifecycle.isReady(), true);
  assert.equal(lifecycle.isShuttingDown(), false);
});

test('graceful shutdown drains an in-flight request before exiting', async () => {
  // Verified end to end in a child process, because a real shutdown calls process.exit().
  const { execFileSync } = require('node:child_process');
  const script = `
    process.env.PRE_STOP_DELAY_MS='50';
    const http = require('node:http');
    const lifecycle = require('${require('path').join(__dirname, '..', '..', 'core', 'lifecycle').replace(/\\/g, '\\\\')}');
    let finished = false;
    const server = http.createServer((req, res) => setTimeout(() => { finished = true; res.end('ok'); }, 400));
    server.listen(0, () => {
      const port = server.address().port;
      const shutdown = lifecycle.install({ server, db: null });
      http.get('http://localhost:' + port + '/slow', (r) => r.resume());
      setTimeout(() => shutdown('SIGTERM'), 50);
    });
    process.on('exit', (code) => {
      process.stdout.write(JSON.stringify({ code, finished }));
    });
  `;
  const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 20000 });
  const result = JSON.parse(out.slice(out.lastIndexOf('{')));

  assert.equal(result.finished, true, 'the in-flight request must complete, not be cut off');
  assert.equal(result.code, 0, 'a clean drain exits 0');
});
