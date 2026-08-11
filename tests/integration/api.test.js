require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, loginApi, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

const User = require('../../app/models/User');
let app;

test.before(async () => {
  await migrateTestDb();
  app = makeApp({ mode: 'hybrid' });
});
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

// Signs in and returns { user, token } for the authenticated cases below.
async function authed(overrides = {}) {
  const user = await createUser(overrides);
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  return { user, token };
}

// --- Auth --------------------------------------------------------------------------------------

test('POST /api/auth/login returns a token for valid credentials', async () => {
  const user = await createUser({ username: 'api.user' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: DEFAULT_PASSWORD })
    .expect(200);

  assert.ok(res.body.token);
  assert.equal(res.body.user.username, 'api.user');
  assert.equal('password' in res.body.user, false, 'the hash must never be returned');
});

test('POST /api/auth/login rejects bad credentials and missing fields', async () => {
  const user = await createUser();
  await request(app).post('/api/auth/login').send({ username: user.username, password: 'nope' }).expect(401);
  await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'nope' }).expect(401);
  await request(app).post('/api/auth/login').send({ username: user.username }).expect(422);
});

test('POST /api/auth/login refuses an inactive account', async () => {
  const user = await createUser({ status: 'inactive' });
  await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: DEFAULT_PASSWORD })
    .expect(403);
});

test('GET /api/auth/me requires a valid bearer token', async () => {
  const { user, token } = await authed();

  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(res.body.user.username, user.username);

  await request(app).get('/api/auth/me').expect(401);
  await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
  await request(app).get('/api/auth/me').set('Authorization', token).expect(401); // missing "Bearer "
});

test('a token stops working once the account is deactivated', async () => {
  // The token itself is still cryptographically valid — the controller re-reads the database
  // rather than trusting the claims, which is what makes revocation possible at all.
  const { user, token } = await authed();
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

  await User.update(user.id, { status: 'inactive' });
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(403);
});

// --- Users CRUD ----------------------------------------------------------------------------------

test('every /api/users route requires a token', async () => {
  await request(app).get('/api/users').expect(401);
  await request(app).get('/api/users/1').expect(401);
  await request(app).post('/api/users').send({ username: 'x', password: 'Password@123' }).expect(401);
  await request(app).put('/api/users/1').send({ username: 'x' }).expect(401);
  await request(app).delete('/api/users/1').expect(401);
});

test('GET /api/users paginates and never leaks password hashes', async () => {
  const { token } = await authed();
  for (let i = 0; i < 4; i++) await createUser();

  const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(res.body.total, 5); // 4 + the signed-in account
  assert.equal(res.body.rows.some((r) => 'password' in r), false);

  const paged = await request(app)
    .get('/api/users?page=1&page_size=2')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(paged.body.rows.length, 2);
  assert.equal(paged.body.totalPages, 3);
});

test('GET /api/users?q= searches', async () => {
  const { token } = await authed({ username: 'admin.acct' });
  await createUser({ username: 'jane.doe' });
  await createUser({ username: 'bob.jones' });

  const res = await request(app).get('/api/users?q=jane').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.rows[0].username, 'jane.doe');
});

test('GET /api/users?q=&status= compose, and the total matches the rows', async () => {
  const { token } = await authed({ username: 'admin.acct' });
  await createUser({ username: 'jane.active', status: 'active' });
  await createUser({ username: 'jane.inactive', status: 'inactive' });
  await createUser({ username: 'bob.inactive', status: 'inactive' });

  const res = await request(app)
    .get('/api/users?q=jane&status=inactive')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(res.body.rows.length, 1);
  assert.equal(res.body.rows[0].username, 'jane.inactive');
  // total must reflect the same query as rows, or clients paginate into empty pages.
  assert.equal(res.body.total, 1);
});

test('GET /api/users?status= filters', async () => {
  const { token } = await authed({ status: 'active' });
  await createUser({ status: 'inactive' });

  const res = await request(app)
    .get('/api/users?status=inactive')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(res.body.rows.length, 1);
  assert.equal(res.body.rows[0].status, 'inactive');
});

test('GET /api/users/:id returns 404 for a missing record', async () => {
  const { token } = await authed();
  await request(app).get('/api/users/999999').set('Authorization', `Bearer ${token}`).expect(404);
});

test('POST /api/users creates with a hashed password', async () => {
  const { token } = await authed();
  const res = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'api.created', password: 'Created@123', status: 'active' })
    .expect(201);

  assert.equal(res.body.record.username, 'api.created');
  assert.equal('password' in res.body.record, false);

  const stored = await User.findByUsername('api.created');
  assert.notEqual(stored.password, 'Created@123', 'must be hashed at rest');
});

test('POST /api/users returns 422 with a per-field error map', async () => {
  const { token } = await authed();
  const res = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'ab', password: 'short', status: 'active' })
    .expect(422);

  assert.equal(res.body.success, false);
  assert.ok(res.body.errors.username);
  assert.ok(res.body.errors.password);
});

test('POST /api/users rejects a duplicate username with 409', async () => {
  const { token } = await authed();
  await createUser({ username: 'already.here' });

  await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'already.here', password: 'Password@123', status: 'active' })
    .expect(409);
});

test('PUT /api/users/:id updates and leaves a blank password alone', async () => {
  const { token } = await authed();
  const target = await createUser({ username: 'to.update' });
  const before = (await User.findById(target.id)).password;

  const res = await request(app)
    .put(`/api/users/${target.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'updated.name', status: 'inactive' })
    .expect(200);

  assert.equal(res.body.record.username, 'updated.name');
  assert.equal((await User.findById(target.id)).password, before, 'password untouched');
});

test('DELETE /api/users/:id removes the record', async () => {
  const { token } = await authed();
  const target = await createUser();

  await request(app).delete(`/api/users/${target.id}`).set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(await User.findById(target.id), null);
});

test('you cannot delete your own account through the API either', async () => {
  const { user, token } = await authed();
  await createUser(); // another active account, so this isn't the "last active" rule

  await request(app).delete(`/api/users/${user.id}`).set('Authorization', `Bearer ${token}`).expect(403);
  assert.ok(await User.findById(user.id));
});

test('you cannot deactivate the last active account', async () => {
  const { user, token } = await authed();
  await request(app)
    .put(`/api/users/${user.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ username: user.username, status: 'inactive' })
    .expect(409);
  assert.equal((await User.findById(user.id)).status, 'active');
});

// --- Cross-cutting -----------------------------------------------------------------------------

test('the API tree is exempt from CSRF', async () => {
  // Regression guard: the web router mounts at '/', so if /api is ever mounted after it, the
  // session CSRF middleware runs first and 403s every API call. See bootstrap.js.
  const res = await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
  assert.notEqual(res.status, 403);
});

test('unknown API routes return JSON, not HTML', async () => {
  const res = await request(app).get('/api/nope').expect(404);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.success, false);
});
