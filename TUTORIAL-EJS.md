# Forge MVC — CRUD walkthrough (EJS)

Build a complete Users module — list, create, edit, delete, login, logout — using **EJS
templates**. Every layer is covered: migration → model → validator → controller → view → route,
plus middleware and session management.

> Using React components instead? Read **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)** — same feature,
> same controllers, different view syntax. For framework reference (databases, helpers,
> deployment, testing) see **[TUTORIAL.md](./TUTORIAL.md)**.

Set this in `.env` before you start:

```ini
VIEW_ENGINE=ejs
```

Everything below is already built in this repo — read it alongside the real files, or delete the
example with `node bin/forge.js clean --yes --ejs` and rebuild it yourself as practice.

---

## Contents

1. [What we're building](#1-what-were-building)
2. [The migration](#2-the-migration)
3. [The model](#3-the-model)
4. [The validator](#4-the-validator)
5. [The controller](#5-the-controller)
6. [The views](#6-the-views)
7. [The routes](#7-the-routes)
8. [Session management](#8-session-management)
9. [Middleware](#9-middleware)
10. [Request lifecycle, end to end](#10-request-lifecycle-end-to-end)
11. [Starting a new project](#11-starting-a-new-project)

---

## 1. What we're building

One table, four columns:

| column | type | notes |
|---|---|---|
| `id` | INT, auto-increment | primary key |
| `username` | VARCHAR(50), UNIQUE | the login identifier |
| `password` | VARCHAR(255) | a **bcrypt hash**, never plaintext |
| `status` | ENUM(`active`,`inactive`) | inactive users can't sign in |

It does double duty: it's the login table *and* the resource the CRUD screens manage — which is
how most real admin panels actually start.

Files involved:

```
database/migrations/001_create_users_table.sql   the schema
app/models/User.js                               all SQL
app/validators/userValidators.js                 input rules
app/controllers/web/UserController.js            CRUD actions
app/controllers/web/AuthController.js            login / logout
app/views/users/{index,form,show}.ejs            the screens
app/views/auth/login.ejs                         the login form
app/middlewares/requireActiveUser.js             re-checks the session
app/middlewares/preventSelfAction.js             blocks self-delete
app/routes/web.js                                wires it together
```

---

## 2. The migration

`database/migrations/001_create_users_table.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```bash
npm run migrate
npm run seed      # admin / Admin@12345
```

Two things worth noting:

- `VARCHAR(255)` on `password` — a bcrypt hash is 60 characters, but leave headroom in case you
  change algorithm later.
- `UNIQUE` on `username` — the database is the last line of defence. We *also* check in the
  controller, but only so the user sees a friendly field error rather than a 500.

Generate more migrations with `node bin/forge.js make:migration create_things_table`.

---

## 3. The model

**All SQL lives here.** Controllers never write a query. That's what lets the same model serve
the web controller, the API controller and the test suite without duplication.

`app/models/User.js`:

```js
const Model = require('../../core/Model');
const { hashPassword } = require('../../core/helpers/hash');

class User extends Model {
  static table = 'users';

  static async findByUsername(username) {
    return this.findOne({ username });
  }

  // Hashing belongs here, not in the controller: one path in means no future controller can
  // accidentally store plaintext.
  static async createWithPassword({ username, password, status = 'active' }) {
    return this.create({ username, password: await hashPassword(password), status });
  }

  // A blank password on update means "leave it alone" — what an admin editing someone else's
  // account almost always intends.
  static async updateProfile(id, { username, status, password }) {
    const changes = { username, status };
    if (password) changes.password = await hashPassword(password);
    return this.update(id, changes);
  }

  // Ignores the row being edited, so saving without changing the username doesn't trip
  // "already taken".
  static async usernameTaken(username, exceptId = null) {
    const existing = await this.findByUsername(username);
    if (!existing) return false;
    return exceptId == null || String(existing.id) !== String(exceptId);
  }

  static async countActive() {
    return this.count({ status: 'active' });
  }

  // Call this at every boundary that leaves the model layer.
  static publicFields(user) {
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
  }
}

module.exports = User;
```

Plus two lines that power the search box:

```js
  // Which columns the list screen's search box looks at. Declared on the model rather than in
  // the controller so the web and API lists can't drift apart. Never put `password` in here.
  static searchable = ['username'];

  // Turns a raw query string into the { fields, term } shape Model.paginate expects, or null
  // when there's nothing to search for. Trimming matters: a box containing only spaces should
  // behave as an empty search, not match every row containing a space.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed ? { fields: this.searchable, term: trimmed } : null;
  }
```

Extending `core/Model.js` gives you `find`, `findOne`, `findById`, `count`, `create`, `update`,
`delete`, `paginate` and `raw` for free — see [TUTORIAL.md §5](./TUTORIAL.md#5-writing-models).

**`publicFields()` is the important one.** The password hash should never reach a session, an
API response, or a rendered page. Having one function that strips it means you can grep for the
places that forgot to call it.

---

## 4. The validator

`app/validators/userValidators.js` — server-side rules, using
[express-validator](https://express-validator.github.io/):

```js
const { body } = require('express-validator');

const username = () =>
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username may only contain letters, numbers, dots, underscores and hyphens');

const status = () =>
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive');

exports.createUserRules = [
  username(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  status(),
];

// On update the password is optional — blank means "keep the current one" — but if something
// *is* typed it still has to meet the length rule.
exports.updateUserRules = [
  username(),
  body('password').optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  status(),
];
```

Sharing the field builders between create and update is deliberate: it's the only way to stop
the two rule sets drifting apart as the schema changes.

Client-side `required`/`minlength` attributes are a convenience, not a control — anyone can
POST directly. Server-side validation is the one that counts.

---

## 5. The controller

**HTTP only** — parse the request, delegate to the model, choose a response. No SQL, no HTML.

`app/controllers/web/UserController.js`, the list action:

```js
const User = require('../../models/User');
const { respond, fail } = require('../../../core/Controller');
const { getFlashForm } = require('../../../core/helpers/flashForm');
const { parsePagination } = require('../../../core/helpers/pagination');

exports.index = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    // Only pass a filter the user actually chose — an empty string would match nothing.
    const where = {};
    if (req.query.status) where.status = req.query.status;

    // Free-text search across User.searchable, ANDed with the status filter above so the two
    // controls compose ("inactive users whose name contains 'jane'") instead of fighting.
    const q = String(req.query.q || '').trim();
    const search = User.searchFor(q);

    const result = await User.paginate({ where, search, page, pageSize, orderBy: 'id DESC' });
    result.rows = result.rows.map(User.publicFields);

    respond(req, res, {
      view: 'users/index',
      // The view echoes these back into the search box, the filter dropdown and every
      // pagination link — otherwise clicking "page 2" silently drops the user's query.
      data: { title: 'Users', filterStatus: req.query.status || '', q, ...result },
    });
  } catch (err) {
    next(err);
  }
};
```

`Model.paginate()` runs the count with the *same* `where` + `search` as the rows query. Get that
wrong and the pager lies — "1 of 4 pages" while pages 2–4 come back empty.

Three habits worth copying:

**Always `try/catch` into `next(err)`.** That routes the error to the central handler instead of
hanging the request.

**`respond()` instead of `res.render()`.** It renders HTML normally but returns JSON when the
caller asks — so `/users` and `/users?format=json` both work from one action. See
[TUTORIAL.md §7](./TUTORIAL.md#7-writing-controllers).

**Re-render forms from flashed data.** The create action:

```js
exports.create = (req, res) => {
  const { formErrors, formData } = getFlashForm(req);
  res.render('users/form', { title: 'New user', record: formData, formErrors });
};
```

When validation fails, `core/middlewares/validate.js` flashes both the errors and the submitted
values, then redirects back. `getFlashForm()` picks them up so the form returns filled in with
the offending field marked — rather than blank, which makes users retype everything.

The store action shows the friendly-uniqueness pattern:

```js
exports.store = async (req, res, next) => {
  try {
    const { username, password, status } = req.body;

    // The UNIQUE index protects the data; this produces a field error instead of a 500.
    if (await User.usernameTaken(username)) {
      req.flash('formErrors', JSON.stringify({ username: 'That username is already taken' }));
      req.flash('formData', JSON.stringify({ username, status }));
      req.flash('error', 'Please fix the highlighted errors and try again.');
      return res.redirect('/users/create');
    }

    const user = await User.createWithPassword({ username, password, status });
    req.flash('success', `User "${username}" created.`);
    respond(req, res, { redirect: '/users', json: { record: User.publicFields(user) }, status: 201 });
  } catch (err) {
    next(err);
  }
};
```

And `update`/`destroy` guard against locking everyone out:

```js
// Deactivating the last active account would make the app permanently unreachable.
if (status === 'inactive' && user.status === 'active' && (await User.countActive()) <= 1) {
  req.flash('error', 'You cannot deactivate the last active account.');
  return res.redirect(`/users/${user.id}/edit`);
}
```

---

## 6. The views

EJS with `express-ejs-layouts`. The default layout is `app/views/layouts/main.ejs`; the login
page opts into a different one with `layout: 'layouts/auth'`.

Available in every view without passing them (from `core/middlewares/sharedLocals.js`):
`messages`, `currentUser`, `csrfToken`, `currentPath`, `appName`.

### The list — `app/views/users/index.ejs`

```html
<div class="d-flex justify-content-between align-items-center mb-3">
  <h4>Users <span class="badge text-bg-secondary"><%= total %></span></h4>
  <a href="/users/create" class="btn btn-primary btn-sm">New user</a>
</div>

<% if (!rows.length) { %>
  <div class="card"><div class="card-body text-center text-muted py-5">
    <p>No users match this filter.</p>
    <a href="/users/create" class="btn btn-primary btn-sm">Create a user</a>
  </div></div>
<% } else { %>
  <table class="table table-hover align-middle">
    <thead class="table-light">
      <tr><th>Username</th><th>Status</th><th>Created</th><th class="text-end">Actions</th></tr>
    </thead>
    <tbody>
      <% rows.forEach(function (record) { %>
        <tr>
          <td>
            <a href="/users/<%= record.id %>"><%= record.username %></a>
            <% if (currentUser && String(currentUser.id) === String(record.id)) { %>
              <span class="badge text-bg-info ms-1">you</span>
            <% } %>
          </td>
          <td>
            <span class="badge <%= record.status === 'active' ? 'text-bg-success' : 'text-bg-secondary' %>">
              <%= record.status %>
            </span>
          </td>
          <td class="small text-muted"><%= record.created_at %></td>
          <td class="text-end">
            <a href="/users/<%= record.id %>/edit" class="btn btn-sm btn-outline-secondary">Edit</a>
          </td>
        </tr>
      <% }); %>
    </tbody>
  </table>
<% } %>
```

`<%= %>` escapes HTML — use it for anything from the database. `<%- %>` does not; save it for
content you have deliberately sanitised.

### The search + filter bar

```html
<!-- GET, not POST: search results should be linkable, shareable and back-button friendly.
     A GET form also needs no CSRF token, since it changes nothing. -->
<form method="GET" action="/users" class="row g-2 mb-3">
  <div class="col-12 col-sm-5 col-md-4">
    <div class="input-group input-group-sm">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input type="search" name="q" class="form-control" placeholder="Search username…"
             value="<%= q %>" aria-label="Search users">
    </div>
  </div>
  <div class="col-6 col-sm-3 col-md-2">
    <select name="status" class="form-select form-select-sm" aria-label="Filter by status">
      <option value="">All statuses</option>
      <option value="active" <%= filterStatus === 'active' ? 'selected' : '' %>>Active</option>
      <option value="inactive" <%= filterStatus === 'inactive' ? 'selected' : '' %>>Inactive</option>
    </select>
  </div>
  <div class="col-auto">
    <button type="submit" class="btn btn-sm btn-outline-primary">Search</button>
  </div>
  <% if (hasFilters) { %>
    <div class="col-auto"><a href="/users" class="btn btn-sm btn-outline-secondary">Clear</a></div>
  <% } %>
</form>
```

Four things that make a search box actually usable:

**1. `method="GET"`.** The query ends up in the URL, so results are bookmarkable, shareable, and
the back button works. A POST search breaks all three and needs a CSRF token for no reason.

**2. `value="<%= q %>"`.** The box keeps what was typed, so the user can refine "jan" → "jane"
instead of starting over.

**3. Both controls in one form.** Search and filter submit together, so they compose rather than
clobbering each other.

**4. Pagination must carry the query.** This is the classic bug — you search, click "page 2",
and silently get page 2 of *everything*:

```html
<%
  function pageUrl(p) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    params.set('page', p);
    return '/users?' + params.toString();
  }
%>
...
<a class="page-link" href="<%= pageUrl(p) %>"><%= p %></a>
```

### Two different empty states

**Always write an empty state** — a bare table tells the user nothing. But "you have no users"
and "nothing matched your search" are different situations needing different exits:

```html
<% if (hasFilters) { %>
  <!-- Offering "create a user" here would be wrong — they have users, just not matching ones. -->
  <p class="mb-3">No users match your search.</p>
  <a href="/users" class="btn btn-outline-secondary btn-sm">Clear search</a>
<% } else { %>
  <p class="mb-3">No users yet.</p>
  <a href="/users/create" class="btn btn-primary btn-sm">Create a user</a>
<% } %>
```

Also worth showing a result summary when a search is active, so the count isn't ambiguous:

```html
<% if (hasFilters) { %>
  <p class="text-muted small">
    <%= total %> result<%= total === 1 ? '' : 's' %>
    <% if (q) { %> for “<strong><%= q %></strong>”<% } %>
  </p>
<% } %>
```

### The form — `app/views/users/form.ejs`

One template serves create *and* edit; `record.id` decides which:

```html
<% const isEdit = Boolean(record.id); %>

<form method="POST" action="<%= isEdit ? '/users/' + record.id : '/users' %>" novalidate>
  <!-- Required on every state-changing form, or csrfProtect rejects the request. -->
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <!-- HTML forms only do GET/POST; core/Application.js reads this and rewrites the verb. -->
  <% if (isEdit) { %><input type="hidden" name="_method" value="PUT"><% } %>

  <div class="mb-3">
    <label class="form-label" for="username">Username *</label>
    <input type="text" id="username" name="username"
           class="form-control <%= formErrors.username ? 'is-invalid' : '' %>"
           value="<%= record.username || '' %>" required minlength="3" maxlength="50">
    <% if (formErrors.username) { %>
      <div class="invalid-feedback d-block"><%= formErrors.username %></div>
    <% } %>
  </div>

  <div class="mb-3">
    <label class="form-label" for="password">Password <%= isEdit ? '' : '*' %></label>
    <input type="password" id="password" name="password"
           class="form-control <%= formErrors.password ? 'is-invalid' : '' %>"
           <%= isEdit ? '' : 'required' %> minlength="8" autocomplete="new-password">
    <div class="form-text">
      <%= isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.' %>
    </div>
  </div>

  <div class="mb-3">
    <label class="form-label" for="status">Status *</label>
    <select id="status" name="status" class="form-select">
      <option value="active" <%= (record.status || 'active') === 'active' ? 'selected' : '' %>>Active</option>
      <option value="inactive" <%= record.status === 'inactive' ? 'selected' : '' %>>Inactive</option>
    </select>
  </div>

  <button type="submit" class="btn btn-primary"><%= isEdit ? 'Save changes' : 'Create user' %></button>
  <a href="/users" class="btn btn-outline-secondary">Cancel</a>
</form>
```

Three details that matter:

1. **`_csrf` on every write form.** Miss it and you get a 403.
2. **`_method` for PUT/DELETE.** Browsers can't send those verbs from a form.
3. **`value="<%= record.username || '' %>"` plus `is-invalid`.** This is what makes a failed
   submission come back usable instead of empty.

### Delete — a form, not a link

```html
<form method="POST" action="/users/<%= record.id %>" class="d-inline"
      onsubmit="return confirm('Delete user &quot;<%= record.username %>&quot;?');">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <input type="hidden" name="_method" value="DELETE">
  <button class="btn btn-sm btn-outline-danger">Delete</button>
</form>
```

Never a `<a href="/users/1/delete">`. Crawlers, prefetchers and antivirus browser extensions
follow links — and would happily delete your data.

---

## 7. The routes

`app/routes/web.js` is the complete, readable list of every URL the app answers:

```js
// Middleware that applies to every web request, in order
router.use(createSessionMiddleware()); // 1. read/create the session from the cookie
router.use(flash());                   // 2. one-request-only messages (needs the session)
router.use(csrfMiddleware);            // 3. mint a token and expose it to views
router.use(csrfProtect);               // 4. reject state-changing requests without that token
router.use(sharedLocals);              // 5. flash + currentUser + appName in every view

router.get('/', (req, res) => res.redirect(req.session.user ? '/users' : '/login'));

// Public
router.get('/login', AuthController.showLogin);
router.post('/login', loginRules, validate, AuthController.login);
router.post('/logout', AuthController.logout);

// Everything below needs a signed-in, still-active account
router.use(requireAuth, requireActiveUser);

router.get('/users', UserController.index);
router.get('/users/create', UserController.create);
router.post('/users', createUserRules, validate, UserController.store);
router.get('/users/:id', UserController.show);
router.get('/users/:id/edit', UserController.edit);
router.put('/users/:id', updateUserRules, validate, UserController.update);
router.delete('/users/:id', preventSelfAction('You cannot delete your own account.'), UserController.destroy);
```

**Route order matters.** `/users/create` must come before `/users/:id`, or Express matches the
parameterised route first and you get a lookup for a user with `id = "create"`.

**The chain reads left to right**: rules → `validate` → controller. If validation fails,
`validate` redirects and the controller never runs.

---

## 8. Session management

`app/controllers/web/AuthController.js` follows four rules.

### 1. Never reveal whether a username exists

```js
const user = await User.findByUsername(username);
const valid = user && (await verifyPassword(password, user.password));
if (!valid) {
  req.flash('error', 'Invalid username or password.');
  req.flash('formData', JSON.stringify({ username }));
  return res.redirect('/login');
}
```

One message for "no such user" and "wrong password". Two different messages turn the login form
into a user-enumeration oracle — an attacker can harvest valid usernames before trying a single
password.

### 2. Regenerate the session id on login

```js
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.user = User.publicFields(user);   // no password hash in the session
  const redirectTo = req.session.postLoginRedirect || '/users';
  delete req.session.postLoginRedirect;
  req.session.save(() => res.redirect(redirectTo));
});
```

`regenerate()` issues a brand-new session id, so a token an attacker planted in the victim's
browser beforehand is now worthless — that's session-fixation defence.

`save()` before redirecting avoids a race where a fast browser issues the next request before
the session store has finished writing.

### 3. Store only small, safe fields

`User.publicFields(user)` strips the password hash. Sessions get serialised into a store —
whatever you put in there ends up on disk or in Redis.

### 4. Destroy on logout

```js
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('forge.sid');
    res.redirect('/login');
  });
};
```

`destroy()` drops the record server-side. Merely clearing `req.session.user` would leave a valid
session id in the store for anyone holding the cookie.

---

## 9. Middleware

Two app-specific guards ship with the example.

### `requireActiveUser` — re-check the database

```js
module.exports = async function requireActiveUser(req, res, next) {
  const sessionUser = req.session.user;
  if (!sessionUser) return next();          // requireAuth handles the anonymous case

  const current = await User.findById(sessionUser.id);

  if (!current || current.status !== 'active') {
    return req.session.destroy(() => res.redirect('/login?reason=deactivated'));
  }

  req.session.user = User.publicFields(current);   // pick up a username change immediately
  res.locals.currentUser = req.session.user;
  next();
};
```

**Why this exists:** a session is a snapshot taken at login. `requireAuth` proves "you logged in
at some point", not "you are still allowed in". Without this re-check, an admin can deactivate
someone who's already signed in and that person keeps browsing until the cookie expires.

It costs one query per request. That's the right trade for an admin panel; on a high-traffic
public app you'd cache it or push a revocation flag into the session store instead.

Note the redirect carries `?reason=deactivated` rather than a flash message — the session (and
therefore the flash store) has just been destroyed, so there's nowhere to put a flash.

### `preventSelfAction` — a configurable guard

```js
module.exports = function preventSelfAction(message = 'You cannot perform this action on your own account.') {
  return (req, res, next) => {
    const actor = (req.session && req.session.user) || req.user;
    if (actor && String(actor.id) === String(req.params.id)) {
      return fail(req, res, { message, status: 403 });
    }
    next();
  };
};
```

A factory returning middleware, so the message can be tailored per route. Used as a route guard
rather than an `if` inside the controller because it applies to several routes and reads better
at the route table — you can see at a glance which endpoints are self-protected.

Note it checks both `req.session.user` (web) and `req.user` (JWT), so the same guard works on
both route trees.

Generate your own with `node bin/forge.js make:middleware auditLog`.

---

## 10. Request lifecycle, end to end

Submitting the "create user" form:

```
POST /users   username=jane.doe  password=Secret@123  status=active  _csrf=…
  │
  ├─ core/Application.js      helmet, body parsing, method-override
  ├─ session middleware       loads the session from the forge.sid cookie
  ├─ flash / csrfMiddleware   restores flash messages, exposes csrfToken
  ├─ csrfProtect              _csrf matches the session? no → 403
  ├─ sharedLocals             messages, currentUser, appName → res.locals
  ├─ requireAuth              signed in? no → redirect /login
  ├─ requireActiveUser        still active in the DB? no → destroy session, /login?reason=…
  ├─ createUserRules          express-validator collects field errors
  ├─ validate                 errors? → flash them + the input, redirect back to the form
  │
  ├─ UserController.store
  │    ├─ User.usernameTaken()      → friendly field error instead of a DB constraint 500
  │    ├─ User.createWithPassword() → bcrypt hash, INSERT
  │    ├─ req.flash('success', …)
  │    └─ respond({ redirect: '/users' })
  │
  └─ 302 → GET /users   which renders users/index.ejs with the success banner
```

Every step is a file you can open. Nothing is auto-wired.

---

## 11. Starting a new project

Strip the example down to a runnable skeleton:

```bash
node bin/forge.js clean --yes --ejs
```

That removes the Users example (model, controllers, views, validators, migration, tests, the
generated Postman collection), resets `routes/web.js`, `routes/api.js` and `seeds/seed.js` to
stubs, and deletes the TSX view tree since you're on EJS. **It never touches `core/`,
`templates/`, `bin/`, `tests/helpers/` or your `.env`** — you keep the entire framework.

Then:

```bash
# 1. point at a fresh database
#    edit DB_NAME in .env, or: DROP DATABASE forge_mvc;

# 2. update APP_NAME and secrets in .env

# 3. generate your first resource
node bin/forge.js make:scaffold Product

# 4. fill in the migration, then
npm run migrate
npm start
```

`make:scaffold` writes the model, both controllers, all three views and a migration stub, then
prints the exact route lines to paste into `app/routes/web.js`.

Run `node bin/forge.js clean` without `--yes` first — it prints exactly what it will delete and
exits without touching anything.

---

## Where to go next

- **[TUTORIAL.md](./TUTORIAL.md)** — framework reference: databases (MySQL/Postgres/Mongo),
  helpers, JWT, email, uploads, testing, Playwright, Postman, deployment, and a "gotchas" section
  covering nine real bugs found while building this.
- **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)** — the same walkthrough with React components.
