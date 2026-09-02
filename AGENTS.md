# AGENTS.md — Forge MVC

Instructions for an AI coding agent working in this repository. Written to be pasted into (or
referenced by) an agent kit's system prompt. Human-oriented background lives in
[PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md) and [TUTORIAL.md](./TUTORIAL.md).

---

## 1. What this project is

A Node.js framework for building a **server-rendered MVC app**, a **JSON REST API**, or **both
from one codebase**, on **MySQL / PostgreSQL / MongoDB**, with **EJS or React (TSX)** views.

Plain Express and plain `require()`. No dependency injection container, no decorators, no
auto-discovery. Routes are registered by hand.

- **Runtime:** Node 18+ (developed on 24). CommonJS — **no ESM, no top-level `await`.**
- **Entry:** `server.js` → `bootstrap.js` → `core/Application.js`
- **Port:** `PORT` from `.env`. `.env.example` ships `5000`; `server.js` falls back to `5010` if
  the variable is unset. Read `.env` rather than assuming.

---

## 2. Set up a new project from this framework

```bash
git clone <repo> my-project && cd my-project
npm install
cp .env.example .env
```

Edit `.env` — at minimum `DB_*`, `SESSION_SECRET`, `JWT_SECRET`. Then pick the switches:

```ini
APP_MODE=hybrid     # mvc | api | hybrid
DB_DRIVER=mysql     # mysql | postgres | mongodb
VIEW_ENGINE=ejs     # ejs | tsx
SESSION_STORE=db    # db | file | sqlite | redis | memcached | cookie | memory (see .env.example)
```

Strip the bundled Users example down to a runnable skeleton, keeping the whole framework:

```bash
node bin/forge.js clean --yes --ejs
```

`--ejs` keeps `app/views/` and deletes `app/views-tsx/`; `--tsx` does the reverse; omit both to
keep each. Then:

```bash
npm run migrate
npm run seed
npm start
```

**Do not run `clean` on a project that already has real code** — it removes files by an explicit
allowlist of *example* files, but there is no undo.

---

## 3. Hard rules

These are not style preferences. Violating them breaks something concrete.

1. **All SQL lives in `app/models/`.** Controllers and services never contain a query. This is
   what makes `DB_DRIVER` swappable.
2. **Controllers do HTTP only** — read `req`, call a model/service, call `respond()`. No business
   logic, no queries.
3. **Never mount session, flash, or CSRF globally.** They belong to `app/routes/web.js` only.
   Mounting them in `core/Application.js` makes every `/api/*` request fail CSRF.
4. **`/api` must stay mounted before `/`** in `bootstrap.js`.
5. **Keep the terminal JSON 404 at the end of `app/routes/api.js`.** Without it, an unmatched
   `/api/*` path falls into the web tree and returns a 302 to an HTML login page.
6. **CommonJS only.** `require`/`module.exports`. For an ESM-only package use
   `const mod = await import('pkg')` inside an async function.
7. **Never edit `core/` to add a feature.** Extend via `app/`. The exceptions where editing
   `core/` *is* correct: adding a database adapter (`core/db/`), or adding a genuinely reusable
   middleware/helper.
8. **Use `??`, not `||`, for defaults** on anything that can legitimately be `0` or `""`.
9. **Every `.env` key you introduce must be added to `.env.example`** with a comment.

---

## 4. Generate code — prefer the CLI over hand-writing

```bash
node bin/forge.js make:scaffold Product      # model + web/api controllers + views + migration
node bin/forge.js make:model Product
node bin/forge.js make:controller Product [--api]
node bin/forge.js make:views Product
node bin/forge.js make:middleware requireOwner
node bin/forge.js make:migration create_products_table
node bin/forge.js make:e2e Products
node bin/forge.js make:postman
```

The generator does **not** edit route files. After scaffolding, register routes by hand in
`app/routes/web.js` and/or `app/routes/api.js`.

---

## 5. The APIs you will actually use

### Model — `core/Model.js`

```js
const Model = require('../../core/Model');

class Product extends Model {
  static table = 'products';           // SQL table OR Mongo collection — same property
  static searchable = ['name', 'sku']; // columns used by paginate({ search })

  // Add your own statics for anything beyond equality lookups. Use this.db directly.
  static async findBySku(sku) {
    return this.findOne({ sku });
  }
}
module.exports = Product;
```

Inherited statics, all `async`:

```js
Product.find({ status: 'active' }, { limit, offset, orderBy, search })
Product.findOne({ sku: 'X1' })
Product.findById(id)
Product.count({ status: 'active' })
Product.create({ name, sku })          // returns the created record
Product.update(id, { name })
Product.delete(id)
Product.paginate({ where, search, page, pageSize, orderBy })
Product.raw(sql, params)               // escape hatch; SQL drivers only
```

`search` is `{ fields: [...], term: '...' }` — a case-insensitive contains-match, ANDed with
`where`, escaped by each adapter (`LIKE ESCAPE` / `ILIKE` / `$regex`).

### Controller — `core/Controller.js`

`respond()` and `fail()` let **one action serve both HTML and JSON**. Do not extend a base class;
controllers are plain exported functions.

```js
const { respond, fail } = require('../../../core/Controller');
const Product = require('../../models/Product');

exports.index = async (req, res, next) => {
  try {
    const { rows, meta } = await Product.paginate({
      page: req.query.page,
      search: req.query.q ? { fields: Product.searchable, term: req.query.q } : null,
    });
    return respond(req, res, { view: 'products/index', data: { products: rows, meta } });
  } catch (err) {
    return next(err);
  }
};

exports.store = async (req, res, next) => {
  try {
    const product = await Product.create(req.body);
    return respond(req, res, {
      status: 201,
      data: { product },
      redirect: '/products',      // HTML path only; JSON path returns the payload
      view: 'products/show',
    });
  } catch (err) {
    return next(err);
  }
};
```

`respond(req, res, { view, data, json, status, redirect })` — renders `view` with `data` for
browsers, returns `{ success, ...data }` for API callers. `fail(req, res, { message, status,
view, data })` is the error-path counterpart.

JSON is chosen when the request is under `/api`, is XHR, sends `Accept: application/json`, or has
`?format=json`.

### Async route handlers

Express 4 **swallows** a rejected promise — the request hangs forever. Always `try/catch` and call
`next(err)`, as above.

---

## 6. Adding a feature — the exact sequence

Adding "Products" to a hybrid app:

1. `node bin/forge.js make:migration create_products_table` → write the SQL
2. `npm run migrate`
3. `node bin/forge.js make:model Product` → set `table`, `searchable`, custom finders
4. `node bin/forge.js make:controller Product` and `... --api`
5. `node bin/forge.js make:views Product` (skip if `APP_MODE=api`)
6. Create `app/validators/productValidators.js`
7. **Register routes by hand:**

```js
// app/routes/web.js — static paths BEFORE parameterised ones
router.get('/products', ProductController.index);
router.get('/products/create', ProductController.create);
router.post('/products', createProductRules, validate, ProductController.store);
router.get('/products/:id', ProductController.show);
router.put('/products/:id', updateProductRules, validate, ProductController.update);
router.delete('/products/:id', ProductController.destroy);
```

```js
// app/routes/api.js — BEFORE the terminal 404 at the bottom
router.get('/products', requireJwt, ProductController.index);
router.post('/products', requireJwt, createProductRules, validate, ProductController.store);
```

8. Write tests in `tests/integration/`
9. `npm test`

Add a `app/services/` module only when logic spans more than one model or calls another service.

---

## 7. Verify your work

Run these before reporting a task complete. **Do not claim success without running them.**

```bash
npm test
```

```bash
npm run type-check
```

`type-check` only covers `.tsx` views; it is a no-op for EJS projects but must still pass.

Smoke-test a running server:

```bash
curl -s http://localhost:5000/health
```

```bash
curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@12345"}'
```

(Substitute the `PORT` from your `.env`.)

**Stop the dev server before running the test suite** — it competes for the test database and the
run appears to hang.

---

## 8. Environment gotchas that cost real debugging time

Each of these was a genuine bug in this codebase. They are documented so an agent does not
rediscover them.

| Symptom | Cause | Fix |
|---|---|---|
| Timestamps off by hours; "-1 day" ages | MySQL connection defaults to system time while the app renders UTC | Pin `time_zone='+00:00'` per pooled connection **and** `timezone:'+00:00'` in pool config |
| Every `_method=PUT` form stays a POST | `method-override@3`'s string getter reads only the query string | Custom body-reading getter (already in `core/Application.js`) |
| Failed form submit lands on the dashboard, input lost | helmet's default `no-referrer` strips Referer, so `redirect('back')` falls through to `/` | `referrerPolicy: {policy:'same-origin'}` + explicit `req.get('Referer')` |
| `?page_size=0` silently becomes 25 | `parseInt(x) \|\| default` swallows a legitimate 0 | Explicit `Number.isNaN` check |
| Test runner hangs | MySQL session store keeps the event loop alive; or cache-busted `core/db` leaks pools | MemoryStore under `NODE_ENV=test`; STATEFUL exclusion list in `tests/helpers/testApp.js` |
| A view local named `client` breaks `include()` | Collides with EJS's own `opts.client` compile flag | Rename the local |
| Transaction hangs until lock timeout | A helper grabbed a *new* pooled connection while the transaction held the row lock | Thread the transaction connection through as the first argument |

---

## 9. Running as a service (SOA)

Already wired: `/health` (liveness) and `/ready` (readiness), correlation IDs on every log line,
graceful shutdown with connection draining, and `core/helpers/httpClient.js` for calling other
services with timeouts, retries and a circuit breaker.

```js
const { createClient } = require('../../core/helpers/httpClient');
const notifications = createClient({
  name: 'notifications',
  baseUrl: process.env.NOTIFICATION_SERVICE_URL,
  timeoutMs: 3000,
  retries: 2,
});
```

Never call another service with bare `fetch` — you lose the timeout, the retry policy, the
breaker, and correlation-ID propagation. See [TUTORIAL-SOA.md](./TUTORIAL-SOA.md).

---

## 10. Documentation map

| File | Read when |
|---|---|
| [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md) | deciding where a new file goes |
| [TUTORIAL.md](./TUTORIAL.md) | framework reference — DB, helpers, JWT, mail, uploads, deployment |
| [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) / [TUTORIAL-TSX.md](./TUTORIAL-TSX.md) | full CRUD walkthrough for your view engine |
| [TUTORIAL-CRUD.md](./TUTORIAL-CRUD.md) | adding a resource end to end — web + API from one model, 12 steps, verified |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | health probes, shutdown, service-to-service calls |
| [TUTORIAL-JS.md](./TUTORIAL-JS.md) | Node/JS essentials for PHP migrants |
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | promises, async/await, concurrency, and the async rules this framework enforces |
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | event loop, streams, module cache, workers, handles — why runs hang and processes stall |
| [TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) | prototypes, `this`, iterators, metaprogramming, numbers/dates/JSON traps |
| [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) | `node:test`, this repo's harness, mocks, coverage, diagnosing a hung run |
| [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) | injection, XSS, auth, CSRF, CORS, uploads, secrets — plus a pre-launch checklist |
| [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) | N+1, indexes, pagination depth, pool limits, profiling, load testing |
| [LEARNING-PATH.md](./LEARNING-PATH.md) | the whole curriculum in reading order, and what is still unwritten |
| [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) | the standalone JavaScript course in `practice/` |

---

## 11. Checklist before reporting done

- [ ] All SQL is in a model
- [ ] Controller actions `try/catch` and call `next(err)`
- [ ] Routes registered by hand; static paths before `:id` paths
- [ ] API routes added **above** the terminal 404
- [ ] New `.env` keys documented in `.env.example`
- [ ] `npm test` passes — output shown, not asserted
- [ ] `npm run type-check` passes
- [ ] Defaults use `??` where `0`/`""` are valid values
