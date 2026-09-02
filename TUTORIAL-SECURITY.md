# Security — What This Framework Does, and What You Must Do

A working audit of the security surface of a Forge MVC app: what `core/` already handles, where
the sharp edges are, and the specific mistakes that turn a safe default into a vulnerability.

Every claim about this codebase below was **checked against the source**, and the injection
finding in §4 was **reproduced** on this repo. Where something is verified, it says so.

**Scope note:** this is application-level security. Infrastructure (TLS termination, WAF, secret
managers, network policy) is out of scope — see [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) §9–10 for
the deployment side.

---

## Contents

**Part 1 — Input**
1. [The threat model, in one page](#1-the-threat-model-in-one-page)
2. [Validation is the first control](#2-validation-is-the-first-control)
3. [SQL injection: what the model layer protects](#3-sql-injection-what-the-model-layer-protects)
4. [⚠️ SQL injection: the hole it does *not* cover](#4-️-sql-injection-the-hole-it-does-not-cover)
5. [NoSQL injection under `DB_DRIVER=mongodb`](#5-nosql-injection-under-db_drivermongodb)
6. [XSS in EJS and TSX](#6-xss-in-ejs-and-tsx)

**Part 2 — Identity**

7. [Passwords](#7-passwords)
8. [Sessions (the web tree)](#8-sessions-the-web-tree)
9. [JWT (the API tree)](#9-jwt-the-api-tree)
10. [Authorisation — the bug class that ships most often](#10-authorisation--the-bug-class-that-ships-most-often)

**Part 3 — Request-level defences**

11. [CSRF](#11-csrf)
12. [Rate limiting](#12-rate-limiting)
13. [CORS](#13-cors)
14. [Headers, and the CSP that is switched off](#14-headers-and-the-csp-that-is-switched-off)
15. [File uploads](#15-file-uploads)

**Part 4 — Operations**

16. [Secrets and `.env`](#16-secrets-and-env)
17. [Error messages and log hygiene](#17-error-messages-and-log-hygiene)
18. [Dependencies](#18-dependencies)
19. [SSRF and outbound calls](#19-ssrf-and-outbound-calls)
20. [Denial of service on one thread](#20-denial-of-service-on-one-thread)

**Part 5 — Reference**

21. [Pre-launch checklist](#21-pre-launch-checklist)
22. [Symptom → cause → fix](#22-symptom--cause--fix)
23. [Exercises](#23-exercises)

---

# Part 1 — Input

## 1. The threat model, in one page

A Forge MVC app has four trust boundaries. Everything in this document sits on one of them.

```
   ┌── browser ──────────┐        ┌── API client ───────┐
   │ cookies sent        │        │ Bearer token, no    │
   │ automatically       │        │ ambient credential  │
   │ → CSRF matters      │        │ → CSRF does not     │
   └──────────┬──────────┘        └──────────┬──────────┘
              │  app/routes/web.js           │  app/routes/api.js
              ▼                              ▼
        session + flash + CSRF          requireJwt
              └──────────────┬───────────────┘
                             ▼
                     controllers (HTTP only)
                             ▼
                    app/models — ALL SQL  ← the injection boundary
                             ▼
                    ┌────────────────┐
                    │ MySQL/PG/Mongo │
                    └────────────────┘
                             ▲
                   outbound: core/helpers/httpClient  ← SSRF boundary
```

The single most important structural fact: **the two route trees have different threat models.**
Cookies ride along automatically on a cross-site request, so the web tree needs CSRF. A Bearer
token does not, so the API tree does not. That is why rule 3 in [AGENTS.md](./AGENTS.md) —
*never mount session, flash or CSRF globally* — is a security rule, not a tidiness rule. Mounting
CSRF globally does not make the API safer; it just breaks every API request.

What is already handled for you, and where:

| Control | Where |
|---|---|
| Parameterised values in every query | `core/db/{mysql,postgres,mongodb}.js` |
| Password hashing (bcrypt, cost 12) | `core/helpers/hash.js` |
| Session cookies `httpOnly` + `sameSite: lax` + `secure` in production | `core/session.js` |
| Session-bound CSRF tokens for the web tree | `core/middlewares/csrf.js` |
| Global + per-route rate limiting | `core/middlewares/rateLimit.js` |
| Security headers via helmet | `core/Application.js` |
| Opt-in, explicit-origin CORS | `core/middlewares/cors.js` |
| Auto-escaping templates | EJS `<%= %>`, React/TSX |
| Upload type + size + count limits | `core/helpers/upload.js` |
| Error message redaction in production | `core/middlewares/errorHandler.js` |

---

## 2. Validation is the first control

Validation is not a UX feature that happens to help security — it is the control that makes every
later assumption true. A controller that trusts `req.body` has already lost.

Validators live in `app/validators/` and run as route middleware, before the controller:

```js
// app/validators/productValidators.js
const { body, param, query } = require('express-validator');

exports.createProductRules = [
  body('sku').trim().isLength({ min: 1, max: 32 }).matches(/^[A-Z0-9-]+$/),
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('price_paise').isInt({ min: 0 }).toInt(),
  body('status').isIn(['active', 'inactive']),
];
exports.idRule = [param('id').isInt({ min: 1 }).toInt()];
```

```js
// app/routes/api.js — rules, then validate, then the controller
router.post('/products', requireJwt, createProductRules, validate, ProductController.store);
```

Four rules that matter more than the specific library:

1. **Allowlist, never blocklist.** `isIn([...])` and `matches(/^[A-Z0-9-]+$/)` beat "reject
   anything containing `<script>`" every time. You cannot enumerate bad input.
2. **Validate the type you will use.** `isInt().toInt()` means the controller gets a number, so
   `Number('')  === 0` and `parseInt('12px') === 12`
   ([TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §14) never become logic errors.
3. **Never spread `req.body` into a model.** `Product.create(req.body)` lets a caller set any
   column — `role`, `status`, `is_admin`, `id`. This is **mass assignment**, and it is how a
   normal user makes themselves an admin:

```js
// ❌ whatever the client sent, straight into the table
const product = await Product.create(req.body);

// ✅ name the fields you accept
const { name, sku, price_paise, status } = req.body;
const product = await Product.create({ name, sku, price_paise, status });
```

4. **Validate on the API tree too.** It is not "internal". It is the tree with no CSRF and no
   browser in the way.

---

## 3. SQL injection: what the model layer protects

Rule 1 in [AGENTS.md](./AGENTS.md) — all SQL lives in `app/models/` — buys you a single place
where injection can happen, and the adapters parameterise every **value** that passes through.

**Verified.** A classic payload as a value:

```js
buildWhere({ username: "admin' OR 1=1 --" })
// → { sql: "WHERE `username` = ?", params: ["admin' OR 1=1 --"] }
```

The payload lands in `params`, never in `sql`. The driver sends it separately and the database
treats it as a string. Same story for `search`, which each adapter escapes for its own dialect —
`LIKE ? ESCAPE '\\'` on MySQL, `ILIKE` on Postgres, `$regex` on Mongo — so a search for `%` or
`_` matches those characters instead of acting as a wildcard.

So the safe path is the ordinary path:

```js
await Product.findOne({ sku: req.body.sku });        // ✅ parameterised
await Product.paginate({ search: Product.searchFor(req.query.q) });   // ✅ escaped
```

`Model.raw()` is the one place you can undo this yourself:

```js
// ❌ string interpolation — injection
await Product.raw(`SELECT * FROM products WHERE sku = '${req.query.sku}'`);

// ✅ placeholders, always
await Product.raw('SELECT * FROM products WHERE sku = ?', [req.query.sku]);
```

---

## 4. ⚠️ SQL injection: the hole it does *not* cover

**This is the finding to take away from this document.** Values are parameterised; **column names
are not.** `buildWhere` interpolates the keys of your `where` object, and the entries of
`search.fields`, directly into the SQL string.

**Reproduced on this repo** — three calls, the first safe, the next two not:

```js
buildWhere({ username: "admin' OR 1=1 --" })
// → WHERE `username` = ?                                  ✅ value parameterised

buildWhere({ 'id` = 1 OR `1': 1 })
// → WHERE `id` = 1 OR `1` = ?                             ❌ key broke out of its backticks

buildWhere({}, { fields: ['name` , (SELECT 1)  -- '], term: 'x' })
// → WHERE (`name` , (SELECT 1)  -- ` LIKE ? ESCAPE '\\')  ❌ so did the search field
```

This is not a defect in how you use the framework — it is the framework's **contract**: `where`
keys and `search.fields` are assumed to be *developer-controlled identifiers*, which is why the
documented usage is `Product.searchFor(req.query.q)` (fields from `Model.searchable`, term from
the user) rather than anything user-supplied. Follow the contract and you are safe. Break it once
and you have a full injection.

**The three rules that keep you on the safe side:**

```js
// ❌ NEVER: user input becomes the where KEYS
await Product.find(req.query);
await Product.find({ ...req.query, status: 'active' });

// ❌ NEVER: user input becomes search.fields
await Product.paginate({ search: { fields: req.query.fields, term: req.query.q } });

// ✅ Keys and fields are literals you wrote; only VALUES come from the user
await Product.find({ status: req.query.status, category_id: req.query.category });
await Product.paginate({ search: Product.searchFor(req.query.q) });
```

For a genuinely user-chosen sort column or filter field — a real requirement on any list screen —
**map through an allowlist**, never pass the string through:

```js
const SORTABLE = { name: 'name', created: 'created_at', price: 'price_paise' };

const orderBy = SORTABLE[req.query.sort] ?? 'created_at';   // ?? not ||, per AGENTS.md rule 8
await Product.paginate({ page: req.query.page, orderBy });
```

The same reasoning applies to `orderBy` itself: it is an identifier, so it is interpolated, so it
must never come from the request unmapped.

> A defence-in-depth fix belongs in the adapters — validate every identifier against
> `/^[A-Za-z0-9_]+$/` and throw otherwise, in all three of `core/db/{mysql,postgres,mongodb}.js`.
> That is the kind of change rule 7 in [AGENTS.md](./AGENTS.md) permits in `core/`, and it would
> turn a silent injection into a loud error. Until it is in place, the allowlist above is the
> control.

---

## 5. NoSQL injection under `DB_DRIVER=mongodb`

Mongo has no SQL to inject, and a different problem instead: **query operators are just object
keys.** If a user-supplied value is an *object*, it becomes an operator.

```js
// The request:  POST /api/auth/login   {"username": {"$ne": null}, "password": {"$ne": null}}
await User.findOne({ username: req.body.username });
// Under Mongo this becomes findOne({ username: { $ne: null } }) → the first user in the collection
```

`express.json()` will happily parse that object, and the query is "parameterised" in the sense
that nothing was concatenated — yet the semantics changed completely. Two defences, both cheap:

1. **Validate the type**, which §2's rules already do: `body('username').isString()` rejects the
   object before the model ever sees it.
2. **Coerce at the boundary** for anything that must be scalar: `String(req.body.username)`.

This is a real reason to run the validators on the API tree even when the caller is "trusted".

---

## 6. XSS in EJS and TSX

Both view engines escape by default; both give you a way to switch it off.

**EJS:**

```ejs
<%= user.username %>    <!-- ✅ escaped: <script> becomes &lt;script&gt; -->
<%- user.bio %>         <!-- ❌ raw HTML. If bio came from a user, this is stored XSS -->
```

**Verified**: the only `<%-` in `app/views/` is `<%- body %>` in the two layouts
(`layouts/main.ejs`, `layouts/auth.ejs`), which injects the already-rendered child template. That
is correct and necessary. **Every `<%-` you add after that needs a justification**, and the
justification cannot be "the input is trusted" unless you sanitised it yourself.

**TSX/React** escapes interpolated values the same way, and its unsafe door is named to be hard to
miss:

```tsx
<p>{user.bio}</p>                                              {/* ✅ escaped */}
<p dangerouslySetInnerHTML={{ __html: user.bio }} />           {/* ❌ stored XSS */}
```

If you must render user HTML (a rich-text field), sanitise on the way **in**, with an allowlist
library, and store the sanitised version. Sanitising on the way out means every future read path
has to remember.

Three XSS vectors that escaping does **not** cover:

| Vector | Example | Defence |
|---|---|---|
| An attribute that becomes code | `<a href="<%= url %>">` with `url = "javascript:alert(1)"` | validate the scheme is `http`/`https` |
| Interpolation into a `<script>` block | `const cfg = <%= json %>` | `JSON.stringify` + a `<script type="application/json">` tag, read via `textContent` |
| An `on*` attribute built from data | `onclick="<%= handler %>"` | never build handlers from data; use `data-` attributes |

And the structural defence for all three is the CSP that is currently switched off — §14.

---

# Part 2 — Identity

## 7. Passwords

`core/helpers/hash.js` is twelve lines and gets the important things right:

```js
async function hashPassword(plain) { return bcrypt.hash(plain, 12); }
async function verifyPassword(plain, hash) {
  if (!hash) return false;                 // ← a user row with no password can never authenticate
  return bcrypt.compare(plain, hash);
}
```

| Decision | Why it matters |
|---|---|
| bcrypt, **cost 12** | deliberately slow; raise it as hardware improves, and re-hash on next login |
| the **async** API | a sync hash blocks every other request for ~250ms ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3) |
| `if (!hash) return false` | a null hash returns false instead of throwing — no accidental bypass |
| `bcrypt.compare`, never `===` | constant-time; `===` leaks the hash byte by byte through timing |

Hashing lives in the **model** (`User.createWithPassword`, `User.updateProfile`), which is what
guarantees there is exactly one path a password can take into the database. Keep it that way — a
controller that hashes is a controller that will eventually forget to.

The rest of the password surface is yours to build:

- **Enforce length, not composition.** A 12-character minimum beats "one uppercase, one symbol".
- **Never log a password**, and never echo it back in a form re-render. Note that
  `User.publicFields()` exists precisely so a row can't carry its hash into a session, a
  response, or a rendered page.
- **Uniform failure messages.** "Invalid username or password" — never "no such user", which
  turns your login form into a username enumerator.
- **Rate-limit login** — already wired, §12.
- **Invalidate sessions on password change**, or a stolen session survives the reset.

---

## 8. Sessions (the web tree)

`core/session.js` supports seven backends via `SESSION_STORE`. **Verified** cookie flags, on both
the `express-session` and `cookie-session` paths:

```js
httpOnly: true,                                   // JavaScript cannot read it → XSS can't steal it
secure: process.env.NODE_ENV === 'production',    // HTTPS only in production
sameSite: 'lax',                                  // not sent on cross-site POSTs
maxAge: SESSION_TTL_MS,                           // 60-minute idle timeout
rolling: true,                                    // re-issued on each request → idle, not absolute
resave: false, saveUninitialized: false,          // don't write sessions nobody uses
```

Three of those are worth understanding rather than just having:

- **`sameSite: 'lax'` is a second CSRF defence.** The token in §11 is the first. Defence in depth
  matters because `lax` still allows top-level cross-site *GET* navigation — so a state-changing
  GET route would remain forgeable. Never mutate state on a GET.
- **`saveUninitialized: false`** means an anonymous visitor gets no session row, which is both a
  performance and a privacy win.
- **`secure` keys off `NODE_ENV`.** If you deploy with `NODE_ENV` unset, cookies go out without
  the `Secure` flag. Check it in your container's environment, not just your `.env`.

Your remaining jobs:

**Set `SESSION_STORE` to something shared before you run more than one instance.** The default
`memory` store loses every session on restart and doesn't work across replicas
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §17).

**Regenerate the session id on login.** Without it you are open to session fixation — an attacker
plants a known id, the victim logs in, and the attacker's id is now authenticated:

```js
req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.userId = user.id;
  req.session.save(() => res.redirect(destination));
});
```

**Destroy on logout**, server-side. Clearing the cookie alone leaves a valid session behind.

---

## 9. JWT (the API tree)

```js
jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
```

`core/middlewares/requireJwt.js` reads `Authorization: Bearer <token>`, verifies it, sets
`req.user`, and returns a JSON 401 on anything else — including an expired token. That is the
right shape. Four things about JWTs you must decide, because the framework can't:

**1. A JWT cannot be revoked.** That is the whole trade — statelessness means no lookup, which
means no revocation list. A 7-day default (`JWT_EXPIRES_IN=7d`) is a 7-day window for a stolen
token. **Shorten it.** 15–60 minutes for an access token, with a refresh token if you need long
sessions, and a server-side denylist keyed by `jti` if you need real logout.

**2. Put nothing sensitive in the payload.** A JWT is signed, **not encrypted** — anyone can
base64-decode it and read every claim. `{ id, role }` is fine; an email or a phone number is a
data leak in every client's local storage.

**3. Trust the claims only as far as their freshness.** `req.user.role` is what the role was when
the token was issued. Demote a user and their existing token still says `admin` until it expires.
For anything genuinely privileged, re-read the row.

**4. The secret is the whole security model.** A weak or shared `JWT_SECRET` means anyone can mint
tokens. Generate it properly, and never reuse `SESSION_SECRET` for it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

⚠️ Never accept the algorithm from the token. `jsonwebtoken` defaults to HS256 and rejects `none`,
which is correct — do not "fix" that by passing `algorithms` from a header. If you ever move to
RS256, pin `algorithms: ['RS256']` explicitly at verify time, or an attacker can hand you an
HS256 token signed with your *public* key.

---

## 10. Authorisation — the bug class that ships most often

Authentication is "who are you"; authorisation is "may you do this to *this* record". The second
is where real applications leak, because it is per-route work that no framework can do for you.

`requireAuth`, `requireJwt` and `requireRole` answer the coarse question. They do **not** answer
the object-level one:

```js
// ❌ Any logged-in user can read, edit, or delete ANY invoice by changing the id.
//    This is IDOR — Insecure Direct Object Reference — and it is the #1 web API vulnerability.
router.get('/invoices/:id', requireAuth, InvoiceController.show);
```

```js
// ✅ The ownership check is part of the query, so it cannot be forgotten later
static async findForOwner(id, userId) {
  return this.findOne({ id, user_id: userId });
}
```

```js
exports.show = async (req, res, next) => {
  try {
    const invoice = await Invoice.findForOwner(req.params.id, req.session.userId);
    if (!invoice) return fail(req, res, { message: 'Not found', status: 404 });
    return respond(req, res, { view: 'invoices/show', data: { invoice } });
  } catch (err) {
    return next(err);
  }
};
```

Two deliberate details there. The scoping lives **in the model**, as a `WHERE` clause, so no
future controller can query the table unscoped by accident. And a record you don't own returns
**404, not 403** — a 403 confirms the record exists, which is itself an information leak.

The checklist for every route that takes an `:id`:

- [ ] Is the record scoped to the caller in the **query**, not checked after fetching?
- [ ] Does `PUT`/`DELETE` re-check ownership? (A `GET` guard proves nothing about a `DELETE`.)
- [ ] Can the caller change a field they shouldn't? (mass assignment — §2)
- [ ] Is there a test that a *different* user gets a 404? (§14 of
      [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md))
- [ ] Does a list endpoint filter by owner, or does `?page=2` walk everyone's data?

---

# Part 3 — Request-level defences

## 11. CSRF

`core/middlewares/csrf.js` issues a 24-byte random token per session, exposes it as
`res.locals.csrfToken`, and rejects any unsafe method whose `_csrf` body field (or
`x-csrf-token` header) doesn't match.

```js
if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
```

```ejs
<form method="post" action="/products">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

Four behaviours in that file that you need to know, because each one is a footgun if you don't:

**1. `GET`/`HEAD`/`OPTIONS` are exempt.** Which means a state-changing GET has no CSRF protection
at all. **Never mutate state on a GET** — this is the concrete reason, not a REST purity argument.

**2. API requests are exempt** (`if (req.isApi) return next()`). Correct: a Bearer token is not an
ambient credential, so there is nothing to forge. But it means **an API route authenticated by
*session* cookie has no CSRF protection.** If you ever add one, protect it explicitly.

**3. Multipart bodies need a second pass.** At the point the global middleware runs, `multer`
hasn't parsed the body, so `req.body._csrf` doesn't exist yet. The file skips those requests and
expects the route to re-run `csrfProtect` after upload, via `markMulterProcessed`. **A file-upload
route that doesn't follow the `app/routes/web.js` pattern is unprotected.** Check yours.

**4. It is mounted in `app/routes/web.js` only** — rule 3 in [AGENTS.md](./AGENTS.md). Mounting it
globally breaks every `/api/*` request.

For AJAX from your own pages, send the header instead of a body field:

```js
fetch('/products/42', {
  method: 'DELETE',
  headers: { 'x-csrf-token': document.querySelector('meta[name="csrf"]').content },
});
```

---

## 12. Rate limiting

`core/middlewares/rateLimit.js` gives you a global brake and a stricter auth limiter:

| Limiter | Default window | Configure with |
|---|---|---|
| global | 15 min | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` |
| auth routes | 15 min | `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` |

Two design choices worth copying: it **skips `/health` and `/ready`** (an orchestrator polling
every second must never be throttled — and it is mounted *after* the health routes for the same
reason), and it **answers JSON to API callers and text to browsers**, with `retryAfter` in the
body.

Apply the strict one to every credential-accepting route, not just login:

```js
router.post('/login', authLimiter, loginRules, validate, AuthController.login);
router.post('/register', authLimiter, ...);
router.post('/forgot-password', authLimiter, ...);   // also an account enumerator
router.post('/reset-password', authLimiter, ...);
```

⚠️ **Behind a proxy, rate limiting silently stops working.** Every request appears to come from
the load balancer's IP, so either one user exhausts everyone's quota or the limiter keys on a
single value and never fires. You must tell Express to trust the proxy:

```js
app.set('trust proxy', 1);   // 1 = one proxy hop; be specific, don't use `true`
```

Set it to the actual number of hops. `true` means "trust any `X-Forwarded-For`", which lets a
client spoof its IP and bypass the limiter entirely.

Rate limiting is not DoS protection (§20) — it is brute-force and scraping protection. The default
store is in-memory, so counters are per-process; with multiple replicas, use a shared store.

---

## 13. CORS

`core/middlewares/cors.js` is **off by default** (`CORS_ORIGINS` unset = same-origin only), which
is the right default. When you enable it, list origins explicitly:

```ini
CORS_ORIGINS=https://app.example.com,https://admin.example.com
CORS_CREDENTIALS=true
```

The rule the middleware enforces for you, and the reason it exists: **`*` and credentials are
mutually exclusive.** A wildcard origin with `Access-Control-Allow-Credentials: true` would let
any site on the internet make authenticated requests as your logged-in users. Browsers reject the
combination; this middleware refuses it up front with an explanatory error rather than letting you
discover it in production. It also echoes the specific requesting origin rather than `*` when
credentials are in play, which is what the spec requires.

Two things CORS is *not*: it is not authorisation (it constrains browsers, not `curl`), and
relaxing it does not make your API safer for mobile clients — they were never subject to it.

---

## 14. Headers, and the CSP that is switched off

`core/Application.js` mounts helmet with two deliberate deviations from its defaults:

```js
helmet({
  contentSecurityPolicy: false,          // ← OFF. See below.
  referrerPolicy: { policy: 'same-origin' },
});
```

**`referrerPolicy: 'same-origin'`** replaces helmet's `no-referrer`, and it is a bug fix rather
than a preference: with no `Referer` header, `res.redirect('back')` had nowhere to go, so a failed
form submission dumped the user on the dashboard and lost their input (it's in the
[AGENTS.md](./AGENTS.md) gotcha table). Same-origin keeps the header for your own pages while
still not leaking URLs to third parties.

**`contentSecurityPolicy: false`** is the one meaningful gap in the shipped configuration, and the
source comment says why: a real policy needs to know your asset origins. **Turn it on before you
launch.** CSP is the control that turns most XSS from "account takeover" into "a blocked console
error" — including the three vectors escaping doesn't cover (§6).

```js
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],              // no 'unsafe-inline' — that defeats the point
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],          // clickjacking
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy: { policy: 'same-origin' },
});
```

If inline `<script>` blocks in your EJS views break under that, the fix is a per-request nonce —
not `'unsafe-inline'`. Roll it out with `Content-Security-Policy-Report-Only` first and watch the
reports.

What helmet already sets for you: `X-Content-Type-Options: nosniff`,
`Strict-Transport-Security`, `X-Frame-Options`, `X-DNS-Prefetch-Control`, and it removes
`X-Powered-By`.

Also cap your body size, which `express.json()` does not do usefully by default:

```js
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

A 10 MB JSON body is a free `JSON.parse` stall for every other request (§20).

---

## 15. File uploads

`core/helpers/upload.js` wraps multer with the three limits that matter:

```js
createUploader({ allowedExt, maxFiles, maxFileSizeMB })
// → multer({ storage, fileFilter, limits: { fileSize: maxFileSizeMB * 1024 * 1024, files: maxFiles } })
```

Uploads are the highest-risk input in most applications. The full checklist:

| Risk | Control |
|---|---|
| Path traversal via filename (`../../server.js`) | **generate your own filename**; never trust `file.originalname` |
| Executable content | allowlist extensions **and** check the magic bytes — an extension is a claim, not a fact |
| Stored XSS via SVG/HTML | don't serve user files from your app's origin, or force `Content-Disposition: attachment` |
| Disk exhaustion | `fileSize` + `files` limits (above), plus a quota per user |
| A zip bomb / decompression bomb | don't decompress user archives in-process |
| Serving with a sniffed type | `nosniff` (helmet, §14) + an explicit `Content-Type` |

The strongest single measure: **serve uploads from a different origin** (S3, a CDN, or at least a
separate subdomain). Same-origin user content means a malicious file inherits your cookies and
your CSP.

And remember the CSRF interaction from §11 — a multipart route must re-run `csrfProtect` after
multer, or it has no CSRF protection at all.

---

# Part 4 — Operations

## 16. Secrets and `.env`

`.env` is git-ignored and `.env.example` is the committed template — that split is the whole
convention, and rule 9 in [AGENTS.md](./AGENTS.md) keeps it honest: **every key you introduce goes
into `.env.example`, with a comment and no value.**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Rule | Why |
|---|---|
| `SESSION_SECRET` ≠ `JWT_SECRET` | one leak shouldn't compromise both |
| Never commit a real `.env` | it lives in history forever, even after you delete it |
| Rotate anything that has ever been pasted into a chat, a ticket, or a screenshot | assume it's public |
| Different secrets per environment | a staging leak must not authenticate against production |
| In production, prefer the platform's secret store | k8s Secrets, SSM, Vault — not a file on disk |

If a secret does leak: rotate it first, then work out the blast radius. For `JWT_SECRET`,
rotating invalidates every outstanding token — which is the point.

One more: `.env` is read by `dotenv` at boot, so a changed value needs a restart. Do not add a
"reload config" endpoint; it is an unauthenticated remote configuration change waiting to happen.

---

## 17. Error messages and log hygiene

`core/middlewares/errorHandler.js` already does the important redaction — in production, a 500
returns `'Server error'` instead of the exception message:

```js
return res.status(status).json({
  success: false,
  message: status === 500 && process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
});
```

That matters because an unredacted message leaks table names, file paths, driver versions and
occasionally SQL. Note the condition: **only 500s are redacted.** A deliberate 4xx (`err.status =
422`) keeps its message, which is correct — those messages are written for users. So do not put
internal detail in a 4xx message.

Log hygiene, which the framework leaves to you:

- **Never log passwords, tokens, session ids, or full card/ID numbers.** Logs get shipped to
  third-party aggregators, and they get read by people who aren't you.
- **Log the correlation id, not the credential.** `core/context.js` and
  `core/helpers/logger.js` already carry `requestId` on every line
  ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §20) — that is how you trace a request
  without recording its contents.
- **Beware logging whole request bodies.** `logger.info(req.body)` on a login route logs
  passwords. If you need bodies, redact by key allowlist.
- **Log auth events** — login success and failure, password change, role change, and every 403.
  These are what an incident investigation actually needs.
- **Never log a stack trace to the client.** In this framework you don't have to think about it;
  don't undo it by adding `err.stack` to a response.

---

## 18. Dependencies

Most real-world Node compromises arrive through `node_modules`, not through your code.

```bash
npm audit
```

```bash
npm audit fix
```

```bash
npm outdated
```

Practices that matter more than the commands:

- **Commit `package-lock.json`** and use `npm ci` in CI and in your image build. `npm install` can
  resolve a different tree than the one you tested.
- **Read `npm audit` output rather than obeying it.** A "high" in a transitive dev-only dependency
  used by a build tool is not the same risk as one in your HTTP stack. Triage by reachability.
- **`npm audit fix --force` can break your app** — it upgrades across major versions. Run the
  suite after (`npm test`, §7 of [AGENTS.md](./AGENTS.md)).
- **Be suspicious of new dependencies.** Every one is code running with your process's privileges
  and access to your `.env`. This framework's whole design — plain Express, plain `require`, no DI
  container — keeps that surface small. Adding a package to save ten lines is usually a bad trade.
- **Watch for typosquats** when you add something: check the download count, the repository link
  and the publish date before `npm i`.

---

## 19. SSRF and outbound calls

Server-Side Request Forgery: a user supplies a URL, your server fetches it, and now the attacker
is making requests from *inside* your network — to `169.254.169.254` for cloud credentials, to
`localhost:3306`, to an internal admin service with no auth because it's "internal".

```js
// ❌ SSRF. Also bypasses every protection in core/helpers/httpClient.js
const res = await fetch(req.body.webhookUrl);
```

The rules:

1. **Never fetch a user-supplied URL** unless the feature genuinely requires it (webhooks, avatar
   import). If it does: allowlist the scheme (`https:` only), resolve the hostname and **reject
   private and link-local ranges** (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, `::1`,
   unique-local v6), disable redirect following (or re-validate every hop — a redirect to
   `localhost` defeats a check done only on the original URL), and set a short timeout.
2. **Always go through `createClient`** from `core/helpers/httpClient.js`
   ([TUTORIAL-SOA.md](./TUTORIAL-SOA.md) §5). Bare `fetch` loses the timeout, the retry policy,
   the circuit breaker and the correlation-ID propagation — that's an availability *and* a
   forensics problem.
3. **Don't forward your own credentials outbound.** Header propagation should be an allowlist
   (`x-request-id`), never a copy of the inbound headers — or you will hand `Authorization` or
   `Cookie` to a third party.

---

## 20. Denial of service on one thread

Node's threading model ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3) makes DoS
cheaper than on a process-per-request stack: **anything that blocks the event loop is downtime for
every user**, not just the attacker. Verified there: 600ms of CPU work delayed an unrelated 10ms
timer by 590ms.

The cheap-to-attack surfaces, and the control for each:

| Attack | Control |
|---|---|
| Huge JSON body → `JSON.parse` stall | `express.json({ limit: '100kb' })` (§14) |
| Catastrophic regex backtracking on a validated field | audit patterns; no nested quantifiers; never build a regex from user input ([TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §18) |
| `?page_size=100000` | `parsePagination` — already clamps to 100; use it (§20 below) |
| An unbounded search across a large table | require a minimum term length; index the columns |
| Many concurrent large downloads | stream, don't `readFile` ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §12) |
| Slowloris / connection exhaustion | terminate at a proxy; set `server.headersTimeout` |
| Login brute force | `authLimiter` (§12) |
| Zip/image bomb | don't process user media in-process; use a worker or a service |

On page size specifically, the framework already has the control — **use it rather than
re-inventing it.** `core/helpers/pagination.js` clamps both values:

```js
const { parsePagination } = require('../../../core/helpers/pagination');
const { page, pageSize } = parsePagination(req.query);   // page >= 1, pageSize 1..100
```

```js
// core/helpers/pagination.js — the shipped bounds
const page = Math.max(1, toIntOr(query.page, 1));
const pageSize = Math.min(maxPageSize, Math.max(1, toIntOr(query.page_size, defaultPageSize)));
```

Note what it does *not* do: `Model.paginate` itself only floors (`Math.max(1, Number(pageSize))`)
and has no upper bound. So an endpoint that passes `req.query.page_size` straight to
`Model.paginate`, bypassing `parsePagination`, accepts `?page_size=100000`. Go through
`parsePagination` — or pass your own `maxPageSize` to it — on every endpoint that takes the value
from the request.

Real volumetric DoS is not solvable in application code — that's a CDN/WAF concern. What you own
is making sure a *single cheap request* can't stall the loop.

---

# Part 5 — Reference

## 21. Pre-launch checklist

**Configuration**

- [ ] `NODE_ENV=production` in the deployed environment (drives `secure` cookies *and* error
      redaction — §8, §17)
- [ ] `SESSION_SECRET` and `JWT_SECRET` are distinct, 32+ bytes, generated randomly (§16)
- [ ] `JWT_EXPIRES_IN` shortened from the 7-day default (§9)
- [ ] `SESSION_STORE` is a shared backend, not `memory` (§8)
- [ ] Every new `.env` key is in `.env.example` (§16)
- [ ] `app.set('trust proxy', <hops>)` if you're behind a load balancer (§12)
- [ ] TLS terminated in front of the app; HSTS on

**Code**

- [ ] CSP enabled and tested in report-only first (§14)
- [ ] Body size limits set on `json` and `urlencoded` (§14)
- [ ] No user input reaches `where` keys, `search.fields`, or `orderBy` (§4)
- [ ] No `Model.create(req.body)` — explicit field lists everywhere (§2)
- [ ] Every `:id` route scopes to the caller **in the query** (§10)
- [ ] Every `<%-` / `dangerouslySetInnerHTML` justified and sanitised (§6)
- [ ] `authLimiter` on every credential-accepting route (§12)
- [ ] Session regenerated on login, destroyed on logout (§8)
- [ ] Upload routes re-run `csrfProtect` after multer (§11, §15)
- [ ] No bare `fetch` to another service (§19)
- [ ] Upper bound on `page_size` (§20)

**Process**

- [ ] `npm audit` triaged; `package-lock.json` committed; CI uses `npm ci` (§18)
- [ ] `npm test` and `npm run type-check` green (§7 of [AGENTS.md](./AGENTS.md))
- [ ] Auth events logged; no credentials in logs (§17)
- [ ] A test proves a *different* user gets a 404 on someone else's record (§10)

---

## 22. Symptom → cause → fix

| Symptom / finding | Cause | Fix |
|---|---|---|
| A user reads another user's record by changing `:id` | IDOR — no ownership scoping | scope in the query; 404 not 403 (§10) |
| A normal user became an admin | mass assignment via `req.body` | explicit field list (§2) |
| Injection despite "parameterised queries" | user input in `where` keys / `search.fields` / `orderBy` | allowlist-map identifiers (§4) |
| Mongo login bypassed with `{"$ne":null}` | operator injection via an object value | validate `isString()`; coerce (§5) |
| Stored XSS | `<%-` or `dangerouslySetInnerHTML` on user data | escape; sanitise on input; enable CSP (§6, §14) |
| `javascript:` URL executes | escaped, but in an `href` | validate the scheme (§6) |
| Every request looks like one IP; rate limits misfire | missing `trust proxy` | `app.set('trust proxy', hops)` (§12) |
| Rate limit bypassed by spoofed `X-Forwarded-For` | `trust proxy` set to `true` | set the real hop count (§12) |
| CSRF token missing on an upload form | multipart body unparsed at global middleware time | re-run `csrfProtect` after multer (§11) |
| Session survived a password reset | sessions not invalidated | destroy other sessions on change (§7) |
| Session fixation | id not regenerated at login | `req.session.regenerate()` (§8) |
| A revoked user still has access | JWTs can't be revoked | short expiry + `jti` denylist (§9) |
| Stack traces / SQL in an API response | error message not redacted | `NODE_ENV=production` (§17) |
| Passwords in the log file | `logger.info(req.body)` | redact by key allowlist (§17) |
| Cookies sent over HTTP in production | `NODE_ENV` unset in the container | set it (§8) |
| Internal metadata service reachable from a webhook feature | SSRF | allowlist scheme + reject private ranges (§19) |
| One request stalls the whole server | blocking work on the event loop | body limits, regex audit, streams (§20) |

---

## 23. Exercises

1. Add `?sort=` to a list endpoint. Implement it with an allowlist map, then try
   `?sort=name\`,(SELECT 1)--` and confirm it falls back to the default rather than reaching the
   SQL. (§4)

2. Write the IDOR test: create two users and two records, log in as the second, and assert a 404
   on the first user's record. Then remove the ownership scoping and watch it go red. (§10,
   [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) §14)

3. Switch `DB_DRIVER=mongodb` and try to log in with `{"username": {"$ne": null}}`. Add the
   `isString()` validator and try again. (§5)

4. Enable the CSP from §14 in report-only mode, load every page, and fix what it reports. Then
   turn it on for real. (§14)

5. Set `JWT_EXPIRES_IN=30s`, log in, wait, and confirm the API returns a JSON 401 rather than a
   redirect or a 500. (§9, §11)

6. Remove `_csrf` from one form and confirm you get a 403 with the framework's message, not a
   silent success. Then do the same for an upload form and see whether it is actually protected.
   (§11, §15)

7. `POST` a 5 MB JSON body to an endpoint and time an unrelated `/health` request while it
   parses. Add `express.json({ limit: '100kb' })` and repeat. (§14, §20)

8. Run `npm audit`. For each finding, decide reachable or not, and write down why — that
   reasoning is the actual skill. (§18)

---

| Next | |
|---|---|
| [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) | writing the auth and IDOR tests that keep this fixed |
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | why blocking the loop is a denial of service |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | CORS, rate limiting and resilient outbound calls in production |
| [TUTORIAL.md](./TUTORIAL.md) | §12 auth, §11 validation, §15 uploads — the framework reference |
