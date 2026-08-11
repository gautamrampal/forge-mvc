require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, webAgent, loginWeb, extractCsrf, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

const User = require('../../app/models/User');
let app;

test.before(async () => {
  await migrateTestDb();
  app = makeApp({ mode: 'hybrid', viewEngine: 'ejs' });
});
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

// --- Session management ---------------------------------------------------------------------

test('the login form renders with a CSRF token', async () => {
  const res = await request(app).get('/login').expect(200);
  assert.match(res.headers['content-type'], /html/);
  assert.ok(extractCsrf(res.text));
});

test('protected pages redirect anonymous visitors to /login', async () => {
  for (const path of ['/users', '/users/create', '/users/1', '/users/1/edit']) {
    const res = await request(app).get(path).expect(302);
    assert.equal(res.headers.location, '/login', `${path} should bounce to login`);
  }
});

test('a valid login starts a session', async () => {
  const user = await createUser({ username: 'signer' });
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  const res = await agent.get('/users').expect(200);
  assert.match(res.text, /signer/, 'the navbar shows who is signed in');
});

test('a wrong password is rejected without revealing whether the user exists', async () => {
  const user = await createUser({ username: 'realuser' });
  const { agent, csrfToken } = await webAgent(app, '/login');

  const bad = await agent
    .post('/login')
    .type('form')
    .send({ _csrf: csrfToken, username: user.username, password: 'wrong-password' })
    .expect(302);
  assert.equal(bad.headers.location, '/login');

  const page = await agent.get('/login').expect(200);
  assert.match(page.text, /Invalid username or password/);
  // The same wording must appear for a username that doesn't exist at all, or the form becomes
  // a user-enumeration oracle.
  const { agent: a2, csrfToken: t2 } = await webAgent(app, '/login');
  await a2.post('/login').type('form').send({ _csrf: t2, username: 'ghost', password: 'whatever' }).expect(302);
  const page2 = await a2.get('/login').expect(200);
  assert.match(page2.text, /Invalid username or password/);
});

test('an inactive account cannot sign in', async () => {
  const user = await createUser({ username: 'dormant', status: 'inactive' });
  const { agent, csrfToken } = await webAgent(app, '/login');

  await agent
    .post('/login')
    .type('form')
    .send({ _csrf: csrfToken, username: user.username, password: DEFAULT_PASSWORD })
    .expect(302);

  const page = await agent.get('/login').expect(200);
  assert.match(page.text, /account is inactive/i);
});

test('deactivating a signed-in user ends their session on the next request', async () => {
  // This is what app/middlewares/requireActiveUser.js exists for: a session is a snapshot from
  // login time, so without a re-check a deactivated user keeps browsing until the cookie expires.
  const user = await createUser({ username: 'about.to.go' });
  await createUser({ username: 'someone.else' }); // keep an active account so the guard isn't the "last active" rule
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  await agent.get('/users').expect(200);

  await User.update(user.id, { status: 'inactive' });

  const res = await agent.get('/users').expect(302);
  assert.equal(res.headers.location, '/login?reason=deactivated');

  const login = await request(app).get('/login?reason=deactivated').expect(200);
  assert.match(login.text, /deactivated/i, 'the login page explains what happened');
});

test('logout destroys the session', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  const page = await agent.get('/users').expect(200);
  await agent.post('/logout').type('form').send({ _csrf: extractCsrf(page.text) }).expect(302);

  const after = await agent.get('/users').expect(302);
  assert.equal(after.headers.location, '/login');
});

test('a state-changing POST without a CSRF token is rejected', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  const res = await agent
    .post('/users')
    .type('form')
    .send({ username: 'no.csrf', password: 'Password@123', status: 'active' });

  assert.equal(res.status, 403);
  assert.equal(await User.findByUsername('no.csrf'), null, 'nothing may be written');
});

// --- CRUD -------------------------------------------------------------------------------------

async function signedIn() {
  const user = await createUser({ username: `admin${Date.now()}` });
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  return { user, agent };
}

test('the list shows users and an empty state when filtered to nothing', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'visible.user' });

  const list = await agent.get('/users').expect(200);
  assert.match(list.text, /visible\.user/);

  const empty = await agent.get('/users?status=inactive').expect(200);
  assert.match(empty.text, /No users match your search/i);
});

test('the search box filters the list', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'jane.doe' });
  await createUser({ username: 'bob.jones' });

  const res = await agent.get('/users?q=jane').expect(200);
  assert.match(res.text, /jane\.doe/);
  assert.equal(/bob\.jones/.test(res.text), false, 'non-matching rows are excluded');
  assert.match(res.text, /1 result/, 'the result count reflects the search');
});

test('search and status filter compose', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'jane.active', status: 'active' });
  await createUser({ username: 'jane.inactive', status: 'inactive' });
  await createUser({ username: 'bob.inactive', status: 'inactive' });

  const res = await agent.get('/users?q=jane&status=inactive').expect(200);
  assert.match(res.text, /jane\.inactive/);
  assert.equal(/jane\.active/.test(res.text.replace(/jane\.inactive/g, '')), false);
  assert.equal(/bob\.inactive/.test(res.text), false);
});

test('a search with no matches shows a "clear search" empty state, not "create a user"', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'somebody' });

  const res = await agent.get('/users?q=nothingmatchesthis').expect(200);
  assert.match(res.text, /No users match your search/i);
  assert.match(res.text, /Clear search/i, 'offers a way out of the search');
});

test('the search term is echoed back into the box and into pagination links', async () => {
  const { agent } = await signedIn();
  for (let i = 0; i < 30; i++) await createUser({ username: `findme.${i}` });

  const res = await agent.get('/users?q=findme').expect(200);
  assert.match(res.text, /value="findme"/, 'the box keeps the term so it can be refined');
  // Losing the query on "page 2" is the classic bug here.
  assert.match(res.text, /href="\/users\?q=findme[^"]*page=2"/, 'pagination links carry the search');
});

test('the status filter narrows the list', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'active.one', status: 'active' });
  await createUser({ username: 'inactive.one', status: 'inactive' });

  const res = await agent.get('/users?status=inactive').expect(200);
  assert.match(res.text, /inactive\.one/);
  assert.equal(/active\.one/.test(res.text.replace(/inactive\.one/g, '')), false, 'active user filtered out');
});

test('creating a user persists it with a hashed password', async () => {
  const { agent } = await signedIn();
  const form = await agent.get('/users/create').expect(200);

  const res = await agent
    .post('/users')
    .type('form')
    .set('Referer', '/users/create')
    .send({ _csrf: extractCsrf(form.text), username: 'created.here', password: 'Created@123', status: 'active' })
    .expect(302);
  assert.equal(res.headers.location, '/users');

  const saved = await User.findByUsername('created.here');
  assert.ok(saved);
  assert.notEqual(saved.password, 'Created@123', 'must be hashed');
});

test('an invalid create returns to the form with errors and the typed values', async () => {
  const { agent } = await signedIn();
  const form = await agent.get('/users/create').expect(200);

  const res = await agent
    .post('/users')
    .type('form')
    .set('Referer', '/users/create')
    .send({ _csrf: extractCsrf(form.text), username: 'ab', password: 'short', status: 'active' })
    .expect(302);
  assert.equal(res.headers.location, '/users/create', 'must return to the form, not "/"');

  const reloaded = await agent.get('/users/create').expect(200);
  assert.match(reloaded.text, /is-invalid/);
  assert.match(reloaded.text, /Username must be 3-50 characters/);
  assert.match(reloaded.text, /Password must be at least 8 characters/);
  assert.match(reloaded.text, /value="ab"/, 'the typed username survives');
});

test('a duplicate username is rejected with a field error', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'duplicate.me' });
  const form = await agent.get('/users/create').expect(200);

  await agent
    .post('/users')
    .type('form')
    .set('Referer', '/users/create')
    .send({ _csrf: extractCsrf(form.text), username: 'duplicate.me', password: 'Password@123', status: 'active' })
    .expect(302);

  const reloaded = await agent.get('/users/create').expect(200);
  assert.match(reloaded.text, /already taken/i);
});

test('updating with a blank password keeps the existing one', async () => {
  const { agent } = await signedIn();
  const target = await createUser({ username: 'to.rename' });
  const before = (await User.findById(target.id)).password;

  const form = await agent.get(`/users/${target.id}/edit`).expect(200);
  await agent
    .post(`/users/${target.id}`)
    .type('form')
    .set('Referer', `/users/${target.id}/edit`)
    .send({ _csrf: extractCsrf(form.text), _method: 'PUT', username: 'renamed.ok', password: '', status: 'inactive' })
    .expect(302);

  const after = await User.findById(target.id);
  assert.equal(after.username, 'renamed.ok');
  assert.equal(after.status, 'inactive');
  assert.equal(after.password, before, 'blank password must not wipe the stored hash');
});

test('deleting a user removes it', async () => {
  const { agent } = await signedIn();
  const target = await createUser({ username: 'delete.me' });

  const page = await agent.get(`/users/${target.id}`).expect(200);
  await agent
    .post(`/users/${target.id}`)
    .type('form')
    .send({ _csrf: extractCsrf(page.text), _method: 'DELETE' })
    .expect(302);

  assert.equal(await User.findById(target.id), null);
});

test('you cannot delete your own account', async () => {
  const { user, agent } = await signedIn();
  await createUser(); // so the "last active account" rule isn't what blocks it

  const page = await agent.get('/users').expect(200);
  await agent
    .post(`/users/${user.id}`)
    .type('form')
    .send({ _csrf: extractCsrf(page.text), _method: 'DELETE' });

  assert.ok(await User.findById(user.id), 'the signed-in account must survive');
  const after = await agent.get('/users').expect(200);
  assert.match(after.text, /cannot delete your own account/i);
});

test('you cannot deactivate the last active account', async () => {
  const { user, agent } = await signedIn();
  // This is the only active account; deactivating it would lock everyone out permanently.
  const form = await agent.get(`/users/${user.id}/edit`).expect(200);

  await agent
    .post(`/users/${user.id}`)
    .type('form')
    .set('Referer', `/users/${user.id}/edit`)
    .send({ _csrf: extractCsrf(form.text), _method: 'PUT', username: user.username, password: '', status: 'inactive' })
    .expect(302);

  assert.equal((await User.findById(user.id)).status, 'active', 'must remain active');
});

// --- Cross-cutting -----------------------------------------------------------------------------

test('the same web route serves JSON when asked', async () => {
  const { agent } = await signedIn();
  await createUser({ username: 'dual.mode' });

  const json = await agent.get('/users?format=json').expect(200);
  assert.match(json.headers['content-type'], /json/);
  assert.equal(json.body.success, true);
  assert.ok(json.body.rows.some((r) => r.username === 'dual.mode'));
  assert.equal(json.body.rows.some((r) => 'password' in r), false, 'no hash in the JSON either');
});

test('unknown web routes 404 for a signed-in user', async () => {
  const { agent } = await signedIn();
  const res = await agent.get('/no-such-page').expect(404);
  assert.match(res.headers['content-type'], /html/);
});

test('unknown web routes redirect anonymous visitors to login, not 404', async () => {
  // `router.use(requireAuth, ...)` sits above the route table, so it catches unmatched paths
  // too. That's intentional: an anonymous visitor gets bounced to the login page rather than
  // being told which URLs do and don't exist.
  const res = await request(app).get('/no-such-page').expect(302);
  assert.equal(res.headers.location, '/login');
});
