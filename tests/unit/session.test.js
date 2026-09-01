require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const flash = require('connect-flash');
const request = require('supertest');

const { createSessionMiddleware, resolveSessionStore } = require('../../core/session');

// Runs a callback with SESSION_STORE (and optionally NODE_ENV) temporarily set, restoring the
// originals even on assertion failure — env vars are process-global and other tests in this
// file depend on NODE_ENV=test.
function withEnv(vars, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// --- Store selection --------------------------------------------------------------------------

test('SESSION_STORE defaults to db', () => {
  withEnv({ NODE_ENV: 'development', SESSION_STORE: undefined }, () => {
    assert.equal(resolveSessionStore(), 'db');
  });
});

test('the default collapses to memory under NODE_ENV=test', () => {
  withEnv({ SESSION_STORE: undefined }, () => {
    assert.equal(resolveSessionStore(), 'memory');
  });
});

test('server-backed stores are forced to memory under NODE_ENV=test', () => {
  for (const kind of ['db', 'file', 'sqlite', 'redis', 'memcached']) {
    withEnv({ SESSION_STORE: kind }, () => {
      assert.equal(resolveSessionStore(), 'memory', `${kind} must not open handles in tests`);
    });
  }
});

test('cookie is honoured under NODE_ENV=test — it holds no server state', () => {
  withEnv({ SESSION_STORE: 'cookie' }, () => {
    assert.equal(resolveSessionStore(), 'cookie');
  });
});

test('outside tests every configured store passes through, case-insensitively', () => {
  withEnv({ NODE_ENV: 'development' }, () => {
    for (const kind of ['db', 'file', 'sqlite', 'redis', 'memcached', 'cookie', 'memory']) {
      withEnv({ SESSION_STORE: kind.toUpperCase() }, () => {
        assert.equal(resolveSessionStore(), kind);
      });
    }
  });
});

test('an unknown SESSION_STORE refuses to boot with a clear message', () => {
  withEnv({ SESSION_STORE: 'redis2' }, () => {
    assert.throws(() => resolveSessionStore(), /Unknown SESSION_STORE "redis2"/);
  });
});

test('the memory store yields a single express-session middleware function', () => {
  const mw = createSessionMiddleware(); // everything collapses to memory under test
  assert.equal(typeof mw, 'function');
});

// --- Cookie store + express-session compat shim ------------------------------------------------

// A minimal app exercising exactly the session API the real controllers use:
// property writes, regenerate(cb), save(cb), destroy(cb), and connect-flash.
function cookieApp() {
  return withEnv({ SESSION_STORE: 'cookie' }, () => {
    const app = express();
    const chain = createSessionMiddleware();
    assert.ok(Array.isArray(chain), 'cookie store swaps in a [cookie-session, compat] pair');
    app.use(chain);
    app.use(flash());

    app.get('/set', (req, res) => {
      req.session.user = { id: 1, username: 'alice' };
      req.session.stale = 'left over from before login'; // must NOT survive regenerate()
      res.send('ok');
    });
    app.get('/me', (req, res) =>
      res.json({
        user: (req.session && req.session.user) || null,
        stale: (req.session && req.session.stale) || null,
      })
    );
    // Reports the session's enumerable keys WITHOUT writing anything — see the shim test below.
    app.get('/keys', (req, res) => res.json({ keys: Object.keys(req.session) }));
    app.post('/regen', (req, res, next) =>
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = { id: 2, username: 'bob' };
        req.session.save(() => res.send('ok'));
      })
    );
    app.post('/logout', (req, res) => req.session.destroy(() => res.send('bye')));
    app.get('/flash', (req, res) => {
      req.flash('error', 'boom');
      res.send('ok');
    });
    app.get('/flash/read', (req, res) => res.json({ msgs: req.flash('error') }));
    return app;
  });
}

test('cookie store round-trips session data through the signed cookie', async () => {
  const agent = request.agent(cookieApp());
  const res = await agent.get('/set').expect(200);

  const setCookies = res.headers['set-cookie'] || [];
  assert.ok(setCookies.some((c) => c.startsWith('forge.sid=')), 'payload cookie issued');
  assert.ok(setCookies.some((c) => c.startsWith('forge.sid.sig=')), 'signature cookie issued');

  const me = await agent.get('/me').expect(200);
  assert.deepEqual(me.body.user, { id: 1, username: 'alice' });

  // The payload really is client-readable base64 JSON — the documented cookie-store trade-off.
  const payload = setCookies.find((c) => c.startsWith('forge.sid='));
  const decoded = Buffer.from(decodeURIComponent(payload.split(';')[0].split('=')[1]), 'base64').toString('utf8');
  assert.match(decoded, /alice/);
});

test('the compat shims are invisible to session enumeration', async () => {
  // If the shims were attached as plain enumerable properties, two things would break:
  // Object.keys(session) would list them, and an untouched session would count as "populated"
  // (cookie-session's isPopulated checks Object.keys().length), handing every anonymous visitor
  // a session cookie via the rolling stamp. Both are observable — assert on them.
  const res = await request(cookieApp()).get('/keys').expect(200);
  assert.deepEqual(res.body.keys, [], 'a fresh session has no enumerable keys');
  const cookies = res.headers['set-cookie'] || [];
  assert.ok(!cookies.some((c) => c.startsWith('forge.sid=')), 'an untouched session issues no cookie');
});

test('regenerate() discards the previous session state — the login flow', async () => {
  const agent = request.agent(cookieApp());
  await agent.get('/set').expect(200); // user alice + a stale marker
  await agent.post('/regen').expect(200);
  const me = await agent.get('/me').expect(200);
  assert.deepEqual(me.body.user, { id: 2, username: 'bob' });
  assert.equal(me.body.stale, null, 'pre-regenerate state must not survive');
});

test('destroy() ends the session — the logout flow', async () => {
  const agent = request.agent(cookieApp());
  await agent.get('/set').expect(200);
  await agent.post('/logout').expect(200);
  const me = await agent.get('/me').expect(200);
  assert.equal(me.body.user, null);
});

test('connect-flash works on cookie sessions: set once, read once, then gone', async () => {
  const agent = request.agent(cookieApp());
  await agent.get('/flash').expect(200);
  const first = await agent.get('/flash/read').expect(200);
  assert.deepEqual(first.body.msgs, ['boom']);
  const second = await agent.get('/flash/read').expect(200);
  assert.deepEqual(second.body.msgs, []);
});
