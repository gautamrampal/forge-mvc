# Complete CRUD — One Resource, Web *and* API

Build a full CRUD resource that serves **server-rendered HTML pages and a JSON REST API from one
codebase**. Twelve steps, from an empty table to a passing test suite.

This walkthrough was **built and run** against this repo while writing it — Node v24.11.1, MySQL
8, `APP_MODE=hybrid`, `VIEW_ENGINE=ejs`. Every command output, every JSON response and every test
result below is real, copied from the terminal. The three failures I hit on the way are
documented in step 10, where you will hit them too.

## How this differs from the other two walkthroughs

| Document | What it is |
|---|---|
| [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) / [TUTORIAL-TSX.md](./TUTORIAL-TSX.md) | An annotated **tour of the bundled Users example** — read the code that already exists, per view engine. Web tree only. Users is also the login table, so it's a special case. |
| **This document** | **Build a new, ordinary resource from nothing**, wired into **both route trees**, with verification at every step. |

Read the EJS/TSX walkthrough for view-layer depth. Read this one to add a resource.

---

## Contents

1. [What we're building](#1-what-were-building)
2. [Step 1 — Scaffold](#step-1--scaffold)
3. [Step 2 — The migration](#step-2--the-migration)
4. [Step 3 — The model](#step-3--the-model)
5. [Step 4 — The validators](#step-4--the-validators)
6. [Step 5 — The web controller](#step-5--the-web-controller)
7. [Step 6 — The API controller](#step-6--the-api-controller)
8. [Step 7 — The routes](#step-7--the-routes)
9. [Step 8 — The views](#step-8--the-views)
10. [Step 9 — Verify the API with curl](#step-9--verify-the-api-with-curl)
11. [Step 10 — Test both trees](#step-10--test-both-trees)
12. [Step 11 — One action for both, or two controllers?](#step-11--one-action-for-both-or-two-controllers)
13. [Step 12 — Postman, and what's left](#step-12--postman-and-whats-left)
14. [Checklist](#checklist)
15. [Symptom → cause → fix](#symptom--cause--fix)

---

## 1. What we're building

A `Product` resource. One table, six meaningful columns:

| column | type | notes |
|---|---|---|
| `id` | INT UNSIGNED, auto-increment | primary key |
| `sku` | VARCHAR(32), **UNIQUE** | the business key — drives a 409 on collision |
| `name` | VARCHAR(255) | searchable |
| `description` | TEXT, nullable | optional |
| `price_paise` | INT UNSIGNED | **money as an integer**, never a float |
| `status` | ENUM(active, inactive) | filterable |

Twelve routes when we're done — seven HTML (two of which are the form screens) and five JSON:

```
WEB (session + CSRF)                    API (JWT)
GET    /products                        GET    /api/products
GET    /products/create                 GET    /api/products/:id
POST   /products                        POST   /api/products
GET    /products/:id                    PUT    /api/products/:id
GET    /products/:id/edit               DELETE /api/products/:id
PUT    /products/:id
DELETE /products/:id
```

Both trees hit **the same model**. That is the whole point of the architecture: business rules
live in one place, and the two controllers stay thin enough that they cannot drift.

Files we will touch:

```
database/migrations/<ts>_create_products_table.sql   the schema          (step 2)
app/models/Product.js                                ALL SQL             (step 3)
app/validators/productValidators.js                  input rules         (step 4)
app/controllers/web/ProductController.js             HTML actions        (step 5)
app/controllers/api/ProductController.js             JSON actions        (step 6)
app/routes/web.js  ·  app/routes/api.js              wiring — by hand    (step 7)
app/views/products/{index,form,detail}.ejs           the screens         (step 8)
tests/integration/products.test.js                   proof               (step 10)
tests/helpers/db.js                                  add to the truncate list (step 10)
```

---

## Step 1 — Scaffold

```bash
node bin/forge.js make:scaffold Product
```

**Real output:**

```
created: app\models\Product.js
created: app\controllers\web\ProductController.js
created: app\controllers\api\ProductController.js
created: app\views\products\index.ejs
created: app\views\products\form.ejs
created: app\views\products\detail.ejs
created: database\migrations\20260902081559_create_products_table.sql

Next steps:
  1. Fill in the migration under database/migrations/, then: npm run migrate
  2. Add fields to the generated form view (see the commented example)
  3. Wire up routes — add to app/routes/web.js:
       const ProductController = require('../controllers/web/ProductController');
       router.get('/products', require('../../core/middlewares/requireAuth'), ProductController.list);
       ...
```

Seven files. Note three things about what just happened:

- **It pluralises for you.** `Product` → table `products`, route segment `/products`, view
  directory `products/`. Class names stay singular and PascalCase.
- **It picked EJS** because `VIEW_ENGINE=ejs` in `.env`. Force the other with `--tsx`, or
  generate both by running `make:views Product --tsx` after.
- **It does not touch your route files.** Deliberate — routes are registered by hand so the
  wiring is always visible and greppable. Step 7.

Three things in the generated code you must fix, and this tutorial fixes all three:

| Generated code | Problem |
|---|---|
| `Product.create(req.body)` | **mass assignment** — a client can set any column ([TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §2) |
| `static searchable = []` | search silently matches nothing |
| `orderBy: 'id DESC'` hardcoded | fine, but a user-supplied sort needs an allowlist (§4 of the security doc) |

---

## Step 2 — The migration

Open the generated `.sql` and fill it in. Mine:

```sql
-- create_products_table
-- MySQL/PostgreSQL only — Mongo collections are created implicitly on first insert.
--
-- Note `price_paise INT UNSIGNED`: money is stored as an integer count of minor units, never a
-- FLOAT/DOUBLE. 0.1 + 0.2 !== 0.3 in binary floating point, so a float column turns a few
-- thousand order lines into a total nobody can reconcile.

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price_paise INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Index every column you filter or sort on. The composite serves
  -- `WHERE status = ? ORDER BY created_at DESC` from one index, left to right.
  KEY idx_products_status_created (status, created_at),
  KEY idx_products_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Four decisions worth copying:

1. **`price_paise INT UNSIGNED`, not `DECIMAL` or `FLOAT`.** Integer minor units all the way
   through. See [TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §14 for the measured reason
   — `(1.005).toFixed(2)` is `'1.00'`, and there is no formatting fix.
2. **`sku … UNIQUE`.** The database is the last line of defence. We also check in the model (step
   3) so the user gets a 409 with a sensible message instead of `ER_DUP_ENTRY`.
3. **Indexes on what you filter and sort by.** The composite `(status, created_at)` is usable
   left-to-right ([TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) §4).
4. **`IF NOT EXISTS`** — the test harness applies every migration on every run, so they must be
   idempotent.

```bash
npm run migrate
```

**Real output:**

```
applying: 001_create_users_table.sql
applying: 20260902081559_create_products_table.sql
migrations complete.
```

> **Postgres/Mongo:** swap `AUTO_INCREMENT` for `GENERATED ALWAYS AS IDENTITY`, drop
> `ENGINE`/`CHARSET`, `DATETIME` → `TIMESTAMPTZ`, and `ENUM` → a `CHECK` constraint. Mongo needs
> no migration at all — the collection appears on first insert.

---

## Step 3 — The model

**Everything that touches the database goes here** ([AGENTS.md](./AGENTS.md) rule 1). This is what
keeps `DB_DRIVER` swappable and gives both controllers one source of truth.

```js
// app/models/Product.js
const Model = require('../../core/Model');

class Product extends Model {
  static table = 'products';

  // Columns the search box looks at. Declared on the model rather than in each controller so
  // the web and API lists can't drift apart. Never put a secret column here.
  static searchable = ['sku', 'name'];

  // Returns null for an empty/whitespace-only term so paginate() falls back to an unfiltered
  // list instead of searching for "" and matching every row.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed && this.searchable.length ? { fields: this.searchable, term: trimmed } : null;
  }

  static async findBySku(sku) {
    return this.findOne({ sku });
  }

  // Uniqueness check that ignores the row being edited, so saving a product without changing
  // its SKU doesn't trip "already taken".
  static async skuTaken(sku, exceptId = null) {
    const existing = await this.findBySku(sku);
    if (!existing) return false;
    return exceptId == null || String(existing.id) !== String(exceptId);
  }

  // The ONE place a user-supplied sort becomes a real column. `orderBy` is an identifier, so it
  // is interpolated into the SQL rather than parameterised — an unmapped value here would be
  // SQL injection. See TUTORIAL-SECURITY.md section 4.
  static SORTABLE = {
    newest: 'created_at DESC',
    oldest: 'created_at ASC',
    name: 'name ASC',
    price: 'price_paise DESC',
  };

  static orderByFor(sort) {
    return this.SORTABLE[sort] ?? 'id DESC';     // ?? not ||, per AGENTS.md rule 8
  }

  // The shape that leaves the model layer. Products have no secrets today, but one function per
  // model means there is a single place to add redaction when they do — and it stops `SELECT *`
  // columns from silently becoming part of your API contract.
  static publicFields(product) {
    if (!product) return null;
    const { id, sku, name, description, price_paise, status, created_at, updated_at } = product;
    return {
      id, sku, name, description, price_paise,
      price: (price_paise / 100).toFixed(2),   // display only — never compute from this
      status, created_at, updated_at,
    };
  }
}

module.exports = Product;
```

You get `find`, `findOne`, `findById`, `count`, `create`, `update`, `delete`, `paginate` and
`raw` inherited from [core/Model.js](core/Model.js) — all `async`, so all awaited.

The four additions each earn their place:

- **`searchable` + `searchFor`** — one definition of "what does search look at", shared by both
  controllers. The whitespace guard matters: without it, `?q=%20` searches for `""` and matches
  everything.
- **`skuTaken(sku, exceptId)`** — the `exceptId` is the whole trick. On update you must exclude
  the row you're editing, or saving an unchanged SKU reports a collision with itself.
- **`orderByFor`** — the security-critical one. `orderBy` reaches the SQL as text. A map from
  friendly names to real columns means a hostile `?sort=` can only ever produce the fallback.
- **`publicFields`** — the boundary. Note it is **not** `async`, so `rows.map(Product.publicFields)`
  works directly ([TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §9).

---

## Step 4 — The validators

```js
// app/validators/productValidators.js
const { body } = require('express-validator');

// Shared field rules so create and update can't drift apart.
const sku = () =>
  body('sku').trim()
    .isLength({ min: 1, max: 32 }).withMessage('SKU must be 1-32 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('SKU may only contain capital letters, numbers and hyphens');

const name = () =>
  body('name').trim().isLength({ min: 1, max: 255 })
    .withMessage('Name is required (max 255 characters)');

const description = () =>
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 5000 })
    .withMessage('Description must be 5000 characters or fewer');

// .toInt() means the controller and model only ever see an integer — no float touches money.
const pricePaise = () =>
  body('price_paise').isInt({ min: 0, max: 2147483647 })
    .withMessage('Price must be a whole number of paise (0 or more)')
    .toInt();

const status = () =>
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive');

exports.createProductRules = [sku(), name(), description(), pricePaise(), status()];
exports.updateProductRules = [sku(), name(), description(), pricePaise(), status()];
```

Three patterns here, all from the existing `userValidators.js`:

- **Field rules as functions**, composed into rule sets. Create and update share the definitions,
  so they cannot disagree — the bug where a field is validated on create and not on update is
  extremely common and completely preventable.
- **Allowlist patterns** (`matches`, `isIn`), never "reject bad characters".
- **`.toInt()` coerces**, so the model receives a number. `Number('')` is `0` and
  `parseInt('12px')` is `12` — validate and convert at the edge and neither ever bites you.

`core/middlewares/validate.js` turns a failure into a **422 with per-field errors** for JSON
callers, or a **flash + redirect-back** for browsers. One middleware, both trees.

---

## Step 5 — The web controller

HTTP only ([AGENTS.md](./AGENTS.md) rule 2). Read `req`, call the model, respond.

```js
// app/controllers/web/ProductController.js
const Product = require('../../models/Product');
const { respond, fail } = require('../../../core/Controller');
const { getFlashForm } = require('../../../core/helpers/flashForm');
const { parsePagination } = require('../../../core/helpers/pagination');

// The one place request input becomes model input. Named explicitly rather than passing
// req.body through, so a client cannot set a column we didn't intend (mass assignment).
function pickFields(body) {
  return {
    sku: body.sku,
    name: body.name,
    description: body.description || null,
    price_paise: body.price_paise,
    status: body.status,
  };
}

// GET /products
exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const q = String(req.query.q || '').trim();

    const where = {};
    if (req.query.status === 'active' || req.query.status === 'inactive') {
      where.status = req.query.status;      // allowlisted — user input never becomes a where KEY
    }

    const result = await Product.paginate({
      where,
      search: Product.searchFor(q),
      page,
      pageSize,
      orderBy: Product.orderByFor(req.query.sort),    // mapped, never interpolated raw
    });

    return respond(req, res, {
      view: 'products/index',
      data: {
        title: 'Products',
        q,
        status: where.status || '',
        sort: req.query.sort || '',
        ...result,
        rows: result.rows.map(Product.publicFields),
      },
    });
  } catch (err) {
    return next(err);
  }
};
```

The write actions, where the interesting decisions are:

```js
// POST /products
exports.create = async (req, res, next) => {
  try {
    const fields = pickFields(req.body);

    if (await Product.skuTaken(fields.sku)) {
      return fail(req, res, {
        message: `SKU ${fields.sku} is already in use.`,
        status: 409,
        view: 'products/form',
        data: { title: 'New Product', record: req.body,
                formErrors: { sku: 'Already in use' }, formData: req.body },
      });
    }

    const record = await Product.create(fields);
    req.flash('success', 'Product created.');
    return respond(req, res, {
      status: 201,
      redirect: `/products/${record.id}`,               // HTML path
      json: { record: Product.publicFields(record) },   // JSON path
    });
  } catch (err) {
    return next(err);
  }
};

// PUT /products/:id   (browsers send POST + _method=PUT)
exports.update = async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return fail(req, res, { message: 'Product not found.', status: 404, view: 'errors/404' });
    }

    const fields = pickFields(req.body);
    if (await Product.skuTaken(fields.sku, existing.id)) {   // ← exceptId
      return fail(req, res, { message: `SKU ${fields.sku} is already in use.`, status: 409,
                              view: 'products/form', data: { /* … */ } });
    }

    const record = await Product.update(existing.id, fields);
    req.flash('success', 'Product updated.');
    return respond(req, res, {
      redirect: `/products/${existing.id}`,
      json: { record: Product.publicFields(record) },
    });
  } catch (err) {
    return next(err);
  }
};
```

Five rules visible in that code, none of them optional:

1. **`try/catch` around everything, `return next(err)`.** Express 4 ignores a handler's return
   value, so a rejected promise reaches nobody: the request hangs *and*
   [core/lifecycle.js](core/lifecycle.js) shuts the process down on the unhandled rejection.
   Measured in [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §15.
2. **`return` on every response.** Without it, execution continues and you get
   `Cannot set headers after they are sent`.
3. **`pickFields`, never `req.body`.** The generator's `Product.create(req.body)` is mass
   assignment.
4. **Load before you write.** `update` and `destroy` fetch the row first, so a missing record is a
   404 rather than a silent no-op.
5. **`respond()` carries both paths.** `redirect` for browsers, `json` for API callers — one
   action, two audiences. `fail()` is its error-path twin.

`showCreate` and `showEdit` just render the form; `showEdit` merges `formData` from flash over the
loaded record so a rejected edit redisplays what the user typed, not what's in the database.

---

## Step 6 — The API controller

```js
// app/controllers/api/ProductController.js
const Product = require('../../models/Product');
const { ok, fail } = require('../../../core/helpers/response');
const { parsePagination } = require('../../../core/helpers/pagination');

// GET /api/products?q=widget&status=active&sort=price&page=1&page_size=25
exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    const where = {};
    if (req.query.status === 'active' || req.query.status === 'inactive') {
      where.status = req.query.status;
    }

    const result = await Product.paginate({
      where,
      search: Product.searchFor(req.query.q),
      page,
      pageSize,
      orderBy: Product.orderByFor(req.query.sort),
    });

    result.rows = result.rows.map(Product.publicFields);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const fields = pickFields(req.body);
    if (await Product.skuTaken(fields.sku)) {
      return fail(res, `SKU ${fields.sku} is already in use.`, 409);
    }
    const record = await Product.create(fields);
    return ok(res, { record: Product.publicFields(record) }, 201);
  } catch (err) {
    return next(err);
  }
};
```

`detail`, `update` and `destroy` follow the same shape: load, 404 if missing, act, `ok()`.

### Two response helpers — which one?

This is the thing most likely to confuse you, because the framework ships both:

| Helper | From | Signature | Use for |
|---|---|---|---|
| `respond` / `fail` | [core/Controller.js](core/Controller.js) | `(req, res, {view, data, json, status, redirect})` | **dual-mode** — HTML *or* JSON from one action |
| `ok` / `fail` | [core/helpers/response.js](core/helpers/response.js) | `(res, data, status)` / `(res, message, status)` | **JSON only** — no view path to think about |

Note the argument order differs (`fail(req, res, {...})` vs `fail(res, message, status)`), so
they are not interchangeable — the mistake produces a confusing `Cannot read properties of
undefined`. The generated controllers pick correctly for you: web gets `respond`, API gets `ok`.

`respond()` chooses JSON when the request is under `/api`, is XHR, sends
`Accept: application/json`, or carries `?format=json` — see `wantsJson()` in
[core/Controller.js](core/Controller.js).

---

## Step 7 — The routes

The generator prints a snippet but **does not edit your route files**. Wire both by hand.

```js
// app/routes/web.js — with the other requires at the top
const ProductController = require('../controllers/web/ProductController');
const { createProductRules, updateProductRules } = require('../validators/productValidators');
```

```js
// app/routes/web.js — after the Users block, below `router.use(requireAuth, requireActiveUser)`
// Static paths come BEFORE parameterised ones: '/products/create' must be matched by its own
// route rather than swallowed by '/products/:id' with id="create".
router.get('/products', ProductController.list);
router.get('/products/create', ProductController.showCreate);
router.post('/products', createProductRules, validate, ProductController.create);
router.get('/products/:id', ProductController.detail);
router.get('/products/:id/edit', ProductController.showEdit);
router.put('/products/:id', updateProductRules, validate, ProductController.update);
router.delete('/products/:id', ProductController.destroy);
```

```js
// app/routes/api.js — ABOVE the terminal 404 at the bottom
// Every route carries requireJwt: the API tree has no session to fall back on.
router.get('/products', requireJwt, ProductApiController.list);
router.get('/products/:id', requireJwt, ProductApiController.detail);
router.post('/products', requireJwt, createProductRules, validate, ProductApiController.create);
router.put('/products/:id', requireJwt, updateProductRules, validate, ProductApiController.update);
router.delete('/products/:id', requireJwt, ProductApiController.destroy);
```

Four ordering rules, each of which produces a specific bug if you break it:

| Rule | Break it and… |
|---|---|
| Static before parameterised | `GET /products/create` hits `detail` with `id="create"` |
| API routes **above** the terminal 404 | your new routes are unreachable — the 404 catches them first |
| `/api` mounted before `/` in `bootstrap.js` | already correct; don't reorder it |
| Middleware order: `rules → validate → controller` | the controller runs on unvalidated input |

Note what the web routes **don't** repeat: `requireAuth` and `requireActiveUser` are already
applied by the `router.use(...)` above the Users block, so everything below is protected. The API
tree has no such blanket, which is why `requireJwt` appears on every line.

Sanity-check that both trees still load:

```bash
node -e "require('./app/routes/web.js'); require('./app/routes/api.js'); console.log('ok')"
```

---

## Step 8 — The views

Three EJS files. The generator writes the skeletons; you add fields. Full versions are in
`app/views/products/` — here are the parts that carry a lesson.

**The list** (`index.ejs`) — search and filters as a `GET` form, so results stay linkable and the
back button works:

```ejs
<form method="GET" action="/products" class="row g-2 mb-3">
  <input type="search" name="q" value="<%= q %>" placeholder="Search SKU or name…">
  <select name="status">
    <option value="">All statuses</option>
    <option value="active" <%= status === 'active' ? 'selected' : '' %>>Active</option>
  </select>
  <select name="sort">
    <option value="">Newest first</option>
    <option value="name" <%= sort === 'name' ? 'selected' : '' %>>Name A–Z</option>
  </select>
  <button type="submit">Filter</button>
</form>
```

No CSRF token on that form — it's a `GET` and changes nothing. And note every value is echoed back
with `<%= %>`, which escapes; `<%- %>` would be stored XSS
([TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §6).

**Two different empty states**, because "nothing matched your filter" and "nothing exists yet" call
for different next actions:

```ejs
<% if (!rows.length) { %>
  <% if (q || status) { %>
    <p>No products match that filter.</p>
    <a href="/products">Clear filters</a>
  <% } else { %>
    <p>No products yet.</p>
    <a href="/products/create">Create your first product</a>
  <% } %>
<% } %>
```

**One form for create and edit** (`form.ejs`) — the action and the method override switch on
`record.id`:

```ejs
<form method="POST" action="<%= record.id ? '/products/' + record.id : '/products' %>" novalidate>
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <% if (record.id) { %><input type="hidden" name="_method" value="PUT"><% } %>

  <input type="text" name="sku" class="form-control <%= formErrors.sku ? 'is-invalid' : '' %>"
         value="<%= record.sku || '' %>" required>
  <% if (formErrors.sku) { %><div class="invalid-feedback d-block"><%= formErrors.sku %></div><% } %>
```

Browsers can only send `GET` and `POST`, so `_method=PUT` in the **body** is what produces a
`PUT`. This project uses a custom body-reading override in
[core/Application.js](core/Application.js) because `method-override@3`'s string getter only reads
the query string — that was a real bug where every `_method=PUT` form silently stayed a POST.

**Delete is a form, not a link** (`detail.ejs`):

```ejs
<form method="POST" action="/products/<%= record.id %>"
      onsubmit="return confirm('Delete this product?')">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="hidden" name="_method" value="DELETE">
  <button type="submit">Delete</button>
</form>
```

A `GET` link would be fired by any crawler or link prefetcher, and CSRF exempts safe methods — so
a delete-by-link is unprotected *and* triggerable by accident.

> **TSX projects:** same structure, different syntax — `{formErrors.sku}` instead of `<%= %>`,
> and `dangerouslySetInnerHTML` is the unsafe door. See [TUTORIAL-TSX.md](./TUTORIAL-TSX.md) §6.

---

## Step 9 — Verify the API with curl

Start the server, then work through the whole cycle. **All output below is real.**

```bash
npm start
```

**1. Get a token.**

```bash
curl -s -X POST http://localhost:5010/api/auth/login -H "Content-Type: application/json" -d '{"username":"demo","password":"Demo@12345"}'
```

**2. Create.**

```bash
curl -s -X POST http://localhost:5010/api/products -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"sku":"WIDGET-01","name":"Widget","description":"A widget","price_paise":19999,"status":"active"}'
```

```json
{
  "success": true,
  "record": {
    "id": 2,
    "sku": "WIDGET-01",
    "name": "Widget",
    "description": "A widget",
    "price_paise": 19999,
    "price": "199.99",
    "status": "active",
    "created_at": "2026-09-02 08:22:55",
    "updated_at": "2026-09-02 08:22:55"
  }
}
```

Both `price_paise` (the integer of record) and `price` (the display string) — that's
`publicFields` doing its job.

**3. List.**

```bash
curl -s "http://localhost:5010/api/products?page=1&page_size=5" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "rows": [ { "id": 2, "sku": "WIDGET-01", "price": "199.99", "status": "active" } ],
  "total": 1,
  "page": 1,
  "pageSize": 5,
  "totalPages": 1
}
```

**4. Update.**

```bash
curl -s -X PUT http://localhost:5010/api/products/2 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"sku":"WIDGET-01","name":"Widget Mk II","price_paise":24999,"status":"active"}'
```

```json
{ "success": true, "record": { "id": 2, "name": "Widget Mk II", "price": "249.99" } }
```

**5. Delete, then confirm it's gone.**

```bash
curl -s -X DELETE http://localhost:5010/api/products/2 -H "Authorization: Bearer $TOKEN"
```

```json
{ "success": true, "deleted": true }
```

### The five error cases, all verified

| Request | Result |
|---|---|
| No `Authorization` header | **401** |
| `{"sku":"bad sku","name":"","price_paise":-1,"status":"nope"}` | **422** with all four field errors |
| A `sku` that already exists | **409** `"SKU WIDGET-01 is already in use."` |
| `GET /api/products/2` after deleting it | **404**, JSON |
| `GET /api/prodcuts` (typo) | **404** `"No API route matches GET /api/prodcuts"` |

The 422 body, exactly as returned:

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": {
    "sku": "SKU may only contain capital letters, numbers and hyphens",
    "name": "Name is required (max 255 characters)",
    "price_paise": "Price must be a whole number of paise (0 or more)",
    "status": "Status must be active or inactive"
  }
}
```

And the injection payload from [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §4, aimed at the
sort parameter:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --get --data-urlencode 'sort=id` = 1 OR `1' "http://localhost:5010/api/products" -H "Authorization: Bearer $TOKEN"
```

**200** — `orderByFor` didn't find it in `SORTABLE`, so it returned the `'id DESC'` fallback and
the payload never reached the SQL. That is the allowlist from step 3 doing the only job it has.

For the web tree, open `http://localhost:5010/products` in a browser and click through: list →
create → detail → edit → delete. The integration tests in step 10 automate exactly that.

---

## Step 10 — Test both trees

```js
// tests/integration/products.test.js
require('../helpers/env');                    // ← LINE 1, before anything touches core/db
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

const VALID = { sku: 'WIDGET-01', name: 'Widget', description: 'A widget',
                price_paise: 19999, status: 'active' };
```

The API cycle in one test:

```js
test('API: full CRUD cycle', async () => {
  const user = await createUser();
  const token = await loginApi(app, { username: user.username, password: DEFAULT_PASSWORD });
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  const created = await auth(request(app).post('/api/products').send(VALID)).expect(201);
  assert.equal(created.body.record.price, '199.99');
  const id = created.body.record.id;

  await auth(request(app).get(`/api/products/${id}`)).expect(200);

  const updated = await auth(
    request(app).put(`/api/products/${id}`).send({ ...VALID, name: 'Widget Mk II', price_paise: 24999 })
  ).expect(200);
  assert.equal(updated.body.record.price, '249.99');

  await auth(request(app).delete(`/api/products/${id}`)).expect(200);
  await auth(request(app).get(`/api/products/${id}`)).expect(404);
});
```

The web cycle, which has to behave like a browser:

```js
test('web: full CRUD cycle through the forms', async () => {
  const user = await createUser();
  const agent = await loginWeb(app, { username: user.username, password: DEFAULT_PASSWORD });

  // CREATE — GET the form for a CSRF token, then POST it back
  const form = await agent.get('/products/create').expect(200);
  const csrf = extractCsrf(form.text);

  const created = await agent.post('/products').type('form').send({ _csrf: csrf, ...VALID }).expect(302);
  const product = await Product.findBySku('WIDGET-01');
  assert.equal(created.headers.location, `/products/${product.id}`);

  // UPDATE — POST + _method=PUT, the way a browser form does it
  const editForm = await agent.get(`/products/${product.id}/edit`).expect(200);
  const editCsrf = extractCsrf(editForm.text);
  await agent.post(`/products/${product.id}`).type('form')
    .send({ _csrf: editCsrf, _method: 'PUT', ...VALID, name: 'Widget Mk II' }).expect(302);
  assert.equal((await Product.findById(product.id)).name, 'Widget Mk II');

  // DELETE — also a form, also _method
  await agent.post(`/products/${product.id}`).type('form')
    .send({ _csrf: editCsrf, _method: 'DELETE' }).expect(302);
  assert.equal(await Product.findById(product.id), null);
});
```

### ⚠️ Three things that will fail on your first run

I hit all three writing this. None are in the other walkthroughs.

**1. `resetTestDb()` only truncates the tables it knows about.** Mine failed 11 of 20 tests with:

```
Duplicate entry 'WIDGET-01' for key 'products.sku'
```

The first test's row survived into every later test, because `tests/helpers/db.js` has a hardcoded
list. **Add your table to all three drivers:**

```js
// tests/helpers/db.js — resetTestDb()
for (const table of ['users', 'products']) {          // MySQL
  await db.query(`TRUNCATE TABLE \`${table}\``);
}
await db.query('TRUNCATE TABLE users, products RESTART IDENTITY CASCADE');   // Postgres
for (const collection of ['users', 'products']) {                            // Mongo
  await mongo.collection(collection).deleteMany({});
}
```

**This is a required step for every new table**, not an optional one. Nothing warns you; you just
get duplicate-key failures in tests that look unrelated to the one that leaked the row.

**2. supertest sends no `Referer`, so redirect-back lands somewhere else.** My validation test
asserted a redirect to `/products/create` and got `/products`:

```
actual: '/products',  expected: /\/products\/create/
```

`core/middlewares/validate.js` redirects to `req.get('Referer') || req.originalUrl || '/'`. A
browser sends `Referer`; supertest does not, so it fell through to the POST target. Set it
explicitly — which also documents the dependency:

```js
const res = await agent
  .post('/products')
  .type('form')
  .set('Referer', '/products/create')      // ← a browser sends this; supertest does not
  .send({ _csrf: csrf, sku: 'bad sku', name: '', price_paise: 'abc', status: 'active' })
  .expect(302);
assert.match(res.headers.location, /\/products\/create/);
```

(The reason `validate.js` spells the fallback chain out at all is the helmet `no-referrer` bug in
the [AGENTS.md](./AGENTS.md) gotcha table — worth reading the comment in that file.)

**3. The Postman replay test assumes one resource.** Running the *whole* suite, not just my new
file, produced one more failure — in a test I hadn't touched:

```
✖ every generated request actually reaches its route
    actual: 404,  expected: 404,  operator: 'notStrictEqual'
```

`tests/integration/postman.test.js` replays every request in the generated collection and asserts
none of them 404. It resolves `:id` to a **user** id and sends a **user-shaped body**, which
worked fine when Users was the only resource. Now `GET /api/products/<a user id>` correctly
returns 404 — the route matched, the record doesn't exist — and the assertion cannot tell that
apart from "no such endpoint".

The fix is to assert what the test actually means. The terminal handler in `app/routes/api.js` is
the *only* 404 that means "no route matched", and it identifies itself:

```js
// "Did it reach a route?" is not the same question as "did it find a record?". Once the app has
// more than one resource, `:id` cannot be a valid id for all of them and a body shaped for one
// resource will not validate for another — both are legitimate answers from a route that matched.
const noRouteMatched = res.status === 404 && /No API route matches/.test(res.body?.message || '');
assert.equal(noRouteMatched, false, `${method} ${urlPath} did not match any route`);
assert.ok(res.status < 500, `${method} ${urlPath} returned ${res.status}`);
```

The general lesson: **run the full suite, not just your new file.** A new resource changes shared
fixtures — the truncate list, the Postman collection, the route table — and the breakage lands in
tests that look unrelated to what you built.

### The run

```bash
node --test --test-concurrency=1 tests/integration/products.test.js
```

**Real output, after both fixes:**

```
✔ findBySku returns the row, or null when missing
✔ skuTaken ignores the row being edited
✔ orderByFor maps a user-supplied sort to a real column, and falls back safely
✔ publicFields exposes a formatted price without losing the integer
✔ paginate reports totals and honours page size
✔ search matches sku or name, and an empty term does not filter
✔ API: every product route requires a token
✔ API: full CRUD cycle
✔ API: validation failure is a 422 with per-field errors
✔ API: a duplicate SKU is a 409, not a 500
✔ API: a missing record is a JSON 404
✔ API: an unmatched /api path returns JSON 404, not an HTML redirect
✔ API: page_size is clamped, so ?page_size=100000 cannot ask for the whole table
✔ web: anonymous visitors are bounced to /login
✔ web: the list renders, with an empty state before anything exists
✔ web: full CRUD cycle through the forms
✔ web: a POST without a CSRF token is rejected
✔ web: /products/create is matched by its own route, not by /products/:id
✔ web: a validation failure redirects back and keeps the input
✔ the web action returns JSON when asked, via ?format=json
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

The tests worth copying verbatim for any resource you add: **auth on every route**, **the terminal
`/api` 404**, **`/create` not matching `/:id`**, **CSRF rejection**, and **`page_size` clamping**.
Each guards a rule that is invisible until it breaks.

---

## Step 11 — One action for both, or two controllers?

We wrote two controllers. The framework also lets one action serve both, because `respond()`
already branches. Both are legitimate; here's how to choose.

The last test in step 10 proves the web action *already* serves JSON:

```js
const res = await agent.get('/products?format=json').expect(200);
assert.equal(res.body.rows[0].sku, 'WIDGET-01');     // ✔ passes
```

So a single-controller version is just the web controller with the API routes pointed at it:

```js
// app/routes/api.js — no separate API controller at all
const ProductController = require('../controllers/web/ProductController');
router.get('/products', requireJwt, ProductController.list);
router.post('/products', requireJwt, createProductRules, validate, ProductController.create);
```

| | Two controllers (this tutorial) | One dual-mode action |
|---|---|---|
| Best when | the two surfaces differ — different fields, filters, status codes, or auth | the API is a thin mirror of the pages |
| Response shape | independent; change one freely | coupled — an HTML tweak can change your API contract |
| Code | ~2× the controller lines, all of it trivial | half the code |
| Risk | the two drift apart | you break a mobile client while restyling a page |
| Flash messages | web only, naturally | `req.flash` must be guarded — it doesn't exist on the API tree |

**Default to two controllers** once the API has any real consumer. The duplication is thin — every
actual rule lives in the model, which is why both controllers here are almost entirely
argument-shuffling. Use one dual-mode action for an internal admin screen whose "API" exists only
for your own fetch calls.

Whichever you choose, keep the *model* single. That is where drift would actually hurt.

---

## Step 12 — Postman, and what's left

Generate a collection from the live route table:

```bash
node bin/forge.js make:postman
```

It reads `app/routes/api.js`, so your new endpoints appear automatically — no manual upkeep.

### What this walkthrough deliberately left out

A production resource usually needs these too. They are not in scope here, but you should know
they're missing:

| Gap | Where to read |
|---|---|
| **Ownership scoping** — any signed-in user can edit any product (IDOR) | [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §10 — put `user_id` in the `WHERE`, return 404 not 403 |
| **Soft delete / audit trail** — `Product.delete` is permanent | add `deleted_at` and filter it in the model |
| **Transactions** — no multi-table write here | [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §26; the framework ships no helper |
| **Deep pagination** — `OFFSET` degrades (1ms → 69ms measured) | [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) §6 |
| **Search at scale** — `LIKE '%term%'` can't use an index (68× slower) | [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) §5 |
| **File uploads** (product images) | [TUTORIAL.md](./TUTORIAL.md) §15, [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §15 |
| **Browser E2E** | `node bin/forge.js make:e2e Products`, then [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) §19 |

---

## Checklist

Copy this for every resource you add.

**Schema**
- [ ] Migration is `IF NOT EXISTS` and idempotent
- [ ] Money stored as integer minor units
- [ ] `UNIQUE` on the business key
- [ ] Index on every filtered/sorted column
- [ ] `npm run migrate` run

**Model** — all SQL lives here
- [ ] `static table`
- [ ] `static searchable` + `searchFor()` with the whitespace guard
- [ ] Uniqueness check taking an `exceptId`
- [ ] `SORTABLE` map + `orderByFor()` — **never** raw `orderBy` from the request
- [ ] `publicFields()` defining what leaves the layer

**Validators**
- [ ] Field rules as shared functions, used by both create and update
- [ ] Allowlists (`isIn`, `matches`), not blocklists
- [ ] Numeric fields `.toInt()`

**Controllers** — HTTP only
- [ ] `pickFields()`; never `req.body` into a model
- [ ] Every action `async` + `try/catch` + `return next(err)`
- [ ] `return` on every response
- [ ] Load-then-act on update/delete, so missing is a 404
- [ ] Duplicate business key → 409, not a driver error

**Routes**
- [ ] Static paths before `:id`
- [ ] API routes above the terminal 404
- [ ] `rules → validate → controller` order
- [ ] `requireJwt` on every API route
- [ ] Both route files still `require()` cleanly

**Views** (skip if `APP_MODE=api`)
- [ ] `<%= %>` everywhere; every `<%- %>` justified
- [ ] `_csrf` in every mutating form
- [ ] `_method` for PUT/DELETE
- [ ] Delete is a form, not a link
- [ ] Two empty states

**Tests**
- [ ] **Table added to `resetTestDb()`** — all three drivers
- [ ] Auth asserted on every route
- [ ] Full CRUD cycle, both trees
- [ ] 422 validation, 409 duplicate, 404 missing
- [ ] `Referer` set where redirect-back is asserted
- [ ] **Full suite run**, not just the new file — shared fixtures change
- [ ] `npm test` and `npm run type-check` green

---

## Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| `GET /products/create` renders a detail page or 404s | `/:id` declared before `/create` | reorder — static first (step 7) |
| A new API route 404s with the terminal message | declared below the terminal 404 | move it above (step 7) |
| `Duplicate entry` in tests that shouldn't collide | table missing from `resetTestDb()` | add it, all three drivers (step 10) |
| A test you didn't touch starts failing | shared fixtures (truncate list, Postman collection) assume one resource | run the full suite; fix the shared fixture (step 10) |
| Redirect-back goes to `/products` in a test but the form in a browser | supertest sends no `Referer` | `.set('Referer', …)` (step 10) |
| Web form fields arrive empty | sent as JSON | `.type('form')` (step 10) |
| A web POST gets 403 | missing or stale `_csrf` | GET the form first, reuse the agent (step 8) |
| `_method=PUT` stays a POST | override reading the query string | already fixed in `core/Application.js` |
| Request hangs, then the process shuts down | async action with no `try/catch` | `return next(err)` (step 5) |
| `Cannot set headers after they are sent` | missing `return` before a response | `return` everything (step 5) |
| `ER_DUP_ENTRY` reaches the client as a 500 | no uniqueness pre-check | `skuTaken()` → 409 (steps 3, 5) |
| A client set a column you didn't expose | `Model.create(req.body)` | `pickFields()` (step 5) |
| Search matches every row | empty term became `""` | `searchFor()` whitespace guard (step 3) |
| `Cannot read properties of undefined` in a controller | `fail(res, …)` vs `fail(req, res, …)` mixed up | check which helper you imported (step 6) |
| Price off by a paisa | float arithmetic on money | integer paise end to end (step 2) |
| `?sort=` from the request in the SQL | raw `orderBy` | `orderByFor()` allowlist (step 3) |

---

| Next | |
|---|---|
| [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) / [TUTORIAL-TSX.md](./TUTORIAL-TSX.md) | view-layer depth, and the bundled Users example annotated |
| [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) | the harness in full — mocks, coverage, hung runs |
| [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) | ownership scoping, the injection surface, the pre-launch checklist |
| [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) | what breaks first as this table grows |
| [LEARNING-PATH.md](./LEARNING-PATH.md) | where this sits in the curriculum |
