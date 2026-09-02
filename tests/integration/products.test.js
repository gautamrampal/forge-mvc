require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, loginWeb, loginApi, extractCsrf, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

const Product = require('../../app/models/Product');
let app;

test.before(async () => {
  await migrateTestDb();
  app = makeApp({ mode: 'hybrid', viewEngine: 'ejs' });
});
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

const VALID = { sku: 'WIDGET-01', name: 'Widget', description: 'A widget', price_paise: 19999, status: 'active' };

// --- Model -----------------------------------------------------------------------------------

test('findBySku returns the row, or null when missing', async () => {
  const created = await Product.create(VALID);
  assert.equal((await Product.findBySku('WIDGET-01')).id, created.id);
  assert.equal(await Product.findBySku('NOPE'), null);
});

test('skuTaken ignores the row being edited', async () => {
  const p = await Product.create(VALID);
  assert.equal(await Product.skuTaken('WIDGET-01'), true);
  assert.equal(await Product.skuTaken('WIDGET-01', p.id), false, 'editing itself is not a collision');
});

test('orderByFor maps a user-supplied sort to a real column, and falls back safely', async () => {
  assert.equal(Product.orderByFor('price'), 'price_paise DESC');
  assert.equal(Product.orderByFor('name'), 'name ASC');
  // The injection payload from TUTORIAL-SECURITY.md section 4 must never reach the SQL.
  assert.equal(Product.orderByFor('id` = 1 OR `1'), 'id DESC');
  assert.equal(Product.orderByFor(undefined), 'id DESC');
});

test('publicFields exposes a formatted price without losing the integer', async () => {
  const p = await Product.create(VALID);
  const shaped = Product.publicFields(p);
  assert.equal(shaped.price_paise, 19999);
  assert.equal(shaped.price, '199.99');
});

test('paginate reports totals and honours page size', async () => {
  for (let i = 0; i < 7; i++) {
    await Product.create({ ...VALID, sku: `SKU-${i}`, name: `Product ${i}` });
  }
  const { rows, total, totalPages } = await Product.paginate({ page: 2, pageSize: 3 });
  assert.equal(rows.length, 3);
  assert.equal(total, 7);
  assert.equal(totalPages, 3);
});

test('search matches sku or name, and an empty term does not filter', async () => {
  await Product.create({ ...VALID, sku: 'AAA-1', name: 'Hammer' });
  await Product.create({ ...VALID, sku: 'BBB-2', name: 'Screwdriver' });

  const hit = await Product.paginate({ search: Product.searchFor('hamm') });
  assert.equal(hit.total, 1);
  assert.equal(hit.rows[0].sku, 'AAA-1');

  const blank = await Product.paginate({ search: Product.searchFor('   ') });
  assert.equal(blank.total, 2, 'a whitespace-only term must not search for ""');
});

// --- API tree (JWT) --------------------------------------------------------------------------

test('API: every product route requires a token', async () => {
  const p = await Product.create(VALID);
  await request(app).get('/api/products').expect(401);
  await request(app).get(`/api/products/${p.id}`).expect(401);
  await request(app).post('/api/products').send(VALID).expect(401);
  await request(app).put(`/api/products/${p.id}`).send(VALID).expect(401);
  await request(app).delete(`/api/products/${p.id}`).expect(401);
});

test('API: full CRUD cycle', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // CREATE
  const created = await auth(request(app).post('/api/products').send(VALID)).expect(201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.record.sku, 'WIDGET-01');
  assert.equal(created.body.record.price, '199.99');
  const id = created.body.record.id;

  // READ one
  const one = await auth(request(app).get(`/api/products/${id}`)).expect(200);
  assert.equal(one.body.record.name, 'Widget');

  // READ list
  const list = await auth(request(app).get('/api/products?page=1&page_size=10')).expect(200);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.rows.length, 1);

  // UPDATE
  const updated = await auth(
    request(app).put(`/api/products/${id}`).send({ ...VALID, name: 'Widget Mk II', price_paise: 24999 })
  ).expect(200);
  assert.equal(updated.body.record.name, 'Widget Mk II');
  assert.equal(updated.body.record.price, '249.99');

  // DELETE
  const deleted = await auth(request(app).delete(`/api/products/${id}`)).expect(200);
  assert.equal(deleted.body.deleted, true);
  await auth(request(app).get(`/api/products/${id}`)).expect(404);
});

test('API: validation failure is a 422 with per-field errors', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });

  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: 'lower case!', name: '', price_paise: -5, status: 'banana' })
    .expect(422);

  assert.equal(res.body.success, false);
  for (const field of ['sku', 'name', 'price_paise', 'status']) {
    assert.ok(res.body.errors[field], `expected an error for ${field}`);
  }
});

test('API: a duplicate SKU is a 409, not a 500', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  await Product.create(VALID);

  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send(VALID)
    .expect(409);
  assert.match(res.body.message, /already in use/);
});

test('API: a missing record is a JSON 404', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  const res = await request(app)
    .get('/api/products/999999')
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.success, false);
});

test('API: an unmatched /api path returns JSON 404, not an HTML redirect', async () => {
  const res = await request(app).get('/api/prodcuts').expect(404);
  assert.match(res.headers['content-type'], /json/, 'the terminal 404 in routes/api.js must catch this');
});

test('API: page_size is clamped, so ?page_size=100000 cannot ask for the whole table', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  const res = await request(app)
    .get('/api/products?page_size=100000')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(res.body.pageSize, 100, 'parsePagination clamps to maxPageSize');
});

// --- Web tree (session + CSRF) ---------------------------------------------------------------

test('web: anonymous visitors are bounced to /login', async () => {
  for (const path of ['/products', '/products/create', '/products/1', '/products/1/edit']) {
    const res = await request(app).get(path).expect(302);
    assert.equal(res.headers.location, '/login', `${path} should bounce to login`);
  }
});

test('web: the list renders, with an empty state before anything exists', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  const empty = await agent.get('/products').expect(200);
  assert.match(empty.text, /No products yet/);

  await Product.create(VALID);
  const filled = await agent.get('/products').expect(200);
  assert.match(filled.text, /WIDGET-01/);
  assert.match(filled.text, /199\.99/, 'the formatted price is rendered');
});

test('web: full CRUD cycle through the forms', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  // CREATE — GET the form for a CSRF token, then POST it back
  const form = await agent.get('/products/create').expect(200);
  const csrf = extractCsrf(form.text);
  assert.ok(csrf, 'the form must carry a CSRF token');

  const created = await agent.post('/products').type('form').send({ _csrf: csrf, ...VALID }).expect(302);
  const product = await Product.findBySku('WIDGET-01');
  assert.ok(product, 'the row exists after the redirect');
  assert.equal(created.headers.location, `/products/${product.id}`);

  // READ
  const detail = await agent.get(`/products/${product.id}`).expect(200);
  assert.match(detail.text, /Widget/);

  // UPDATE — POST + _method=PUT, the way a browser form does it
  const editForm = await agent.get(`/products/${product.id}/edit`).expect(200);
  const editCsrf = extractCsrf(editForm.text);
  await agent
    .post(`/products/${product.id}`)
    .type('form')
    .send({ _csrf: editCsrf, _method: 'PUT', ...VALID, name: 'Widget Mk II' })
    .expect(302);
  assert.equal((await Product.findById(product.id)).name, 'Widget Mk II');

  // DELETE — also a form, also _method
  await agent
    .post(`/products/${product.id}`)
    .type('form')
    .send({ _csrf: editCsrf, _method: 'DELETE' })
    .expect(302);
  assert.equal(await Product.findById(product.id), null);
});

test('web: a POST without a CSRF token is rejected', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  await agent.post('/products').type('form').send(VALID).expect(403);
});

test('web: /products/create is matched by its own route, not by /products/:id', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  const res = await agent.get('/products/create').expect(200);
  assert.match(res.text, /New Product/, 'a 200 with the form, not a 404 for id="create"');
});

test('web: a validation failure redirects back and keeps the input', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  const form = await agent.get('/products/create').expect(200);
  const csrf = extractCsrf(form.text);

  // ⚠️ Set Referer explicitly. core/middlewares/validate.js redirects to
  // `req.get('Referer') || req.originalUrl || '/'` — a browser sends Referer, supertest does
  // not, so without this the assertion sees the POST target (/products) rather than the form.
  const res = await agent
    .post('/products')
    .type('form')
    .set('Referer', '/products/create')
    .send({ _csrf: csrf, sku: 'bad sku', name: '', price_paise: 'abc', status: 'active' })
    .expect(302);
  assert.match(res.headers.location, /\/products\/create/, 'back to the form, not to /');

  const back = await agent.get('/products/create').expect(200);
  assert.match(back.text, /bad sku/, 'the rejected input is repopulated from flash');
  assert.equal(await Product.count({}), 0, 'nothing was written');
});

// --- Dual-mode: the same web action serving JSON ----------------------------------------------

test('the web action returns JSON when asked, via ?format=json', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  await Product.create(VALID);

  const res = await agent.get('/products?format=json').expect(200);
  assert.match(res.headers['content-type'], /json/);
  assert.equal(res.body.success, true);
  assert.equal(res.body.rows[0].sku, 'WIDGET-01');
});
