# Performance — Measure, Then Fix

How to find out why a Forge MVC app is slow, and what to do about it. Ordered by how much
difference each thing actually makes, which is roughly the reverse of the order people try them.

Every number below was **measured on this repo** — Node v24.11.1, MySQL 8 on localhost, the real
`users` table and the real `core/db` pool, against the test database. Your absolute numbers will
differ; the ratios are the point.

**Read** [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3 first. On one thread, "slow"
and "slow for everybody" are the same problem, and that changes which fixes matter.

---

## Contents

**Part 1 — Discipline**
1. [Measure first, and measure the right thing](#1-measure-first-and-measure-the-right-thing)
2. [The four things that are actually slow](#2-the-four-things-that-are-actually-slow)

**Part 2 — Database (where the time usually is)**

3. [N+1 queries — 61ms vs 1ms, measured](#3-n1-queries--61ms-vs-1ms-measured)
4. [Indexes, and reading `EXPLAIN`](#4-indexes-and-reading-explain)
5. [⚠️ `search` uses a leading wildcard — 68× slower](#5-️-search-uses-a-leading-wildcard--68-slower)
6. [⚠️ `OFFSET` pagination degrades — 1ms to 69ms](#6-️-offset-pagination-degrades--1ms-to-69ms)
7. [The connection pool is your real concurrency limit](#7-the-connection-pool-is-your-real-concurrency-limit)
8. [`SELECT *`, `COUNT(*)`, and other small wins](#8-select--count-and-other-small-wins)

**Part 3 — The application**

9. [Parallelise independent work](#9-parallelise-independent-work)
10. [Never block the event loop](#10-never-block-the-event-loop)
11. [Stream large responses](#11-stream-large-responses)
12. [Caching, in the order you should try it](#12-caching-in-the-order-you-should-try-it)
13. [Views and payloads](#13-views-and-payloads)

**Part 4 — Tools**

14. [Timing a request end to end](#14-timing-a-request-end-to-end)
15. [The CPU profiler](#15-the-cpu-profiler)
16. [Event-loop lag as a health metric](#16-event-loop-lag-as-a-health-metric)
17. [Memory leaks](#17-memory-leaks)
18. [Load testing](#18-load-testing)

**Part 5 — Reference**

19. [Symptom → cause → fix](#19-symptom--cause--fix)
20. [Exercises](#20-exercises)
21. [Cheat sheet](#21-cheat-sheet)

---

# Part 1 — Discipline

## 1. Measure first, and measure the right thing

Almost every performance change made without a measurement is either neutral or a regression that
also costs readability. The rule is boring and non-negotiable: **reproduce, measure, change one
thing, measure again.**

Two specific traps in a Node web app:

**The slow endpoint is often not the problem.** If a handler blocks the event loop for 600ms,
*other* requests get slower and the blocking one looks fine
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3 measured a 590ms delay inflicted on an
unrelated timer). Always look at p95/p99 across all endpoints, not the average of one.

**Averages hide everything.** A p50 of 40ms with a p99 of 4s is a broken application, and the
mean will read ~80ms and look fine. Measure percentiles.

What "good" looks like for a server-rendered CRUD app on modest hardware: p95 under 200ms for a
list page, under 100ms for a detail page, and a query count per request in the low single digits.
If you're outside that, §3 is almost certainly why.

---

## 2. The four things that are actually slow

In ten years of Node web apps, essentially all real slowness is one of these four:

| # | Cause | Typical size of the win | Section |
|---|---|---|---|
| 1 | **Too many queries** (N+1) | 10–60× | §3 |
| 2 | **Missing index / unindexable query** | 10–100× | §4, §5 |
| 3 | **Sequential awaits** on independent work | 2–5× | §9 |
| 4 | **Blocking the event loop** | fixes *everyone else's* latency | §10 |

Things that are almost never the problem, and that people try first: switching JSON libraries,
micro-optimising a `.map`, replacing Express, upgrading Node for speed, adding a cache in front of
a query that would be fast with an index.

Fix in order. A cache in front of an N+1 is a faster N+1 that is now also stale.

---

# Part 2 — Database (where the time usually is)

## 3. N+1 queries — 61ms vs 1ms, measured

The N+1 is the single most common performance defect in every ORM-shaped codebase. You fetch a
list, then loop it and fetch something per row.

**Measured** on this repo — fetching 100 rows from a 20,000-row table, three ways:

| Approach | Time | Round trips |
|---|---|---|
| `for (const id of ids) await User.findById(id)` | **61ms** | 100, sequential |
| `await Promise.all(ids.map((id) => User.findById(id)))` | **31ms** | 100, concurrent |
| `SELECT * FROM users WHERE id IN (?, ?, …)` | **1ms** | **1** |

Read those numbers carefully, because the middle row is the trap. `Promise.all` halves the time
and feels like a fix — but it is still 100 round trips, still 100 pool checkouts, and it degrades
with row count exactly as badly. **The fix is one query, not concurrent queries.**

```js
// ❌ N+1: one query for the list, then one per row
const invoices = await Invoice.find({ status: 'open' });
for (const inv of invoices) {
  inv.customer = await Customer.findById(inv.customer_id);   // ← N more queries
}

// ✅ Two queries total, regardless of N
const invoices = await Invoice.find({ status: 'open' });
const customers = await Customer.findByIds([...new Set(invoices.map((i) => i.customer_id))]);
const byId = new Map(customers.map((c) => [c.id, c]));
for (const inv of invoices) inv.customer = byId.get(inv.customer_id);
```

The `findByIds` belongs in the model, per rule 1 in [AGENTS.md](./AGENTS.md):

```js
static async findByIds(ids) {
  if (!ids.length) return [];                        // ← IN () is a syntax error; guard it
  const placeholders = ids.map(() => '?').join(',');
  return this.raw(`SELECT * FROM ${this.table} WHERE id IN (${placeholders})`, ids);
}
```

Note that `ids.map(() => '?')` builds *placeholders*, not values — the ids still go through
`params`, so this stays parameterised ([TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §3).

**How to find your N+1s:** log every query with a count per request. If a list page runs 1 + N
queries, you'll see it immediately.

```js
// core/db/mysql.js — temporary instrumentation, dev only
async function query(sql, params) {
  const t = Date.now();
  const [rows] = await pool.query(sql, params);
  logger.debug(`${Date.now() - t}ms  ${sql.slice(0, 120)}`);
  return rows;
}
```

Because every log line already carries the request id (`core/context.js`), grouping by
`requestId` gives you the query count per request for free.

---

## 4. Indexes, and reading `EXPLAIN`

An index is the difference between reading one row and reading every row. **Measured** on a
200,000-row table, with `EXPLAIN` beside each:

| Query | `EXPLAIN type` | key | est. rows | actual | Time |
|---|---|---|---|---|---|
| `username = 'user0000042'` | `const` | `username` | 1 | 1 | **2ms** |
| `username LIKE 'user000004%'` | `range` | `username` | 10 | 10 | **1ms** |
| `username LIKE '%000004%'` | `index` | `username` | **200000** | 11 | **68ms** |

Everything you need to read `EXPLAIN` is in that table:

- **`type`** tells you the access method. Best to worst: `const`/`eq_ref` → `ref` → `range` →
  `index` (scan the whole index) → `ALL` (scan the whole table). **`index` and `ALL` on a big
  table are your bug.**
- **`key`** is the index chosen. `NULL` means none was usable.
- **`rows`** is how many the optimiser expects to examine. Compare it to how many you expect back.
  200,000 examined to return 11 is the whole story of that third row.

```sql
EXPLAIN SELECT * FROM products WHERE status = 'active' ORDER BY created_at DESC LIMIT 20;
```

What to index, in this framework specifically:

- **Every column in a `where` you pass to a model.** `Model.find({ status })` is only fast if
  `status` is indexed — the shipped `users` table has `KEY idx_users_status (status)` for exactly
  this reason.
- **Every foreign key.** `invoice.customer_id` — the FK constraint doesn't always create the index
  you need for the join.
- **The `orderBy` column**, ideally as a composite with the filter: `(status, created_at)` serves
  `WHERE status = ? ORDER BY created_at` from one index.
- **Every column in `Model.searchable`** — with the large caveat in §5.

What *not* to do: index every column. Each index slows every write and costs storage. Index for
the queries you actually run, and drop the ones `EXPLAIN` shows are never chosen.

A composite index is usable **left to right**: `(status, created_at)` helps `WHERE status`, and
`WHERE status AND created_at`, but not `WHERE created_at` alone.

---

## 5. ⚠️ `search` uses a leading wildcard — 68× slower

`Model.paginate({ search })` is documented as a "case-insensitive contains-match", and the MySQL
adapter implements it as:

```js
const ors = search.fields.map((f) => `\`${f}\` LIKE ? ESCAPE '\\\\'`);
search.fields.forEach(() => params.push(`%${escapeLike(search.term)}%`));
```

That leading `%` is correct for the feature and **fatal for the index**. A B-tree index is sorted
by prefix, so `LIKE 'abc%'` can seek; `LIKE '%abc%'` cannot, ever, on any database.

**Measured** on 200,000 rows, from the table in §4: the prefix match ran in **1ms** examining
**10** rows; the contains match ran in **68ms** examining **200,000**. Same column, same index,
68× the latency — and it grows linearly with your table while the prefix version stays flat.

This is fine at 10,000 rows and a problem at 1,000,000. Your options, in ascending order of
effort:

1. **Prefix search** — drop the leading `%`. Often what users actually want from an
   autocomplete, and it uses the index. Add a `searchPrefix` alongside `searchFor` in your model.
2. **A full-text index** — the right answer for real text search within one database:

```sql
ALTER TABLE products ADD FULLTEXT INDEX ft_products_name (name, description);
```

```js
static async searchFullText(term, { limit = 20 } = {}) {
  return this.raw(
    `SELECT *, MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
       FROM ${this.table}
      WHERE MATCH(name, description) AGAINST (? IN NATURAL LANGUAGE MODE)
      ORDER BY score DESC LIMIT ?`,
    [term, term, limit],
  );
}
```

3. **A dedicated search engine** (Meilisearch, Typesense, Elasticsearch) once search is a
   first-class feature with facets and ranking. Note the cost: a second datastore to keep in sync.

Whatever you choose, **enforce a minimum term length** (2–3 characters) and always pass a
`LIMIT`. A one-character contains-search over a large table is a free denial of service
([TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) §20).

Postgres users: `ILIKE '%x%'` has the same problem, but a `pg_trgm` GIN index *can* accelerate it
— which is a real reason to prefer Postgres if contains-search matters to you.

---

## 6. ⚠️ `OFFSET` pagination degrades — 1ms to 69ms

`Model.paginate` is offset-based: `LIMIT size OFFSET (page - 1) * size`. The database has to walk
and discard every skipped row, so cost grows with page number.

**Measured** on 200,000 rows, `pageSize: 20`:

| Page | Offset | Time |
|---|---|---|
| 1 | 0 | **1ms** |
| 100 | 1,980 | **1ms** |
| 1,000 | 19,980 | **9ms** |
| 5,000 | 99,980 | **37ms** |
| 10,000 | 199,980 | **69ms** |

And the same final page fetched by **keyset** (a.k.a. cursor) pagination:

```js
await db.query('SELECT * FROM users WHERE id > ? ORDER BY id LIMIT 20', [lastSeenId]);
```

**1ms.** Sixty-nine times faster, and — the important part — **flat**: page 10,000 costs the same
as page 1, because the index seeks straight to the position instead of counting to it.

`Model.paginate({ page: 9000 })` measured **76ms** on the same data, which is the offset cost plus
the `COUNT(*)` (§8) running in parallel.

**When offset pagination is fine:** an admin screen where nobody goes past page 20. That is most
screens, and it is why the framework ships it — page numbers are what a human UI wants.

**When you need keyset:** infinite scroll, an API that pages through everything, a data export, or
any table where "page 5,000" is reachable. Add it to the model rather than replacing `paginate`:

```js
static async pageAfter({ afterId = 0, pageSize = 20, where = {} } = {}) {
  const rows = await this.find({ ...where }, {
    limit: pageSize + 1,                     // one extra row tells you if there's a next page
    orderBy: 'id ASC',
  });
  // (for a real implementation, push `id > afterId` into the WHERE via a raw query)
  return { rows: rows.slice(0, pageSize), nextCursor: rows[pageSize]?.id ?? null };
}
```

Two constraints keyset brings: you must order by something **unique and monotonic** (the primary
key, or `(created_at, id)` as a tiebreak), and you cannot jump to an arbitrary page number — only
next/previous. That trade is exactly why both styles exist.

Also, for export-style paging over everything, an async generator plus streaming beats both
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §14).

---

## 7. The connection pool is your real concurrency limit

`core/db/mysql.js` creates the pool with `connectionLimit: 10`. That number, not your code, sets
how many queries can actually be in flight.

**Measured** — 500 queries of `SELECT SLEEP(0.01)` (10ms each), three dispatch strategies:

| Strategy | Time |
|---|---|
| `Promise.all` — all 500 at once | **851ms** |
| `mapLimit(jobs, 10, …)` — 10 at a time | **849ms** |
| sequential (measured over 50, extrapolated ×10) | ~**8,350ms** |

The finding worth internalising: **`Promise.all` and `mapLimit(10)` are identical**, because the
pool serialises at 10 either way. Firing 500 concurrent queries does not make the database do 500
things — it makes 490 promises sit in the pool's queue.

So:

- **Parallel beats sequential by ~10×** here — which is the pool size. That's the win from §9.
- **Concurrency beyond the pool size buys nothing.** It costs queue depth, memory, and the risk of
  a connection-acquisition timeout that surfaces as a mysterious 500 under load.
- **`mapLimit` still earns its place** ([TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §20) when the
  work isn't database-bound — external APIs, file processing, anything with its own rate limit.

Sizing the pool: it is a *shared* budget across all concurrent requests, so `connectionLimit: 10`
with 3 queries per request supports ~3 concurrent requests before queueing. Raise it toward your
database's `max_connections` divided by the number of app instances — and remember every replica
has its own pool. Ten replicas × 10 connections = 100 connections at the database.

Watch for `queueLimit: 0` (unlimited queue) in the current config: under overload, requests queue
forever rather than failing fast. A bounded queue plus a fast 503 is usually better behaviour.

---

## 8. `SELECT *`, `COUNT(*)`, and other small wins

Real but small — do these after §3–§7, not before.

**Measured**, 5,000 rows from the `users` table:

| Query | Time |
|---|---|
| `SELECT * FROM users LIMIT 5000` | **7ms** |
| `SELECT id, username FROM users LIMIT 5000` | **4ms** |

Naming columns is ~40% faster here, and the gap widens with wide rows and `TEXT`/`BLOB` columns.
It is also a **security** improvement — `SELECT *` on `users` pulls the password hash into your
process, which is the whole reason `User.publicFields()` exists.

**`COUNT(*)` is not free.** Measured on 20,000 rows: `COUNT(*)` took **6ms** against **1ms** for
the `LIMIT 20` page. On millions of rows an exact InnoDB count is a full index scan. `paginate`
already runs the two in parallel (`Promise.all`, [core/Model.js:59](core/Model.js:59)), so you pay
the slower of the two rather than the sum — good design. But if you need "page 1 of ~2,000" on a
huge table, consider dropping the exact total: fetch `pageSize + 1` rows to learn whether a next
page exists, and show "next/previous" instead of a total. That is one query instead of two.

Other cheap wins, roughly in order of value:

- **Batch inserts.** The benchmark above seeded 20,000 rows in **438ms** using 1,000-row
  multi-value `INSERT`s. Row-at-a-time would be 20,000 round trips.
- **`dateStrings: true`** is already set in the pool config, avoiding a `Date` parse per column.
- **Only `JSON.parse` what you need**; don't round-trip a payload to copy it
  ([TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §12).
- **Add `LIMIT` to every list query.** An unbounded `find()` is a table scan waiting for your
  table to grow.

---

# Part 3 — The application

## 9. Parallelise independent work

Covered fully in [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §17; the performance summary is that
sequential awaits on independent work multiply latency, and the fix is free.

```js
// ❌ 2 round trips, back to back
const products = await Product.paginate({ page });
const categories = await Category.find({ status: 'active' });

// ✅ both in flight at once
const [products, categories] = await Promise.all([
  Product.paginate({ page }),
  Category.find({ status: 'active' }),
]);
```

Measured evidence for the shape of the win: 3 × 100ms sequential took **334ms**, the same three in
`Promise.all` took **112ms** ([TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §17); and 100 real queries
went from 61ms sequential to 31ms concurrent (§3).

Two caveats from §7 and §3 respectively: the pool caps the real concurrency at 10, and *fewer
queries still beats concurrent queries*. Parallelise what you cannot merge.

---

## 10. Never block the event loop

The one performance problem that hurts users who aren't even making the slow request.
[TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3 has the measurement — 600ms of CPU work
delayed an unrelated 10ms timer by **590ms**, and moving it to a `Worker` brought that to **4ms**.

The checklist, most common first:

| Blocking | Fix |
|---|---|
| `readFileSync` / `writeFileSync` in a handler | `fs/promises`, or stream (§11) |
| `JSON.parse` on a multi-MB body | cap the body size — `express.json({ limit: '100kb' })` |
| `bcrypt.hashSync` | the async API (already used in `core/helpers/hash.js`) |
| `zlib.gzipSync`, `crypto.pbkdf2Sync` | the async forms |
| Sorting/filtering 100k rows in JS | do it in SQL — `ORDER BY`, `WHERE`, `LIMIT` |
| Rendering a 5,000-row table | paginate |
| A regex with catastrophic backtracking | fix the pattern ([TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) §18) |
| Genuine CPU work (image resize, PDF, crypto) | `Worker`, or a separate service |

The tell in production is event-loop lag (§16) rising while CPU is high and the database is idle.

---

## 11. Stream large responses

**Measured** ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §12) on a 19.1 MB file:
`readFile` peaked at **+19.2 MB** of heap; streaming the same file peaked at **+1.1 MB**.

Multiply by concurrent requests to see why it matters: 50 simultaneous report downloads is ~1 GB
of heap the first way and ~50 MB the second. The first one gets your container OOM-killed.

```js
const { pipeline } = require('node:stream/promises');

exports.export = async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    await pipeline(Readable.from(productRows()), res);    // async generator → constant memory
    return undefined;
  } catch (err) {
    return next(err);
  }
};
```

Streaming also improves *perceived* performance: time-to-first-byte drops to nearly zero because
the client starts receiving while you're still generating.

And enable compression for text responses — HTML, JSON and CSV typically shrink 70–80%:

```js
app.use(require('compression')());     // before your routes
```

⚠️ Compression is CPU work on the main thread (§10). It is a clear win for text, a waste for
already-compressed bytes (images, PDFs, zips), and best done at the proxy if you have one.

---

## 12. Caching, in the order you should try it

Caching is the last resort, not the first, because every cache introduces staleness and a new
class of bug. Work down this list:

**1. Don't compute it.** The best cache is a query you no longer run — see §3.

**2. HTTP caching.** Free, and it means the request never reaches you:

```js
res.set('Cache-Control', 'public, max-age=31536000, immutable');   // hashed static assets
res.set('Cache-Control', 'private, no-cache');                     // authenticated HTML
```

`ETag` is on by default in Express, so an unchanged response becomes a cheap 304.

**3. In-process memoisation** for small, hot, rarely-changing data — a settings row, a category
list. ⚠️ Two rules, both from [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §6 and §21: a
module-level cache is **per process**, so N replicas means N caches with N different views; and it
must be **bounded**, or it is a memory leak:

```js
let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

async function activeCategories() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  cached = await Category.find({ status: 'active' });
  cachedAt = Date.now();
  return cached;
}
```

**4. A shared cache (Redis)** when you have more than one instance, or the data is big enough to
matter. `SESSION_STORE=redis` already proves the connection works.

**5. Materialise it.** A counter column updated on write beats `COUNT(*)` on every read.

Whatever you cache: decide the invalidation rule *before* you write the cache, and prefer a short
TTL over clever invalidation. "Stale for 60 seconds" is a specification; "invalidated whenever
something changes" is a bug report waiting to happen.

---

## 13. Views and payloads

**Server-rendered (EJS/TSX):** the dominant cost is almost always the data, not the rendering. Two
exceptions worth knowing: a template that renders thousands of rows (paginate instead), and a
partial included inside a loop (hoist the work out).

**JSON APIs:** send what the client needs and nothing more.

```js
// ❌ the whole row, including columns the client ignores — and possibly shouldn't see
return respond(req, res, { data: { users: rows } });

// ✅ an explicit shape; also the security boundary
return respond(req, res, { data: { users: rows.map(User.publicFields) } });
```

Note `rows.map(User.publicFields)` works precisely because `publicFields` is **not** `async`
([TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §9) — an async version would need `Promise.all` and a
tick per row.

For the browser side: hashed asset filenames with a one-year `max-age` (§12), and don't ship a
framework to a server-rendered page that needs 20 lines of JavaScript.

---

# Part 4 — Tools

## 14. Timing a request end to end

Start at the outside and narrow down. This tells you *which layer* to profile, which is the
question worth answering first.

```bash
curl -s -o /dev/null -w "dns:%{time_namelookup} connect:%{time_connect} ttfb:%{time_starttransfer} total:%{time_total}\n" http://localhost:5000/users
```

If `ttfb` is the whole time, the server is slow. If `total - ttfb` is large, it's payload size or
the network (§11).

Then instrument inside. Because every log line already carries the request id
(`core/context.js`), timings from different layers stitch together automatically:

```js
const t = Date.now();
const { rows, meta } = await Product.paginate({ page });
logger.debug(`paginate ${Date.now() - t}ms`);
```

For a permanent version, log the total per request in middleware:

```js
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
});
```

`process.hrtime.bigint()` rather than `Date.now()` for durations: monotonic, nanosecond
resolution, and immune to a clock adjustment mid-request.

---

## 15. The CPU profiler

When you know the time is in your JavaScript and not the database, sample it.

```bash
node --cpu-prof --cpu-prof-dir=./storage/profiles server.js
```

Exercise the slow path, stop the server, and open the `.cpuprofile` in Chrome DevTools →
Performance → Load profile. Read it **bottom-up**: the functions with high *self* time are where
the CPU actually went, as opposed to high *total* time, which just means "called something slow".

For a live process, no restart required:

```bash
node --inspect server.js
```

Open `chrome://inspect`, attach, and use the Performance tab. You can also take a heap snapshot
from the same session (§17).

What you're looking for: a single function with dominant self time (usually a serialiser, a
template loop, or a regex), or a flat profile that means the time isn't in CPU at all — in which
case it's the database (§3) or an outbound call, and you should go back to §14.

---

## 16. Event-loop lag as a health metric

The single best number for "is this process healthy". Lag is how long a task waits before the loop
gets to it — so it measures blocking (§10) directly, and it's cheap enough to export continuously.

```js
const { monitorEventLoopDelay } = require('node:perf_hooks');

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  logger.info(`loop lag p50=${(h.percentile(50) / 1e6).toFixed(1)}ms p99=${(h.percentile(99) / 1e6).toFixed(1)}ms`);
  h.reset();
}, 30_000).unref();     // ⚠️ unref, or this keeps the process alive
```

Rough reading: p99 under 20ms is healthy; 100ms+ means something is blocking; seconds means a
CPU-bound handler and every user is feeling it.

This is a good candidate to expose through the readiness surface in
[TUTORIAL-SOA.md](./TUTORIAL-SOA.md) §3 — though prefer *reporting* it to *failing* on it: a
restart loop triggered by a load spike makes things worse.

That `.unref()` is not optional — see [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §4.

---

## 17. Memory leaks

A leak looks like `heapUsed` trending up across a load test and **not** coming back down after it
stops. Growth during load is normal; GC is lazy on purpose.

```js
const { rss, heapUsed } = process.memoryUsage();
```

Diagnosis, which is genuinely mechanical:

1. `node --inspect server.js`, attach Chrome DevTools → Memory.
2. Take a heap snapshot at idle.
3. Run the load.
4. Snapshot again, and use **Comparison** view.
5. Sort by delta. The constructor whose count grows and never falls is your leak; the retainers
   panel tells you what's holding it.

The usual causes in this framework, all previously covered:

| Cause | Section |
|---|---|
| A module-level `Map`/array cache with no eviction | §12, [runtime](./TUTORIAL-NODE-RUNTIME.md) §6 |
| Listeners added per request, never removed (watch for the 11-listener warning) | [runtime](./TUTORIAL-NODE-RUNTIME.md) §10 |
| A closure captured by a long-lived timer, holding a whole request alive | [runtime](./TUTORIAL-NODE-RUNTIME.md) §21 |
| `readFile` of large files under concurrency (not a leak, but the same symptom) | §11 |

---

## 18. Load testing

You cannot find a concurrency problem with `curl`. Pool exhaustion (§7), event-loop lag (§16) and
memory growth (§17) only appear under load.

```bash
npx autocannon -c 50 -d 30 http://localhost:5000/users
```

That's 50 connections for 30 seconds. Read the **p97.5/p99 latency** and the error count, not the
requests-per-second headline.

Method that produces usable answers:

1. **Load-test against production-like data**, not an empty table. Every measurement in this
   document changed shape between 20,000 and 200,000 rows.
2. **Use the test database**, never production.
3. **Warm up first** — the first requests pay for the pool and the JIT.
4. **Change one thing**, re-run, compare. Add an index, re-run. Fix the N+1, re-run.
5. **Watch the server**, not just the client: loop lag, `heapUsed`, and the database's own slow
   query log.
6. **Find the knee** — increase concurrency until latency degrades non-linearly. That number is
   your capacity per instance, and it's what you need for capacity planning.

For authenticated endpoints, get a token first
([TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) §11) and pass it:

```bash
npx autocannon -c 50 -d 30 -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/products
```

---

# Part 5 — Reference

## 19. Symptom → cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| A list page is slow, each query is fast | N+1 — 1 + N queries | one `IN` query (§3) |
| Slowness grows linearly with row count | missing index, or an unindexable query | `EXPLAIN`; look for `type=ALL`/`index` (§4) |
| Search is fast on dev, slow in production | `LIKE '%term%'` cannot use an index | prefix search or full-text (§5) |
| Page 1 fast, page 500 slow | `OFFSET` walks and discards | keyset pagination (§6) |
| Requests queue under load; DB looks idle | pool exhausted at `connectionLimit: 10` | raise the pool, or use fewer queries per request (§7) |
| Everything gets slower when one endpoint is hit | that endpoint blocks the event loop | measure loop lag; move CPU work off-thread (§10, §16) |
| Out of memory serving downloads | `readFile` per request | stream (§11) |
| Endpoint is 3× slower than the sum of its parts | sequential awaits on independent work | `Promise.all` (§9) |
| p50 fine, p99 terrible | blocking, GC pauses, or pool queueing | loop lag + pool metrics (§7, §16) |
| Memory grows and never recovers | unbounded cache or leaked listener | heap snapshot comparison (§17) |
| Fast locally, slow in production | data volume, network hops, cold cache, 1 replica | load-test with production-like data (§18) |
| A cache made it *worse* | caching in front of an N+1 or a missing index | fix §3/§4 first (§12) |
| `COUNT(*)` dominates a list page | exact totals on a large table | drop the total; fetch `pageSize + 1` (§8) |

---

## 20. Exercises

1. Add query logging to `core/db/mysql.js`, load a list page, and count the queries per
   `requestId`. Is it 1 + N? (§3)

2. Build a 200,000-row table and reproduce the §4 table: `=`, `LIKE 'x%'`, `LIKE '%x%'`, with
   `EXPLAIN` for each. Explain the `type` value in each case. (§4, §5)

3. Time `Model.paginate` at page 1, 100, 1,000 and 10,000. Plot it. Then implement `pageAfter`
   and time the deepest page again. (§6)

4. Run 500 queries three ways — sequential, `Promise.all`, `mapLimit(10)`. Explain why the last
   two are the same. Then raise `connectionLimit` to 50 and re-run. (§7)

5. Add a 500ms busy loop to one endpoint. With `autocannon` hitting `/health`, watch p99 and
   event-loop lag. Move the work to a `Worker` and repeat. (§10, §16, §18)

6. Export 100,000 rows as CSV two ways — build the whole string, then stream via an async
   generator. Compare peak `heapUsed` under 5 concurrent downloads. (§11)

7. Cache the active-category list with a 60s TTL. Now run two instances and explain what a user
   sees for up to 60 seconds after an edit. (§12)

8. Profile with `--cpu-prof` while hitting your slowest endpoint. Which function has the highest
   *self* time? Is it even yours? (§15)

---

## 21. Cheat sheet

```
Fix in this order — the ratios are measured on this repo:
  1. N+1 queries         100 rows: 61ms sequential → 31ms Promise.all → 1ms one IN query
  2. Indexes             200k rows: `=` 2ms · LIKE 'x%' 1ms · LIKE '%x%' 68ms
  3. Deep OFFSET         page 1: 1ms → page 10,000: 69ms → keyset: 1ms
  4. Sequential awaits   3×100ms: 334ms → 112ms with Promise.all
  5. Blocking the loop   600ms of CPU delayed an unrelated 10ms timer by 590ms
  6. Streaming           19 MB file: +19.2 MB heap (readFile) vs +1.1 MB (stream)
  7. Small stuff         SELECT * 7ms vs named columns 4ms · COUNT(*) 6ms vs LIMIT 20 1ms
  8. Caching             last, and only with a stated invalidation rule
```

```sql
EXPLAIN SELECT …;     -- type: const/eq_ref > ref > range > index > ALL
                      -- key: NULL means no index used
                      -- rows: examined; compare to rows returned
```

```bash
curl -w "ttfb:%{time_starttransfer} total:%{time_total}\n" -o /dev/null -s URL
node --cpu-prof --cpu-prof-dir=./storage/profiles server.js   # → Chrome DevTools, read self time
node --inspect server.js                                      # live profile + heap snapshots
npx autocannon -c 50 -d 30 URL                                # read p99, not req/sec
```

```js
// pool: connectionLimit 10 in core/db/mysql.js — that IS your query concurrency
// concurrency beyond the pool size buys nothing (851ms vs 849ms, measured)
monitorEventLoopDelay({ resolution: 20 })     // p99 < 20ms healthy, 100ms+ = blocking
process.hrtime.bigint()                        // for durations, not Date.now()
process.memoryUsage().heapUsed                 // leak = grows and never recovers
setInterval(…).unref()                         // or your metrics timer pins the process
```

---

| Next | |
|---|---|
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | blocking, streams, workers, handles |
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | parallelism, `Promise.all`, concurrency limits |
| [TUTORIAL-SECURITY.md](./TUTORIAL-SECURITY.md) | §20 — the same limits, viewed as denial-of-service controls |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | health probes and readiness under load |
