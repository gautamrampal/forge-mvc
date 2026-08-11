# Forge MVC — Tutorial

A small, explicit Node.js framework for building either a **server-rendered MVC web app**, a
**JSON REST API**, or **both at once from the same codebase** — on top of **MySQL, PostgreSQL,
or MongoDB** without rewriting your models.

It is deliberately *not* magic. There is no hidden auto-wiring, no dependency-injection
container, no convention that only works if you name a file exactly right. Everything is plain
Express, plain `require()`, plain exported functions. The framework is the ~15 small files under
`core/` that save you from rewriting the same session/CSRF/validation/JWT/upload plumbing on
every project.

---

## 📖 Which document do I want?

| Document | Read it for |
|---|---|
| **[TUTORIAL-JS.md](./TUTORIAL-JS.md)** | **New to Node?** JavaScript + Node essentials, written for PHP developers — start here |
| **This file** | Framework reference — databases, helpers, JWT, email, uploads, testing, deployment |
| **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** | Complete CRUD walkthrough using **EJS templates** |
| **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)** | The same walkthrough using **React components (TSX)** |
| **[TUTORIAL-SOA.md](./TUTORIAL-SOA.md)** | Running as a **service** — graceful shutdown, health probes, correlation IDs, calling other services, Docker/Kubernetes |

**A project uses one view engine, not both.** Pick `VIEW_ENGINE=ejs` or `VIEW_ENGINE=tsx` in
`.env` and follow the matching walkthrough — you'll never need to read the other one. This repo
ships both view trees so you can compare them before choosing; `node bin/forge.js clean --yes
--ejs` (or `--tsx`) deletes the one you don't want.

Everything *below* the view layer — models, controllers, routes, middleware, sessions,
validation — is identical either way.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [How the pieces fit](#2-how-the-pieces-fit)
3. [Directory layout](#3-directory-layout)
4. [The CLI generator](#4-the-cli-generator)
5. [Writing models](#5-writing-models)
6. [Switching database](#6-switching-database)
7. [Writing controllers](#7-writing-controllers)
8. [Routes: the web tree vs the API tree](#8-routes-the-web-tree-vs-the-api-tree)
9. [Views and layouts (EJS or TSX)](#9-views-and-layouts-ejs-or-tsx)
10. [Middleware](#10-middleware)
11. [Validation](#11-validation)
12. [Authentication: sessions and JWT](#12-authentication-sessions-and-jwt)
13. [Helpers](#13-helpers)
14. [Email](#14-email)
15. [File uploads](#15-file-uploads)
16. [Building a feature end to end](#16-building-a-feature-end-to-end)
17. [Testing](#17-testing)
18. [Playwright browser tests](#18-playwright-browser-tests)
19. [Postman collections](#19-postman-collections)
20. [Starting a new project (`clean`)](#20-starting-a-new-project-clean)
21. [Deployment](#21-deployment)
22. [Gotchas worth knowing](#22-gotchas-worth-knowing)

---

## 1. Quick start

```bash
cd D:/projects/forge-mvc
npm install
cp .env.example .env        # then edit DB credentials
npm run migrate             # creates the database + tables
npm run seed                # demo accounts
npm start
```

Open <http://localhost:5000> — sign in with `admin` / `Admin@12345`. You get a working user
management module: list with filtering and pagination, create, edit, delete, login, logout.

The same running server also answers the REST API:

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```

That returns a JWT. Use it on protected endpoints:

```bash
curl -s http://localhost:5000/api/users \
  -H "Authorization: Bearer <token>"
```

Then follow **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** or **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)**
to see how that module is built, layer by layer.

---

## 2. How the pieces fit

A request flows through the app like this:

```
                       ┌──────────────────────────────┐
   HTTP request ─────► │  core/Application.js         │  helmet, body parsing,
                       │  (shared setup)              │  method-override, static
                       └──────────────┬───────────────┘
                                      │
                    ┌─────────────────┴──────────────────┐
                    ▼                                    ▼
        ┌───────────────────────┐            ┌────────────────────────┐
        │  app/routes/api.js    │            │  app/routes/web.js     │
        │  markApi              │            │  session, flash, CSRF  │
        │  requireJwt           │            │  requireAuth           │
        └───────────┬───────────┘            └───────────┬────────────┘
                    ▼                                    ▼
        controllers/api/*.js                 controllers/web/*.js
                    │                                    │
                    └────────────────┬───────────────────┘
                                     ▼
                            app/models/*.js
                                     │
                            core/Model.js
                                     │
                            core/db/index.js   ◄── reads DB_DRIVER
                        ┌────────────┼────────────┐
                        ▼            ▼            ▼
                     mysql.js   postgres.js   mongodb.js
```

**The layering rule** (inherited from the production app this was extracted from, and worth
keeping):

- **Controllers** handle HTTP only — read `req`, validate, delegate, respond. No SQL.
- **Services** (`app/services/`) hold business logic that spans multiple models or needs a
  transaction. Optional; skip it for simple CRUD.
- **Models** hold *all* data access. A model never knows `req` or `res` exist.

Following that is what makes one controller able to serve both a web page and a JSON API — the
logic underneath isn't tangled up with how the response is rendered.

---

## 3. Directory layout

```
forge-mvc/
├── bin/forge.js              # code generator CLI
├── core/                     # ← the framework. You rarely edit this.
│   ├── Application.js        # express app factory (helmet, parsers, view engine)
│   ├── Controller.js         # respond()/fail() — dual-mode HTML-or-JSON responses
│   ├── Model.js              # base model: find/create/update/delete/paginate
│   ├── session.js            # session middleware factory
│   ├── db/
│   │   ├── index.js          # picks the adapter from DB_DRIVER
│   │   ├── mysql.js
│   │   ├── postgres.js
│   │   └── mongodb.js
│   ├── views/
│   │   ├── index.js          # picks the engine from VIEW_ENGINE
│   │   └── tsxEngine.js      # esbuild require hook + React SSR
│   ├── middlewares/          # requireAuth, requireJwt, requireRole, validate,
│   │                         # csrf, markApi, sharedLocals, errorHandler, notFound
│   └── helpers/              # jwt, hash, mailer, upload, logger, pagination,
│                             # response, flashForm
├── app/                      # ← your application. This is what you write.
│   ├── config/mail.js        # register your email templates here
│   ├── controllers/web/      # controllers that render EJS
│   ├── controllers/api/      # controllers that return JSON
│   ├── models/
│   ├── middlewares/          # your app-specific middleware
│   ├── routes/web.js         # the MVC route tree
│   ├── routes/api.js         # the REST route tree
│   ├── services/
│   ├── validators/
│   ├── views/                # EJS templates      (VIEW_ENGINE=ejs)
│   ├── views-tsx/            # React components   (VIEW_ENGINE=tsx)
│   └── public/
├── database/
│   ├── migrate.js
│   ├── migrations/*.sql
│   └── seeds/seed.js
├── tests/
│   ├── helpers/              # env, db reset, app builder, factories
│   ├── unit/                 # pure logic
│   ├── integration/          # real HTTP via supertest
│   └── e2e/                  # Playwright browser specs
├── storage/{logs,uploads}/
├── templates/                # scaffolding templates used by bin/forge.js
├── bootstrap.js              # builds the app WITHOUT listening (so tests can drive it)
├── server.js                 # entry point — requires bootstrap.js, then listens
├── playwright.config.js
└── .env
```

---

## 4. The CLI generator

```bash
node bin/forge.js make:model Article
node bin/forge.js make:controller Article          # generates both web + api
node bin/forge.js make:controller Article --api    # api only
node bin/forge.js make:views Article
node bin/forge.js make:middleware auditLog
node bin/forge.js make:migration create_articles_table --table=articles
node bin/forge.js make:scaffold Article            # all of the above at once
node bin/forge.js make:e2e Article                 # Playwright browser spec
node bin/forge.js make:postman                     # Postman collection from the live routes
```

`make:scaffold` is the one you'll use most — it generates the model, both controllers, all three
views, and a migration stub, then prints the exact route lines to paste into
`app/routes/web.js` and `app/routes/api.js`.

Pass `--force` to overwrite existing files. Names are flexible: `Article`, `article`,
`blog-post`, and `BlogPost` all normalize correctly.

> Routes are intentionally **not** auto-registered. Auto-discovery of route files is the kind of
> magic that makes a codebase hard to trace six months later — you should be able to open
> `routes/web.js` and see every URL your app answers.

---

## 5. Writing models

A model is a class extending `core/Model.js` with a `table`:

```js
// app/models/Article.js
const Model = require('../../core/Model');

class Article extends Model {
  static table = 'articles';   // SQL table name OR Mongo collection name — same property

  static async published() {
    return this.find({ status: 'published' }, { orderBy: 'id DESC' });
  }
}

module.exports = Article;
```

You get these for free:

| Method | Description |
|---|---|
| `Model.find(where, {limit, offset, orderBy})` | array of rows |
| `Model.findOne(where)` | one row or `null` |
| `Model.findById(id)` | one row or `null` |
| `Model.count(where)` | number |
| `Model.create(data)` | the created row |
| `Model.update(id, data)` | the updated row |
| `Model.delete(id)` | boolean |
| `Model.paginate({where, search, page, pageSize, orderBy})` | `{rows, total, page, pageSize, totalPages}` |
| `Model.raw(sql, params)` | raw SQL (SQL drivers only) |

`where` is a plain object of equality matches: `{ status: 'published', user_id: 3 }`.

### Going beyond simple lookups

For joins, aggregation, or full-text search, drop to the driver — still inside the model, so
your controllers stay SQL-free:

```js
class Article extends Model {
  static table = 'articles';

  static async withAuthors() {
    return this.raw(`
      SELECT a.*, u.name AS author_name
      FROM articles a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
    `);
  }
}
```

For MongoDB, use an aggregation pipeline instead:

```js
static async withAuthors() {
  const db = await this.db.connect();
  return db.collection(this.table).aggregate([
    { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'author' } },
    { $unwind: '$author' },
  ]).toArray();
}
```

### Free-text search

`paginate()`, `find()` and `count()` all accept a `search` option alongside `where`:

```js
await User.paginate({
  where:  { status: 'active' },                       // exact match
  search: { fields: ['username'], term: 'jane' },     // contains-match, case-insensitive
  page: 1, pageSize: 25, orderBy: 'id DESC',
});
```

The two combine with **AND**, so a search narrows the current filter rather than replacing it —
"active users whose name contains jane". That's what people expect from a filter dropdown and a
search box sitting next to each other.

Each adapter implements it natively, so you write the same call on any database:

| Driver | Generated |
|---|---|
| MySQL | `username LIKE '%jane%' ESCAPE '\'` |
| PostgreSQL | `username ILIKE '%jane%'` (case-insensitive by default) |
| MongoDB | `{ $or: [{ username: /jane/i }] }` |

**The term is escaped before it reaches the query.** Without that, a user typing `%` in a LIKE
search matches every row, `_` acts as a single-character wildcard, and a stray `(` in a Mongo
regex throws instead of finding nothing. The adapters handle it; you don't have to think about
it.

Declare the searchable columns on the model rather than in each controller, so the web list and
the API list can't drift apart:

```js
class User extends Model {
  static table = 'users';
  static searchable = ['username'];      // never include a password/secret column

  // Returns null for an empty or whitespace-only term, so paginate() falls back to an
  // unfiltered list instead of searching for "" and matching everything.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed ? { fields: this.searchable, term: trimmed } : null;
  }
}
```

Then a controller is one line:

```js
const result = await User.paginate({
  where,
  search: User.searchFor(req.query.q),
  page, pageSize, orderBy: 'id DESC',
});
```

> **The count must use the same search as the rows**, or the pager lies — you get "1 of 4 pages"
> while pages 2–4 come back empty. `paginate()` does this for you; if you hand-roll a listing,
> don't forget it.

For large tables, a `LIKE '%term%'` cannot use a normal index. That's fine to a few hundred
thousand rows; past that, switch to a MySQL/Postgres full-text index or a Mongo text index and
override the method on your model.


---

## 6. Switching database

Change one line in `.env`:

```ini
DB_DRIVER=mysql      # or: postgres | mongodb
```

Everything using the base-model methods (`find`, `create`, `paginate`, …) keeps working
untouched. What *doesn't* carry over automatically:

| Concern | What you need to do |
|---|---|
| **Raw SQL** (`Model.raw`, `this.db.query`) | Rewrite per dialect, or avoid it in code you want portable. Throws a clear error under MongoDB. |
| **Migrations** | `database/migrations/*.sql` is MySQL DDL. For Postgres, put equivalent files in `database/migrations/postgres/`. MongoDB needs no migrations — collections are created on first insert. |
| **Session store** | MySQL ships with a persistent store. For Postgres/Mongo, install `connect-pg-simple` or `connect-mongo` and swap the store in `core/session.js` — otherwise you get an in-memory store that logs a warning and loses sessions on restart. |
| **`id` type** | Mongo IDs are 24-char hex strings, not integers. The adapter normalizes `_id` ⇄ `id` for you, but don't write `parseInt(id)` anywhere. |

Postgres DDL differs from MySQL in three predictable ways:

```sql
-- MySQL
id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PostgreSQL
id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Adding another database

Create `core/db/yourdb.js` exporting the same eight functions (`connect`, `query`, `findWhere`,
`findOne`, `count`, `insert`, `update`, `remove`), then register it in `core/db/index.js`. That's
the whole integration surface — nothing else in the framework touches the database directly.

---

## 7. Writing controllers

Controllers are plain functions. No base class to extend.

### Web controller (renders EJS)

```js
const Article = require('../../models/Article');
const { respond, fail } = require('../../../core/Controller');
const { parsePagination } = require('../../../core/helpers/pagination');

exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await Article.paginate({ page, pageSize, orderBy: 'id DESC' });
    respond(req, res, { view: 'articles/index', data: { title: 'Articles', ...result } });
  } catch (err) {
    next(err);
  }
};
```

Always `try/catch` and pass errors to `next(err)` — that's what routes them to the central
error handler instead of hanging the request.

### The dual-mode trick

`respond()` is what lets one controller serve both worlds:

```js
respond(req, res, {
  view: 'articles/index',      // rendered when the caller wants HTML
  data: { title, ...result },  // view locals AND the default JSON body
  json: { articles: result },  // optional: different payload for JSON callers
  redirect: '/articles',       // HTML-only: where to go after a successful write
  status: 201,
});
```

It returns JSON when the request is under `/api`, is an XHR/fetch call, sends
`Accept: application/json`, or has `?format=json` — otherwise it renders the view. So this works
against the very same route:

```bash
curl http://localhost:5000/users                # → HTML page
curl http://localhost:5000/users?format=json    # → JSON
```

Use `respond()` when an action genuinely serves both. When an endpoint is API-only, a plain
`ok()/fail()` from `core/helpers/response` is clearer — that's what `controllers/api/*` uses.

---

## 8. Routes: the web tree vs the API tree

Two route files, two different middleware stacks:

| | `app/routes/web.js` | `app/routes/api.js` |
|---|---|---|
| Auth | session cookie (`requireAuth`) | JWT bearer (`requireJwt`) |
| CSRF | **yes** | no — not needed, see below |
| Sessions/flash | yes | no (stateless) |
| Responses | rendered EJS | JSON |
| Mounted at | `/` | `/api` |

The API tree needs no CSRF because a Bearer token isn't a browser-ambient credential — the
browser never attaches it automatically, so there's nothing for a cross-site request to ride on.
Session cookies *are* ambient, which is exactly why the web tree does need it.

```js
// app/routes/web.js
router.get('/articles', requireAuth, ArticleController.list);
router.post('/articles', requireAuth, articleRules, validate, ArticleController.create);
router.put('/articles/:id', requireAuth, articleRules, validate, ArticleController.update);
router.delete('/articles/:id', requireAuth, ArticleController.destroy);
```

HTML forms can't send PUT/DELETE, so use the hidden-field override the generated views already
include:

```html
<form method="POST" action="/articles/42">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="hidden" name="_method" value="PUT">
</form>
```

### APP_MODE

```ini
APP_MODE=hybrid   # both trees (default)
APP_MODE=mvc      # web only — /api returns 404
APP_MODE=api      # JSON only — no view engine loaded at all
```

Use `api` for a pure backend serving a React/Vue/mobile frontend; `mvc` for a classic
server-rendered app; `hybrid` when you want a web admin panel *and* an API from one deployment.

---

## 9. Views and layouts (EJS or TSX)

Pick your template language in `.env`:

```ini
VIEW_ENGINE=ejs   # app/views/*.ejs      — classic templates (default)
VIEW_ENGINE=tsx   # app/views-tsx/*.tsx  — React components, server-rendered
```

**Controllers don't change.** Both engines are driven through Express's standard
`res.render(view, data)`, so `res.render('posts/index', {...})` resolves to `views/posts/index.ejs`
or `views-tsx/posts/index.tsx` depending on the setting. Nothing in `controllers/`, `routes/`,
`models/`, or `core/` outside `core/views/` knows which is active.

| | EJS | TSX |
|---|---|---|
| Files | `app/views/**.ejs` | `app/views-tsx/**.tsx` |
| Layouts | `express-ejs-layouts`, chosen via the `layout` local | a component you wrap with — no framework support needed |
| Type safety | none — a typo fails at render time | props checked by TypeScript (`npm run type-check`) |
| Build step | none | none — esbuild transpiles at runtime |
| Best for | small projects, familiar territory, minimal deps | larger view layers, teams already writing React |

Both trees ship complete in this repo, rendering identical pages, so you can compare them
side by side and delete whichever you don't want.

### Locals available in every view

Provided automatically by `core/middlewares/sharedLocals.js` and the CSRF middleware:

- `messages` — `{success: [], error: [], info: []}` flash messages
- `currentUser` — set by `requireAuth`
- `csrfToken` — put this in every form
- `currentPath` — handy for marking the active nav item
- `appName`

### EJS

```js
res.render('auth/login', { title: 'Sign in', layout: 'layouts/auth' });
res.render('errors/404', { title: 'Not Found', layout: false });  // no layout
```

### TSX

A view is a `.tsx` file whose **default export is a React component**. The locals arrive as
props, and the layout is just a component you wrap your content in:

```tsx
// app/views-tsx/posts/index.tsx
import Main from '../layouts/Main';
import type { BaseViewProps, Paginated, Post } from '../types';

type Props = BaseViewProps & Paginated<Post>;

export default function PostsIndex({ rows, page, totalPages, ...layout }: Props) {
  return (
    <Main {...layout} title={layout.title}>
      <h4>Posts</h4>
      {rows.map((p) => (
        <a key={p.id} href={`/posts/${p.id}`}>{p.title}</a>
      ))}
      <p>Page {page} of {totalPages}</p>
    </Main>
  );
}
```

Shared prop types live in `app/views-tsx/types.ts`. Defining them is the main payoff over EJS:
the shape a controller passes to `res.render()` gets checked at build time instead of blowing up
mid-template with "cannot read property of undefined".

```bash
npm run type-check     # tsc --noEmit over app/views-tsx/
```

**How it works.** `core/views/tsxEngine.js` installs a `require` hook that transpiles `.tsx`
with esbuild on demand, then renders the component with `renderToStaticMarkup`. No build step,
no `dist/` directory to keep in sync — edit a `.tsx`, reload the page, see the change (in
development the module cache is busted per render; in production views compile once).

**Three things to know when writing TSX views:**

1. **It's static markup, not hydrated React.** `renderToStaticMarkup` emits plain HTML with no
   client-side React bundle. Think "JSX as a template language" — `useState` and `onClick` will
   not do anything. This keeps pages fast and the mental model identical to EJS. If you want
   interactive islands, add a client bundle and `hydrateRoot` — that's a deliberate extra step,
   not something the framework does behind your back.

2. **No inline event handlers.** Since there's no client React, `onSubmit={() => ...}` is
   dropped silently. For confirm-before-delete, the shipped layout wires a delegated listener to
   a `data-confirm` attribute:

   ```tsx
   <form method="POST" action={`/posts/${record.id}`} data-confirm="Delete this post?">
   ```

3. **Form values use `defaultValue`, not `value`.** A `value` prop without an `onChange` makes
   React treat the input as controlled and read-only. Use `defaultValue` / `defaultChecked` for
   server-rendered forms.

### Generating views

`make:views` and `make:scaffold` follow `VIEW_ENGINE`, or you can force a flavour:

```bash
node bin/forge.js make:views Widget           # follows VIEW_ENGINE
node bin/forge.js make:views Widget --tsx     # force TSX
node bin/forge.js make:views Widget --ejs     # force EJS
```

### Adding a third engine (Pug, Handlebars, …)

Register it in `core/views/index.js` — that's the whole integration surface:

```js
} else if (engine === 'pug') {
  app.set('view engine', 'pug');
  app.set('views', path.join(appDir, 'views-pug'));
}
```

Anything Express supports as a view engine drops in, since controllers only ever call
`res.render()`.

---

## 10. Middleware

Ship-with middleware in `core/middlewares/`:

| Middleware | Purpose |
|---|---|
| `requireAuth` | session guard; redirects to `/login`, remembers intended URL |
| `requireJwt` | Bearer-token guard; sets `req.user` |
| `requireRole('admin', 'editor')` | role guard; works with either auth style |
| `validate` | express-validator result handler (see below) |
| `csrf` | `csrfMiddleware`, `csrfProtect`, `markMulterProcessed` |
| `markApi` | flags a request as API (JSON responses, CSRF skipped) |
| `sharedLocals` | flash + view globals |
| `errorHandler` / `notFound` | central error pages / 404 |

Write your own with the generator:

```bash
node bin/forge.js make:middleware requireVerifiedEmail
```

```js
// app/middlewares/requireVerifiedEmail.js
module.exports = function requireVerifiedEmail(req, res, next) {
  const user = (req.session && req.session.user) || req.user;
  if (!user || !user.email_verified_at) {
    if (req.isApi) return res.status(403).json({ success: false, message: 'Verify your email first.' });
    req.flash('error', 'Please verify your email address first.');
    return res.redirect('/verify-email');
  }
  next();
};
```

Apply it per-route, per-group, or per-tree:

```js
router.get('/articles', requireAuth, requireVerifiedEmail, ArticleController.list);  // one route
router.use('/admin', requireAuth, requireRole('admin'));                             // whole prefix
```

---

## 11. Validation

Rules live in `app/validators/`, using
[express-validator](https://express-validator.github.io/):

```js
// app/validators/articleValidators.js
const { body } = require('express-validator');

exports.articleRules = [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('body').trim().isLength({ min: 10 }).withMessage('Body must be at least 10 characters'),
  body('status').isIn(['draft', 'published']).withMessage('Invalid status'),
];
```

Chain `rules → validate → controller`:

```js
router.post('/articles', requireAuth, articleRules, validate, ArticleController.create);
```

`validate` is dual-mode, which is the nice part — **the same rules** serve both trees:

- **API** → `422` with a JSON error map:
  ```json
  { "success": false, "message": "Validation failed.",
    "errors": { "title": "Title must be 3-200 characters" } }
  ```
- **Web** → flashes the errors *and the submitted values*, then redirects back to the form.

To show them, read the flash in your `showCreate`/`showEdit` action:

```js
const { getFlashForm } = require('../../../core/helpers/flashForm');

exports.showCreate = (req, res) => {
  const { formErrors, formData } = getFlashForm(req);
  res.render('articles/form', { title: 'New Article', record: formData, formErrors, formData });
};
```

…and mark the fields in the view:

```html
<input name="title" class="form-control <%= formErrors.title ? 'is-invalid' : '' %>"
       value="<%= record.title || '' %>">
<% if (formErrors.title) { %>
  <div class="invalid-feedback d-block"><%= formErrors.title %></div>
<% } %>
```

Without this, a failed submission silently wipes everything the user typed and tells them
nothing about which field was wrong. It's worth the five extra lines.

---

## 12. Authentication: sessions and JWT

Both are wired up in the example app; use either or both.

### Sessions (web)

```js
// after verifying the password
req.session.regenerate((err) => {          // regenerate = prevents session fixation
  if (err) return next(err);
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect(req.session.postLoginRedirect || '/posts');
});
```

Passwords go through `core/helpers/hash.js` (bcrypt, cost 12). Never store plaintext, never log
them.

### JWT (API)

```js
const { signToken } = require('../../../core/helpers/jwt');
const token = signToken({ id: user.id, email: user.email, role: user.role });
```

Client sends it back as `Authorization: Bearer <token>`; `requireJwt` verifies and populates
`req.user`.

Keep JWT payloads small and non-sensitive — they're base64, **not encrypted**; anyone holding
the token can read the claims. Put an id and a role in there, never a password hash or PII.

### Roles

```js
router.delete('/articles/:id', requireJwt, requireRole('admin'), ArticleController.destroy);
```

Role guards handle *who may reach the route*. They do **not** handle *which records that person
may touch* — for that you still need an ownership check inside the action:

```js
const article = await Article.findById(req.params.id);
if (article.user_id !== req.user.id && req.user.role !== 'admin') {
  return fail(res, 'You can only edit your own articles.', 403);
}
```

Skipping this is one of the most common real-world access-control bugs: any logged-in user can
edit any record just by changing the ID in the URL.

---

## 13. Helpers

```js
const { signToken, verifyToken }    = require('./core/helpers/jwt');
const { hashPassword, verifyPassword } = require('./core/helpers/hash');
const mailer                        = require('./core/helpers/mailer');
const { createUploader, validateSignature } = require('./core/helpers/upload');
const logger                        = require('./core/helpers/logger');
const { parsePagination }           = require('./core/helpers/pagination');
const { ok, fail }                  = require('./core/helpers/response');
const { getFlashForm }              = require('./core/helpers/flashForm');
```

To add your own, drop a file in `core/helpers/` (framework-wide) or `app/services/`
(app-specific) and `require` it. There's no registration step.

---

## 14. Email

Register templates once in `app/config/mail.js`:

```js
const mailer = require('../../core/helpers/mailer');

mailer.registerTemplate('welcome', (data) => ({
  subject: `Welcome, ${data.name}!`,
  html: `<p>Hi ${data.name},</p><p>Your account is ready.</p>`,
}));
```

Send from anywhere:

```js
mailer.sendAsync('welcome', user.email, { name: user.name });   // fire-and-forget (preferred)
await mailer.send('welcome', user.email, { name: user.name });  // await delivery
```

Prefer `sendAsync` in request handlers. SMTP can be slow or briefly down, and a user shouldn't
see a 500 on signup because a mail server hiccuped — the account was created either way.

**With no `SMTP_HOST` configured**, the mailer falls back to a JSON transport: your code runs
end-to-end and nothing actually leaves the machine. Good for local development; set real SMTP
credentials before launch, and check `storage/logs/` to confirm mail is going out.

---

## 15. File uploads

```js
const { createUploader, validateSignature, relativeStoredPath } = require('../../core/helpers/upload');

const upload = createUploader({ allowedExt: ['jpg', 'png', 'pdf'], maxFiles: 5, maxFileSizeMB: 10 });

router.post('/articles/:id/attachments',
  requireAuth,
  upload.array('files', 5),
  markMulterProcessed,   // ← see gotcha #2
  csrfProtect,
  ArticleController.attach
);
```

In the controller, **always re-check the file signature** before saving the reference:

```js
for (const f of req.files || []) {
  if (!(await validateSignature(f.path, f.originalname))) {
    fs.unlinkSync(f.path);   // extension lied about the real content — drop it
    continue;
  }
  await Attachment.create({
    article_id: req.params.id,
    original_name: f.originalname,
    stored_path: relativeStoredPath(req._uploadSubdir, path.basename(f.path)),
    mime_type: f.mimetype,
    size_bytes: f.size,
  });
}
```

Files are stored as UUID filenames under `storage/uploads/<year>/<month>/`, **outside the web
root**, with the original name kept only in the database. Serve them through an authenticated
controller route that verifies the requester may see the parent record — never with
`express.static`, which would let anyone who guesses a path download anything.

---

## 16. Building a feature end to end

The bundled example is a complete Users module — list, create, edit, delete, login, logout —
built through every layer. Rather than repeat it here, it has its own walkthrough, one per view
engine:

- **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** — using EJS templates
- **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)** — using React components

Both cover migration → model → validator → controller → views → routes → middleware → session
management, and end with a request-lifecycle trace showing every middleware a form submission
passes through.

The short version, for adding any new resource:

```bash
node bin/forge.js make:scaffold Product   # model + both controllers + views + migration
```

Then:

1. Fill in the generated migration under `database/migrations/`, run `npm run migrate`
2. Add query methods to `app/models/Product.js` (all SQL lives there)
3. Write rules in `app/validators/productValidators.js`
4. Fill in the form fields in the generated view
5. Paste the printed route lines into `app/routes/web.js` and `app/routes/api.js`
6. `npm start`

## 17. Testing

```bash
npm test               # everything (unit + integration)
npm run test:unit      # fast — no database needed for the helper tests
npm run test:integration
```

Built on Node's own `node:test` runner (no Jest/Mocha to configure) plus `supertest` for driving
HTTP. The suite that ships covers the framework itself — **68 tests** over helpers, the model
layer, both route trees, both view engines, and the Postman generator.

### How it's wired

`bootstrap.js` exports `buildApp()` which returns the Express app **without** calling
`listen()`. That's the key to fast tests: supertest drives the real app in-process rather than
spawning a server and polling a URL.

```
tests/
├── helpers/
│   ├── env.js         # points everything at a *_test database — require this FIRST
│   ├── db.js          # migrate / reset / close
│   ├── testApp.js     # buildApp + login helpers for both auth styles
│   └── factories.js   # createUser(), createPost()
├── unit/              # pure logic — hashing, JWT, pagination, model CRUD
├── integration/       # real HTTP through the real middleware stack
└── e2e/               # Playwright browser specs (section 18)
```

**Tests never touch your development database.** `tests/helpers/env.js` rewrites `DB_NAME` to
`<your_db>_test` before anything connects, and `resetTestDb()` truncates between tests. Every
test file must `require('../helpers/env')` on line 1 — before any module that reads config.

### Writing a test

```js
require('../helpers/env');            // must come first
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { makeApp, loginApi, request } = require('../helpers/testApp');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');

let app;
test.before(async () => { await migrateTestDb(); app = makeApp(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

test('a member cannot delete another members post', async () => {
  const owner = await createUser();
  const stranger = await createUser();
  const post = await createPost({ user_id: owner.id });

  const token = await loginApi(app, { email: stranger.email, password: DEFAULT_PASSWORD });
  await request(app)
    .delete(`/api/posts/${post.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
});
```

### Testing the web tree (sessions + CSRF)

Web routes reject any POST without a CSRF token matching the session, so you can't post blind.
`loginWeb()` returns a cookie-carrying agent, and `extractCsrf()` pulls the token out of a
rendered form:

```js
const agent = await loginWeb(app, { email: user.email, password: DEFAULT_PASSWORD });
const form = await agent.get('/posts/create');
await agent
  .post('/posts')
  .type('form')
  .set('Referer', '/posts/create')     // needed for the redirect-back-on-error path
  .send({ _csrf: extractCsrf(form.text), title: '...', body: '...' })
  .expect(302);
```

### Two things that will bite you

**Integration tests must run serially.** They share one test database, so a parallel file's
`TRUNCATE` will wipe another's fixtures mid-assertion. The npm scripts already pass
`--test-concurrency=1`; keep it if you add more files.

**Don't reload stateful modules.** `makeApp()` busts the require cache so a new
`APP_MODE`/`VIEW_ENGINE` takes effect, but it deliberately skips `core/db` and
`core/helpers/logger`. Reloading those creates a second connection pool (and winston file
handles) on every call — open sockets that keep the event loop alive, so the runner finishes
every assertion and then hangs forever. If your suite ever stops exiting, that's the first
thing to check.

---

## 18. Playwright browser tests

Supertest proves your HTTP layer works. It cannot prove a button is clickable, a confirm()
dialog fires, or the layout doesn't overflow on a phone. Playwright drives a real browser.

**Playwright is not installed by default** — it downloads ~400MB of browsers, which shouldn't be
forced on someone who only wants the API:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
npm run test:e2e
```

`playwright.config.js` starts the server for you (against a separate `forge_mvc_e2e` database),
waits for it to answer, and seeds a login account via `tests/e2e/global-setup.js`. Failures
capture a screenshot, a video, and a full trace you can replay.

Generate a spec for a resource:

```bash
node bin/forge.js make:e2e Widget      # -> tests/e2e/widgets.spec.js
```

The shipped `tests/e2e/posts.spec.js` covers login, CRUD through real form submissions,
validation errors, the delete confirmation dialog, and a mobile-width layout check:

```js
test('the page is usable at mobile width without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  const overflows = await page.evaluate(
    () => document.body.scrollWidth > document.body.clientWidth
  );
  expect(overflows).toBe(false);
});
```

Useful commands:

```bash
npm run test:e2e                        # headless
npm run test:e2e:ui                     # interactive time-travel debugger
npx playwright test --headed            # watch the browser
npx playwright test posts.spec.js -g "deletes"   # one test
npx playwright show-report              # after a CI run
```

---

## 19. Postman collections

For an API project, hand-maintaining a Postman collection means it's wrong within a week.
This generates one **by introspecting the live Express router**, so it can't drift:

```bash
npm run postman
# or: node bin/forge.js make:postman [--out=api.json] [--name="My API"] [--baseUrl=https://...]
```

Import the resulting `postman_collection.json` into Postman (File → Import).

What you get:

- **Every route**, grouped into folders by resource, with `auth` first.
- **Readable names** — `Login`, `Register`, `List posts`, `Get posts by id`, `Update posts`.
- **Bearer auth at the collection level**, so every request inherits `{{token}}`.
- **Auto token capture**: run `Login` once and its test script writes the JWT into the `{{token}}`
  collection variable. No copy-pasting tokens between requests.
- **Example bodies built from your validators** — `core/postman.js` scrapes `body('field')` out
  of `app/validators/*.js`, so `Create posts` ships with `title`/`body`/`status` rather than an
  empty `{}` that 422s on first use.
- **Variables** for `baseUrl`, `token`, `email`, `password` — point it at staging by editing one
  field.
- **Documented query params on list endpoints** — `?q=`, `?page=`, `?page_size=` appear as
  optional (disabled) params on every `GET /resource`, so they're discoverable without reading
  the source. Single-record `GET /resource/:id` requests don't get them.

Typical use:

1. `npm run postman`
2. Import into Postman
3. Set `baseUrl` if it isn't localhost
4. Run **Login** → token stored automatically
5. Everything else just works

Regenerate whenever routes change. The file is fully derived, so `make:postman` always
overwrites it without asking.

The generator is itself covered by tests (`tests/integration/postman.test.js`) that replay every
generated request against the running app and assert none of them 404 or 500 — a collection that
looks right but doesn't run is worse than no collection.

---

## 20. Starting a new project (`clean`)

This repo ships with a working Users example so you can read real code rather than a skeleton.
When you're ready to build something else, strip it back:

```bash
node bin/forge.js clean            # dry run — prints what it would do, changes nothing
node bin/forge.js clean --yes      # do it, keeping both view trees
node bin/forge.js clean --yes --ejs   # ...and delete the TSX tree
node bin/forge.js clean --yes --tsx   # ...and delete the EJS tree
```

| | |
|---|---|
| **Deleted** | `app/models/User.js`, both User + Auth controllers, `userValidators.js`, `requireActiveUser.js`, `preventSelfAction.js`, the `users/` and `auth/` views, `001_create_users_table.sql`, the example tests, `postman_collection.json` |
| **Reset to stubs** | `app/routes/web.js`, `app/routes/api.js`, `database/seeds/seed.js`, plus a placeholder `home` view |
| **Kept** | everything in `core/`, `templates/`, `bin/`, `tests/helpers/`, the layouts, the error pages, and your `.env` |

You keep the whole framework and all the plumbing — only the demo feature goes. The result boots
immediately: `/` renders a placeholder home page and `/api/health` returns JSON.

After cleaning:

```bash
# 1. Point at a fresh database — edit DB_NAME in .env, or drop the old one:
#    DROP DATABASE forge_mvc;

# 2. Update APP_NAME, SESSION_SECRET and JWT_SECRET in .env
#    (and VIEW_ENGINE if you kept only one view tree)

# 3. Generate your first resource
node bin/forge.js make:scaffold Product

# 4. Fill in database/migrations/<timestamp>_create_products_table.sql
npm run migrate

# 5. Paste the printed route lines into app/routes/web.js and app/routes/api.js
npm start
```

Two things `clean` deliberately does **not** do:

- **It doesn't drop your database.** Deleting data is not something a scaffolding tool should
  do silently — do it yourself, or just point `DB_NAME` somewhere new.
- **It doesn't touch `.env`.** Your credentials survive; update `APP_NAME` and the secrets by
  hand.

If you want a pristine copy rather than an edited one, clone the repo again and run `clean` on
the fresh copy — nothing here depends on git history.

---

## 21. Deployment

**Environment** — set these for real in production:

```ini
NODE_ENV=production
SESSION_SECRET=<long random string>
JWT_SECRET=<different long random string>
```

Session cookies automatically become `secure: true` when `NODE_ENV=production`, so **you must be
serving over HTTPS** or nobody will be able to log in.

**Process manager** (PM2):

```bash
npm install -g pm2
pm2 start server.js --name my-app
pm2 save && pm2 startup
```

**Reverse proxy** (nginx):

```nginx
location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Behind a proxy, add `app.set('trust proxy', 1)` in `server.js` so secure cookies and client IPs
work correctly.

**Before launch:**
- [ ] Real `SESSION_SECRET` / `JWT_SECRET` (not the dev defaults)
- [ ] HTTPS with a valid certificate
- [ ] Real SMTP configured and test-sent
- [ ] Database backups scheduled
- [ ] `storage/` writable by the app user
- [ ] Tighten the CSP in `core/Application.js` (`contentSecurityPolicy` is off by default so CDN
      assets work out of the box — lock it down once you know your asset origins)
- [ ] Persistent session store if you're on Postgres/Mongo (see §6)

---

## 22. Gotchas worth knowing

These are real bugs that cost real debugging time in the app this framework came from. They're
already handled in `core/` — this section is so you understand *why* the code looks the way it
does, and don't undo it.

**1. Never use `res.redirect('back')`.** It reads the `Referer` header, and helmet's default
`Referrer-Policy: no-referrer` strips that header — even on a form posting to its own origin.
With it missing, Express silently falls back to `/`, so a failed form submission dumps the user
on the homepage with no error shown. It looks exactly like "my data didn't save" with no clue
why. `core/Application.js` sets `referrerPolicy: 'same-origin'` to keep the header, and
`validate.js` spells out `req.get('Referer') || req.originalUrl || '/'` as a second defense.

**2. CSRF and multipart forms.** `csrfProtect` runs before multer has parsed a
`multipart/form-data` body, so `req.body._csrf` doesn't exist yet. Upload routes must re-run it
*after* multer, flagged with `markMulterProcessed`:

```js
router.post('/upload',
  upload.array('files', 5),
  markMulterProcessed,
  csrfProtect,          // now req.body._csrf is populated
  Controller.handle
);
```

**3. Route mount order matters.** In `server.js`, `/api` is mounted *before* the web tree. The
web router sits at `/`, so its `router.use()` middleware (session, CSRF) would otherwise run for
`/api/*` requests too — and reject them with a 403 before they ever reached the API router. Keep
the API mount first.

**4. `method-override`'s string form doesn't read the body.** `methodOverride('_method')` only
checks the *query string*, despite what its own docs suggest — so HTML forms with a hidden
`_method` field silently stay POSTs and never reach your PUT/DELETE handler.
`core/Application.js` passes a custom function getter that reads `req.body._method` instead.

**5. MySQL timezones.** Many local installs (WAMP/XAMPP) run `time_zone=SYSTEM`, so `NOW()`
writes *local* time while your app assumes UTC — every timestamp ends up off by your UTC offset.
`core/db/mysql.js` forces `SET time_zone = '+00:00'` on each pooled connection.

**6. Don't name a view local `client`.** EJS treats `opts.client` as a reserved compile flag; a
local with that name silently switches EJS into client-side compile mode and removes the
`include()` helper, producing a baffling `include is not a function` crash. Same applies to
`cache`, `filename`, and `escape`. Name it `clientRecord` or similar.

**7. Don't run a second query on a fresh connection inside an open transaction.** If you have a
transaction open on connection A holding a row lock, and a model method quietly grabs connection
B from the pool to update that same row, B blocks on A's lock while A waits for B to return —
a self-deadlock that hangs until MySQL's 50-second lock timeout. Pass the transaction's
connection explicitly to every call inside it.

**8. A test suite that passes but never exits is holding a handle open.** Node won't exit while
a socket or timer is alive, so the runner prints every ✔ and then sits there. The usual culprits
here were the MySQL session store (its own pool plus a recurring expired-session sweep — hence
`core/session.js` using MemoryStore under `NODE_ENV=test`) and cache-busting `core/db` in
`makeApp()`, which leaked a fresh pool per call. If it happens to you, look for what you
re-required or forgot to close, not for a slow test.

**9. `parseInt(x) || default` silently swallows zero.** It reads as "use the default if this
isn't a number", but `0` is falsy, so `?page_size=0` quietly became 25 while `?page=0` correctly
clamped to 1 — two behaviours for the same class of bad input. `core/helpers/pagination.js` now
distinguishes NaN (use the default) from out-of-range (clamp). Worth remembering anywhere you
parse numeric input.

---

## Quick reference

```bash
npm start                                   # run
npm run dev                                 # run with auto-reload
npm run migrate                             # apply migrations
npm run seed                                # seed demo data
npm test                                    # unit + integration
npm run test:e2e                            # Playwright (install it first — section 18)
npm run postman                             # regenerate the Postman collection
npm run type-check                          # tsc --noEmit over app/views-tsx/
node bin/forge.js make:scaffold Thing       # generate a full resource
node bin/forge.js                           # list all generator commands
```

| Want to… | Edit |
|---|---|
| Add a page | `app/routes/web.js` + `app/controllers/web/` + your views dir |
| Add an API endpoint | `app/routes/api.js` + `app/controllers/api/` |
| Add a table | `database/migrations/` then `npm run migrate` |
| Change DB engine | `DB_DRIVER` in `.env` |
| Change template language | `VIEW_ENGINE` in `.env` (`ejs` \| `tsx`) |
| Add an email | `app/config/mail.js` |
| Add a guard | `app/middlewares/` |
| Change global layout | `app/views/layouts/main.ejs` or `app/views-tsx/layouts/Main.tsx` |
| Add a test | `tests/unit/` or `tests/integration/` |
| Add a browser test | `node bin/forge.js make:e2e <Name>` |
| Share the API | `npm run postman` |
