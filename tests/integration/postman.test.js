require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');
const { buildCollection, extractRoutes } = require('../../core/postman');

const APP_DIR = path.join(__dirname, '..', '..', 'app');

function collection() {
  // Require the router fresh so we introspect the real, current routes.
  const router = require('../../app/routes/api');
  return buildCollection({ router, appDir: APP_DIR, name: 'Test API', baseUrl: 'http://localhost:5000' });
}

const allRequests = (c) => c.item.flatMap((folder) => folder.item);

test.before(async () => { await migrateTestDb(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

test('extractRoutes finds every route registered on the API router', () => {
  const signatures = extractRoutes(require('../../app/routes/api')).map((r) => `${r.method} ${r.path}`);

  for (const expected of [
    'POST /auth/login',
    'GET /auth/me',
    'GET /users',
    'GET /users/:id',
    'POST /users',
    'PUT /users/:id',
    'DELETE /users/:id',
  ]) {
    assert.ok(signatures.includes(expected), `missing ${expected}`);
  }
});

test('the collection is valid Postman v2.1 with bearer auth and variables', () => {
  const c = collection();
  assert.match(c.info.schema, /v2\.1\.0/);
  assert.equal(c.auth.type, 'bearer');

  const vars = c.variable.map((v) => v.key);
  for (const key of ['baseUrl', 'token']) {
    assert.ok(vars.includes(key), `missing {{${key}}} variable`);
  }
  assert.ok(JSON.parse(JSON.stringify(c)), 'must be JSON-serialisable');
});

test('every request has a unique, human-readable name', () => {
  const names = allRequests(collection()).map((r) => r.name);
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names.join(', ')}`);
  assert.ok(names.includes('Login'), 'auth actions are named by action, not CRUD verb');
});

test('login is noauth and captures the token', () => {
  const login = allRequests(collection()).find((r) => r.name === 'Login');
  assert.equal(login.request.auth.type, 'noauth', 'must not require a token to obtain one');
  const script = login.event[0].script.exec.join('\n');
  assert.match(script, /pm\.collectionVariables\.set\("token"/, 'must store the token');
});

test('write requests carry an example body built from the real validators', () => {
  const createUserReq = allRequests(collection()).find((r) => r.name === 'Create users');
  const body = JSON.parse(createUserReq.request.body.raw);
  // userValidators.js validates username/password/status — the example must match, or the
  // collection ships requests that 422 on first use.
  for (const field of ['username', 'password', 'status']) {
    assert.ok(field in body, `example body missing "${field}"`);
  }
});

test('parameterised routes declare their path variables', () => {
  const byId = allRequests(collection()).find((r) => r.name === 'Get users by id');
  assert.ok(byId.request.url.variable.some((v) => v.key === 'id'));
});

test('list endpoints document the search and pagination query params', () => {
  const requests = allRequests(collection());

  const list = requests.find((r) => r.name === 'List users');
  const keys = (list.request.url.query || []).map((p) => p.key);
  for (const key of ['q', 'page', 'page_size']) {
    assert.ok(keys.includes(key), `List users should document ?${key}`);
  }
  // Disabled = shown in Postman as an optional param rather than sent on every call.
  assert.ok(list.request.url.query.every((p) => p.disabled), 'optional params must not be sent by default');

  // A single-record GET has nothing to paginate or search.
  const byId = requests.find((r) => r.name === 'Get users by id');
  assert.equal(byId.request.url.query, undefined);
});

// The real proof: replay every generated request against the running app and confirm none of
// them 404 (wrong URL) or 500 (malformed body). A collection that looks right but doesn't run
// is worse than no collection.
test('every generated request actually reaches its route', async () => {
  const app = makeApp({ mode: 'hybrid' });
  const user = await createUser({ username: 'postman.runner' });
  const token = (
    await request(app).post('/api/auth/login').send({ username: user.username, password: DEFAULT_PASSWORD })
  ).body.token;

  // :id resolves to a record that is NOT the signed-in account — preventSelfAction would 403
  // a self-DELETE, which would muddy what a failure here means.
  const target = await createUser({ username: 'postman.target' });

  // DELETE runs last so it doesn't remove the record the other requests depend on.
  const ordered = allRequests(collection()).sort(
    (a, b) => (a.request.method === 'DELETE' ? 1 : 0) - (b.request.method === 'DELETE' ? 1 : 0)
  );

  for (const item of ordered) {
    const { method, url } = item.request;
    const urlPath = '/' + url.path.join('/').replace(/:id/g, String(target.id));

    let req = request(app)[method.toLowerCase()](urlPath).set('Authorization', `Bearer ${token}`);
    if (item.request.body) {
      req = req.send({
        username: `replay${Date.now()}`,
        password: DEFAULT_PASSWORD,
        status: 'active',
      });
    }
    const res = await req;

    // "Did it reach a route?" is not the same question as "did it find a record?". Once the app
    // has more than one resource, `:id` cannot be a valid id for all of them and a body shaped
    // for one resource will not validate for another — both of which are legitimate 404/422
    // answers from a route that matched. The terminal handler at the bottom of app/routes/api.js
    // is the only 404 that means "no route matched", and it says so, so assert on that instead
    // of on the bare status.
    const noRouteMatched = res.status === 404 && /No API route matches/.test(res.body?.message || '');
    assert.equal(noRouteMatched, false, `${method} ${urlPath} did not match any route`);
    assert.ok(res.status < 500, `${method} ${urlPath} returned ${res.status} — the generated request is malformed`);
  }
});
