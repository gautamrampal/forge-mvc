# Testing — `node:test`, Fixtures, Mocks, Coverage, E2E

How to test a Node app with no test framework installed, and specifically how *this* repo's
harness works — because the interesting parts of it exist to solve problems you will hit.

Node's built-in runner is what this project uses. There is no Jest, no Mocha, no Chai, and
nothing to configure. Every command and every output below was **run in this repo** on Node
v24.11.1.

**Read** [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) first — the two most common test bugs are a
forgotten `await` and a leaked handle, and both are async problems.

---

## Contents

**Part 1 — The runner**
1. [Running tests](#1-running-tests)
2. [The test API](#2-the-test-api)
3. [Assertions that pull their weight](#3-assertions-that-pull-their-weight)
4. [Hooks, and the state they must reset](#4-hooks-and-the-state-they-must-reset)

**Part 2 — This repo's harness**

5. [The three layers, and what each is for](#5-the-three-layers-and-what-each-is-for)
6. [`tests/helpers/env.js` — why it must be required first](#6-testshelpersenvjs--why-it-must-be-required-first)
7. [`tests/helpers/db.js` — migrate, reset, close](#7-testshelpersdbjs--migrate-reset-close)
8. [`tests/helpers/testApp.js` — the app, and the STATEFUL list](#8-testshelperstestappjs--the-app-and-the-stateful-list)
9. [Factories, not fixtures files](#9-factories-not-fixtures-files)

**Part 3 — Writing tests**

10. [Testing a model](#10-testing-a-model)
11. [Testing the API tree (JWT)](#11-testing-the-api-tree-jwt)
12. [Testing the web tree (sessions + CSRF)](#12-testing-the-web-tree-sessions--csrf)
13. [Testing error paths](#13-testing-error-paths)
14. [What to test, and what not to](#14-what-to-test-and-what-not-to)

**Part 4 — Mocks and time**

15. [`mock.fn` and `mock.method`](#15-mockfn-and-mockmethod)
16. [Faking timers](#16-faking-timers)
17. [Faking HTTP: don't mock `fetch`, mock the boundary](#17-faking-http-dont-mock-fetch-mock-the-boundary)

**Part 5 — Beyond unit tests**

18. [Coverage](#18-coverage)
19. [Playwright E2E](#19-playwright-e2e)
20. [Diagnosing a hung or flaky run](#20-diagnosing-a-hung-or-flaky-run)

**Part 6 — Reference**

21. [Symptom → cause → fix](#21-symptom--cause--fix)
22. [Exercises](#22-exercises)
23. [Cheat sheet](#23-cheat-sheet)

---

# Part 1 — The runner

## 1. Running tests

```bash
npm test
```

That is `node --test --test-concurrency=1 "tests/**/*.test.js"`. Two details in it matter:

- **`--test-concurrency=1`** — files run one at a time. They share one test database, and
  `resetTestDb()` truncates tables between tests, so two files running at once would delete each
  other's rows mid-assertion. Do not remove this flag.
- **The glob is quoted**, so Node expands it rather than the shell. Unquoted, it behaves
  differently across PowerShell, bash and CI.

The narrower entry points, when you don't want the whole run:

```bash
npm run test:unit
```

```bash
npm run test:integration
```

To run a single file, or filter by name — **verified**, the second command ran 1 of 3 tests:

```bash
node --test tests/unit/model.test.js
```

```bash
node --test --test-name-pattern="adds" tests/unit/model.test.js
```

⚠️ **Stop the dev server before running the suite** ([AGENTS.md](./AGENTS.md) §7). It competes for
the test database and the run looks hung when it is actually blocked.

Useful flags: `--watch` (rerun on change), `--test-only` (run only tests marked `{ only: true }`),
`--test-reporter=spec|dot|tap|junit`, `--experimental-test-coverage` (§18).

---

## 2. The test API

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('a plain test', () => { assert.ok(true); });

test('an async test — the runner awaits it', async () => {
  const user = await User.findById(1);
  assert.equal(user.username, 'ada');
});
```

Both styles work; `describe`/`it` is the same runner with different names, and this repo uses flat
`test()` calls with `// --- comment banners ---` to group them. Match the existing style.

| Form | Effect |
|---|---|
| `test(name, fn)` | a test |
| `test(name, { skip: 'reason' }, fn)` | reported as skipped, with the reason |
| `test(name, { todo: true }, fn)` | reported as todo — a known gap, not a failure |
| `test(name, { only: true }, fn)` | with `--test-only`, the only thing that runs |
| `test.skip(...)` / `test.todo(...)` | shorthand for the above |
| `await t.test('child', fn)` | a **subtest** — nests in the output, and must be awaited |

**Verified** output shapes: a skipped test prints `﹣ name # SKIP`, a todo prints `✔ name # TODO`,
and subtests indent under their parent.

One trap worth knowing about `t.plan(n)`. **Verified:** it counts assertions made through the
test context (`t.assert.*`), not bare `assert` calls — so this *fails* with
`plan expected 2 assertions but received 0`:

```js
test('plan()', (t) => {
  t.plan(2);
  assert.ok(true);      // ❌ not counted — this is the module-level assert
  assert.ok(true);
});
```

```js
test('plan()', (t) => {
  t.plan(2);
  t.assert.ok(true);    // ✅ counted
  t.assert.equal(1, 1);
});
```

`plan` earns its place in exactly one situation: proving that a callback or event handler ran the
number of times you expected. Otherwise skip it.

---

## 3. Assertions that pull their weight

**Always `require('node:assert/strict')`.** The non-strict module's `assert.equal` uses `==`, so
`assert.equal(1, '1')` passes — which is how a bug in a type coercion ships green.

```js
assert.equal(a, b);              // === (strict module)
assert.deepStrictEqual(a, b);    // structural, recursive — verified on nested arrays/objects
assert.match(res.text, /signer/);
assert.ok(value, 'message');
assert.throws(() => f(), TypeError);
await assert.rejects(() => f(), /bad sku/);     // ⚠️ must be awaited
```

The two that get misused:

**`assert.rejects` must be awaited.** Forget the `await` and the test passes no matter what — it
is the [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §11 bug wearing a test-shaped hat.

**Objects compare by identity.** `assert.notEqual({}, {})` passes (**verified**) because those are
different objects. Use `deepStrictEqual` for structure.

Always pass the third argument — the message — when the assertion is not self-explanatory. This
repo does it well:

```js
assert.equal(res.headers.location, '/login', `${path} should bounce to login`);
```

When that fails in CI six weeks from now, the message is the difference between a two-minute fix
and a twenty-minute archaeology session.

---

## 4. Hooks, and the state they must reset

```js
test.before(async () => { /* once per file */ });
test.beforeEach(async () => { /* before every test */ });
test.afterEach(async () => { /* after every test, even a failing one */ });
test.after(async () => { /* once, at the end */ });
```

The pattern every test file in this repo opens with, and the reasoning behind each line:

```js
require('../helpers/env');                    // ← FIRST. Before anything touches the DB (§6)
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp } = require('../helpers/testApp');

let app;

test.before(async () => {
  await migrateTestDb();                      // create the test DB + apply migrations
  app = makeApp({ mode: 'hybrid', viewEngine: 'ejs' });
});
test.beforeEach(async () => { await resetTestDb(); });   // truncate → every test starts empty
test.after(async () => { await closeTestDb(); });        // close the pool → the runner can exit
```

- **`before`** builds expensive things once. Migrations are idempotent (`CREATE TABLE IF NOT
  EXISTS`), so calling it per file is cheap.
- **`beforeEach` truncates.** This is what makes tests order-independent: no test can depend on
  another's rows. Reset *before*, not after — an `afterEach` cleanup is skipped when the process
  dies mid-test, leaving the next run dirty.
- **`after` closes the pool.** Skip this and the run hangs after everything passes (§20).

Hooks are `async`-aware; the runner awaits them. A rejected hook fails the tests it guards rather
than crashing the run.

---

# Part 2 — This repo's harness

## 5. The three layers, and what each is for

```
tests/
├── unit/          model logic, helpers, session stores — no HTTP
├── integration/   the real app over HTTP via supertest — no browser
├── e2e/           a real browser against a real server (Playwright, opt-in)
└── helpers/
    ├── env.js        rewrites process.env for tests            (§6)
    ├── db.js         migrate / reset / close                   (§7)
    ├── testApp.js    builds the app in-process, + auth helpers (§8)
    └── factories.js  test data builders                        (§9)
```

Existing files, worth reading before you write a new one:
`tests/unit/model.test.js`, `tests/unit/helpers.test.js`, `tests/unit/session.test.js`,
`tests/unit/soa.test.js`, `tests/integration/api.test.js`, `tests/integration/web.test.js`,
`tests/integration/webCookieSessions.test.js`, `tests/integration/viewEngines.test.js`,
`tests/integration/soa.test.js`, `tests/integration/postman.test.js`.

**Where does a new test go?** If it needs a request, it's integration. If it needs a browser or
client-side JavaScript, it's e2e. Otherwise unit. Most of what you write should be integration —
this is a web framework, and a controller that returns the wrong status is the bug that reaches
users.

---

## 6. `tests/helpers/env.js` — why it must be required first

```js
require('../helpers/env');    // ← line 1 of every test file. Not line 3.
```

It rewrites the environment before anything reads it:

| It sets | So that |
|---|---|
| `NODE_ENV=test` | the session store falls back to MemoryStore (§20) |
| `DB_NAME=<your db>_test` | a truncate can never touch your development data |
| `SESSION_SECRET` / `JWT_SECRET` to fixed values | token assertions don't depend on your local `.env` |
| `LOG_LEVEL=error` | the run isn't drowned in info logs |

The ordering requirement is a direct consequence of the module cache
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §6): `core/db/mysql.js` builds its pool
from `process.env` **at require time**. Require anything that pulls in `core/db` before `env.js`
has run, and you get a pool pointed at your *development* database — which the next
`resetTestDb()` will then truncate.

Override the target database with `TEST_DB_NAME` (or `TEST_MONGO_DB_NAME`) if the default
`<name>_test` collides with something.

---

## 7. `tests/helpers/db.js` — migrate, reset, close

Three functions, one per lifecycle stage:

```js
await migrateTestDb();   // CREATE DATABASE IF NOT EXISTS + apply database/migrations/*.sql in order
await resetTestDb();     // truncate every table (FK checks off around it)
await closeTestDb();     // pool.end() — the "runner can now exit" call
```

Three design decisions in there that are worth copying into your own projects:

- **Migrations run in filename order** (`001_…`, `002_…`) and are `IF NOT EXISTS`, so the function
  is safe to call from every file.
- **`SET FOREIGN_KEY_CHECKS = 0` around the truncate**, so adding a table that references `users`
  later doesn't make the truncate order significant. When you add a table, add it to that list in
  `resetTestDb()` — this is the one place the helper needs editing per feature.
- **All three drivers are handled**: MySQL truncates, Postgres uses `TRUNCATE … RESTART IDENTITY
  CASCADE`, Mongo does `deleteMany({})`. Your tests therefore run unchanged under `DB_DRIVER`,
  which is the point of the whole architecture.

`TRUNCATE` also resets `AUTO_INCREMENT`, so ids restart at 1 in every test. **Do not assert on
literal ids** — use the id the factory returns. Postgres needs `RESTART IDENTITY` to get the same
behaviour, which is exactly why it's in the statement.

---

## 8. `tests/helpers/testApp.js` — the app, and the STATEFUL list

`makeApp()` builds **the real application in-process** — the same `bootstrap.js` that `server.js`
uses — and hands it to `supertest`. No network port, no separate process, real middleware stack.

```js
const app = makeApp({ mode: 'hybrid', viewEngine: 'ejs' });
```

It can do that per test file because it **busts the require cache** first: `bootstrap.js` reads
`APP_MODE` and `VIEW_ENGINE` at require time, so switching either means dropping the modules that
captured the old value. That is how `tests/integration/viewEngines.test.js` tests EJS and TSX in
one run.

And here is the part to actually understand, because it encodes two bugs that already cost this
project debugging time:

```js
const STATEFUL = [
  path.join('core', 'db'),
  path.join('core', 'context'),
  path.join('core', 'lifecycle'),
  path.join('core', 'helpers', 'logger'),
  path.join('core', 'helpers', 'httpClient'),
];
```

Modules on that list are **never** cache-busted. Two distinct reasons, both worth naming:

**Handles.** `core/db` owns a connection pool and `logger` owns winston file transports. Reloading
them creates a *new* pool per `makeApp()` call while the old one stays open with nobody holding a
reference to close it. The open sockets keep the event loop alive and the runner never exits
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §4).

**Shared state.** `core/context` is one `AsyncLocalStorage` that the requestId middleware writes
and the logger reads; `core/lifecycle` holds the ready/shutting-down flags; `httpClient` holds the
circuit-breaker registry. Two copies means **the writer and the reader are looking at different
objects**, and the value silently never propagates. No error — just a correlation id that is
always `undefined`, or a breaker that never opens.

In production nothing busts the cache, so there is exactly one of each. The list keeps the harness
faithful to production. **If you add a `core/` module that owns a singleton — a pool, a timer, a
registry, an emitter — add it to STATEFUL.**

The file also ships the auth helpers you'll use constantly:

```js
const { makeApp, webAgent, loginWeb, loginApi, extractCsrf, request } = require('../helpers/testApp');
```

---

## 9. Factories, not fixtures files

`tests/helpers/factories.js` builds data with overrides, so each test states only the field it
cares about:

```js
const user = await createUser();                        // all defaults
const user = await createUser({ username: 'signer' });  // just the bit this test is about
const user = await createUser({ status: 'inactive' });
```

Two details in the existing `createUser` that are the whole reason to prefer factories over a
SQL fixture file:

- **It goes through the model** (`User.createWithPassword`), so the password is hashed by the same
  code path production uses. A fixture file with a pre-baked hash silently stops matching the day
  you change the cost factor.
- **It returns the plaintext password** alongside the row, so the test can log in as that user.
  The plaintext is never stored.

```js
let counter = 0;
const uniq = () => `${Date.now()}${++counter}`;
```

That `uniq()` is doing real work: `username` is `UNIQUE`, and a fixed name would collide the
moment two tests in a file both create a user. When you add a factory, make every unique column
unique by construction.

Adding one, for a new resource:

```js
async function createProduct(overrides = {}) {
  const Product = require('../../app/models/Product');
  return Product.create({
    name: overrides.name || `Widget ${uniq()}`,
    sku: overrides.sku || `SKU-${uniq()}`,
    status: overrides.status || 'active',
    ...overrides,
  });
}
module.exports = { createUser, createProduct, DEFAULT_PASSWORD };
```

Note the `require` is **inside** the function, not at the top of the file. That matters: the model
pulls in `core/db`, and requiring it at module load time in a helper can beat `env.js` to the
punch (§6).

---

# Part 3 — Writing tests

## 10. Testing a model

Unit level. No HTTP, but a real database — these tests exist to prove the SQL is right, so mocking
the database would defeat the purpose.

```js
require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { createUser } = require('../helpers/factories');
const Product = require('../../app/models/Product');

test.before(async () => { await migrateTestDb(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

test('findBySku returns the row, or null when missing', async () => {
  const created = await Product.create({ name: 'Widget', sku: 'W1' });
  assert.equal((await Product.findBySku('W1')).id, created.id);
  assert.equal(await Product.findBySku('nope'), null);
});

test('skuTaken ignores the row being edited', async () => {
  const p = await Product.create({ name: 'Widget', sku: 'W1' });
  assert.equal(await Product.skuTaken('W1'), true);
  assert.equal(await Product.skuTaken('W1', p.id), false, 'editing itself is not a collision');
});

test('paginate reports totals and honours page size', async () => {
  for (let i = 0; i < 7; i++) await Product.create({ name: `P${i}`, sku: `S${i}` });
  const { rows, total, totalPages } = await Product.paginate({ page: 2, pageSize: 3 });
  assert.equal(rows.length, 3);
  assert.equal(total, 7);
  assert.equal(totalPages, 3);
});
```

What to cover for any model: the null/missing case, the boundary (`page_size=0`, an empty search
term — both were real bugs, see the [AGENTS.md](./AGENTS.md) gotcha table), and anything with a
`WHERE` clause you wrote by hand.

---

## 11. Testing the API tree (JWT)

```js
const { makeApp, loginApi, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

test('GET /api/products requires a token', async () => {
  await request(app).get('/api/products').expect(401);
});

test('GET /api/products returns a page of products', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });

  const res = await request(app)
    .get('/api/products?page=1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.products));
});

test('an unmatched /api path returns JSON 404, not an HTML redirect', async () => {
  const res = await request(app).get('/api/nope').expect(404);
  assert.match(res.headers['content-type'], /json/);
});
```

That last test is worth writing for every project built on this framework. It is the guard for
rules 4 and 5 in [AGENTS.md](./AGENTS.md) — `/api` mounted before `/`, and the terminal JSON 404
at the bottom of `app/routes/api.js`. Without them an unmatched API path 302s to an HTML login
page, and the failure surfaces in someone's mobile client, not in your logs.

`supertest` notes: `.expect(200)` asserts and returns the response, so you can assert further on
`res.body`; a failed `.expect()` rejects, and since the test function is `async` the runner
reports it properly.

---

## 12. Testing the web tree (sessions + CSRF)

The web tree has session cookies and CSRF tokens, so you cannot POST blind. You must **GET the
form first**, then reuse both the cookie and the token — exactly as a browser does.

```js
const { webAgent, loginWeb, extractCsrf, request } = require('../helpers/testApp');

test('creating a product from the form', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  // GET the form to obtain a CSRF token bound to this session
  const form = await agent.get('/products/create').expect(200);
  const csrf = extractCsrf(form.text);

  await agent
    .post('/products')
    .type('form')                                  // ← form encoding, not JSON
    .send({ _csrf: csrf, name: 'Widget', sku: 'W1' })
    .expect(302);                                  // a web POST redirects

  assert.ok(await Product.findBySku('W1'));
});

test('a POST without a CSRF token is rejected', async () => {
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });
  await agent.post('/products').type('form').send({ name: 'X', sku: 'X1' }).expect(403);
});
```

Four things that will bite you here, all of them mechanical:

1. **Use `request.agent(app)`, not `request(app)`** — the agent persists cookies across requests.
   `loginWeb` returns one.
2. **`.type('form')`** — the web tree parses `application/x-www-form-urlencoded`. Send JSON and
   your fields arrive empty.
3. **A fresh CSRF token per form GET.** Reusing a token from a different session fails.
4. **Expect `302`, not `200`.** The web path redirects; only the JSON path returns a body. That's
   the `respond()` contract.

For `PUT`/`DELETE` from a form, remember this project uses `_method` override with a custom
body-reading getter (`core/Application.js`) — so send `_method: 'PUT'` **in the body**, which is
what the browser form does:

```js
await agent.post('/products/1').type('form').send({ _csrf: csrf, _method: 'PUT', name: 'New' });
```

---

## 13. Testing error paths

The happy path is the easy half. These are the tests that catch regressions people actually ship.

```js
test('a rejected model call becomes a 500, not a hung request', async () => {
  const { mock } = require('node:test');
  mock.method(Product, 'paginate', async () => { throw new Error('db exploded'); });

  const res = await request(app).get('/api/products').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 500);
  mock.restoreAll();
});

test('validation failure returns 422 with field errors', async () => {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ sku: '' })
    .expect(422);
  assert.match(JSON.stringify(res.body), /sku/);
});

test('a 404 for a missing record, not a crash', async () => {
  await request(app).get('/api/products/999999').set('Authorization', `Bearer ${token}`).expect(404);
});
```

That first test is the one to copy everywhere. It is the direct regression test for
[TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §15 — a controller missing its `try/catch` will **not**
return 500 here; it will hang the request and, on Node 24, take the process down. A test that
forces a model to reject is how you prove the `next(err)` is present.

---

## 14. What to test, and what not to

**Worth testing:**

| | Why |
|---|---|
| Every route's auth requirement (401/403/302) | the most common security regression |
| The `/api` JSON 404 | guards rules 4 and 5 (§11) |
| Model methods with hand-written `WHERE`/search | the SQL is the risk |
| Boundaries: `0`, `''`, `null`, page 1 vs page 2, missing record | where the real bugs were |
| Error paths — rejection → 500, validation → 422 | proves `try/catch`/`next(err)` exists (§13) |
| Anything in the [AGENTS.md](./AGENTS.md) gotcha table | it broke once; keep it fixed |

**Not worth testing:** that Express routes at all, that `bcrypt` hashes, that a getter returns the
field you just set, or the exact HTML of a template (assert on the *data* in it — `assert.match(res.text, /signer/)`
— not on the markup, or every CSS change breaks your suite).

The honest metric is not coverage percentage (§18) but: **if I break this on purpose, does a test
go red?** Try it — comment out a `requireJwt` and run the suite. If nothing fails, that's the test
you're missing.

---

# Part 4 — Mocks and time

## 15. `mock.fn` and `mock.method`

Built in, no library. **All verified.**

```js
const { test, mock } = require('node:test');

test('mock.fn records calls', () => {
  const fn = mock.fn((a, b) => a + b);
  fn(1, 2); fn(3, 4);

  fn.mock.callCount();                 // 2
  fn.mock.calls[0].arguments;          // [1, 2]
  fn.mock.calls[1].result;             // 7
});
```

`mock.method` replaces a method on a real object and — when you use the **test-scoped**
`t.mock` — restores it automatically when the test ends:

```js
test('stubbing a dependency', async (t) => {
  const svc = { send: async () => 'real' };
  t.mock.method(svc, 'send', async () => 'stubbed');
  assert.equal(await svc.send(), 'stubbed');
});     // ← restored here, automatically
```

⚠️ Use `t.mock` (test-scoped), not the module-level `mock`, wherever you can. A module-level
`mock.method` that you forget to `mock.restoreAll()` leaks into **every later test in the file**,
and the failure appears in an unrelated test — the worst kind of flake. If you must use the
module-level one, restore it in `afterEach`:

```js
test.afterEach(() => { mock.restoreAll(); });
```

Also available: `fn.mock.mockImplementationOnce(f)` for one-shot behaviour, and
`mock.getter`/`mock.setter` for accessors.

**What not to mock:** the database (§10 — a mocked query proves nothing about your SQL), and
`core/Model` in an integration test (you'd be testing your mock, not the app). Mock at the
*boundary of your process* — an outbound HTTP call, a mail send, the clock.

---

## 16. Faking timers

Real waiting makes a suite slow and flaky. **Verified** — this test asserts a 60-second timeout
instantly:

```js
test('mock.timers controls setTimeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  let fired = false;
  setTimeout(() => { fired = true; }, 60_000);
  assert.equal(fired, false);

  t.mock.timers.tick(60_000);
  assert.equal(fired, true);
});
```

`enable({ apis: [...] })` accepts `setTimeout`, `setInterval`, `setImmediate` and `Date`. Faking
`Date` is how you test "expires in an hour" logic without waiting an hour — or, more usefully in
this project, JWT expiry and session TTL.

Two cautions. `tick()` runs timer callbacks synchronously, so if a callback returns a promise you
still need to `await` something for microtasks to drain
([TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §12). And faked timers do **not** speed up a real
network or database call — they only control the clock.

---

## 17. Faking HTTP: don't mock `fetch`, mock the boundary

For outbound service calls, the thing to test is *your* behaviour on timeout, retry and breaker —
not `fetch`. `tests/unit/soa.test.js` and `tests/integration/soa.test.js` already do this, and the
technique is to stand up a **real local server** that misbehaves on purpose:

```js
const http = require('node:http');

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, r));       // port 0 = any free port
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));         // ← or the runner hangs (§20)
  }
}

test('the client gives up after its timeout', async () => {
  await withServer((req, res) => { /* never responds */ }, async (baseUrl) => {
    const client = createClient({ name: 'slow-svc', baseUrl, timeoutMs: 50, retries: 0 });
    await assert.rejects(() => client.get('/x'), /timed out|abort/i);
  });
});
```

That is a genuine end-to-end test of `AbortController` + timer cleanup + breaker accounting, and it
runs in milliseconds. The existing suite proves the retry policy, the 4xx-doesn't-retry rule, that
a `POST` is not auto-retried, and that each service gets its own circuit — all with this pattern.

The essential detail: **`server.close()` in a `finally`.** A leaked listening socket is a handle,
and a handle is a hung run (§20).

---

# Part 5 — Beyond unit tests

## 18. Coverage

Built in, no `nyc`/`istanbul`:

```bash
node --test --experimental-test-coverage "tests/**/*.test.js"
```

**Verified** output shape:

```
ℹ file      | line % | branch % | funcs % | uncovered lines
ℹ lib.js    |  66.67 |   100.00 |   50.00 | 2
ℹ all files |  66.67 |   100.00 |   50.00 |
```

The **uncovered lines** column is the only part worth acting on. A percentage is a vanity metric —
you can hit 90% by testing getters while every error path is untested. Read the uncovered lines
and ask which of them is a `catch` block, an auth check, or a `null` branch. Those are your
missing tests (§14).

Narrow it with `--test-coverage-exclude` (generated code, `templates/`) and, if you want a
gate in CI, `--test-coverage-lines=N`. Set that number from where you already are, not from an
aspiration — a gate that fails constantly gets disabled.

---

## 19. Playwright E2E

`supertest` cannot catch broken client-side JavaScript, CSS that hides a button, or a form that
doesn't actually submit. That is what the browser layer is for.

**Playwright is not installed by default** (it downloads ~400 MB of browsers):

```bash
npm install --save-dev @playwright/test
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

`playwright.config.js` is already written, and its choices are deliberate:

| Setting | Why |
|---|---|
| `workers: 1`, `fullyParallel: false` | specs share one database |
| `webServer.command: node server.js` | boots the real app on `E2E_PORT` (5099) and waits for it |
| `webServer.env.DB_NAME: forge_mvc_e2e` | a separate database from `_test`, so the two suites can't collide |
| `trace: 'on-first-retry'` | a full replayable timeline for the CI failure you can't reproduce |
| `screenshot`/`video` on failure | the other half of that |
| `retries: CI ? 2 : 0` | retries hide flakes locally; in CI they keep the pipeline usable |

`tests/e2e/global-setup.js` runs once before everything: creates the E2E database, applies
migrations, seeds the login account, then closes the pool.

⚠️ **`global-setup.js` had two real bugs** — both found and fixed while writing this document, and
both worth understanding because they are the kind you only meet at the worst moment.

**1. The seed did not match the schema.** It inserted `{ name, email, password_hash, role }`,
while `database/migrations/001_create_users_table.sql` defines only `username`, `password`,
`status`, `created_at`, `updated_at` — four of the five columns did not exist. The fix is to seed
through the factory path, which goes through the model and therefore cannot drift from the schema
or from the way production hashes a password:

```js
const User = require('../../app/models/User');
await User.createWithPassword({
  username: process.env.E2E_USERNAME || 'e2e',
  password: process.env.E2E_PASSWORD || 'E2E@12345',
  status: 'active',
});
```

**2. It pointed at the wrong database — and truncated the unit-test one.** The setup set
`process.env.DB_NAME = 'forge_mvc_e2e'`, then required `../helpers/db`, which requires
`env.js`, which **overwrites** `DB_NAME` with `TEST_DB_NAME ?? \`${DB_NAME}_test\`` (§6). So the
assignment two lines earlier was silently discarded.

**Verified** by running the setup and then listing databases: the E2E database was **never
created**, and the migrate/truncate/seed all landed in the unit-test database instead. Two
consequences, both nasty: `npm run test:e2e` would **wipe your unit-test data**, and Playwright's
`webServer` — which sets `DB_NAME=forge_mvc_e2e` for the app itself — would start the server
against a database that does not exist (`ER_BAD_DB_ERROR`).

The fix is to use the hook `env.js` already provides, before requiring anything:

```js
const e2eDbName = process.env.E2E_DB_NAME || 'forge_mvc_e2e';
process.env.TEST_DB_NAME = e2eDbName;          // ← env.js honours this
process.env.TEST_MONGO_DB_NAME = e2eDbName;

const { migrateTestDb, resetTestDb } = require('../helpers/db');
```

**Verified after the fix:** `forge_mvc_e2e` is created and holds the seeded `e2e/active` user,
and the unit-test database is left alone.

The general lesson is the one from §6 and
[TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §6: **when a module rewrites
`process.env` at require time, the order of your assignments and your `require`s is program
logic.** Setting an environment variable *after* the module that reads it has loaded is a no-op,
and it fails silently.

Generate a spec skeleton with the CLI rather than writing one from scratch:

```bash
node bin/forge.js make:e2e Products
```

Keep the E2E layer thin. Three or four specs covering the critical journeys — log in, create,
edit, delete — and nothing more. Browser tests are slow and the flakiest thing you own; the
coverage belongs in the integration layer.

---

## 20. Diagnosing a hung or flaky run

**"All tests pass, then nothing happens."** Always a live handle
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §4). Find it:

```js
test.after(() => { console.log(process.getActiveResourcesInfo()); });
```

| Handle | Fix |
|---|---|
| `TCPSERVERWRAP` | a test server you didn't `close()` (§17) |
| the DB pool | missing `await closeTestDb()` in `test.after` |
| `Timeout` | a `setInterval` in code under test — `unref()` or clear it |
| winston transports / session store | `NODE_ENV=test` gives MemoryStore; check `env.js` ran first (§6) |
| a new `core/` singleton | add it to STATEFUL in `testApp.js` (§8) |

**"It passes alone and fails in the suite."** Shared state. In order of likelihood: a
module-level `mock` not restored (§15); a factory that doesn't make unique values (§9); a test
asserting on a literal id when `TRUNCATE` reset the counter (§7); a missing `resetTestDb()`; or
two files running concurrently because someone dropped `--test-concurrency=1` (§1).

**"It fails only in CI."** Usually one of three: a case-sensitive `require` path (Linux vs
Windows — [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §5), a timezone difference
(`TZ` is often UTC in CI, and this repo's own timestamp gotcha lives here — see
[TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §16), or a real race that your faster laptop
hides.

**"The failure message tells me nothing."** Add the third argument to your assertions (§3), and
`console.log(res.status, res.body)` before the failing `expect` — supertest's default message
does not include the body.

Do not chase a flake by adding a sleep. Find the thing you should be awaiting.

---

# Part 6 — Reference

## 21. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Run hangs after all tests pass | a live handle | `process.getActiveResourcesInfo()` (§20) |
| A test passes when the code is broken | missing `await` — often on `assert.rejects` | await it (§3) |
| `assert.equal(1, '1')` passes | non-strict `assert` | `require('node:assert/strict')` (§3) |
| Your **dev** database got truncated | something required `core/db` before `env.js` | `require('../helpers/env')` on line 1 (§6) |
| Tests interfere with each other | missing `resetTestDb()`, or concurrency > 1 | `beforeEach` + `--test-concurrency=1` (§1, §4) |
| Passes alone, fails in the suite | a mock not restored | `t.mock`, or `mock.restoreAll()` in `afterEach` (§15) |
| `id` assertions break randomly | `TRUNCATE` resets AUTO_INCREMENT | assert on the factory's returned id (§7) |
| A web POST gets 403 | missing or stale `_csrf` | GET the form, extract the token, reuse the agent (§12) |
| A web POST's fields are empty | sent as JSON | `.type('form')` (§12) |
| Correlation id is always undefined in tests | two copies of `core/context` | add it to STATEFUL (§8) |
| A duplicate-key error in a factory | a non-unique default | `uniq()` in every unique column (§9) |
| `t.plan(2)` fails with "received 0" | bare `assert`, not `t.assert` | use `t.assert.*` (§2) |
| E2E `ER_BAD_FIELD_ERROR` on setup | `global-setup.js` seeds columns the schema doesn't have | seed via `createUser` (§19) |
| A 500 test hangs instead of asserting | the controller has no `try/catch` | that's the bug the test found (§13) |
| Only CI fails | case-sensitive path, or `TZ` | check both (§20) |

---

## 22. Exercises

1. Delete `await closeTestDb()` from a test file and run the suite. Watch it hang, then find the
   handle with `process.getActiveResourcesInfo()`. Put it back. (§4, §20)

2. Write a test that forces `Product.paginate` to reject and asserts a 500. Then remove the
   `try/catch` from the controller and watch what happens instead of a 500. (§13)

3. Comment out `requireJwt` on one API route. Does any test fail? If not, write the one that
   should. (§14)

4. Add a `createProduct` factory with a unique SKU. Prove uniqueness by creating 100 in one test.
   (§9)

5. Use `t.mock.timers` to test that a JWT issued with `JWT_EXPIRES_IN=1h` is rejected 61 minutes
   later — in a test that runs in under 10ms. (§16)

6. Stand up a local server that returns 500 three times then 200, and assert the `httpClient`
   retry policy and breaker state. (§17)

7. Run coverage. Pick the three uncovered lines that are error paths and write tests for them.
   Ignore the percentage. (§18)

8. Fix `tests/e2e/global-setup.js` to seed via `createUser`, install Playwright, generate a spec
   with `make:e2e`, and get one browser journey green. (§19)

---

## 23. Cheat sheet

```bash
npm test                                         # node --test --test-concurrency=1 tests/**/*.test.js
node --test tests/unit/model.test.js             # one file
node --test --test-name-pattern="adds" …         # filter by name (verified)
node --test --watch …                            # rerun on change
node --test --experimental-test-coverage …        # coverage table + uncovered lines
npm run test:e2e                                 # Playwright (opt-in install)
```

```js
// ── File skeleton ─────────────────────────────────────────────────────────────
require('../helpers/env');            // ← LINE 1, before anything touches core/db
const test = require('node:test');
const assert = require('node:assert/strict');       // strict, always
test.before(async () => { await migrateTestDb(); app = makeApp({ mode: 'hybrid' }); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });   // or the run hangs

// ── Assertions ────────────────────────────────────────────────────────────────
assert.equal / deepStrictEqual / match / ok / throws
await assert.rejects(() => f(), /msg/)              // ⚠️ AWAIT it
assert.equal(a, b, 'message that will help future you')

// ── HTTP ──────────────────────────────────────────────────────────────────────
await request(app).get('/api/x').set('Authorization', `Bearer ${token}`).expect(200);
const agent = await loginWeb(app, { username, password });     // cookie-carrying
const csrf = extractCsrf((await agent.get('/x/create')).text);  // GET form first
await agent.post('/x').type('form').send({ _csrf: csrf, … }).expect(302);

// ── Mocks ─────────────────────────────────────────────────────────────────────
const fn = mock.fn(impl);  fn.mock.callCount();  fn.mock.calls[0].arguments;
t.mock.method(obj, 'm', stub);        // test-scoped → auto-restored. Prefer this.
t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });  t.mock.timers.tick(60_000);
// mock the process boundary (HTTP, mail, clock) — never the database

// ── Hangs ─────────────────────────────────────────────────────────────────────
process.getActiveResourcesInfo()      // what's still open
// pool.end() · server.close() · clearInterval · STATEFUL list in testApp.js
```

---

| Next | |
|---|---|
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | why a forgotten `await` makes a test pass regardless |
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | handles, the module cache, and why runs hang |
| [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) | the auth and injection tests worth writing |
| [TUTORIAL.md](./TUTORIAL.md) | §17–19 — the framework's own testing, Playwright and Postman notes |
