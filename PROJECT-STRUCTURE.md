# Project Structure

Every directory in this repository, what belongs in it, and why. If you are deciding *where a
new file should go*, this is the document to read.

The one rule that explains most of the layout: **`core/` is the framework and you rarely edit it;
`app/` is your application and it is all you normally write.** Everything else supports one of
those two.

---

## Top level

```
forge-mvc/
├── core/            the framework            — you rarely edit this
├── app/             your application         — this is what you write
├── database/        migrations and seeds
├── tests/           unit, integration, e2e
├── templates/       code-generator templates
├── bin/             the forge CLI
├── practice/        the JavaScript course    — standalone, safe to delete
├── storage/         runtime output (logs, uploads) — gitignored
│
├── server.js        starts the HTTP listener
├── bootstrap.js     builds the app without listening
├── package.json
├── tsconfig.json    type-checking for .tsx views only
├── playwright.config.js
├── Dockerfile
├── .env             your local config        — never committed
└── .env.example     the documented template
```

---

## The boot chain: three files, three jobs

This split exists so tests can drive the real application in-process, without spawning a server
and polling a URL.

```
server.js  ──calls──>  bootstrap.js  ──calls──>  core/Application.js
   │                        │                         │
   listens on a port        mounts YOUR routes         builds the generic
   connects the DB          adds 404 + error handler   Express app
   installs shutdown        returns the app            (security, parsing,
   sets readiness           WITHOUT listening           views, health, logs)
```

**`core/Application.js`** — `createApp()` returns an Express app with everything that is the same
in every project: correlation IDs, helmet, CORS, health probes, rate limiting, request logging,
body parsing, `method-override`, static files, and the view engine. It deliberately does **not**
mount sessions, flash, or CSRF; those belong to the web route tree only (see below).

**`bootstrap.js`** — mounts your two route trees onto that app and returns it. Named
`bootstrap.js` rather than the conventional `app.js` because this project already has an `app/`
directory, and `require('./app')` would read ambiguously.

**`server.js`** — the only file that opens a port. It connects to the database *first* (so a bad
config crash-loops visibly instead of serving 500s), starts listening, flips readiness to true,
sets keep-alive timeouts, and installs graceful shutdown.

### Mount order matters

```js
if (mode !== 'mvc') app.use('/api', require('./app/routes/api'));   // FIRST
if (mode !== 'api') app.use('/',    require('./app/routes/web'));   // SECOND
```

The web router is mounted at `/`, so its `router.use()` chain — session, flash, CSRF — would
otherwise run for `/api/*` requests too, and CSRF would reject them long before they reached the
API router. Matching `/api` first means API requests never enter the web chain at all.

---

## `core/` — the framework

You extend this rather than edit it. Broken into five groups:

### Root modules

| File | Responsibility |
|---|---|
| `Application.js` | `createApp()` — the generic Express app described above |
| `Model.js` | Base class: `find`, `findOne`, `findById`, `count`, `create`, `update`, `delete`, `paginate`, `raw` |
| `Controller.js` | `respond()` / `fail()` — lets one action serve both HTML and JSON. **Not** a base class to extend |
| `session.js` | Session middleware factory; returns MemoryStore under `NODE_ENV=test` so the runner can exit |
| `context.js` | `AsyncLocalStorage` — per-request correlation ID reachable from any depth without threading `req` |
| `lifecycle.js` | Graceful shutdown: fail readiness → drain → close pool → exit |
| `health.js` | `/health` (liveness) and `/ready` (readiness) routers |
| `postman.js` | Introspects the live Express router to emit a Postman v2.1 collection |
| `clean.js` | Strips the bundled example back to a runnable skeleton |

### `core/db/` — database adapters

```
index.js      picks an adapter from DB_DRIVER and re-exports one unified contract
mysql.js      mysql2/promise pool; search via LIKE ... ESCAPE
postgres.js   pg pool;              search via ILIKE
mongodb.js    official driver;      search via $regex, escaped
```

Every adapter implements the same functions, so `Model` never knows which database is behind it.
**Adding a fourth database means writing one file here and nothing else.**

### `core/views/` — the pluggable view layer

```
index.js       reads VIEW_ENGINE and configures Express accordingly
tsxEngine.js   an esbuild require-hook + React renderToStaticMarkup — no build step
```

`VIEW_ENGINE=ejs` renders `app/views/*.ejs`; `VIEW_ENGINE=tsx` renders `app/views-tsx/*.tsx`.
Controllers are byte-identical either way — they call `res.render('users/index', data)` and the
engine resolves it.

### `core/middlewares/` — request-pipeline building blocks

| File | Purpose |
|---|---|
| `requestId.js` | Mints/propagates the correlation ID. Mounted **first**, before anything that logs |
| `cors.js` | No-op unless `CORS_ORIGINS` is set. Refuses to boot on `*` + credentials |
| `rateLimit.js` | Global abuse brake; per-route limiters applied in the route trees |
| `csrf.js` | Hand-rolled session-bound token (`csurf` is deprecated). Web tree only |
| `validate.js` | Runs express-validator, then either flashes errors back to the form or returns JSON |
| `requireAuth.js` | "Are you signed in?" — session check, redirects anonymous visitors |
| `requireJwt.js` | Bearer-token check for the API tree |
| `requireRole.js` | Variadic role guard: `requireRole('admin', 'super_admin')` |
| `sharedLocals.js` | Puts flash, `currentUser` and app name into every view |
| `markApi.js` | Flags a request so `respond()`/`validate()`/`errorHandler` answer in JSON |
| `notFound.js` / `errorHandler.js` | Terminal handlers, mounted last in `bootstrap.js` |

### `core/helpers/` — importable utilities

`jwt` · `hash` (bcrypt) · `mailer` (nodemailer + templates) · `upload` (multer + magic-byte
validation) · `pagination` · `response` · `flashForm` · `logger` (winston + daily rotate) ·
`httpClient` (timeouts, retries, circuit breaker — for calling other services).

---

## `app/` — your application

This is where nearly all of your work happens.

```
app/
├── config/         app-level config modules (mail templates, etc.)
├── models/         data access — ALL SQL lives here
├── services/       business logic that spans models, or calls other services
├── controllers/
│   ├── web/        render views, redirect, use flash
│   └── api/        return JSON
├── middlewares/    app-specific guards
├── validators/     express-validator rule sets
├── routes/
│   ├── web.js      the MVC route tree
│   └── api.js      the REST route tree
├── views/          EJS templates          (VIEW_ENGINE=ejs)
├── views-tsx/      React components       (VIEW_ENGINE=tsx)
└── public/         static assets served at /
```

### The layering rule

```
route  →  middleware  →  controller  →  service  →  model  →  database
```

- **Controllers** do HTTP only: read `req`, call a service or model, call `respond()`. No SQL.
- **Services** hold business logic that coordinates more than one model, or talks to another
  service. Skip this layer when an action is genuinely a single model call.
- **Models** own **all** data access. Every query lives in a model — no exceptions. That is what
  makes swapping `DB_DRIVER` possible.

### The two route trees

Both files are readable top to bottom as the complete list of URLs the app answers. Nothing is
auto-discovered — that is deliberate.

**`routes/web.js`** — stateful. Its middleware runs in this order, and the order is load-bearing:

```
1. session       read/create the session from the cookie
2. flash         one-request-only messages (needs the session)
3. csrfMiddleware   mint a token and expose it to views
4. csrfProtect      reject state-changing requests without that token
5. sharedLocals     flash + currentUser + appName available in all views
```

then, below the public routes:

```
router.use(requireAuth, requireActiveUser);
```

`requireAuth` asks "are you signed in?" from the session; `requireActiveUser` re-reads the
database to ask "are you *still* allowed in?". `requireAuth` runs first so anonymous visitors are
redirected before you spend a query on them.

**`routes/api.js`** — stateless. `markApi` first, then `requireJwt` per route. No session and no
CSRF: a Bearer token is not attached automatically by the browser, so there is nothing ambient for
a cross-site request to ride on. The file ends with a **terminal JSON 404** — without it, an
unmatched `/api/*` request would fall through to the web tree and get a 302 to an HTML login page.

### `views/` and `views-tsx/`

A project uses **one** of these. Both contain the same pages:

```
layouts/     main + auth wrappers
auth/        login
users/       index, form, show
errors/      403, 404, 500
```

Delete the tree you are not using with `node bin/forge.js clean --yes --ejs` (or `--tsx`).

---

## `database/`

```
migrate.js              the runner — applies pending .sql files in order, tracks what ran
migrations/*.sql        numbered, forward-only schema changes
seeds/seed.js           inserts the demo admin account
```

`npm run migrate` then `npm run seed`.

---

## `tests/`

```
unit/           pure logic — helpers, model methods, SOA primitives
integration/    the real app via supertest: web tree, api tree, view engines,
                postman generator, SOA behaviour
e2e/            Playwright specs driving a real browser
helpers/        testApp.js (builds the app), db.js, factories.js, env.js
```

Run with `npm test`. Two details worth knowing:

- **`--test-concurrency=1`** — parallel test files shared one database, and one file's `TRUNCATE`
  wiped another's fixtures.
- **`testApp.js` keeps a STATEFUL exclusion list** — modules that must *not* be cache-busted
  between tests (`core/db`, `core/context`, `core/lifecycle`, the logger, the httpClient).
  Reloading them leaked connection pools and hung the runner.

E2E specs are generated on demand: `node bin/forge.js make:e2e Users`.

---

## `templates/` and `bin/`

`bin/forge.js` is the code generator. `templates/*.tpl` are the files it stamps out.

```bash
node bin/forge.js make:model User
node bin/forge.js make:controller User --api
node bin/forge.js make:views User
node bin/forge.js make:middleware requireOwner
node bin/forge.js make:migration create_orders_table
node bin/forge.js make:scaffold Product     # model + both controllers + views + migration
node bin/forge.js make:e2e Users
node bin/forge.js make:postman
node bin/forge.js clean --yes [--ejs|--tsx]
```

`clean` works from an **explicit allowlist**, not a glob, so nothing unexpected is deleted. It
never touches `core/`, `templates/`, `bin/`, `practice/`, `package.json`, or your `.env`.

---

## `practice/`

A standalone JavaScript course — 12 runnable chapters plus 39 self-checking exercises. It has no
dependency on the framework and the framework has no dependency on it. Delete the folder if you
do not want it shipped. See [practice/README.md](./practice/README.md).

---

## `storage/`

Runtime output, gitignored: rotating logs under `storage/logs/`, uploads under the path in
`UPLOAD_DIR`. Nothing here is source.

---

## Configuration

All behaviour is driven by `.env` — copy `.env.example` and edit. The three switches that change
the shape of the application:

```ini
APP_MODE=hybrid     # mvc | api | hybrid
DB_DRIVER=mysql     # mysql | postgres | mongodb
VIEW_ENGINE=ejs     # ejs | tsx
```

Every combination works without changing a controller.

---

## Request lifecycle, end to end

A `POST /users` from a browser:

```
1.  requestId          mint a correlation ID, put it on the async context
2.  helmet             security headers
3.  health check?      no — continue
4.  rateLimit          global brake
5.  morgan             access log line, carrying the correlation ID
6.  body parsers       urlencoded + json + cookies
7.  methodOverride     read a hidden _method field, if present
8.  static             not a file — continue
9.  /api match?        no — fall through to the web tree
10. session → flash → csrfMiddleware → csrfProtect → sharedLocals
11. requireAuth → requireActiveUser
12. createUserRules → validate
13. UserController.store        HTTP only
14.   → User.create(...)        all SQL lives in the model
15. respond()          redirect (HTML) or JSON, depending on the caller
16. errorHandler       only if something threw
```

The same route called as `POST /api/users` with a Bearer token skips steps 10–11 entirely and
takes `markApi` → `requireJwt` instead, and `respond()` returns JSON at step 15.

---

## Where do I put…?

| I want to… | Put it in |
|---|---|
| add a table | `database/migrations/` + `app/models/` |
| add a page | `app/routes/web.js` + `app/controllers/web/` + `app/views/` |
| add an API endpoint | `app/routes/api.js` + `app/controllers/api/` |
| write a query | `app/models/` — always, never in a controller |
| coordinate two models | `app/services/` |
| guard a route | `app/middlewares/` (app-specific) or `core/middlewares/` (reusable) |
| validate input | `app/validators/` |
| add a reusable utility | `core/helpers/` |
| support another database | one new file in `core/db/` |
| call another service | `core/helpers/httpClient.js` |
