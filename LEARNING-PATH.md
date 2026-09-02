# Learning Path — From JavaScript to Production Node

The complete curriculum for this repository, in the order it's worth reading. Fifteen documents,
grouped into five stages, with an honest note on what each one covers and what it deliberately
leaves to another.

Every document in the **Written** column exists now. The **Planned** table at the bottom lists
what would complete the set, so the gaps are visible rather than implied.

---

## How to use this

You do not read fifteen documents front to back. Pick your entry point:

| You are… | Start at | Then |
|---|---|---|
| New to JavaScript entirely | Stage 1 | Stage 2 → 3 |
| A PHP/Python/Java developer, new to Node | [TUTORIAL-JS.md](./TUTORIAL-JS.md) | Stage 2 → 3 |
| Comfortable with JS, new to this framework | [TUTORIAL.md](./TUTORIAL.md) + Stage 3 | Stage 4 |
| Fighting a specific bug | the **Symptom → cause → fix** table in the relevant doc | — |
| Preparing to ship | [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §21 checklist | Stage 4 |
| An AI agent working in this repo | [AGENTS.md](./AGENTS.md) | whichever doc the task touches |

Every tutorial ends with a **Symptom → cause → fix** table, an **Exercises** section, and a
**Cheat sheet**. When you're debugging rather than learning, go straight to the table.

---

## Stage 1 — The language

**Goal: write JavaScript without fighting it.**

### 1. [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) — the practice course
12 runnable chapters plus 39 self-checking exercises in `practice/`. No database, no server, no
framework. Values and types, arrays, objects, Map/Set, loops, functions, closures, arrow
functions, promises, strings and numbers, classes, errors, JSON/dates/regex, modules.

```bash
npm run practice
```

```bash
npm run practice:exercises
```

**Read it if** you're new to JavaScript, or your JS is self-taught and you suspect gaps.
**Skip it if** you can explain closures and `this` without hesitating.

### 2. [TUTORIAL-JS.md](./TUTORIAL-JS.md) — Node for PHP developers
The mental shift from process-per-request to one shared thread; modules and `require`; the
language essentials with the traps called out; how Express actually works; reading a stack trace;
and the 14 errors you will genuinely hit, with the fix for each.

**Read it if** you're coming from PHP, Python, Ruby or Java. It is the fastest route from "I can
read this" to "I can debug this".

### 3. [TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) — the language beyond the basics ★ new
Prototypes and what a `class` really is; the five `this` binding rules; property descriptors and
getters; private fields and brand checks; why `Object.freeze` is shallow; the iteration protocol;
generators (including the two-way channel); async generators; iterator helpers; Symbols; Proxy and
Reflect; `structuredClone` vs shallow vs JSON copying; WeakMap and collectable caches; floats,
money and 64-bit ids; coercion; dates and timezones; what `JSON.stringify` destroys; modern regex;
`Intl`; error subclassing with `cause`; and the Node 22+ syntax you can use today.

**Read it when** you can write the code but can't always explain someone else's. Everything is
verified against Node 24 — including which shiny APIs don't exist yet.

---

## Stage 2 — Async, properly

**Goal: stop being surprised.**

### 4. [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) — promises to production ★ new
From callbacks and their three specific failures, through what a Promise *is* (three states, four
properties, eager not lazy), `then`/`catch`/`finally`, chaining, `async`/`await`, when each
belongs on a function or a value, the forgotten `await` and its five symptoms, the microtask
queue, error handling, unhandled rejections, the Express 4 vanishing-error trap, fire-and-forget,
the four combinators, loop patterns, concurrency limits, timeouts — and the framework's own async
patterns.

**Read it before** anything in Stage 3. Every remaining stage assumes it.

### 5. [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) — the machine ★ new
The parts of Node that aren't JavaScript. The six event-loop phases; timers as a floor not a
promise; what blocking costs (measured); handles and why your process won't exit; module
resolution, the singleton cache, and circular requires; CJS/ESM interop; EventEmitter's
synchronous nature and the `error`-event trap; Buffers; streams and backpressure; worker threads,
child processes and cluster; `process`, signals and paths; AsyncLocalStorage; and reading
`memoryUsage()`.

**Read it when** something behaves impossibly — a hung test run, a leak, a process that won't
die.

---

## Stage 3 — The framework

**Goal: build the thing.**

### 6. [PROJECT-STRUCTURE.md](./PROJECT-STRUCTURE.md) — where files go
Every directory explained, the three-file boot chain, why mount order matters, and a "where do I
put…?" table.

### 7. [TUTORIAL.md](./TUTORIAL.md) — the framework reference
Quick start, the CLI generator, models, switching database driver, controllers and the dual-mode
`respond()` trick, the two route trees, views and layouts, middleware, validation, sessions and
JWT, helpers, email, uploads, a feature end to end, testing, Playwright, Postman, `clean`,
deployment, and 22 gotchas.

**This is the one you'll keep open** while building.

### 8. [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) / [TUTORIAL-TSX.md](./TUTORIAL-TSX.md) — pick one
The same complete CRUD walkthrough, twice: once with EJS templates, once with React/TSX. A project
uses one view engine — set `VIEW_ENGINE` and read the matching document.

### 8b. [TUTORIAL-CRUD.md](./TUTORIAL-CRUD.md) — add your own resource ★ new
The two documents above are annotated tours of the bundled Users example, web tree only. This one
builds a *new* resource from an empty table in twelve steps, wired into **both** route trees —
migration, model, validators, both controllers, routes, views — then verifies it with curl and 20
integration tests. Includes the three failures you will hit on the first test run.

---

## Stage 4 — Production

**Goal: ship it without regretting it.**

### 9. [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) — proving it works ★ new
`node:test` with no framework installed: the runner, the API, assertions, hooks. Then this repo's
harness in depth — why `env.js` must be required first, what `db.js` does, and what the STATEFUL
list in `testApp.js` protects against. Writing model, API and web-tree tests (sessions + CSRF),
error-path tests, `mock.fn`/`mock.method`, faking timers, faking HTTP at the boundary, coverage,
Playwright, and diagnosing a hung or flaky run.

### 10. [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) — the audit ★ new
The threat model in one page; validation and mass assignment; what the model layer protects
against SQL injection **and the identifier hole it doesn't**; NoSQL operator injection; XSS in
both view engines; passwords, sessions, JWT; IDOR and object-level authorisation; CSRF's four
exemptions; rate limiting behind a proxy; CORS; the CSP that ships switched off; uploads; secrets;
log hygiene; dependencies; SSRF; single-thread DoS. Ends with a pre-launch checklist.

### 11. [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) — measure, then fix ★ new
The four things that are actually slow, in order. N+1 queries (61ms → 1ms, measured); indexes and
reading `EXPLAIN`; why `search`'s leading wildcard is 68× slower; why `OFFSET` pagination degrades
from 1ms to 69ms and what keyset pagination does about it; the connection pool as your real
concurrency limit; parallelism; blocking; streaming; caching in the right order; the CPU profiler;
event-loop lag as a metric; leak hunting; load testing.

### 12. [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) — running as a service
Graceful shutdown and connection draining, health vs readiness probes, correlation IDs and
joinable logs, resilient service-to-service calls with timeouts/retries/circuit breakers, essential
vs incidental dependencies, CORS, rate limiting, Docker, Kubernetes, and how to split into
services later.

---

## Stage 5 — Working with agents

### 13. [AGENTS.md](./AGENTS.md) — the agent contract
The instruction set for an AI coding agent in this repo: hard rules with the concrete breakage
each one prevents, the CLI generators, the APIs you'll actually use, the exact sequence for adding
a feature, how to verify, and the environment gotchas that cost real debugging time.
[CLAUDE.md](./CLAUDE.md) just points here, so there's one source of truth.

**Read it even if you're human.** The hard-rules section is the most concentrated description of
why this codebase is shaped the way it is.

---

## Reading order at a glance

```
Stage 1  JS-ESSENTIALS ──► JS ──► JS-ADVANCED
                                      │
Stage 2  ASYNC ──► NODE-RUNTIME ◄─────┘
            │
Stage 3  PROJECT-STRUCTURE ──► TUTORIAL ──► EJS or TSX ──► CRUD
            │
Stage 4  TESTING ──► SECURITY ──► PERFORMANCE ──► SOA
            │
Stage 5  AGENTS
```

Minimum viable path if you're in a hurry and already know JavaScript:
**TUTORIAL → CRUD → ASYNC → TESTING → SECURITY §21**.

---

## Planned — the gaps

These are the documents that would complete the curriculum. Listed with what each would cover, so
the omission is deliberate rather than invisible. Nothing below exists yet.

| Planned document | Would cover | Why it matters |
|---|---|---|
| **TUTORIAL-DATA.md** | Schema design, migration discipline (forward-only, reversible, zero-downtime column changes), transactions and isolation levels, composite index design, the three adapters' real differences, modelling for MySQL vs Mongo | Migrations and transactions are the two places this framework currently leaves most to you — there is no transaction helper in `core/` at all |
| **TUTORIAL-HTTP.md** | Method and status semantics, headers, cookie attributes, content negotiation, conditional requests and `ETag`, caching, ranges and resumable downloads, multipart, keep-alive | `respond()` hides HTTP until the day it doesn't |
| **TUTORIAL-AUTH.md** | Sessions vs JWT as an architectural choice, refresh-token rotation, OAuth2/OIDC as a client, RBAC vs ABAC, password reset and email verification flows done safely, MFA, API keys for service callers | The framework ships both auth styles; choosing and extending them is unwritten |
| **TUTORIAL-DEBUGGING.md** | The Node inspector and real breakpoints, conditional and logpoints, reading a minified/TSX stack trace, source maps, structured-log forensics with correlation IDs, `--trace-*` flags, post-mortem with core dumps | Currently spread thin across [TUTORIAL-JS.md](./TUTORIAL-JS.md) §17 and the runtime doc |
| **TUTORIAL-TS.md** | Typing the TSX views properly, JSDoc-typed CommonJS for `core/` and `app/` without a build step, `tsconfig` explained, typing `Model` statics and `respond()`, gradual adoption strategy | `npm run type-check` exists and only covers `.tsx`; the JS side is untyped |
| **TUTORIAL-BROWSER-JS.md** | Progressive enhancement over server-rendered HTML, `fetch` with CSRF headers, forms and validation UX, event delegation, `<template>`, the bits of the DOM API that matter, when *not* to add a framework | `public/js` is the one layer with no guidance at all |
| **TUTORIAL-OPS.md** | Dockerfile and image hygiene, `npm ci` in CI, GitHub Actions for this suite, migrations on deploy, blue/green and rolling releases, log aggregation, metrics and alerting, on-call basics | [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) §9–10 starts this; it stops at the manifest |
| **TUTORIAL-PATTERNS.md** | When a service module earns its place, error taxonomy design, the repository question, background jobs and queues, idempotency keys, feature flags, keeping magic out (why no DI container) | The layering rule is stated in [AGENTS.md](./AGENTS.md) but never argued |

---

| | |
|---|---|
| [README.md](./README.md) | project overview and the same document map, shorter |
| [AGENTS.md](./AGENTS.md) | the rules that shape all of the above |
