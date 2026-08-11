# Forge MVC — CRUD walkthrough (TSX)

Build a complete Users module — list, create, edit, delete, login, logout — using **type-safe
React components rendered on the server**. Every layer is covered: migration → model → validator
→ controller → view → route, plus middleware and session management.

> Prefer classic templates? Read **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** — same feature, same
> controllers, different view syntax. For framework reference (databases, helpers, deployment,
> testing) see **[TUTORIAL.md](./TUTORIAL.md)**.

Set this in `.env` before you start:

```ini
VIEW_ENGINE=tsx
```

**The backend is identical to the EJS walkthrough.** Sections 2–5 and 7–10 below are the same
code — controllers call `res.render()` either way and never know which engine is active. If
you've already read the EJS version, skip to [§6 The views](#6-the-views).

---

## Contents

1. [What we're building](#1-what-were-building)
2. [The migration](#2-the-migration)
3. [The model](#3-the-model)
4. [The validator](#4-the-validator)
5. [The controller](#5-the-controller)
6. [The views](#6-the-views) ← **the part that differs**
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

It does double duty: it's the login table *and* the resource the CRUD screens manage.

```
database/migrations/001_create_users_table.sql   the schema
app/models/User.js                               all SQL
app/validators/userValidators.js                 input rules
app/controllers/web/UserController.js            CRUD actions
app/controllers/web/AuthController.js            login / logout
app/views-tsx/users/{index,form,show}.tsx        the screens
app/views-tsx/auth/login.tsx                     the login form
app/views-tsx/types.ts                           shared prop types
app/middlewares/requireActiveUser.js             re-checks the session
app/middlewares/preventSelfAction.js             blocks self-delete
app/routes/web.js                                wires it together
```

---

## 2. The migration

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

`UNIQUE` on `username` is the last line of defence; the controller also checks so the user gets
a friendly field error rather than a 500.

---

## 3. The model

**All SQL lives here.** Identical to the EJS walkthrough — the view engine changes nothing below
the controller.

`app/models/User.js`:

```js
const Model = require('../../core/Model');
const { hashPassword } = require('../../core/helpers/hash');

class User extends Model {
  static table = 'users';

  static async findByUsername(username) {
    return this.findOne({ username });
  }

  // Hashing belongs here: one path in means no controller can accidentally store plaintext.
  static async createWithPassword({ username, password, status = 'active' }) {
    return this.create({ username, password: await hashPassword(password), status });
  }

  // A blank password on update means "leave it alone".
  static async updateProfile(id, { username, status, password }) {
    const changes = { username, status };
    if (password) changes.password = await hashPassword(password);
    return this.update(id, changes);
  }

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
  // Which columns the list screen's search box looks at. Declared on the model so the web and
  // API lists can't drift apart. Never put `password` in here.
  static searchable = ['username'];

  // Returns null for an empty/whitespace-only term, so paginate() falls back to an unfiltered
  // list rather than searching for "" and matching everything.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed ? { fields: this.searchable, term: trimmed } : null;
  }
```

Extending `core/Model.js` gives you `find`, `findOne`, `findById`, `count`, `create`, `update`,
`delete`, `paginate` and `raw` — see [TUTORIAL.md §5](./TUTORIAL.md#5-writing-models).

---

## 4. The validator

`app/validators/userValidators.js`:

```js
const { body } = require('express-validator');

const username = () =>
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username may only contain letters, numbers, dots, underscores and hyphens');

exports.createUserRules = [
  username(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
];

// On update the password is optional — blank means "keep the current one".
exports.updateUserRules = [
  username(),
  body('password').optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
];
```

TypeScript checks your *view props*; it cannot check what arrives over HTTP. Request bodies are
still `any` from the network's point of view, so server-side validation is exactly as necessary
here as in the EJS version.

---

## 5. The controller

**Unchanged from the EJS walkthrough.** `res.render('users/index', data)` resolves to
`views-tsx/users/index.tsx` instead of `views/users/index.ejs` purely because of `VIEW_ENGINE` —
the controller has no idea.

```js
exports.index = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    const where = {};
    if (req.query.status) where.status = req.query.status;

    // Free-text search, ANDed with the status filter so the two controls compose.
    const q = String(req.query.q || '').trim();
    const search = User.searchFor(q);

    const result = await User.paginate({ where, search, page, pageSize, orderBy: 'id DESC' });
    result.rows = result.rows.map(User.publicFields);

    respond(req, res, {
      view: 'users/index',
      data: { title: 'Users', filterStatus: req.query.status || '', q, ...result },
    });
  } catch (err) {
    next(err);
  }
};
```

The keys of that `data` object become the **props** of your component — which is what the next
section makes type-safe.

See [TUTORIAL-EJS.md §5](./TUTORIAL-EJS.md#5-the-controller) for the full controller including
the uniqueness check and last-active-account guards.

---

## 6. The views

**This is the part that differs.** A view is a `.tsx` file whose **default export is a React
component**. The locals a controller passes arrive as props.

No build step: `core/views/tsxEngine.js` installs a `require` hook that transpiles `.tsx` with
esbuild on demand, then renders with `renderToStaticMarkup`. Edit a file, reload the page.

### Shared types — `app/views-tsx/types.ts`

This is the payoff over EJS. Define the shape once and every view is checked against it:

```ts
import type { FlashMessages } from './layouts/Main';

// Mirrors the users table minus `password` — publicFields() strips the hash before any record
// reaches a view, and the type makes that guarantee visible.
export type User = {
  id: number | string;
  username: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
};

// Every view gets these from sharedLocals + the CSRF middleware.
export type BaseViewProps = {
  title: string;
  appName?: string;
  messages?: FlashMessages;
  currentUser?: User | null;
  currentPath?: string;
  csrfToken?: string;
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type FormErrors = Record<string, string>;
```

Because `User` has no `password` field, an attempt to render `{record.password}` is a **compile
error**, not a silent leak.

```bash
npm run type-check      # tsc --noEmit over app/views-tsx/
```

### Layouts are just components

There's no layout framework to learn and no `<%- body %>` indirection — a layout takes
`children`:

```tsx
// app/views-tsx/layouts/Main.tsx  (abridged)
export default function Main({ title, appName, currentUser, csrfToken, messages = {}, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${title} · ${appName}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
      </head>
      <body>
        <nav className="navbar navbar-dark bg-dark px-3">
          <a className="navbar-brand" href="/">{appName}</a>
          {currentUser && (
            <form action="/logout" method="POST">
              <input type="hidden" name="_csrf" value={csrfToken} />
              <button className="btn btn-sm btn-outline-light">Logout</button>
            </form>
          )}
        </nav>
        <main className="container py-4">
          {/* flash messages */}
          {children}
        </main>
      </body>
    </html>
  );
}
```

### The list — `app/views-tsx/users/index.tsx`

```tsx
import Main from '../layouts/Main';
import type { BaseViewProps, Paginated, User } from '../types';

type Props = BaseViewProps & Paginated<User> & { filterStatus: string; q: string };

export default function UsersIndex({ rows, page, total, totalPages, filterStatus, q, ...layout }: Props) {
  const isSelf = (id: User['id']) => layout.currentUser && String(layout.currentUser.id) === String(id);
  const hasFilters = Boolean(q || filterStatus);

  // Pagination links must carry the current search + filter, or clicking "page 2" silently
  // gives you page 2 of everything. This is the classic bug in search UIs.
  const pageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    params.set('page', String(p));
    return `/users?${params.toString()}`;
  };

  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Users <span className="badge text-bg-secondary">{total}</span></h4>
        <a href="/users/create" className="btn btn-primary btn-sm">New user</a>
      </div>

      {/* GET, not POST: results stay linkable, shareable and back-button friendly — and a GET
          form needs no CSRF token, since it changes nothing. */}
      <form method="GET" action="/users" className="row g-2 mb-3">
        <div className="col-12 col-sm-5 col-md-4">
          <div className="input-group input-group-sm">
            <span className="input-group-text"><i className="bi bi-search" /></span>
            {/* defaultValue, not value — see the gotchas below */}
            <input type="search" name="q" className="form-control" placeholder="Search username…"
                   defaultValue={q} aria-label="Search users" />
          </div>
        </div>
        <div className="col-6 col-sm-3 col-md-2">
          <select name="status" className="form-select form-select-sm" defaultValue={filterStatus}
                  aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="col-auto">
          <button type="submit" className="btn btn-sm btn-outline-primary">Search</button>
        </div>
        {hasFilters && (
          <div className="col-auto">
            <a href="/users" className="btn btn-sm btn-outline-secondary">Clear</a>
          </div>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">
            {/* "Nothing matched your search" and "you have no users" are different situations
                needing different exits — offering "create a user" to someone whose search just
                missed would be wrong. */}
            {hasFilters ? (
              <>
                <p className="mb-3">No users match your search.</p>
                <a href="/users" className="btn btn-outline-secondary btn-sm">Clear search</a>
              </>
            ) : (
              <>
                <p className="mb-3">No users yet.</p>
                <a href="/users/create" className="btn btn-primary btn-sm">Create a user</a>
              </>
            )}
          </div>
        </div>
      ) : (
        <table className="table table-hover align-middle">
          <thead className="table-light">
            <tr><th>Username</th><th>Status</th><th>Created</th><th className="text-end">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={String(record.id)}>
                <td>
                  <a href={`/users/${record.id}`}>{record.username}</a>
                  {isSelf(record.id) && <span className="badge text-bg-info ms-1">you</span>}
                </td>
                <td>
                  <span className={`badge ${record.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>
                    {record.status}
                  </span>
                </td>
                <td className="small text-muted">{record.created_at}</td>
                <td className="text-end">
                  <a href={`/users/${record.id}/edit`} className="btn btn-sm btn-outline-secondary">Edit</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Main>
  );
}
```

JSX escapes interpolated values automatically — `{record.username}` is always safe. To render
trusted HTML you must go out of your way with `dangerouslySetInnerHTML`, which is a much better
default than EJS's easy-to-mistype `<%- %>`.

Every `.map()` needs a `key`. React will warn without one.

### The form — `app/views-tsx/users/form.tsx`

```tsx
export default function UserForm({ record = {}, formErrors = {}, ...layout }: Props) {
  const isEdit = Boolean(record.id);

  return (
    <Main {...layout} title={layout.title}>
      <form method="POST" action={isEdit ? `/users/${record.id}` : '/users'} noValidate>
        <input type="hidden" name="_csrf" value={layout.csrfToken} />
        {isEdit && <input type="hidden" name="_method" value="PUT" />}

        <div className="mb-3">
          <label className="form-label" htmlFor="username">Username *</label>
          {/* defaultValue, NOT value — see the gotchas below */}
          <input
            type="text"
            id="username"
            name="username"
            className={`form-control ${formErrors.username ? 'is-invalid' : ''}`}
            defaultValue={record.username || ''}
            required
            minLength={3}
            maxLength={50}
          />
          {formErrors.username && <div className="invalid-feedback d-block">{formErrors.username}</div>}
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="password">Password {isEdit ? '' : '*'}</label>
          <input
            type="password"
            id="password"
            name="password"
            className={`form-control ${formErrors.password ? 'is-invalid' : ''}`}
            required={!isEdit}
            minLength={8}
            autoComplete="new-password"
          />
          <div className="form-text">
            {isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="status">Status *</label>
          <select id="status" name="status" className="form-select" defaultValue={record.status || 'active'}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary">{isEdit ? 'Save changes' : 'Create user'}</button>
        <a href="/users" className="btn btn-outline-secondary">Cancel</a>
      </form>
    </Main>
  );
}
```

### Four TSX gotchas

**1. It's static markup, not hydrated React.** `renderToStaticMarkup` emits plain HTML with no
client-side bundle. `useState`, `useEffect` and `onClick` do nothing. Think "JSX as a template
language" — the mental model is identical to EJS. Want interactive islands? Add a client bundle
and `hydrateRoot` yourself; that's a deliberate extra step, not something the framework hides.

**2. `defaultValue`, never `value`.** A `value` prop without `onChange` makes React treat the
input as controlled — and with no client React to handle changes, the field becomes read-only.
Same for `defaultChecked` on checkboxes.

**3. No inline event handlers.** `onSubmit={() => confirm(...)}` is silently dropped. The
shipped layout wires a delegated listener to a `data-confirm` attribute instead:

```tsx
<form method="POST" action={`/users/${record.id}`} data-confirm={`Delete user "${record.username}"?`}>
  <input type="hidden" name="_csrf" value={layout.csrfToken} />
  <input type="hidden" name="_method" value="DELETE" />
  <button className="btn btn-sm btn-outline-danger">Delete</button>
</form>
```

```js
// one delegated listener in layouts/Main.tsx covers every form on the site
document.addEventListener('submit', function (e) {
  var m = e.target.getAttribute && e.target.getAttribute('data-confirm');
  if (m && !confirm(m)) e.preventDefault();
});
```

**4. HTML attribute names are React's.** `class` → `className`, `for` → `htmlFor`,
`charset` → `charSet`, `minlength` → `minLength`. `tsc` catches these.

Everything else is the same as EJS: `_csrf` on every write form, `_method` for PUT/DELETE, an
empty state on every list, and delete as a form rather than a link.

### Generating more views

```bash
node bin/forge.js make:views Product --tsx    # or just make:views, which follows VIEW_ENGINE
node bin/forge.js make:scaffold Product       # model + controllers + views + migration
```

---

## 7. The routes

Identical to the EJS walkthrough — `app/routes/web.js` knows nothing about the view engine:

```js
router.use(createSessionMiddleware()); // 1. read/create the session from the cookie
router.use(flash());                   // 2. one-request-only messages (needs the session)
router.use(csrfMiddleware);            // 3. mint a token and expose it to views
router.use(csrfProtect);               // 4. reject state-changing requests without that token
router.use(sharedLocals);              // 5. flash + currentUser + appName in every view

router.get('/login', AuthController.showLogin);
router.post('/login', loginRules, validate, AuthController.login);
router.post('/logout', AuthController.logout);

// Everything below needs a signed-in, still-active account
router.use(requireAuth, requireActiveUser);

router.get('/users', UserController.index);
router.get('/users/create', UserController.create);       // BEFORE /users/:id
router.post('/users', createUserRules, validate, UserController.store);
router.get('/users/:id', UserController.show);
router.get('/users/:id/edit', UserController.edit);
router.put('/users/:id', updateUserRules, validate, UserController.update);
router.delete('/users/:id', preventSelfAction('You cannot delete your own account.'), UserController.destroy);
```

`/users/create` must be declared **before** `/users/:id`, or Express matches the parameterised
route first and looks up a user with `id = "create"`.

---

## 8. Session management

Identical to the EJS walkthrough. Four rules, all in
`app/controllers/web/AuthController.js`:

1. **Never reveal whether a username exists** — one message for "no such user" and "wrong
   password", or the form becomes a user-enumeration oracle.
2. **Regenerate the session id on login** — `req.session.regenerate()` defeats session fixation.
3. **Store only safe fields** — `User.publicFields(user)`, never the password hash.
4. **Destroy on logout** — `req.session.destroy()`, not just clearing your own keys.

```js
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.user = User.publicFields(user);
  const redirectTo = req.session.postLoginRedirect || '/users';
  delete req.session.postLoginRedirect;
  // save() before redirecting so the store write can't lose a race with the next request
  req.session.save(() => res.redirect(redirectTo));
});
```

Full explanation in [TUTORIAL-EJS.md §8](./TUTORIAL-EJS.md#8-session-management).

---

## 9. Middleware

Identical to the EJS walkthrough.

**`requireActiveUser`** re-reads the database on every request, because a session is a snapshot
from login time. Without it, an admin can deactivate someone who's already signed in and that
person keeps browsing until the cookie expires:

```js
const current = await User.findById(sessionUser.id);
if (!current || current.status !== 'active') {
  return req.session.destroy(() => res.redirect('/login?reason=deactivated'));
}
req.session.user = User.publicFields(current);   // picks up a username change immediately
```

The `?reason=` query string rather than a flash message is deliberate: the session — and with it
the flash store — has just been destroyed.

**`preventSelfAction(message)`** is a factory returning middleware, so the message can be
tailored per route. It checks both `req.session.user` (web) and `req.user` (JWT), so the same
guard protects both route trees.

Full explanation in [TUTORIAL-EJS.md §9](./TUTORIAL-EJS.md#9-middleware).

---

## 10. Request lifecycle, end to end

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
  └─ 302 → GET /users
             └─ tsxEngine transpiles users/index.tsx with esbuild (cached in production)
             └─ renderToStaticMarkup(<UsersIndex {...locals} />)
             └─ HTML
```

The only engine-specific step is the last one.

---

## 11. Starting a new project

```bash
node bin/forge.js clean --yes --tsx
```

That removes the Users example (model, controllers, views, validators, migration, tests, the
generated Postman collection), resets `routes/web.js`, `routes/api.js` and `seeds/seed.js` to
stubs, and deletes the EJS view tree since you're on TSX. **It never touches `core/`,
`templates/`, `bin/`, `tests/helpers/` or your `.env`** — you keep the entire framework, plus
`tsconfig.json` and the shared `types.ts`.

Then:

```bash
# 1. point at a fresh database
#    edit DB_NAME in .env, or: DROP DATABASE forge_mvc;

# 2. update APP_NAME and secrets in .env, and confirm VIEW_ENGINE=tsx

# 3. generate your first resource
node bin/forge.js make:scaffold Product

# 4. fill in the migration, then
npm run migrate
npm run type-check
npm start
```

Run `node bin/forge.js clean` without `--yes` first — it prints exactly what it will delete and
exits without touching anything.

---

## Where to go next

- **[TUTORIAL.md](./TUTORIAL.md)** — framework reference: databases (MySQL/Postgres/Mongo),
  helpers, JWT, email, uploads, testing, Playwright, Postman, deployment, and a "gotchas" section
  covering nine real bugs found while building this.
- **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** — the same walkthrough with classic templates.
