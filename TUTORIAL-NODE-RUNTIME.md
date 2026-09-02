# The Node Runtime — Event Loop, Streams, Modules, Threads

The parts of Node that are *not* JavaScript. The language is portable; this is the machine it
runs on, and it is where the surprising behaviour lives.

Every number and every "this happens / this doesn't" claim below was **measured on this repo's
toolchain** — Node v24.11.1, Windows 11, 8 logical CPUs. Where a claim is verified, it says so.

**Read this after** [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) — the event loop section here
assumes you know what a Promise is and why `await` doesn't block the thread.

---

## Contents

**Part 1 — The event loop, properly**
1. [The six phases](#1-the-six-phases)
2. [Timers are a floor, not a promise](#2-timers-are-a-floor-not-a-promise)
3. [Blocking: what it costs, measured](#3-blocking-what-it-costs-measured)
4. [Handles, refs, and why your process won't exit](#4-handles-refs-and-why-your-process-wont-exit)

**Part 2 — Modules**

5. [Resolution: how `require` finds a file](#5-resolution-how-require-finds-a-file)
6. [The module cache is a singleton](#6-the-module-cache-is-a-singleton)
7. [Circular requires, and what you get instead of a crash](#7-circular-requires-and-what-you-get-instead-of-a-crash)
8. [CommonJS vs ESM, and the interop rules](#8-commonjs-vs-esm-and-the-interop-rules)

**Part 3 — Events**

9. [EventEmitter is synchronous](#9-eventemitter-is-synchronous)
10. [The `error` event, and the listener leak warning](#10-the-error-event-and-the-listener-leak-warning)

**Part 4 — Binary and streams**

11. [Buffers: bytes are not characters](#11-buffers-bytes-are-not-characters)
12. [Streams: 19 MB in 1 MB of memory](#12-streams-19-mb-in-1-mb-of-memory)
13. [Backpressure, and why you must use `pipeline`](#13-backpressure-and-why-you-must-use-pipeline)
14. [The four stream types, and `Readable.from`](#14-the-four-stream-types-and-readablefrom)

**Part 5 — More than one thread**

15. [Worker threads](#15-worker-threads)
16. [Child processes](#16-child-processes)
17. [Cluster, and why you probably want the orchestrator instead](#17-cluster-and-why-you-probably-want-the-orchestrator-instead)

**Part 6 — Process and platform**

18. [`process`: argv, env, signals, exit codes](#18-process-argv-env-signals-exit-codes)
19. [Paths and the cwd trap](#19-paths-and-the-cwd-trap)
20. [AsyncLocalStorage: context without threading it through](#20-asynclocalstorage-context-without-threading-it-through)
21. [Memory: what `memoryUsage()` tells you](#21-memory-what-memoryusage-tells-you)

**Part 7 — Reference**

22. [Symptom → cause → fix](#22-symptom--cause--fix)
23. [Exercises](#23-exercises)
24. [Cheat sheet](#24-cheat-sheet)

---

# Part 1 — The event loop, properly

## 1. The six phases

[TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §12 gave you the two-queue model: microtasks drain
completely, then a macrotask phase runs. Here is what "a macrotask phase" actually is. One turn
of the loop, in order:

```
   ┌───────────────────────────┐
   │  timers                   │  setTimeout / setInterval callbacks whose time has come
   ├───────────────────────────┤
   │  pending callbacks        │  a few deferred system callbacks (e.g. some TCP errors)
   ├───────────────────────────┤
   │  idle, prepare            │  internal
   ├───────────────────────────┤
   │  poll                     │  ← waits here for I/O. Where an idle server sits.
   ├───────────────────────────┤
   │  check                    │  setImmediate callbacks
   ├───────────────────────────┤
   │  close callbacks          │  'close' events — socket.on('close'), etc.
   └───────────────────────────┘
        ↓ and between every single phase: drain ALL microtasks
          (process.nextTick queue first, then promise callbacks)
```

Two things follow that you can actually use:

**`setImmediate` runs before `setTimeout(fn, 0)`.** Not intuitive from the names — but `check`
comes after `poll` in the *current* turn, while a timer has to wait for the *next* turn's timers
phase. **Verified:**

```js
setTimeout(() => order.push('timeout'), 0);
setImmediate(() => order.push('immediate'));
queueMicrotask(() => order.push('microtask'));

// Verified output: microtask -> immediate -> timeout
```

**`setImmediate` is the "yield to I/O" primitive.** If you must do a long CPU-bound job in the
main thread, chunking it with `setImmediate` between chunks lets the poll phase run, so requests
get served between chunks. (`process.nextTick` will *not* do this — it's a microtask, so it runs
before the loop ever reaches poll. A `nextTick` loop starves I/O completely.)

| Name | Queue | Runs |
|---|---|---|
| `process.nextTick(fn)` | microtask (its own, higher priority) | before promise callbacks, before any I/O |
| `queueMicrotask(fn)` / `.then` | microtask | after nextTick, before any I/O |
| `setImmediate(fn)` | macrotask — `check` phase | this turn, after poll |
| `setTimeout(fn, 0)` | macrotask — `timers` phase | next turn at the earliest |

---

## 2. Timers are a floor, not a promise

`setTimeout(fn, 100)` means "not before 100ms". It does not mean "at 100ms". The callback runs
when the loop next reaches the timers phase *and* the thread is free.

This is why the async tutorial's measured "3 × 100ms sequential = 334ms" was not 300ms, and why
you must never build correctness on timer precision. If two things must happen in order, order
them with `await`, not with two timers.

`setTimeout` also has a maximum: delays above 2³¹−1 ms (~24.8 days) overflow and fire
**immediately**. If you compute a delay from a date, clamp it.

```js
const delay = Math.min(target - Date.now(), 2 ** 31 - 1);
```

---

## 3. Blocking: what it costs, measured

The single most important runtime fact. One thread serves every request, so CPU-bound work in a
handler is not slow — it is *downtime for everybody*.

**Verified.** A 600ms busy loop on the main thread, with a 10ms timer scheduled first:

| Where the 600ms of CPU work ran | The 10ms timer fired |
|---|---|
| main thread | **590ms late** |
| a `Worker` (§15) | **4ms late** — total wall time 634ms |

That 590ms is exactly what every concurrent user experiences: a 590ms stall added to whatever
they were doing. It does not show up in the slow endpoint's own timing, which is what makes it
hard to diagnose — the victim is a *different* request.

The usual culprits, in rough order of how often they bite:

| Blocking call | Async replacement |
|---|---|
| `fs.readFileSync`, `writeFileSync` | `fs/promises` — or streams (§12) |
| `JSON.parse` on a multi-MB payload | a streaming parser, or don't accept payloads that big (see the `PayloadTooLargeError` note in [TUTORIAL-JS.md](./TUTORIAL-JS.md)) |
| `bcrypt.hashSync` | the async API — `core/helpers/hash.js` already uses it |
| `crypto.pbkdf2Sync`, `randomBytesSync` | the callback/promise forms |
| `zlib.gzipSync` | `zlib.gzip` |
| A regex with catastrophic backtracking | fix the regex; no async version can save you |
| A 100k-element `.map().filter().sort()` chain | do it in the database (`ORDER BY`, `LIMIT`) |
| Template rendering of a 5,000-row table | paginate — `Model.paginate()` exists for this |

Startup is the exception: `require()` is synchronous by design, and `readFileSync` at boot (as
`core/views/` does when loading templates) is fine, because nothing is being served yet.

---

## 4. Handles, refs, and why your process won't exit

Node exits when the event loop has nothing left to do. "Nothing left to do" means **no active
referenced handles** — no open server, no pending timer, no open connection.

This is the whole explanation for the test-suite hang in [AGENTS.md](./AGENTS.md) §8. The tests
finished; something was still holding a handle.

```js
const t = setInterval(() => {}, 1000);
process.getActiveResourcesInfo();     // verified: includes 'Timeout'
// process will never exit

t.unref();                            // "you exist, but don't keep the process alive"
// process can now exit; the timer still fires while other work keeps the loop alive
```

`process.getActiveResourcesInfo()` is the tool for this. When something won't exit, print it.

| Holds the process open | Release it with |
|---|---|
| `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout`, or `.unref()` |
| An HTTP server | `server.close()` — and note it waits for in-flight requests |
| A database pool | `pool.end()` — this is the `core/db` leak in the AGENTS.md table |
| A session store's own timers | the MemoryStore-under-`NODE_ENV=test` workaround |
| An open read/write stream | `stream.destroy()`, or let `pipeline` do it (§13) |
| A child process / worker | `child.kill()` / `worker.terminate()` |

The inverse failure is exiting too early: `process.exit()` does **not** wait for pending writes,
so a final `console.log` or a log flush can be truncated. Set `process.exitCode = 1` and let the
process end naturally instead. (**Verified**: `process.exitCode` is `undefined` by default, and a
clean run exits 0.)

---

# Part 2 — Modules

## 5. Resolution: how `require` finds a file

`require('x')` follows a fixed algorithm, and knowing it turns `Cannot find module` from a
mystery into a two-second fix.

```js
require('./Product')      // relative → ./Product.js, ./Product.json, ./Product/index.js
require('/abs/path')      // absolute → as given, same extension attempts
require('express')        // bare → walk UP, checking node_modules at each level:
                          //   ./node_modules/express
                          //   ../node_modules/express
                          //   ../../node_modules/express   … up to the filesystem root
require('node:fs')        // node: prefix → the builtin, always, unambiguously
```

Three practical consequences:

- **`Cannot find module './Foo'`** with a relative path is a typo or a case mismatch. Windows and
  macOS are case-insensitive; Linux is not, so `require('./userController')` works on your laptop
  and breaks in CI. Match the filename exactly.
- **A bare name that isn't installed** fails no matter where you run from. **Verified**: a script
  in a temp directory cannot `require.resolve('express')`, even though `express` is installed in
  this project — resolution walks up from the *file*, not from your cwd.
- **`require.resolve('x')`** tells you which file would be loaded, without loading it. Use it when
  two copies of a package are fighting.

Prefer `node:fs` over `fs` for builtins. It cannot be shadowed by a package called `fs`, and it
tells the reader instantly that this is a builtin.

---

## 6. The module cache is a singleton

A module's body runs **once per process**. Every subsequent `require` returns the *same object*.

**Verified:**

```js
const a = require('./mod.js');  a.n = 42;
const b = require('./mod.js');
// b.n === 42, and a === b        ← same object, shared state
```

This is a feature, and it is how `core/db/index.js` gives the whole application one connection
pool: `module.exports = adapters[driver]()` runs once, and every model that requires it gets that
same pool.

It is also the "module-level state is shared by every user" hazard from
[TUTORIAL-JS.md](./TUTORIAL-JS.md) §1:

```js
// ❌ In a module, this is ONE variable shared by every concurrent request
let currentUser = null;

// ✅ Per-request state belongs on req, or in AsyncLocalStorage (§20)
```

Busting the cache is possible and occasionally necessary in tests:

```js
delete require.cache[require.resolve('./mod.js')];
const c = require('./mod.js');     // verified: fresh module, c.n === 0, c !== a
```

⚠️ That is precisely the technique behind the second test-suite hang in [AGENTS.md](./AGENTS.md)
§8: cache-busting a module that had already created a pool leaves the old pool open with nobody
holding a reference to close it. This repo maintains a STATEFUL exclusion list in
`tests/helpers/testApp.js` for exactly this reason. **Never cache-bust a module that owns a
connection, a server, or a timer.**

---

## 7. Circular requires, and what you get instead of a crash

If A requires B and B requires A, Node does not error. It hands the second requirer a
**partially-populated** `module.exports` — whatever had been assigned at that moment.

```js
// a.js
exports.name = 'a';
const b = require('./b');
exports.later = 'assigned after requiring b';

// b.js
const a = require('./a');
console.log(a.name);    // 'a'       — already assigned
console.log(a.later);   // undefined — not yet assigned
```

The symptom is `undefined is not a function` on something you can see is exported. Fixes, in
order of preference:

1. **Break the cycle** — usually the shared thing belongs in a third module both can require.
2. **Move the `require` inside the function** that uses it, so it resolves at call time rather
   than load time.
3. Assign your exports **before** requiring the other module, so a partial export is still
   useful. Fragile; use as a last resort.

In this framework the layering rule (`app/controllers` → `app/services` → `app/models`, never
upward) is what keeps cycles from happening at all.

---

## 8. CommonJS vs ESM, and the interop rules

**This project is CommonJS** — rule 6 in [AGENTS.md](./AGENTS.md). But you will meet ESM-only
packages, so know the boundary.

| | CommonJS (this project) | ESM |
|---|---|---|
| Import | `require('x')` | `import x from 'x'` |
| Export | `module.exports = {}` | `export default`, `export const` |
| Loading | synchronous | asynchronous, hoisted |
| Top-level `await` | ❌ | ✅ |
| `__dirname` / `__filename` | ✅ | ❌ — use `import.meta.dirname` |
| File extension | `.js` (with no `"type"` field) or `.cjs` | `.mjs`, or `.js` under `"type":"module"` |

The interop rules that actually matter:

- **ESM can import CJS.** Usually as a default import; named imports work only when Node can
  statically detect them.
- **CJS cannot `require` ESM.** It throws `Cannot use import statement outside a module` or
  `require() of ES Module … not supported`.
- **The escape hatch is dynamic `import()`**, which works in CommonJS because it is asynchronous:

```js
async function renderMarkdown(src) {
  const { marked } = await import('marked');    // ✅ works in CJS
  return marked(src);
}
```

Do not "fix" this by adding `"type": "module"` to `package.json`. It would break every
`require()` and every `__dirname` in `core/` and `bin/` at once.

---

# Part 3 — Events

## 9. EventEmitter is synchronous

Half of Node's own API is an EventEmitter — servers, sockets, streams, `process`. One fact
explains most confusion about it: **`emit()` calls its listeners synchronously, in registration
order, before `emit` returns.**

**Verified:**

```js
em.on('tick', () => seq.push('listener'));
seq.push('before emit'); em.emit('tick'); seq.push('after emit');
// before emit -> listener -> after emit
```

So a listener that throws, throws *out of your `emit()` call*. And a slow listener blocks the
emitter (§3). An emitter is not a queue and gives you no async ordering guarantees — if you need
those, push work onto a promise or a real queue.

**Verified** listener mechanics, with `on`, `once`, `on` registered in that order and two emits:

```
first,once,second,first,second      ← order preserved; `once` removed itself
listenerCount('x') === 2            ← after the once fired
```

```js
const { EventEmitter } = require('node:events');

class ImportJob extends EventEmitter {
  async run(rows) {
    for (const row of rows) {
      await Import.create(row);
      this.emit('progress', { done: ++this.done, total: rows.length });
    }
    this.emit('done', this.done);
  }
}

const job = new ImportJob();
job.on('progress', ({ done, total }) => logger.info(`import ${done}/${total}`));
```

Also useful: `events.once(emitter, 'name')` returns a **promise** for the next occurrence, which
lets you await an event without callback plumbing.

```js
const { once } = require('node:events');
await once(server, 'listening');
```

---

## 10. The `error` event, and the listener leak warning

**An `'error'` event with no listener throws.** **Verified** — `em.emit('error', new Error('x'))`
on a listener-less emitter throws that error, which (per
[TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §14) will take the process down.

```js
// ✅ Every long-lived emitter needs this
stream.on('error', (err) => logger.error(`stream failed: ${err.message}`));
```

This is why manual `.pipe()` chains are dangerous (§13) and why `pipeline` is the rule.

The other diagnostic worth recognising:

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 progress listeners added to [ImportJob]. Use emitter.setMaxListeners() to increase limit
```

That warning at exactly 11 listeners almost always means you are adding a listener **inside a
request handler** and never removing it. Every request adds one; nothing ever drops one. Raising
the limit hides a real leak — remove the listener instead (`off`/`removeListener`), or register
it once at startup.

---

# Part 4 — Binary and streams

## 11. Buffers: bytes are not characters

A `Buffer` is a fixed-length chunk of raw bytes outside the JS heap. Anything that comes off a
socket or a disk is bytes first.

**Verified:**

```js
Buffer.from('héllo', 'utf8').length   // 6   ← bytes
'héllo'.length                        // 5   ← UTF-16 code units
// hex: 68c3a96c6c6f  — the é is two bytes (c3a9)
```

Consequences that cause real bugs:

- **A byte limit is not a character limit.** `VARCHAR(255)` in MySQL under `utf8mb4` counts
  characters, but an upload size limit counts bytes. A 255-emoji username is 1,020 bytes.
- **Never slice a multi-byte string by byte offset.** You will split a character in half and get
  `�`. If you must chunk text, use `StringDecoder`, which holds partial characters across chunks.
- **`Buffer.concat` of chunks, then one `.toString()`** is correct; `.toString()` per chunk is not.

```js
const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
const body = Buffer.concat(chunks).toString('utf8');   // ✅ decode once, at the end
```

For comparing secrets, use the timing-safe comparison, not `===`:

```js
const { timingSafeEqual } = require('node:crypto');
// both must be Buffers of equal length
timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

---

## 12. Streams: 19 MB in 1 MB of memory

`fs.readFile` puts the entire file in memory. A stream moves it through in chunks. On a
single-threaded server that difference is the difference between 50 concurrent downloads and an
out-of-memory kill.

**Verified** on a 19.1 MB file, sampling peak heap every 5ms:

| Approach | Peak heap above baseline |
|---|---|
| `await fs.promises.readFile(file, 'utf8')` | **+19.2 MB** |
| `pipeline(fs.createReadStream(file), …)` | **+1.1 MB** |

The streaming version's memory is flat regardless of file size — it is `highWaterMark` bytes at a
time, 64 KB by default for `fs` streams (**verified**: `readableHighWaterMark === 65536`; object
mode defaults to 16 *objects* instead).

```js
// ❌ 50 concurrent downloads of a 20 MB report = 1 GB of heap
const csv = await fs.promises.readFile(reportPath, 'utf8');
res.send(csv);

// ✅ 50 concurrent downloads = ~3 MB, and the first byte reaches the client immediately
const { pipeline } = require('node:stream/promises');
res.setHeader('Content-Type', 'text/csv');
await pipeline(fs.createReadStream(reportPath), res);
```

The same reasoning applies to generating data: don't build a 100k-row array and `res.json` it —
stream rows out as you read them.

**Verified** for line-oriented work, which streams plus `readline` make trivial:

```js
const rl = require('node:readline').createInterface({ input: fs.createReadStream(big) });
for await (const line of rl) { /* one line at a time, constant memory */ }
```

`for await` over a stream is also cancel-safe: breaking out of the loop destroys the stream.

---

## 13. Backpressure, and why you must use `pipeline`

Backpressure is the reason streams exist. If you read a file at 500 MB/s and write to a client on
a 5 Mbps connection, something has to slow the reader down — otherwise the unwritten data piles
up in memory and you have re-created §12's problem with extra steps.

`stream.write()` returns `false` when its buffer is full. Honouring that by hand means pausing,
waiting for `'drain'`, resuming, and cleaning up on error at every stage. Nobody gets it right.

```js
// ❌ Ignores backpressure, and leaks the read stream if res errors (client disconnects)
fs.createReadStream(file).pipe(res);

// ✅ Handles backpressure, propagates errors, destroys every stream on failure
const { pipeline } = require('node:stream/promises');
try {
  await pipeline(fs.createReadStream(file), res);
} catch (err) {
  logger.warn(`download aborted: ${err.message}`);
}
```

**Verified**: with a writer that fails immediately, `pipeline` rejects with that error
(`writer exploded`) and tears down the source. A bare `.pipe()` would leave the read stream open
with an unhandled `'error'` event — which, per §10, crashes the process.

**Rule: never `.pipe()`. Always `pipeline` from `node:stream/promises`.** It is one import and it
removes an entire category of bug.

---

## 14. The four stream types, and `Readable.from`

| Type | Direction | Examples |
|---|---|---|
| `Readable` | out of a source | `fs.createReadStream`, `req`, a DB cursor |
| `Writable` | into a sink | `fs.createWriteStream`, `res`, `process.stdout` |
| `Duplex` | both, independent | a TCP socket |
| `Transform` | both, coupled | `zlib.createGzip()`, a CSV formatter |

`Transform` is the one you'll write. **Verified** three-stage pipeline producing `ABC`:

```js
const { Readable, Writable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

await pipeline(
  Readable.from(['a', 'b', 'c']),                       // any iterable → a stream
  new Transform({
    objectMode: true,
    transform(chunk, enc, cb) { cb(null, String(chunk).toUpperCase()); },
  }),
  new Writable({ objectMode: true, write(c, e, cb) { out.push(c); cb(); } }),
);
```

Two details that trip people up:

- **`objectMode: true`** when your chunks are objects rather than bytes. Without it, a stream
  coerces chunks to Buffers and your rows arrive as garbage.
- **Call the callback exactly once.** Forget it and the stream stalls forever (a hung request with
  no error); call it twice and you get `ERR_MULTIPLE_CALLBACK`.

`Readable.from()` accepts any iterable **including an async generator**, which is the cleanest way
to stream computed data:

```js
async function* rows(pageSize = 500) {
  for (let page = 1; ; page++) {
    const { rows: batch } = await Product.paginate({ page, pageSize });
    if (!batch.length) return;
    for (const row of batch) yield `${row.id},${row.sku},${row.name}\n`;
  }
}

await pipeline(Readable.from(rows()), res);   // constant memory, any table size
```

---

# Part 5 — More than one thread

## 15. Worker threads

For CPU-bound work. A `Worker` is a real thread with its own event loop and its own V8 isolate —
**no shared variables**, only messages (plus `SharedArrayBuffer` if you really need shared bytes).

**Verified**, the §3 experiment restated: 600ms of CPU work delayed a 10ms timer by **590ms** on
the main thread, and by **4ms** in a worker. Spawn cost for a trivial worker: **29ms**.

```js
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

if (!isMainThread) {
  parentPort.postMessage(expensiveThing(workerData));   // runs in the worker
  return;
}

function runInWorker(data) {
  return new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: data });
    w.on('message', resolve);
    w.on('error', reject);
    w.on('exit', (code) => code !== 0 && reject(new Error(`worker exited ${code}`)));
  });
}
```

Three rules from that snippet:

1. **Handle `error` *and* `exit`.** A worker that dies without messaging you otherwise leaves your
   promise pending forever — a hung request with no error (§4).
2. **That 29ms spawn cost means don't spawn per request.** Keep a small pool sized to
   `os.cpus().length` (**verified**: 8 here) and reuse workers.
3. **Data is copied, not shared** (structured clone). Passing a 50 MB object to a worker costs a
   50 MB copy — which can be slower than the work itself.

When *not* to use a worker: for I/O. Waiting on a database is already free (§1). A worker adds
copying and complexity for zero gain.

---

## 16. Child processes

For running *other programs* — `ffmpeg`, `mysqldump`, a Python script.

| API | Use it for |
|---|---|
| `spawn` | **the default.** Streams stdout/stderr; handles unlimited output |
| `execFile` | small output you want buffered as a string |
| `exec` | ⚠️ runs a **shell** — command injection risk; avoid with user input |
| `fork` | another Node script, with a message channel |

```js
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');

// ✅ Arguments as an array — no shell, so nothing to inject into
const dump = spawn('mysqldump', ['-u', user, dbName]);
await pipeline(dump.stdout, fs.createWriteStream(outPath));
```

```js
// ❌ NEVER. If dbName is 'x; rm -rf /' you have handed over the machine.
exec(`mysqldump -u ${user} ${dbName} > ${outPath}`);
```

`exec` and `execFile` buffer output and reject with `maxBuffer exceeded` (1 MB default) on a
chatty process. `spawn` has no such limit because you consume it as a stream.

---

## 17. Cluster, and why you probably want the orchestrator instead

`cluster` forks N copies of your process sharing one listening socket, so an 8-CPU box uses all 8
cores. Historically this was how you scaled a Node app.

Today, if you are running under Docker/Kubernetes as [TUTORIAL-SOA.md](./TUTORIAL-SOA.md)
describes, **run one process per container and let the orchestrator scale replicas.** You get the
same parallelism plus rolling deploys, health-based restarts and per-replica limits — and you keep
the graceful-shutdown logic in `core/lifecycle.js` simple, because there is exactly one process to
drain.

Reach for `cluster` (or `pm2 -i max`) when you're on a single VM with no orchestrator. If you do:
in-memory state stops working across workers, so sessions must move to a shared store —
`SESSION_STORE=db|redis|memcached` in `.env`, never `memory`.

---

# Part 6 — Process and platform

## 18. `process`: argv, env, signals, exit codes

```js
process.argv        // [node, script, ...args] — verified length 2 with no args
process.env.PORT    // always a STRING, or undefined
process.pid         // number
process.exitCode    // undefined by default (verified); set it instead of calling exit()
process.uptime()    // seconds
```

**`process.env` values are strings.** `process.env.DEBUG` is `"false"` — a truthy string. This
is the single most common env bug:

```js
// ❌ always true when the var is set to anything at all, including "false"
if (process.env.FEATURE_X) {}

// ✅
if (process.env.FEATURE_X === 'true') {}
const port = Number(process.env.PORT ?? 5010);        // ?? not ||, per AGENTS.md rule 8
```

`bin/forge.js` shows the CLI pattern: read `process.argv.slice(2)`, dispatch on the first token.

**Signals** are how the platform asks you to stop. `core/lifecycle.js` handles `SIGTERM` and
`SIGINT` and runs the drain sequence:

| Signal | Sent by | You should |
|---|---|---|
| `SIGINT` | Ctrl-C | shut down gracefully |
| `SIGTERM` | `docker stop`, k8s, `kill` | shut down gracefully — you have a grace period, then SIGKILL |
| `SIGKILL` | `kill -9`, OOM killer, grace expiry | nothing — it cannot be handled |

⚠️ On Windows, POSIX signals are emulated. `SIGTERM` handlers do not fire the way they do on
Linux, so **test graceful shutdown on the platform you deploy to**, not just locally.

---

## 19. Paths and the cwd trap

```js
__dirname     // the directory of THIS file — stable
process.cwd() // where the process was started — depends on who ran it
```

**Verified**: they happen to be equal when you run `node script.js` from that directory, which is
exactly why the bug hides. Start the app from anywhere else and every `cwd`-relative path breaks.

```js
// ❌ breaks under a systemd unit, a cron job, or `npm start` from a parent directory
fs.readFileSync('./templates/mail.ejs');

// ✅ anchored to the file, so it works from any cwd — the bin/forge.js pattern
const ROOT = path.join(__dirname, '..');
fs.readFileSync(path.join(ROOT, 'templates', 'mail.ejs'));
```

Always build paths with `path.join`/`path.resolve` rather than string concatenation — it
normalises separators, so the same code works on this repo's Windows dev box and a Linux
container. And for anything derived from user input, `path.resolve` plus a prefix check is what
stops `../../etc/passwd`:

```js
const target = path.resolve(UPLOAD_DIR, userSuppliedName);
if (!target.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new Error('path traversal');
```

---

## 20. AsyncLocalStorage: context without threading it through

The problem: every log line should carry the request's correlation id, but threading `requestId`
through every function signature poisons every API in the codebase for the sake of logging.

`AsyncLocalStorage` keeps a value on the *async execution context*, so anything downstream can
read it — through awaits, through callbacks, through code that knows nothing about requests. This
is [core/context.js](core/context.js), and it is what makes the joinable logs in
[TUTORIAL-SOA.md](./TUTORIAL-SOA.md) §4 possible.

**Verified:**

```js
await als.run({ requestId: 'req-1' }, async () => {
  await wait(5);
  return (await deep()).requestId;      // 'req-1' — three frames and two awaits down
});
als.getStore();                         // undefined outside a run()
```

**Verified** that concurrent contexts do not leak into each other — two overlapping `run()` calls
with different ids each saw only their own (`A`, `B`). That is the property that makes it safe on
a server handling many requests at once.

```js
const { runWithContext, getContext, setContextValue } = require('./core/context');

// middleware, once per request
runWithContext({ requestId }, () => next());

// anywhere downstream — a model, a helper, an outbound HTTP call
logger.info('saved');            // core/helpers/logger.js reads getContext() itself
setContextValue('userId', user.id);   // later lines carry it too
```

Two cautions: `getContext()` returns `{}` outside a request (a cron job, a boot query, a test) so
never assume a field exists; and don't turn it into a general-purpose global — request identity
and logging metadata, not business data.

---

## 21. Memory: what `memoryUsage()` tells you

**Verified** keys: `rss, heapTotal, heapUsed, external, arrayBuffers`.

| Field | Means |
|---|---|
| `rss` | total OS memory for the process — the number your container limit compares against |
| `heapTotal` | heap V8 has reserved |
| `heapUsed` | heap actually in use — **the leak indicator** |
| `external` | C++ objects bound to JS — includes Buffers |
| `arrayBuffers` | the `ArrayBuffer`/Buffer subset of `external` |

A leak is `heapUsed` trending up across a load test and never coming back down after it stops.
Growth *during* load is normal — GC is lazy on purpose.

The usual leak sources in a server, all of which are §4 and §6 restated:

- A module-level `Map`/array used as a cache with no eviction (see §6 — it's shared and immortal).
- Listeners added per request and never removed (§10 — watch for that 11-listener warning).
- A closure captured by a long-lived timer, holding a whole request's objects alive.

Diagnosis: `node --inspect`, Chrome DevTools → Memory → take a heap snapshot, run the load,
snapshot again, and compare. The objects whose count grows and never falls are your leak. For
caches that *should* be bounded, `WeakMap`/`WeakRef` let entries be collected when nothing else
references the key.

---

# Part 7 — Reference

## 22. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Test suite hangs after all tests pass | a live handle — timer, pool, server, session store | `process.getActiveResourcesInfo()` (§4) |
| Unrelated requests are slow while one endpoint runs | CPU-bound work on the main thread | measure, then `Worker` or chunk with `setImmediate` (§3, §15) |
| `Cannot find module './Foo'` | typo, or case mismatch that only breaks on Linux | match the filename exactly (§5) |
| `Cannot use import statement outside a module` | ESM-only package in CJS | `await import('pkg')` (§8) |
| A value set in one module is visible to another user | module-level state is shared per process | move it to `req` or AsyncLocalStorage (§6, §20) |
| `undefined is not a function` on something you exported | circular require gave a partial export | break the cycle (§7) |
| Process crashes with an error from a stream | unhandled `'error'` event | `pipeline` (§10, §13) |
| Out of memory serving downloads | `readFile` of a large file per request | stream it (§12) |
| A download stalls forever, no error | a `Transform` that never calls its callback | call `cb()` exactly once (§14) |
| `ERR_MULTIPLE_CALLBACK` | a stream callback called twice | same (§14) |
| Emoji/accents become `�` | a multi-byte character split across chunks | `Buffer.concat` then decode once (§11) |
| `maxBuffer length exceeded` | `exec`/`execFile` on a chatty process | `spawn` and stream it (§16) |
| `MaxListenersExceededWarning` at 11 | listener added per request, never removed | remove it, or register once (§10) |
| A feature flag is always on | `process.env.X` is the string `"false"` | compare to `'true'` (§18) |
| Works locally, breaks under systemd/cron | cwd-relative path | anchor to `__dirname` (§19) |
| A worker promise never settles | worker died; only `message` was handled | handle `error` and `exit` (§15) |
| `setTimeout` fires immediately | delay above 2³¹−1 ms overflowed | clamp the delay (§2) |
| Last log line missing on exit | `process.exit()` truncated a pending write | set `process.exitCode` instead (§4) |

---

## 23. Exercises

1. Predict the order, then run it: `setTimeout(f,0)`, `setImmediate(g)`, `queueMicrotask(h)`,
   `process.nextTick(i)`. Explain each position by naming its phase or queue. (§1)

2. Write an endpoint that busy-loops for 2 seconds. With it running, time `curl /health` from
   another terminal. Then move the work into a `Worker` and time it again. (§3, §15)

3. Make a 50 MB CSV. Serve it two ways — `fs.promises.readFile` + `res.send`, and
   `pipeline(createReadStream, res)`. Compare peak `heapUsed` for each while 5 clients download
   concurrently. (§12)

4. Write an async generator that pages through a table with `Model.paginate` and pipe it to `res`
   as CSV. Confirm memory stays flat for a 100k-row table. (§14)

5. Start a `setInterval`, then find it with `process.getActiveResourcesInfo()`. Add `.unref()` and
   confirm the process now exits. (§4)

6. Deliberately create a circular require between two `app/services/` modules. Read the error, then
   fix it by extracting a third module. (§7)

7. Add a field to the request context with `setContextValue('userId', …)` after auth resolves, and
   confirm it appears on log lines emitted from inside a *model*. (§20)

8. Find every synchronous filesystem call in `core/`. For each, decide whether it is boot-time
   (fine) or request-time (a bug). (§3)

---

## 24. Cheat sheet

```js
// ── Loop order ────────────────────────────────────────────────────────────────
// timers → pending → poll → check → close, microtasks drained between each
process.nextTick(f)  // microtask, highest priority — starves I/O if looped
queueMicrotask(f)    // microtask — after nextTick
setImmediate(f)      // check phase — THIS turn, after poll. The "yield to I/O" call.
setTimeout(f, 0)     // timers phase — NEXT turn. Verified: immediate runs first.

// ── Won't exit? ───────────────────────────────────────────────────────────────
process.getActiveResourcesInfo()     // what's still holding the loop open
timer.unref()  server.close()  pool.end()  worker.terminate()  stream.destroy()
process.exitCode = 1                 // NOT process.exit() — that truncates writes

// ── Modules ───────────────────────────────────────────────────────────────────
require('node:fs')                   // prefer node: for builtins
require.resolve('x')                 // which file would load
delete require.cache[require.resolve('./m')]   // ⚠️ never on a module owning a pool
await import('esm-only-pkg')         // the CJS escape hatch

// ── Streams ───────────────────────────────────────────────────────────────────
const { pipeline } = require('node:stream/promises');
await pipeline(src, transform, dest);   // ✅ backpressure + errors + cleanup
src.pipe(dest);                         // ❌ never — leaks on error
Readable.from(asyncGenerator())         // stream computed data
for await (const chunk of readable) {}  // constant memory; break destroys it
// Verified 19.1 MB file: readFile +19.2 MB heap, stream +1.1 MB

// ── Threads ───────────────────────────────────────────────────────────────────
new Worker(__filename, { workerData })  // CPU-bound only; ~29ms spawn; copies data
  .on('message', …).on('error', …).on('exit', …)   // all three, always
spawn('cmd', [args])                    // ✅ no shell
exec(`cmd ${userInput}`)                // ❌ command injection

// ── Process ───────────────────────────────────────────────────────────────────
process.env.X === 'true'                // env values are STRINGS
Number(process.env.PORT ?? 5010)        // ?? not || (AGENTS.md rule 8)
path.join(__dirname, '..', 'x')         // never cwd-relative
```

---

| Next | |
|---|---|
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | promises and async/await from first principles |
| [TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) | the language beyond the basics — prototypes, generators, proxies, memory |
| [TUTORIAL-PERFORMANCE.md](./TUTORIAL-PERFORMANCE.md) | profiling, N+1 queries, caching, load testing |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | graceful shutdown, health probes, correlation IDs in production |
