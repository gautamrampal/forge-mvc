require('../helpers/env');
// SESSION_STORE=cookie is the one backend that changes the middleware itself (cookie-session +
// compat shim instead of express-session), so it gets its own pass through the real web tree:
// same login/CSRF/logout flow as web.test.js, different session plumbing underneath. Set before
// makeApp() so the freshly-required core/session.js sees it.
process.env.SESSION_STORE = 'cookie';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, webAgent, loginWeb, extractCsrf, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

let app;

test.before(async () => {
  await migrateTestDb();
  app = makeApp({ mode: 'hybrid', viewEngine: 'ejs' });
});
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

test('the login form still mints a CSRF token on a cookie session', async () => {
  const res = await request(app).get('/login').expect(200);
  assert.ok(extractCsrf(res.text), 'csrf token rendered');
  const cookies = res.headers['set-cookie'] || [];
  assert.ok(cookies.some((c) => c.startsWith('forge.sid=')), 'session payload cookie issued');
  assert.ok(cookies.some((c) => c.startsWith('forge.sid.sig=')), 'signature cookie issued');
});

test('login (regenerate + save), browsing, and logout (destroy) all work end to end', async () => {
  const user = await createUser({ username: 'cookiemonster' });
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  // Signed in: the protected list page renders and shows who we are.
  const list = await agent.get('/users').expect(200);
  assert.match(list.text, /cookiemonster/);

  // Logout posts with the CSRF token, destroys the session, and we're anonymous again.
  const page = await agent.get('/users').expect(200);
  const csrfToken = extractCsrf(page.text);
  await agent.post('/logout').type('form').send({ _csrf: csrfToken }).expect(302);
  const after = await agent.get('/users').expect(302);
  assert.equal(after.headers.location, '/login');
});

test('login lands on the page the visitor originally asked for (postLoginRedirect)', async () => {
  const user = await createUser({ username: 'deeplinker' });
  const agent = request.agent(app);

  // Anonymous hit on a protected page: bounced to /login, intended URL remembered in the session.
  const bounce = await agent.get('/users/create').expect(302);
  assert.equal(bounce.headers.location, '/login');

  const form = await agent.get('/login').expect(200);
  const login = await agent
    .post('/login')
    .type('form')
    .send({ _csrf: extractCsrf(form.text), username: user.username, password: DEFAULT_PASSWORD })
    .expect(302);
  assert.equal(login.headers.location, '/users/create', 'deep-link must survive session regeneration');
});

test('CSRF still rejects a posts without a token — the guard is store-agnostic', async () => {
  const user = await createUser({ username: 'victim' });
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  await agent.post('/users').type('form').send({ username: 'smuggled', password: 'x' }).expect(403);
});

test('a tampered session cookie is rejected by the signature, not trusted', async () => {
  const user = await createUser({ username: 'honest' });
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  // Forge a payload claiming to be user id 999 but keep the old signature: cookie-session must
  // treat the pair as invalid and hand out a fresh anonymous session.
  const forged = Buffer.from(JSON.stringify({ user: { id: 999, username: 'admin' } })).toString('base64');
  const res = await request(app)
    .get('/users')
    .set('Cookie', [`forge.sid=${forged}`, 'forge.sid.sig=AAAAAAAAAAAAAAAAAAAAAAAAAAA'])
    .expect(302);
  assert.equal(res.headers.location, '/login');
});
