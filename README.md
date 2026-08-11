# Forge MVC

A small, explicit Node.js framework for building a **server-rendered MVC app**, a **JSON REST
API**, or **both from one codebase** — on **MySQL, PostgreSQL, or MongoDB**, with **EJS or
React (TSX)** views.

Extracted from a production client-support portal, so the plumbing is the kind that survived
real use: session + JWT auth, CSRF, dual-mode validation, file uploads with signature checking,
transactional email, structured logging.

```bash
npm install
cp .env.example .env     # set your DB credentials
npm run migrate
npm run seed
npm start                # http://localhost:5000
```

Sign in with `admin` / `Admin@12345`. You get a working **user management module** — list with
filtering and pagination, create, edit, delete, login, logout — built through every layer so you
can read real code rather than a skeleton.

Or hit the API:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'
```

## Documentation

| Document | Read it for |
|---|---|
| **[PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md)** | **Where does this file go?** Every directory explained, the boot chain, the request lifecycle end to end |
| **[AGENTS.md](./AGENTS.md)** | **Driving this framework with an AI coding agent** — setup commands, hard rules, the exact sequence for adding a feature, and how to verify |
| **[TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md)** | **New to JavaScript?** A standalone practice course — 12 runnable chapters plus 39 self-checking exercises in `practice/`. Needs no database and no server. Start here |
| **[TUTORIAL-JS.md](./TUTORIAL-JS.md)** | **Coming from PHP?** JavaScript + Node essentials with runnable examples, the async model, and the 14 errors you'll actually hit |
| **[TUTORIAL.md](./TUTORIAL.md)** | Framework reference — databases, helpers, JWT, email, uploads, testing, Playwright, Postman, deployment, and a "gotchas" section covering nine real bugs found while building this |
| **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** | Complete CRUD walkthrough using **EJS templates** |
| **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)** | The same walkthrough using **React components (TSX)** |
| **[TUTORIAL-SOA.md](./TUTORIAL-SOA.md)** | Running as a **service** — graceful shutdown, health probes, correlation IDs, resilient service-to-service calls, Docker/Kubernetes |

A project uses **one** view engine. Pick it in `.env`, follow the matching walkthrough, and
delete the other tree with `node bin/forge.js clean --yes --ejs` (or `--tsx`).

## What you get

- **One codebase, two interfaces.** `APP_MODE=mvc | api | hybrid`. The same controller can
  render a page and return JSON.
- **Database-agnostic models.** Swap `DB_DRIVER` between `mysql`, `postgres`, and `mongodb`
  without touching model code. Adding a fourth database means writing one adapter file.
- **Pluggable views.** `VIEW_ENGINE=ejs | tsx` — classic templates, or type-safe React
  components server-rendered with no build step. Controllers are identical either way.
- **A code generator.** `node bin/forge.js make:scaffold Product` writes the model, both
  controllers, three views, and a migration.
- **Batteries included.** JWT, bcrypt, mailer with templates, uploads with magic-byte
  validation, pagination, role guards, rotating logs.
- **Tested.** 132 tests on `node:test` + supertest covering both route trees, both view engines,
  auth, sessions, validation, the Postman generator, and the service-layer primitives. `npm test`.
- **Playwright ready.** `npm run test:e2e` drives a real browser; `make:e2e` scaffolds specs.
- **Postman collections that don't drift.** `npm run postman` introspects the live Express
  router and emits a v2.1 collection with bearer auth and automatic token capture.
- **Service-ready.** Graceful shutdown with connection draining, `/health` + `/ready` probes,
  correlation IDs on every log line, and an HTTP client with timeouts, retries and circuit
  breakers for calling other services. Dockerfile included. See
  [TUTORIAL-SOA.md](./TUTORIAL-SOA.md).
- **A clean slate when you want one.** `node bin/forge.js clean --yes` strips the example back
  to a runnable skeleton, keeping the whole framework.
- **No magic.** Plain Express, plain `require()`. Routes are registered by hand so you can read
  `routes/web.js` and know every URL the app answers.

## Switching the big three

```ini
APP_MODE=hybrid     # mvc | api | hybrid
DB_DRIVER=mysql     # mysql | postgres | mongodb
VIEW_ENGINE=ejs     # ejs | tsx
```

Every combination works without changing a controller.

## Layout

```
core/       the framework      — you rarely edit this
app/        your application   — this is what you write
database/   migrations + seeds
tests/      unit, integration, e2e
templates/  code-generator templates
bin/        the forge CLI
practice/   the JavaScript course — standalone, safe to delete
storage/    runtime logs and uploads (gitignored)

server.js     starts the listener
bootstrap.js  builds the app without listening (so tests can drive it in-process)
```

The layering rule, and the reason `DB_DRIVER` is swappable at all:

```
route → middleware → controller → service → model → database
```

Controllers do HTTP only. **All SQL lives in models.** Services are for logic spanning more than
one model. Full walkthrough — including the request lifecycle end to end and a "where do I put
this?" table — in [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md).

## Learning JavaScript first

```bash
node practice/run-all.js      # 12 runnable chapters
node practice/exercises.js    # 39 self-checking exercises
```

No database or server needed. See [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md).

## Building with an AI agent

[AGENTS.md](./AGENTS.md) is the machine-facing spec: setup commands, the hard rules (all SQL in
models, `/api` mounted before `/`, CommonJS only), the exact sequence for adding a feature, the
`Model` and `respond()` APIs, a table of seven real bugs found while building this so an agent
does not rediscover them, and a verification checklist.

Point your agent kit at that file — or copy it into the kit's own instructions.

## Requirements

Node.js 18+, and one of MySQL 8+ / PostgreSQL 13+ / MongoDB 6+.
