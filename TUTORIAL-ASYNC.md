# Async JavaScript — From Promises to Production

A ground-up tutorial on the one part of Node that trips up every newcomer. It starts at "what
*is* a Promise" and ends at the exact async patterns this framework uses in `core/` and `app/`.

Every timing number and every "this crashes / this hangs" claim below was **measured on this
repo's own toolchain** — Node v24.11.1, Express 4.22.2. Where a claim is verified, it says so.

**Prerequisites:** you can read a JavaScript function. Nothing else.

**Related reading:** [TUTORIAL-JS.md](./TUTORIAL-JS.md) Part 3 is the fast survey of this same
ground; [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) ch. 8 has the runnable practice
file (`practice/08-promises.js`). This document is the long-form explanation underneath both.

---

## Contents

**Part 0 — Why async exists at all**
1. [One thread, many requests](#1-one-thread-many-requests)

**Part 1 — The Promise**
2. [Life before promises: callbacks](#2-life-before-promises-callbacks)
3. [What a Promise actually is](#3-what-a-promise-actually-is)
4. [Creating a promise](#4-creating-a-promise)
5. [Consuming a promise: then, catch, finally](#5-consuming-a-promise-then-catch-finally)
6. [Chaining, and the four rules of `.then`](#6-chaining-and-the-four-rules-of-then)
7. [Promises are eager, not lazy](#7-promises-are-eager-not-lazy)

**Part 2 — async / await**

8. [async/await is the same object, better syntax](#8-asyncawait-is-the-same-object-better-syntax)
9. [When to put `async` on a function](#9-when-to-put-async-on-a-function)
10. [When to put `await` on a value](#10-when-to-put-await-on-a-value)
11. [The forgotten `await`](#11-the-forgotten-await)
12. [Execution order: the microtask queue](#12-execution-order-the-microtask-queue)

**Part 3 — Errors**

13. [try / catch / finally with await](#13-try--catch--finally-with-await)
14. [Unhandled rejections kill the process](#14-unhandled-rejections-kill-the-process)
15. [Express 4 and the vanishing error](#15-express-4-and-the-vanishing-error)
16. [Fire-and-forget, done properly](#16-fire-and-forget-done-properly)

**Part 4 — Doing more than one thing**

17. [Sequential vs parallel, measured](#17-sequential-vs-parallel-measured)
18. [The four combinators](#18-the-four-combinators)
19. [Loops: for...of, map+all, and the forEach trap](#19-loops-forof-mapall-and-the-foreach-trap)
20. [Limiting concurrency](#20-limiting-concurrency)
21. [Timeouts, races and AbortController](#21-timeouts-races-and-abortcontroller)

**Part 5 — This framework**

22. [The model layer is all async](#22-the-model-layer-is-all-async)
23. [The controller shape, and why it never varies](#23-the-controller-shape-and-why-it-never-varies)
24. [Parallelism already in `core/`](#24-parallelism-already-in-core)
25. [Calling other services](#25-calling-other-services)
26. [Transactions and the lock-timeout hang](#26-transactions-and-the-lock-timeout-hang)
27. [Async in tests](#27-async-in-tests)

**Part 6 — Reference**

28. [Symptom → cause → fix](#28-symptom--cause--fix)
29. [Exercises](#29-exercises)
30. [Cheat sheet](#30-cheat-sheet)

---

# Part 0 — Why async exists at all

## 1. One thread, many requests

If you come from PHP, every request got its own process. `$rows = $db->query(...)` blocked that
process for 20ms and nobody cared — the other requests were in other processes.

Node is **one process, one thread, all requests**. There is no "your request's own thread" to
block. A blocking database call would stop every other user for those 20ms. Twenty concurrent
users each doing three 20ms queries would mean the last one waits over a second for work that
took 60ms.

Node's answer: **I/O never blocks.** You ask for the query, you get back a *receipt*, and the
thread goes off to serve someone else. When the database answers, the runtime comes back to your
code and hands you the rows.

That receipt is a **Promise**. Async/await is the syntax for spending it. Everything in the rest
of this document is a consequence of that single design decision.

```
PHP:    [req A: query....20ms....render][req B: query....20ms....render]   → 40ms total
Node:   [A: query→][B: query→] ... [A rows→render][B rows→render]          → ~21ms total
```

The tradeoff you are buying into: **CPU-bound work still blocks everyone.** A 500ms JSON parse or
a synchronous bcrypt round freezes the whole server. That is why `core/helpers/hash.js` uses the
async bcrypt API, and why anything genuinely heavy belongs in a queue or a worker thread rather
than a request handler.

---

# Part 1 — The Promise

## 2. Life before promises: callbacks

The original Node convention was "pass a function to be called later, errors first":

```js
db.query('SELECT * FROM users WHERE id = ?', [1], (err, rows) => {
  if (err) return console.error(err);
  db.query('SELECT * FROM orders WHERE user_id = ?', [rows[0].id], (err, orders) => {
    if (err) return console.error(err);
    sendEmail(rows[0].email, orders, (err) => {
      if (err) return console.error(err);
      console.log('done');
    });
  });
});
```

Three things are wrong there, and promises exist to fix exactly these three:

| Problem | What it looks like |
|---|---|
| **Nesting** ("callback hell") | Each dependent step indents one level deeper. Ten steps, ten levels. |
| **Manual error plumbing** | `if (err) return` on every level. Miss one and the error vanishes silently. |
| **`try/catch` does not work** | The callback runs on a later tick, long after your `try` block finished. |

That last one deserves proof, because it is the reason callbacks could never be patched up:

```js
// ❌ The catch never fires. By the time the callback throws, this try block is long gone.
try {
  setTimeout(() => { throw new Error('boom'); }, 10);
} catch (e) {
  console.log('never reached');     // verified: not reached — the process crashes instead
}
```

A Promise is a **value representing the callback's eventual result** — and because it is a value,
it can be returned from functions, stored in variables, passed to combinators, and plugged into
the language's own `try/catch`.

---

## 3. What a Promise actually is

A Promise is an ordinary JavaScript object with exactly **three states**:

```
              ┌──────────────► fulfilled  (has a value)
   pending ───┤
              └──────────────► rejected   (has a reason — should be an Error)
```

Four properties of that diagram matter more than anything else in this document:

1. **It starts pending.** The moment you call `User.findById(1)`, you hold a pending promise.
2. **It settles once.** Fulfilled or rejected, then frozen forever. A second `resolve()` is
   silently ignored — there is no such thing as a promise that fires twice.
3. **Settling is one-way, and you cannot peek.** There is no `promise.value`; the only way to
   read the result is `await` or `.then`.
4. **A rejected promise nobody handles is a fatal error** in Node (§14).

```js
const p = User.findById(1);
console.log(p);            // Promise { <pending> }
console.log(p.name);       // undefined — a Promise has no .name. This is bug #1 (§11).
```

**Terminology**, used precisely for the rest of this doc:

| Term | Meaning |
|---|---|
| *settled* | fulfilled **or** rejected — i.e. no longer pending |
| *resolved* | loosely, fulfilled; strictly, "locked to the fate of another promise" |
| *thenable* | any object with a `.then` method — `await` unwraps these too |

---

## 4. Creating a promise

You will rarely write `new Promise` — the libraries you use already return promises. But you must
understand it, because it is where the semantics live.

```js
const wait = (ms, value) => new Promise((resolve, reject) => {
  if (ms < 0) return reject(new Error('ms must be >= 0'));
  setTimeout(() => resolve(value), ms);
});
```

The function you pass in is the **executor**. It receives `resolve` and `reject`, and — this is
the part that surprises people — **it runs synchronously, immediately.**

```js
// ✅ Verified output:
// before new Promise | inside executor | after new Promise | after .then registration | then callback
const order = [];
order.push('before new Promise');
const p = new Promise((resolve) => { order.push('inside executor'); resolve('done'); });
order.push('after new Promise');
p.then(() => order.push('then callback'));
order.push('after .then registration');
```

Read that order carefully. The executor body ran *first*, before the next line of your program.
The `.then` callback ran *last*, after all synchronous code — even though the promise was already
resolved when `.then` was attached. That is the microtask queue, and §12 explains it.

### The three ways to make a promise you already have a value for

```js
Promise.resolve(42)                       // already fulfilled with 42
Promise.reject(new Error('nope'))         // already rejected — ⚠️ needs a handler (§14)
new Promise(() => {})                     // pending forever; this is how you hang a request
```

### ⚠️ Don't hand-wrap a callback API if a promise version exists

```js
// ❌ Hand-wrapping is where the "forgot to reject" bugs live
const readFile = (path) => new Promise((resolve, reject) => {
  fs.readFile(path, 'utf8', (err, data) => (err ? reject(err) : resolve(data)));
});

// ✅ Node ships promise versions of nearly everything
const fs = require('fs/promises');
const data = await fs.readFile(path, 'utf8');
```

For a genuinely callback-only library, use the built-in adapter rather than writing an executor:

```js
const { promisify } = require('util');
const sleep = promisify(setTimeout);
```

---

## 5. Consuming a promise: then, catch, finally

Three methods. All three return **a new promise**, which is what makes chaining work.

```js
User.findById(1)
  .then((user) => console.log('got', user.username))    // fulfilled path
  .catch((err) => console.error('failed', err.message)) // rejected path
  .finally(() => console.log('either way'));            // cleanup, gets no argument
```

| Method | Runs when | Returns |
|---|---|---|
| `.then(onOk)` | the promise fulfils | a new promise for `onOk`'s return value |
| `.then(onOk, onErr)` | either — two callbacks | a new promise |
| `.catch(onErr)` | the promise rejects | a new promise, which *fulfils* if `onErr` returns normally |
| `.finally(fn)` | it settles, either way | a new promise passing the original outcome through |

Two non-obvious behaviours you should know before you read someone else's chain:

**`.catch` recovers.** A `.catch` that returns a value turns a rejected chain back into a
fulfilled one. This is a feature (fallback values) and a trap (silently swallowed errors).

```js
const user = await User.findById(1).catch(() => null);   // null instead of a throw
```

**`.finally` cannot change the outcome** — unless it throws, in which case its error replaces the
original. Same shape as the `finally` block in §13.

---

## 6. Chaining, and the four rules of `.then`

You will read `.then` chains in other people's code even though you'll write `await`. Four rules
explain every chain you will ever see:

```js
fetchUser(1)
  .then((user) => user.id)                      // 1. return a value → next .then receives it
  .then((id) => fetchOrders(id))                // 2. return a promise → chain waits for it
  .then((orders) => { throw new Error('x'); })  // 3. throw → skips to the next .catch
  .then((never) => 'skipped')                   // ← skipped entirely
  .catch((err) => 'recovered');                 // 4. catch returns → chain is fulfilled again
```

1. **Return a value** → it becomes the next `.then`'s argument.
2. **Return a promise** → the chain pauses until it settles, then unwraps it. (Returning a promise
   from inside `.then` is what stops nesting; forgetting the `return` is the classic `.then` bug —
   the chain continues without waiting.)
3. **Throw** → every subsequent `.then` is skipped until a `.catch`.
4. **A `.catch` that returns normally** → the chain is fulfilled from there on.

### Prefer `await`. Here is the same logic both ways

```js
// .then style — a pipeline you read forwards but debug backwards
function getOrderTotal(userId) {
  return User.findById(userId)
    .then((user) => {
      if (!user) throw new Error('no user');
      return Order.find({ user_id: user.id });
    })
    .then((orders) => orders.reduce((sum, o) => sum + o.total, 0));
}

// await style — the flow is just... code. Step through it in a debugger.
async function getOrderTotal(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('no user');
  const orders = await Order.find({ user_id: user.id });
  return orders.reduce((sum, o) => sum + o.total, 0);
}
```

Both return a promise. Both reject on a missing user. The second gives you real stack traces, real
breakpoints, and `if`/`for`/`try` that behave the way you expect. **Use `await` everywhere except
the fire-and-forget case in §16.**

---

## 7. Promises are eager, not lazy

This is the concept most tutorials skip, and it explains a whole class of confusing behaviour.

**Calling an async function starts the work immediately.** The promise is not a recipe you run
later by awaiting it — the work is already in flight the instant you call the function. `await`
only decides *when you stop and collect the result*.

```js
const a = slowQuery();        // ← running NOW
const b = slowQuery();        // ← also running NOW, concurrently with a
const ra = await a;           // collect
const rb = await b;           // collect (probably already done)
```

That is the entire trick behind §17's parallelism: nothing special is happening, you just called
both functions before awaiting either. Which also means:

```js
// ⚠️ These are NOT equivalent
await slowQuery(); await slowQuery();                          // 2 round trips, back to back
const [x, y] = await Promise.all([slowQuery(), slowQuery()]);  // 2 round trips, at once
```

And the sharp edge: **an eagerly-started promise you never await is a rejection nobody is
watching** (§14). If you start work early, you must eventually await it or attach a `.catch`.

```js
// ❌ If pingCache() rejects between these two lines, the process dies (§14)
const cached = pingCache();
await somethingSlow();
const value = await cached;

// ✅ Attach the handler at creation time when the await is far away
const cached = pingCache().catch(() => null);
```

If you want real laziness, pass a *function* that makes the promise and call it later. That is
exactly why the `mapLimit` helper in §20 takes `fn` rather than an array of promises.

---

# Part 2 — async / await

## 8. async/await is the same object, better syntax

`async`/`await` introduces no new runtime concept. It is syntax over the Promise from Part 1.

- **`async` on a function** means: this function returns a Promise. Always. `return 5` gives you a
  promise for `5` (**verified**: `(async () => 5)() instanceof Promise === true`), and a `throw`
  gives you a rejected promise instead of a synchronous exception.
- **`await` on a value** means: if it's a promise (or thenable), pause *this function* until it
  settles, then evaluate to its value — or throw its rejection reason.

"Pause this function" is the important half. The **thread is not paused.** Your function's
continuation is registered as a callback and the event loop moves on to other requests. That is
the whole point of §1, restated in syntax.

```js
async function getUser(id) {
  const user = await User.findById(id);   // this function pauses; the server keeps serving
  return User.publicFields(user);         // wrapped in a promise automatically
}
```

Two hard rules:

1. `await` is only legal inside an `async` function. **This project is CommonJS — there is no
   top-level `await`** (rule 6 in [AGENTS.md](./AGENTS.md)). Wrap it: `(async () => { ... })()`.
2. An `async` function *always* returns a promise, so its caller must `await` it — or the caller
   has a floating promise and a bug waiting to happen.

### The ESM escape hatch

Some modern packages ship ESM only, and `require()` will refuse them. Inside an async function:

```js
async function renderMarkdown(src) {
  const { marked } = await import('marked');   // dynamic import works in CommonJS
  return marked(src);
}
```

---

## 9. When to put `async` on a function

**Rule: `async` if the body contains `await`, or if you deliberately want callers to get a
promise. Otherwise leave it off.**

Marking a synchronous function `async` is not harmless — it forces every caller to `await`, it
defers the result by a tick, and it hides from the reader whether the function does I/O.

Real examples from [app/models/User.js](app/models/User.js):

```js
// ✅ async — it awaits the hash
static async createWithPassword({ username, password, status = 'active' }) {
  return this.create({ username, password: await hashPassword(password), status });
}

// ✅ NOT async — pure object transform, no I/O. Callers write User.publicFields(row).
static publicFields(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

// ✅ NOT async — string trimming. Same reasoning.
static searchFor(term) {
  const trimmed = String(term || '').trim();
  return trimmed ? { fields: this.searchable, term: trimmed } : null;
}
```

### The borderline case: `async` with no `await` in the body

```js
static async findByUsername(username) {
  return this.findOne({ username });     // already a promise
}
```

The `async` here is technically redundant — returning a promise from a sync function looks
identical to the caller. It is kept deliberately, for two reasons: it documents "this touches the
database", and it means a later edit that adds an `await` inside is not a signature change.
**Keep this pattern for anything that does I/O; do not add it to pure functions.**

One place `async` is *not* redundant: it converts synchronous throws into rejections.

```js
const f  = () => { throw new Error('sync'); };        // throws at the call site
const fa = async () => { throw new Error('async'); }; // returns a rejected promise

try { f(); } catch (e) {}          // caught
try { fa(); } catch (e) {}         // ⚠️ NOT caught — needs `await fa()` (§13)
```

---

## 10. When to put `await` on a value

**Rule: `await` where you need the value, not the receipt.**

In this codebase, that means:

| Needs `await` | Does not need `await` |
|---|---|
| Anything from `app/models/` (all of `Model`'s statics) | `respond()` / `fail()` from `core/Controller.js` |
| `hashPassword` / `comparePassword` (`core/helpers/hash.js`) | `req.body`, `req.params`, `req.query` |
| `httpClient` calls (`core/helpers/httpClient.js`) | validators and the `validate` middleware |
| `fs/promises`, `mailer.send`, upload handlers | `User.publicFields()`, `User.searchFor()` |
| Anything documented as returning a promise | `logger.info()` |

The reliable test when you are unsure: **log it.** `Promise { <pending> }` in the output means you
needed an `await`.

### Where deliberately *not* awaiting is correct

Two cases, both covered elsewhere: starting work early for parallelism (§7, §17), and
fire-and-forget with an attached `.catch` (§16). Everything else, await it.

---

## 11. The forgotten `await`

This is the single most common bug in Node code, so learn its symptoms rather than its cause.

```js
const user = User.findById(1);          // ❌ a Promise
const user = await User.findById(1);    // ✅ the row
```

**Verified** for the un-awaited version:

| You do | You get | Why |
|---|---|---|
| `typeof user` | `'object'` | a Promise is an object |
| `user.name` | `undefined` | Promise has no such property |
| `if (user)` | **always true** | every object is truthy — so `if (!user) return 404` never fires |
| `String(user)` | `'[object Promise]'` | this is what renders into your EJS page |
| `res.json({ user })` | `{"user":{}}` | `JSON.stringify` of a promise is an empty object |

That third row is the dangerous one. A missing `await` on a lookup does not throw — it makes your
"not found" guard silently pass, and the next line fails somewhere less obvious with `Cannot read
properties of undefined`.

```js
// ❌ Verified: this 404 branch is dead code
const user = User.findById(req.params.id);
if (!user) return fail(req, res, { message: 'Not found', status: 404 });
return respond(req, res, { view: 'users/show', data: { user } });   // renders [object Promise]
```

The same bug, one level up, is forgetting to await a *call* to your own async function:

```js
async function chargeCard(order) { /* ... */ }

exports.store = async (req, res, next) => {
  try {
    chargeCard(order);                    // ❌ not awaited — the response goes out before the
    return respond(req, res, { ... });    //    charge completes, and a failure crashes the
  } catch (err) { return next(err); }     //    process instead of reaching this catch (§14)
};
```

---

## 12. Execution order: the microtask queue

You do not need the full event loop to write correct code, but you need this much, because it
explains why `.then` callbacks run "later" even when the promise is already settled.

Node has **two queues that drain at different priorities**:

- **Microtasks** — promise callbacks (`.then`, and everything after an `await`), plus
  `process.nextTick`. Drained *completely* after the current synchronous block finishes, before
  any timer gets a look in.
- **Macrotasks** — timers (`setTimeout`, `setInterval`), I/O callbacks, `setImmediate`. One phase
  at a time, with the whole microtask queue drained between each.

**Verified** ordering at the top level of a script:

```js
setTimeout(() => log('setTimeout'), 0);
setImmediate(() => log('setImmediate'));
Promise.resolve().then(() => log('promise.then'));
process.nextTick(() => log('nextTick'));
log('sync');

// Output: sync -> nextTick -> promise.then -> setImmediate -> setTimeout
```

All synchronous code first. Then `nextTick` (its own queue, ahead of promises). Then promise
microtasks. Only then the timer phases. Three practical consequences:

**1. `await` always yields at least one tick — even on a non-promise.**

```js
// ✅ Verified: prints A B C, not A C B
(async () => { log('A'); await 42; log('C'); })();
log('B');
```

`await 42` has nothing to wait for, but it still suspends the function and resumes it as a
microtask. Never rely on code after an `await` running "immediately".

**2. A tight microtask loop starves timers.** An infinite chain of `.then`s will never let a
`setTimeout` fire, because the microtask queue never empties. Rare, but it looks like a total
freeze when it happens.

**3. `process.nextTick` jumps the promise queue.** Only reach for it in library code that must run
before any pending promise callback. In application code, don't.

---

# Part 3 — Errors

## 13. try / catch / finally with await

`await` converts a rejection into a **thrown exception in your function**, which is what makes the
language's own error handling work with async code:

```js
try {
  const user = await User.findByUsername(username);   // rejection → throw, right here
  if (!user) throw new Error('No such user');         // your own throw, same channel
} catch (err) {
  logger.warn(err.message);                           // both arrive here
} finally {
  // runs on both paths, and on an early return
}
```

`throw` and `reject` are the same channel from the caller's point of view:

```js
async function a() { throw new Error('x'); }
async function b() { return Promise.reject(new Error('x')); }
// await a() and await b() are indistinguishable to the caller
```

### ⚠️ `try/catch` only catches what you `await`

```js
// ❌ Verified: execution continues past the rejection; the catch never fires
try {
  Promise.reject(new Error('boom'));      // no await
  console.log('still here');              // ← this prints
} catch (e) {
  console.log('never reached');
}
```

The same trap in its two everyday disguises:

```js
try { someAsyncFn(); } catch {}                       // ❌ missing await
try { rows.forEach(async (r) => { ... }); } catch {}  // ❌ forEach discards the promises (§19)
```

### `finally` for cleanup — and one sharp edge

```js
const conn = await db.pool.getConnection();
try {
  await conn.query('...');
} finally {
  conn.release();          // runs whether the query threw or not
}
```

**Verified sharp edge:** a `return` inside `finally` overrides the `return` in `try`. Never return
from a `finally` block.

```js
function g() { try { return 'from try'; } finally { return 'from finally'; } }
g();   // 'from finally'
```

### Errors that carry an HTTP status

[core/middlewares/errorHandler.js:14](core/middlewares/errorHandler.js:14) reads `err.status`, so
this is how a model or service says "this is a 402, not a 500":

```js
const err = new Error('Payment declined');
err.status = 402;
throw err;
```

---

## 14. Unhandled rejections kill the process

A rejected promise that nothing is watching is not a warning you can ignore. **Verified on Node
v24.11.1:** the default mode is `--unhandled-rejections=throw`, and the process dies.

```
Error: boom
    at v1.js:52:24
Node.js v24.11.1        ← process exited non-zero
```

In *this* framework the consequence is specific and worth knowing exactly.
[core/lifecycle.js:137](core/lifecycle.js:137) installs a handler that treats an unhandled
rejection as fatal — it logs the stack and starts a **graceful shutdown**:

```js
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled promise rejection: ${...}`);
  shutdown('unhandledRejection');
});
```

That is deliberate, not defeatist: the process's invariants may already be broken, so it drains
its connections and exits cleanly rather than serving corrupt responses, and the orchestrator
starts a replacement. But the operational reality is that **one missing `await` in one controller
can take a pod down.** Which is why §15's try/catch is not a style rule.

Every promise needs exactly one of: an `await` (inside a `try`), a `.catch()`, or a place in a
`Promise.all`/`allSettled` that is itself awaited.

---

## 15. Express 4 and the vanishing error

Express 4 route handlers are called synchronously and their **return value is ignored**. Hand it
an `async` function and Express has no idea a promise came back — so a rejection reaches nobody.

**Verified**, on Express 4.22.2 + Node 24, with this handler:

```js
app.get('/hang', async () => { throw new Error('unhandled in async handler'); });
```

| Node setting | Observed result |
|---|---|
| default (`--unhandled-rejections=throw`) | **process crashed**, stack printed, non-zero exit |
| `--unhandled-rejections=warn` | `UnhandledPromiseRejectionWarning` logged, and the client **got no response at all** — my `fetch` was still waiting when I aborted it at 1500ms |

Either way the request is never answered. The error middleware — even a correct four-argument one
— is never reached, because nothing ever called `next(err)`.

**The fix is the shape every controller in this framework uses.** Verified answering
`500 {"error":"handled"}` in the same test run:

```js
exports.show = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(req, res, { message: 'Not found', status: 404 });
    return respond(req, res, {
      view: 'users/show',
      data: { user: User.publicFields(user) },
    });
  } catch (err) {
    return next(err);      // ← the only thing connecting a rejection to errorHandler.js
  }
};
```

Three details in that snippet are not decoration:

- **`return next(err)`** — the `return` stops execution. Without it, code after the catch can run
  and try to send a second response (`Cannot set headers after they are sent`).
- **`return` on every `respond`/`fail`** — same reason.
- **The `catch` wraps everything**, including the `fail()` call, not just the `await`.

> Express 5 changes this — it forwards a rejected handler promise to `next()` automatically. This
> project is on Express 4 (`4.22.2`, verified). Write the try/catch.

---

## 16. Fire-and-forget, done properly

Sometimes you genuinely do not want to make the user wait — an audit log write, a notification
email. The rule is: **you may skip the `await`, but you may never skip the error handler** (§14).

```js
// ❌ Rejection → process shutdown (§14)
notifyUserCreated(user);

// ✅ The .catch is what makes this safe
notifyUserCreated(user).catch((err) => logger.warn(`notify failed: ${err.message}`));
```

This is the one place `.catch()` beats `try/catch` — the whole point is *not* to await, so there
is nothing for a `try` block to catch.

Two cautions. First, the response may go out before the work finishes, so it must be work whose
failure genuinely does not affect the user's result. Second, in-request fire-and-forget does not
survive a shutdown: `core/lifecycle.js` drains *connections*, not your detached promise. For
anything that must not be lost, use a queue.

---

# Part 4 — Doing more than one thing

## 17. Sequential vs parallel, measured

Sequential `await`s on independent work is the most common performance mistake in Node code.
**Verified**, three 100ms operations:

```js
// ❌ 334ms — each waits for the one before
await wait(100);
await wait(100);
await wait(100);

// ✅ 112ms — all three in flight at once
await Promise.all([wait(100), wait(100), wait(100)]);
```

Nothing magic happened: per §7, calling the function starts the work, so all three were already
running before `Promise.all` was reached. `Promise.all` just waits for the set.

```js
// ❌ Two round trips, one after the other
const users = await User.paginate({ page });
const active = await User.countActive();

// ✅ Both at once
const [users, active] = await Promise.all([
  User.paginate({ page }),
  User.countActive(),
]);
```

**Only parallelise independent work.** If B needs A's result — `findById` then `update` — they are
sequential by necessity, and that is fine.

---

## 18. The four combinators

| Combinator | Settles when | Result | Use it for |
|---|---|---|---|
| `Promise.all` | all fulfil, **or the first rejects** | array of values | the normal case: everything must succeed |
| `Promise.allSettled` | all settle, never rejects | `[{status, value\|reason}]` | partial failure is acceptable |
| `Promise.race` | the first to **settle**, ok or not | that one outcome | timeouts (§21) |
| `Promise.any` | the first to **fulfil** | that value | redundant sources; rejects with `AggregateError` |

**Verified** behaviour with one job failing at 20ms and one succeeding at 200ms:

```
Promise.all        → rejected after 27ms with "first"  (the slow one keeps running, unwatched)
Promise.allSettled → resolved after 205ms: ["rejected","fulfilled"]
```

Note what `Promise.all`'s fail-fast really means: it **does not cancel** the other work. Those
promises keep going; `all` just stops waiting. If a survivor later rejects, its rejection is
already considered handled, so it won't crash the process — but any side effects it was
performing still happen.

```js
// allSettled when you want every result regardless
const results = await Promise.allSettled(ids.map((id) => fetchUser(id)));
const users  = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
```

⚠️ `Promise.all` rejects with the *first* error and discards the rest. When you need to know
everything that went wrong — validating a batch, or a readiness probe that should report every
failing dependency — either use `allSettled`, or make each job catch its own errors and return a
status object (which is what `core/health.js` does; see §24).

---

## 19. Loops: for...of, map+all, and the forEach trap

### `for...of` — sequential, ordered, stops on the first error

```js
const imported = [];
for (const row of rows) {
  imported.push(await Import.create(row));   // one at a time
}
```

**Verified**: a throw on the third iteration leaves the first two done and exits the loop
immediately. Use this when order matters, when each step depends on the last, or when parallel
would open hundreds of connections at once.

### `map` + `Promise.all` — parallel, ordered results

```js
const users = await Promise.all(ids.map((id) => User.findById(id)));
```

`.map` with an async callback returns **an array of promises** (**verified**:
`[Promise, Promise]`) — which is exactly what `Promise.all` wants. Results come back in input
order even though the work finished out of order.

### ⚠️ `forEach` with an async callback — always wrong

`forEach` ignores its callback's return value, so it throws away every promise. **Verified:**

```js
const log = [];
[1, 2, 3].forEach(async (n) => { await wait(10); log.push(n); });
console.log(log);          // [] — nothing has run yet
// 50ms later: [1,2,3] — long after the surrounding function returned
```

Two failures at once: the surrounding function does not wait, and a rejection inside becomes an
unhandled rejection (§14). Same for `.map` without `Promise.all`, and for `.filter`/`.sort` with
an async predicate (a promise is always truthy — the filter keeps everything).

| Want | Use |
|---|---|
| One at a time, in order | `for (const x of xs) { await ... }` |
| All at once, results in order | `await Promise.all(xs.map(fn))` |
| All at once, tolerate failures | `await Promise.allSettled(xs.map(fn))` |
| N at a time | `mapLimit` (§20) |
| Anything | **never** `forEach(async ...)` |

---

## 20. Limiting concurrency

`Promise.all` over 5,000 ids opens 5,000 concurrent operations, exhausts the connection pool, and
gets you rate-limited by whatever you are calling. You want N at a time.

**Verified** — peak concurrency 3, ten 30ms jobs in 126ms (vs ~300ms sequential), results in input
order:

```js
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;                 // claim an index, THEN await — no two workers share one
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const users = await mapLimit(ids, 5, (id) => User.findById(id));
```

Why it works: `limit` worker functions are started at once, and each pulls the next index off a
shared counter until the list is exhausted. The claim (`const idx = i++`) happens *before* the
`await`, which is what keeps two workers from grabbing the same item.

Note the signature: `fn` is a **function**, not a promise. Per §7, an array of promises would
already all be running — laziness is what makes the limit possible.

Sensible limits: **at or below the pool size** for the database (`connectionLimit` is 10 in
[core/db/mysql.js](core/db/mysql.js)), whatever the vendor documents for an external API, and
roughly `os.cpus().length` for CPU-ish work.

---

## 21. Timeouts, races and AbortController

A promise has **no built-in timeout**. Neither does `fetch`. A hung TCP connection will keep a
request pending until the client gives up.

The pattern is `Promise.race` against a timer — this is
[core/health.js:26](core/health.js:26), used so a readiness probe can never hang:

```js
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} check timed out after ${ms}ms`)), ms)),
  ]);
}

await withTimeout(db.query('SELECT 1'), 2000, 'database');
```

**Verified**: rejects at 50ms while the 500ms work is still running.

⚠️ `race` **does not cancel the loser.** The slow work keeps going, still holding its connection.
`race` only stops *you* from waiting. To actually abort the work you need `AbortController` —
which is what [core/helpers/httpClient.js:130](core/helpers/httpClient.js:130) does, because it is
the only thing that genuinely enforces a timeout on `fetch`:

```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeout);
try {
  const res = await fetch(url, { signal: controller.signal });
  return res;
} finally {
  clearTimeout(timer);          // ⚠️ or the timer keeps the event loop alive
}
```

That `clearTimeout` in the `finally` matters beyond tidiness: a pending timer is a live handle, and
leaked handles are one of the reasons a test run hangs after all tests pass (§27).

---

# Part 5 — This framework

## 22. The model layer is all async

Rule 1 in [AGENTS.md](./AGENTS.md): all SQL lives in `app/models/`. Every inherited static on
[core/Model.js](core/Model.js) is `async`, so every call needs an `await`:

```js
await Product.find({ status: 'active' }, { limit, offset, orderBy, search })
await Product.findOne({ sku: 'X1' })
await Product.findById(id)
await Product.count({ status: 'active' })
await Product.create({ name, sku })
await Product.update(id, { name })
await Product.delete(id)
await Product.paginate({ where, search, page, pageSize, orderBy })
await Product.raw(sql, params)
```

Your own model statics follow §9: `async` when they touch the database or await a helper, plain
when they only shape data.

```js
class Product extends Model {
  static table = 'products';
  static searchable = ['name', 'sku'];

  static async findBySku(sku) {                    // async — hits the DB
    return this.findOne({ sku });
  }

  static async skuTaken(sku, exceptId = null) {    // async — awaits the lookup above
    const existing = await this.findBySku(sku);
    if (!existing) return false;
    return exceptId == null || String(existing.id) !== String(exceptId);
  }

  static toListItem(product) {                     // NOT async — pure transform
    return { id: product.id, label: `${product.sku} — ${product.name}` };
  }
}
```

---

## 23. The controller shape, and why it never varies

Every async controller action in this framework has the same skeleton, for the reason measured in
§15. Note that `respond` and `fail` are **synchronous** — they are not awaited, they are returned.

```js
const { respond, fail } = require('../../../core/Controller');
const Product = require('../../models/Product');

exports.index = async (req, res, next) => {
  try {
    const { rows, meta } = await Product.paginate({
      page: req.query.page,
      search: Product.searchFor(req.query.q),
    });
    return respond(req, res, { view: 'products/index', data: { products: rows, meta } });
  } catch (err) {
    return next(err);
  }
};

exports.store = async (req, res, next) => {
  try {
    if (await Product.skuTaken(req.body.sku)) {
      return fail(req, res, {
        message: 'SKU already exists',
        status: 422,
        view: 'products/create',
      });
    }
    const product = await Product.create(req.body);
    return respond(req, res, {
      status: 201,
      data: { product },
      redirect: '/products',
      view: 'products/show',
    });
  } catch (err) {
    return next(err);
  }
};
```

The checklist for any handler you write:

- [ ] `async` on the handler, `next` in the parameter list
- [ ] the whole body inside `try`
- [ ] `catch (err) { return next(err); }` — with the `return`
- [ ] `return` on every `respond` / `fail` / `res.*`
- [ ] every model call awaited
- [ ] no `await` on `respond` / `fail`
- [ ] middleware you write follows the same rules — it also gets `next`

---

## 24. Parallelism already in `core/`

Two places worth reading, because they are the patterns to copy.

**[core/Model.js:56](core/Model.js:56)** — `paginate` needs a page of rows *and* a total count.
Independent queries, so they go together:

```js
const [rows, total] = await Promise.all([
  db.findWhere(this.resource, where, { limit: size, offset: (p - 1) * size, orderBy, search }),
  db.count(this.resource, where, { search }),
]);
```

**[core/health.js:78](core/health.js:78)** — the readiness probe checks every dependency at once,
so `/ready` costs the slowest check rather than the sum of them:

```js
const results = await Promise.all([checkDatabase(), ...checks.map((fn) => runCheck(fn))]);
const healthy = results.every((r) => r.status === 'up');
```

Read that alongside §18: it uses `Promise.all` rather than `allSettled`, but it gets
`allSettled`'s "report every failure" behaviour anyway, because `checkDatabase()` and `runCheck()`
each catch their own errors and **resolve** with `{ status: 'down', error }`. That is the other
way to avoid fail-fast — make the jobs unable to reject — and it's usually the nicer one, because
the caller gets uniform result objects instead of a `{status, value|reason}` wrapper to unpack.

---

## 25. Calling other services

Rule from [TUTORIAL-SOA.md](./TUTORIAL-SOA.md): **never call another service with bare `fetch`.**
Bare `fetch` has no timeout (§21), no retries, no circuit breaker, and does not propagate the
correlation ID that makes a distributed trace possible.

```js
const { createClient } = require('../../core/helpers/httpClient');

const notifications = createClient({
  name: 'notifications',        // names the circuit breaker — required
  baseUrl: process.env.NOTIFICATION_SERVICE_URL,
  timeoutMs: 3000,
  retries: 2,
});

const res = await notifications.post('/send', { to, template });
```

What that client is doing with promises, all of it in
[core/helpers/httpClient.js](core/helpers/httpClient.js):

| Concern | Mechanism |
|---|---|
| Timeout | `AbortController` + `setTimeout`, cleared in `finally` (§21) |
| Retries | a loop of awaited attempts, only for idempotent methods |
| Backoff | `await sleep(ms)` — i.e. `new Promise((r) => setTimeout(r, ms))` — with jitter, so retries don't synchronise |
| Circuit breaker | `canAttempt()` before the call, `onSuccess()`/`onFailure()` after; opens after N failures and fails fast |

A note on retries and idempotency, since it is an async-design decision rather than a detail: the
client only retries `GET`/`HEAD`/`PUT`/`DELETE` by default. Retrying a `POST` that succeeded but
timed out on the *response* creates a duplicate. Pass `retry` explicitly only when you know the
endpoint is safe.

---

## 26. Transactions and the lock-timeout hang

**The framework ships no transaction helper.** `core/db/mysql.js` exports the `pool`, and that is
what you build on. When you need one, the pattern is:

```js
const db = require('../../core/db');

async function transferStock(fromId, toId, qty) {
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, fromId]);
    await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, toId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();          // ⚠️ non-negotiable — a leaked connection starves the pool
  }
}
```

Per rule 1, that belongs in a model (or a service if it spans models), never in a controller.

### ⚠️ The hang that costs an afternoon

From the gotcha table in [AGENTS.md](./AGENTS.md) §8, and it is pure async plumbing:

```js
// ❌ Deadlock. The helper's Model call takes a DIFFERENT pooled connection, which blocks on
//    the row lock this transaction holds — and the transaction is waiting on the helper.
await conn.beginTransaction();
await conn.query('UPDATE products SET stock = 0 WHERE id = ?', [id]);
const product = await Product.findById(id);       // ← hangs until lock timeout

// ✅ Thread the transaction's connection through as the first argument
const product = await findByIdOn(conn, id);
```

The symptom is a request that hangs for exactly your `innodb_lock_wait_timeout` (50s by default)
and then fails. **Rule: inside a transaction, every query goes through `conn`.** Any helper you
call must accept the connection as its first parameter.

---

## 27. Async in tests

Node's test runner awaits an async test function, so the shape is ordinary:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('creates a product', async () => {
  const product = await Product.create({ name: 'Widget', sku: 'W1' });
  assert.equal(product.sku, 'W1');
});
```

Three async-specific traps in this repo's suite:

**1. A forgotten `await` makes a test pass regardless.** The assertion runs against a promise, the
test function returns before the work finishes, and a later rejection surfaces as an unrelated
failure or a crashed run.

```js
// ❌ Passes even if create() rejects
assert.equal(Product.create({ sku: 'W1' }).sku, 'W1');
```

**2. Assert on rejections with the right helper**, not a bare try/catch:

```js
await assert.rejects(() => Product.create({ sku: null }), /sku/);
```

**3. The run hangs after all tests pass.** This is always a live handle, and per
[AGENTS.md](./AGENTS.md) §8 there are two known causes in this repo: a session store keeping the
event loop alive (hence MemoryStore under `NODE_ENV=test`), and cache-busted `core/db` leaking
pools (hence the STATEFUL exclusion list in `tests/helpers/testApp.js`). Your own leaked
`setInterval` or unclosed pool will do the same.

Also from §7 of [AGENTS.md](./AGENTS.md): **stop the dev server before running the suite.** It
competes for the test database, and the run looks hung when it is actually blocked.

```bash
npm test
```

---

# Part 6 — Reference

## 28. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| `[object Promise]` in the page | missing `await` on a model call | add the `await` (§11) |
| `undefined` where a field should be | reading a property off a promise | add the `await` (§11) |
| A "not found" 404 branch never fires | `if (!user)` on a promise — always truthy | add the `await` (§11) |
| `{"user":{}}` in a JSON response | `JSON.stringify` of a promise | add the `await` (§11) |
| Request hangs forever, no error logged | async handler threw, nothing called `next(err)` | try/catch + `next(err)` (§15) |
| Process exits with a bare stack trace | unhandled rejection — Node's default is fatal | await it, or `.catch()` it (§14) |
| `Unhandled promise rejection` then a graceful shutdown | same, caught by `core/lifecycle.js` | same (§14) |
| `Cannot set headers after they are sent` | two responses — a missing `return` before `respond`/`next` | `return` every response (§15) |
| An async loop's results are empty | `forEach(async ...)` | `for...of` or `Promise.all(map)` (§19) |
| `catch` block never runs | the promise inside wasn't awaited | `await` inside the `try` (§13) |
| A filter keeps every element | async predicate — a promise is truthy | resolve first, then filter (§19) |
| Endpoint is slow, each query is fast | sequential awaits on independent work | `Promise.all` (§17) |
| Pool exhausted / connection errors under load | `Promise.all` over thousands of items | `mapLimit` (§20) |
| Request hangs ~50s then errors | a helper took a new connection inside a transaction | thread `conn` through (§26) |
| Timeout fires but the work continues | `Promise.race` does not cancel | `AbortController` (§21) |
| Test suite hangs after passing | a live handle — timer, pool, or session store | §27 |
| A function returns before its work finishes | `async` call not awaited | await it, or `.catch()` deliberately (§16) |
| `SyntaxError: await is only valid in async functions` | top-level `await` in CommonJS | wrap in `(async () => { ... })()` (§8) |
| `Cannot use import statement outside a module` | ESM-only package | `await import('pkg')` inside async (§8) |

---

## 29. Exercises

Run these against the framework. Answers are in the sections named.

1. **Predict the output**, then run it. Why is `B` before `C`? (§12)

   ```js
   (async () => { console.log('A'); await 42; console.log('C'); })();
   console.log('B');
   ```

2. Find **three** bugs in this handler. (§11, §15, §19)

   ```js
   exports.index = async (req, res) => {
     const users = User.find({ status: 'active' });
     users.forEach(async (u) => { u.orders = await Order.find({ user_id: u.id }); });
     res.render('users/index', { users });
   };
   ```

3. Rewrite so the two independent queries run at once, and time both versions. (§17)

   ```js
   const users = await User.paginate({ page: 1 });
   const active = await User.countActive();
   ```

4. In `mapLimit`, what breaks if you move `const idx = i++` to *after* the `await`? Predict it,
   then try it. (§20)

5. Write `withTimeout(promise, ms)` that rejects after `ms`. Then explain why it does not stop the
   underlying work, and what would. Compare your answer with
   [core/health.js:26](core/health.js:26). (§21)

6. Why is `User.publicFields()` not `async` while `User.createWithPassword()` is? Both are in
   [app/models/User.js](app/models/User.js). (§9)

7. `core/health.js` uses `Promise.all`, yet a single failing dependency does not make the whole
   probe reject. Why not? (§18, §24)

8. Add a `mapLimit`-based bulk import to a model, honouring the pool's `connectionLimit`. Verify
   there is no connection leak: the suite must still exit cleanly. (§20, §27)

Runnable versions of the core promise mechanics live in
[practice/08-promises.js](practice/08-promises.js) — `node practice/08-promises.js`.

---

## 30. Cheat sheet

```js
// ── The object ────────────────────────────────────────────────────────────────
// pending → fulfilled (value) | rejected (reason). Settles once. Eager, not lazy.
new Promise((resolve, reject) => { /* runs SYNCHRONOUSLY, right now */ });
Promise.resolve(v); Promise.reject(new Error('x'));

// ── Syntax ────────────────────────────────────────────────────────────────────
async function f() {}          // always returns a Promise; throw → rejection
const v = await p;             // pauses THIS function, not the thread
                               // CommonJS: no top-level await → (async () => {})()

// ── async yes/no ──────────────────────────────────────────────────────────────
async  → the body awaits, or the function does I/O
plain  → pure transforms (publicFields, searchFor, respond, fail)

// ── Errors ────────────────────────────────────────────────────────────────────
try { await x(); } catch (e) { next(e); }     // only catches what you AWAIT
work().catch((e) => logger.warn(e.message));  // fire-and-forget MUST have this
// unhandled rejection = process death (core/lifecycle.js shuts down gracefully)
// never `return` from a finally block

// ── Concurrency ───────────────────────────────────────────────────────────────
await a(); await b();                    // sequential: 100+100+100 = 334ms (measured)
await Promise.all([a(), b()]);           // parallel:                  112ms (measured)
Promise.all        // all, or first rejection (does NOT cancel the rest)
Promise.allSettled // every outcome, never rejects
Promise.race       // first to settle — timeouts (does NOT cancel the loser)
Promise.any        // first to fulfil

for (const x of xs) await f(x);          // sequential, ordered, stops on error
await Promise.all(xs.map(f));            // parallel, results in input order
await mapLimit(xs, 5, f);                // N at a time
xs.forEach(async (x) => await f(x));     // ❌ NEVER — discards every promise

// ── Express 4 (this project) ──────────────────────────────────────────────────
exports.action = async (req, res, next) => {
  try   { return respond(req, res, { view, data }); }   // respond/fail are SYNC
  catch (err) { return next(err); }                     // no next(err) = hung request
};
```

---

| Next | |
|---|---|
| [TUTORIAL-JS.md](./TUTORIAL-JS.md) | the rest of Node for PHP developers — modules, the event loop, the 14 errors you'll hit |
| [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) | the runnable practice course, incl. `practice/08-promises.js` |
| [TUTORIAL.md](./TUTORIAL.md) | the framework reference — DB, helpers, JWT, mail, uploads, deployment |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | health probes, graceful shutdown, resilient service-to-service calls |
