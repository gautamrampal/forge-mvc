require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, loginWeb, extractCsrf, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

// Both engines must render the same pages from the same data. This is the guard that keeps the
// two view trees from drifting apart — add a page to one and forget the other, or break a TSX
// component, and these fail.

test.before(async () => { await migrateTestDb(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

for (const engine of ['ejs', 'tsx']) {
  const signedIn = async () => {
    const app = makeApp({ mode: 'hybrid', viewEngine: engine });
    const user = await createUser({ username: 'view.tester' });
    const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
    return { app, user, agent };
  };

  test(`[${engine}] renders the login page`, async () => {
    const app = makeApp({ mode: 'hybrid', viewEngine: engine });
    const res = await request(app).get('/login').expect(200);
    assert.match(res.headers['content-type'], /html/);
    assert.match(res.text, /<!doctype html>/i, 'must emit a doctype');
    assert.ok(extractCsrf(res.text), 'login form must carry a CSRF token');
    assert.match(res.text, /name="username"/);
  });

  test(`[${engine}] renders the users list with data`, async () => {
    const { agent } = await signedIn();
    await createUser({ username: 'listed.user', status: 'inactive' });

    const res = await agent.get('/users').expect(200);
    assert.match(res.text, /listed\.user/, 'the record renders');
    assert.match(res.text, /view\.tester/, 'the navbar shows the signed-in user');
    assert.match(res.text, /inactive/, 'the status badge renders');
  });

  test(`[${engine}] renders the empty state`, async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/users?status=inactive').expect(200);
    assert.match(res.text, /No users match your search/i);
  });

  test(`[${engine}] renders the search box and echoes the term back`, async () => {
    const { agent } = await signedIn();
    await createUser({ username: 'searchable.one' });
    await createUser({ username: 'unrelated.two' });

    const res = await agent.get('/users?q=searchable').expect(200);
    assert.match(res.text, /name="q"/, 'the search input exists');
    assert.match(res.text, /value="searchable"/, 'the term is echoed back into the box');
    assert.match(res.text, /searchable\.one/);
    assert.equal(/unrelated\.two/.test(res.text), false, 'non-matching rows are excluded');
  });

  test(`[${engine}] renders the create form`, async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/users/create').expect(200);

    assert.ok(extractCsrf(res.text));
    assert.match(res.text, /name="username"/);
    assert.match(res.text, /name="password"/);
    assert.match(res.text, /name="status"/);
  });

  test(`[${engine}] renders the edit form pre-filled with a PUT override`, async () => {
    const { agent } = await signedIn();
    const target = await createUser({ username: 'editable.user' });

    const res = await agent.get(`/users/${target.id}/edit`).expect(200);
    assert.match(res.text, /editable\.user/, 'existing values are pre-filled');
    assert.match(res.text, /name="_method"\s+value="PUT"/, 'HTML forms need the method override');
  });

  test(`[${engine}] renders the detail page without the password hash`, async () => {
    const { agent } = await signedIn();
    const target = await createUser({ username: 'shown.user' });

    const res = await agent.get(`/users/${target.id}`).expect(200);
    assert.match(res.text, /shown\.user/);
    assert.equal(/\$2[aby]\$/.test(res.text), false, 'a bcrypt hash must never reach the HTML');
  });

  test(`[${engine}] surfaces validation errors and restores typed values`, async () => {
    const { agent } = await signedIn();
    const form = await agent.get('/users/create').expect(200);

    await agent
      .post('/users')
      .type('form')
      .set('Referer', '/users/create')
      .send({ _csrf: extractCsrf(form.text), username: 'ab', password: 'short', status: 'active' })
      .expect(302);

    const reloaded = await agent.get('/users/create').expect(200);
    assert.match(reloaded.text, /is-invalid/, 'the failing field is marked');
    assert.match(reloaded.text, /Username must be 3-50 characters/);
    assert.match(reloaded.text, /value="ab"/, 'the typed value survives the round trip');
  });

  test(`[${engine}] renders a 404 page`, async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/definitely-not-a-route').expect(404);
    assert.match(res.headers['content-type'], /html/);
    assert.match(res.text, /404/);
  });
}

test('an unknown VIEW_ENGINE fails loudly at boot', () => {
  assert.throws(() => makeApp({ mode: 'mvc', viewEngine: 'handlebars' }), /Unknown VIEW_ENGINE/);
  makeApp({ viewEngine: 'ejs' }); // restore for anything that follows
});
