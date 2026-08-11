# JavaScript & Node for PHP Developers

A working guide to the JavaScript you actually need to build on, debug, and repair this
framework. Written for someone fluent in PHP who is now reading Node code.

Every example is runnable, and every "gotcha" here is one that bit a real PHP developer moving
across. Where a section explains something the framework relies on, it points at the real file.

> Set up: `VIEW_ENGINE=ejs`, `APP_MODE=hybrid`. Node 18+ (this repo is on 24).
> Run any snippet with `node -e "...”` or by saving to `scratch.js` and running `node scratch.js`.

---

## Contents

**Part 1 — The mental shift**
1. [One process, many requests](#1-one-process-many-requests)
2. [Modules: require and exports](#2-modules-require-and-exports)

**Part 2 — The language**
3. [Variables: const, let, never var](#3-variables-const-let-never-var)
4. [Types, null vs undefined, and the truthiness traps](#4-types-null-vs-undefined-and-the-truthiness-traps)
5. [Strings](#5-strings)
6. [Objects and arrays are references](#6-objects-and-arrays-are-references)
7. [Destructuring and spread](#7-destructuring-and-spread)
8. [Functions, arrow functions, and `this`](#8-functions-arrow-functions-and-this)
9. [Array methods (your PHP array_* cheatsheet)](#9-array-methods-your-php-array_-cheatsheet)

**Part 3 — Async, the big one**
10. [Callbacks, promises, async/await](#10-callbacks-promises-asyncawait)
11. [Error handling in async code](#11-error-handling-in-async-code)
12. [Running things in parallel](#12-running-things-in-parallel)

**Part 4 — Node & the framework**
13. [Node runtime essentials](#13-node-runtime-essentials)
14. [npm and package.json (vs composer)](#14-npm-and-packagejson-vs-composer)
15. [How Express actually works](#15-how-express-actually-works)
16. [EJS templates](#16-ejs-templates)
17. [Reading a stack trace and debugging](#17-reading-a-stack-trace-and-debugging)
18. [The 14 errors you will actually hit](#18-the-14-errors-you-will-actually-hit)

**Part 5 — Next**
19. [Notes for agentic AI work](#19-notes-for-agentic-ai-work)
20. [A 2-week learning path](#20-a-2-week-learning-path)

---

# Part 1 — The mental shift

## 1. One process, many requests

This is the single biggest change, and almost every Node bug a PHP developer writes traces back
to it.

**PHP:** every request gets a fresh process. Globals are born and die with the request. If your
script blocks for 2 seconds on a database query, only *that* request waits. Memory leaks are
mostly impossible because everything is torn down at the end.

**Node:** *one* process handles *every* request, and keeps running for weeks. A single thread
runs your JavaScript.

Three consequences that matter immediately:

### (a) Module-level state is shared by every user

```js
// ❌ CATASTROPHIC in Node. Fine-ish in PHP.
let currentUser = null;                    // module scope = shared by ALL requests

exports.index = async (req, res) => {
  currentUser = req.session.user;          // request B overwrites request A's value
  const data = await slowQuery();          // ...A resumes here with B's user
  res.render('page', { user: currentUser });// A renders B's data. Data leak.
};
```

```js
// ✅ Keep per-request state on `req`, or in a local variable.
exports.index = async (req, res) => {
  const currentUser = req.session.user;    // local — one per invocation
  const data = await slowQuery();
  res.render('page', { user: currentUser });
};
```

This is exactly why `core/context.js` uses `AsyncLocalStorage` rather than a module variable to
hold the request id. Read the comment at the top of that file — it's the same lesson.

### (b) Blocking the thread blocks everyone

```js
// ❌ Freezes the ENTIRE SERVER for 3 seconds. Every user. Health checks fail.
const start = Date.now();
while (Date.now() - start < 3000) {}
```

There is no PHP equivalent of this disaster, because PHP never shares a thread between requests.
Anything CPU-heavy (image processing, big loops, sync crypto) must go to a worker or a queue.

### (c) Things must be cleaned up

An unclosed database connection or an interval timer lives forever. That's why
`core/lifecycle.js` exists and why the tests close their pool.

### The event loop, concretely

Run this:

```js
console.log('A sync');
setTimeout(() => console.log('D setTimeout'), 0);
Promise.resolve().then(() => console.log('C microtask'));
console.log('B sync');
```

Output — **verified**:

```
A sync | B sync | C microtask | D setTimeout
```

The rules:
1. All synchronous code runs to completion first.
2. Then **microtasks** (resolved promises / `await` continuations).
3. Then **macrotasks** (`setTimeout`, I/O callbacks).

`setTimeout(fn, 0)` does *not* mean "now" — it means "after everything currently queued".

---

## 2. Modules: require and exports

| PHP | Node |
|---|---|
| `require 'file.php'` / PSR-4 autoload | `require('./file')` |
| `use App\Models\User;` | `const User = require('../models/User');` |
| `composer.json` | `package.json` |
| `vendor/` | `node_modules/` |

**There is no autoloader.** Every dependency is an explicit `require`. That's deliberate — you
can always trace where something came from.

### Exporting

```js
// Named exports — how controllers do it (app/controllers/web/UserController.js)
exports.index = async (req, res) => { /* ... */ };
exports.store = async (req, res) => { /* ... */ };

// Import:
const UserController = require('./UserController');
UserController.index(req, res);
// or destructure:
const { index, store } = require('./UserController');
```

```js
// Single export — how models do it (app/models/User.js)
class User extends Model { /* ... */ }
module.exports = User;

// Import:
const User = require('../models/User');
```

```js
// Object of things — how helpers do it (core/helpers/hash.js)
module.exports = { hashPassword, verifyPassword };

// Import (destructured, the common style in this codebase):
const { hashPassword } = require('../../core/helpers/hash');
```

> **`exports.foo = …` vs `module.exports = …`** — `exports` is just a shortcut variable pointing
> at `module.exports`. Assigning `module.exports = X` *replaces* the whole export. Mixing both in
> one file is a classic silent bug: `module.exports = X` wins and every `exports.foo` is lost.

### Paths

```js
require('./User')        // same directory
require('../models/User')// up one
require('express')       // node_modules
```

Relative paths are relative to the **current file**, not the working directory. That's why you
see `require('../../../core/Controller')` in controllers — count the `../` against the folder
depth.

### Modules are cached (a singleton, for free)

```js
// core/db/mysql.js creates ONE pool. Every require() of it gets that same pool.
const pool = mysql.createPool({ /* ... */ });
module.exports = { pool, query /* ... */ };
```

The first `require` executes the file; every later `require` returns the same cached object. This
is how the framework gets singletons (the DB pool, the logger, the circuit-breaker registry) with
no DI container. It's also why `tests/helpers/testApp.js` has to be careful about which modules
it lets the cache-buster reload.

### CommonJS vs ESM

You'll see `import`/`export` in tutorials online. That's **ESM**. This framework uses
**CommonJS** (`require`/`module.exports`). Don't mix them in a `.js` file here — you'll get
`Cannot use import statement outside a module`.

---

# Part 2 — The language

## 3. Variables: const, let, never var

```js
const name = 'jane';     // cannot be REASSIGNED. Use this ~90% of the time.
let count = 0;           // reassignable
count += 1;
var old = 'avoid';       // legacy — function-scoped, hoisted, causes bugs
```

**`const` does not mean immutable.** It means the *binding* can't be repointed. Verified:

```js
const user = { name: 'jane' };
user.name = 'bob';       // ✅ allowed — the object is mutable
// user = {};            // ❌ TypeError: Assignment to constant variable
```

So `const` on an object is like PHP's `$user` — you can still change its properties.

**Why never `var`:** it ignores block scope.

```js
if (true) { var a = 1; let b = 2; }
console.log(a);   // 1   — leaked out of the block
console.log(b);   // ReferenceError — correct behaviour
```

**Rule of thumb:** start with `const`. Change to `let` only when the linter/runtime complains
that you're reassigning.

---

## 4. Types, null vs undefined, and the truthiness traps

### `null` vs `undefined` — PHP has one, JS has two

| | Meaning |
|---|---|
| `undefined` | "never set" — a missing property, a missing argument, no `return` |
| `null` | "deliberately empty" — you set it to nothing on purpose |

```js
const user = { name: 'jane' };
user.name       // 'jane'
user.email      // undefined  — property doesn't exist
user.email = null;              // now deliberately empty

function f(a) { return a; }
f()             // undefined
```

In this framework: a model returns `null` when a row isn't found (`User.findById(999) → null`),
and `undefined` shows up when you typo a property name.

### The falsy list — memorise this

```js
Boolean(false)      // false
Boolean(0)          // false
Boolean(-0)         // false
Boolean(0n)         // false
Boolean("")         // false
Boolean(null)       // false
Boolean(undefined)  // false
Boolean(NaN)        // false
// EVERYTHING else is truthy
```

### ⚠️ Two traps that will get you — both verified

```js
Boolean("0")   // true   ← PHP says FALSE. JS says true!
Boolean([])    // true   ← PHP says FALSE for empty array. JS says true!
Boolean({})    // true
```

This matters constantly:

```js
// ❌ Doesn't do what a PHP dev expects
if (!rows) { /* never runs for an empty array — [] is truthy */ }

// ✅
if (rows.length === 0) { /* ... */ }
```

You'll see `if (!rows.length)` throughout the framework's views for exactly this reason.

### `===` not `==`

`==` coerces types with rules nobody remembers. Verified oddities:

```js
"0" == 0            // true
[] == false         // true
null == undefined   // true
null === undefined  // false
```

**Always use `===` and `!==`.** The single exception you'll see in this codebase is `== null`,
which deliberately catches both `null` and `undefined` in one check — and is commented where used.

### `??` vs `||` — an important distinction

```js
0  || 'default'    // 'default'   ← || treats 0 as missing
0  ?? 'default'    // 0           ← ?? only catches null/undefined
'' || 'default'    // 'default'
'' ?? 'default'    // ''
```

Real bug this causes:

```js
// ❌ page_size=0 silently becomes 25
const pageSize = parseInt(query.page_size, 10) || 25;

// ✅ what core/helpers/pagination.js actually does
const parsed = parseInt(query.page_size, 10);
const pageSize = Number.isNaN(parsed) ? 25 : parsed;
```

This was a **real bug found by the test suite** in this framework — see gotcha #9 in
[TUTORIAL.md](./TUTORIAL.md#22-gotchas-worth-knowing).

### Optional chaining `?.`

```js
const city = user?.address?.city;        // undefined instead of throwing
const n = list?.length ?? 0;
maybeFn?.();                              // only calls if it exists
```

PHP 8's `?->` is the same idea.

### Numbers

There's one number type. `1 === 1.0`.

```js
0.1 + 0.2 === 0.3        // false! floating point
(0.1 + 0.2).toFixed(2)   // '0.30'
parseInt('12abc', 10)    // 12   — always pass the radix
Number('12abc')          // NaN  — stricter
Number.isNaN(NaN)        // true — prefer over global isNaN()
```

**Never store money as a float.** Use integer cents, or a decimal column + a string.

---

## 5. Strings

```js
const name = 'Jane';
const n = 3;

// Template literal (backticks) — like PHP's "double quotes"
`Hello ${name}, you have ${n} item${n === 1 ? '' : 's'}`

// Multi-line, no concatenation needed
const sql = `
  SELECT *
  FROM users
  WHERE status = ?
`;
```

| PHP | JS |
|---|---|
| `strlen($s)` | `s.length` |
| `strtoupper($s)` | `s.toUpperCase()` |
| `trim($s)` | `s.trim()` |
| `str_replace($a,$b,$s)` | `s.replaceAll(a, b)` |
| `strpos($s,$x) !== false` | `s.includes(x)` |
| `substr($s,0,5)` | `s.slice(0, 5)` |
| `explode(',', $s)` | `s.split(',')` |
| `implode(',', $arr)` | `arr.join(',')` |
| `sprintf('%05d', $n)` | `String(n).padStart(5, '0')` |
| `str_starts_with()` | `s.startsWith()` |

**Strings are immutable** — every method returns a new string.

---

## 6. Objects and arrays are references

**The #1 source of confusing bugs for PHP developers**, because PHP copies arrays on assignment
and JS does not.

```php
// PHP — arrays are COPIED
$a = [1, 2];
$b = $a;
$b[] = 3;
count($a);  // 2 — $a untouched
```

```js
// JS — objects and arrays are REFERENCES. Verified:
const a = { n: 1 };
const b = a;
b.n = 99;
a.n;          // 99  ← same object!

const arr1 = [1, 2];
const arr2 = arr1;
arr2.push(3);
arr1.length;  // 3   ← same array!
```

### Copying

```js
const copy = { ...original };        // shallow copy
const copy = [...originalArray];     // shallow copy
const deep = structuredClone(obj);   // deep copy (Node 17+)
```

### ⚠️ Spread is SHALLOW — verified

```js
const nested = { deep: { x: 1 } };
const shallow = { ...nested };
shallow.deep.x = 42;
nested.deep.x;    // 42  ← the inner object is still shared!
```

This is why `User.publicFields()` in `app/models/User.js` works — it destructures out
`password` at the top level, which is all that's needed for a flat DB row. For nested data
you'd need `structuredClone`.

### Watch for methods that mutate

```js
// MUTATE the original:
arr.push()  arr.pop()  arr.shift()  arr.unshift()
arr.splice()  arr.sort()  arr.reverse()

// RETURN a new array (safe):
arr.map()  arr.filter()  arr.slice()  arr.concat()
[...arr]  arr.toSorted()  arr.toReversed()   // Node 20+
```

**`sort()` is the nastiest** — it mutates *and* sorts as strings by default. Verified:

```js
[10, 9, 100, 1].sort()              // [1, 10, 100, 9]   ← lexicographic!
[10, 9, 100, 1].sort((a,b) => a-b)  // [1, 9, 10, 100]   ← correct
```

### Object basics

```js
const user = { id: 1, name: 'jane' };

user.name           // dot access
user['name']        // bracket access
const key = 'name';
user[key]           // dynamic key

Object.keys(user)    // ['id', 'name']
Object.values(user)  // [1, 'jane']
Object.entries(user) // [['id',1], ['name','jane']]

'name' in user       // true
delete user.name;

// Shorthand — used everywhere in this codebase
const page = 1, pageSize = 25;
const opts = { page, pageSize };     // same as { page: page, pageSize: pageSize }
```

Iterating (PHP's `foreach ($arr as $k => $v)`):

```js
for (const [key, value] of Object.entries(user)) {
  console.log(key, value);
}
```

---

## 7. Destructuring and spread

Used on nearly every line of this framework, so it's worth being fluent.

```js
// Object destructuring
const { page, pageSize } = parsePagination(req.query);
// same as: const page = ...page; const pageSize = ...pageSize;

// Rename
const { id: userId } = user;

// Default when undefined
const { limit = 25 } = options;

// Nested
const { session: { user } } = req;

// Rest — grab everything else (this is how publicFields strips the hash)
const { password, ...safe } = userRow;   // `safe` has every field except password
```

```js
// Array destructuring
const [first, second] = [1, 2, 3];
const [, , third] = [1, 2, 3];        // skip
const [head, ...tail] = [1, 2, 3];    // head=1, tail=[2,3]

// Swap
let a = 1, b = 2;
[a, b] = [b, a];
```

### In function parameters — the framework's dominant style

```js
// Instead of positional args nobody can remember the order of:
async function paginate({ where = {}, search = null, page = 1, pageSize = 25, orderBy } = {}) {
  // ...
}

// Called with a self-documenting object:
await User.paginate({ page: 2, pageSize: 50, orderBy: 'id DESC' });
```

> The trailing `= {}` matters. Without it, calling `paginate()` with no arguments throws
> `Cannot destructure property 'where' of 'undefined'`. You'll see that default on every options
> object in `core/`.

### Spread

```js
// Merge — later wins. Used constantly for "override the defaults".
const config = { ...defaults, ...userOptions };

// This is how the edit form keeps what you typed after a validation failure:
record: { ...User.publicFields(user), ...formData }

// Spread into arguments
Math.max(...[1, 5, 3]);   // 5
```

---

## 8. Functions, arrow functions, and `this`

```js
// Declaration — hoisted (callable before it's defined)
function add(a, b) { return a + b; }

// Arrow function — concise, and does NOT bind its own `this`
const add = (a, b) => a + b;              // implicit return
const square = n => n * n;                // single param, parens optional
const make = () => ({ ok: true });        // return an object: wrap in parens!
const log = (msg) => { console.log(msg); };  // block body needs explicit return
```

### Default and rest parameters

```js
function greet(name, greeting = 'Hello') { return `${greeting}, ${name}`; }
function sum(...nums) { return nums.reduce((a, b) => a + b, 0); }
```

### `this` — the trap

```js
const obj = {
  name: 'thing',
  regular() { return this.name; },        // `this` = obj  ✅
  arrow: () => this.name,                 // `this` = module scope ❌ undefined
};
```

**Rule:** arrow functions inherit `this` from where they're *defined*. That's usually what you
want in callbacks:

```js
// ❌ classic bug
class Service {
  constructor() { this.count = 0; }
  start() {
    setTimeout(function () { this.count++; }, 100);   // `this` is not the instance
  }
}

// ✅ arrow inherits `this`
start() {
  setTimeout(() => { this.count++; }, 100);
}
```

In the framework's models, `static` methods use `this` to mean *the class*:

```js
class User extends Model {
  static table = 'users';
  static async findByUsername(username) {
    return this.findOne({ username });   // `this` === User
  }
}
```

### Closures

```js
function counter() {
  let n = 0;                 // captured
  return () => ++n;
}
const next = counter();
next(); next();   // 1, 2
```

This is how `preventSelfAction(message)` works — it returns a middleware that closes over
`message`. Look at `app/middlewares/preventSelfAction.js`.

---

## 9. Array methods (your PHP `array_*` cheatsheet)

| PHP | JS |
|---|---|
| `array_map` | `arr.map(fn)` |
| `array_filter` | `arr.filter(fn)` |
| `array_reduce` | `arr.reduce(fn, init)` |
| `in_array($x, $a)` | `arr.includes(x)` |
| `array_search` | `arr.indexOf(x)` / `arr.findIndex(fn)` |
| `array_slice` | `arr.slice(start, end)` |
| `count($a)` | `arr.length` |
| `array_keys` | `Object.keys(obj)` |
| `array_merge` | `[...a, ...b]` |
| `array_column($a,'id')` | `arr.map(r => r.id)` |
| `array_sum` | `arr.reduce((s,n)=>s+n, 0)` |
| `usort` | `arr.sort(fn)` ⚠️ mutates |
| `array_unique` | `[...new Set(arr)]` |
| `empty($a)` | `arr.length === 0` |

```js
const users = [
  { id: 1, name: 'jane',  status: 'active'   },
  { id: 2, name: 'bob',   status: 'inactive' },
  { id: 3, name: 'alice', status: 'active'   },
];

users.map(u => u.name);                    // ['jane','bob','alice']
users.filter(u => u.status === 'active');  // [jane, alice]
users.find(u => u.id === 2);               // {id:2,...}  — first match, or undefined
users.some(u => u.status === 'inactive');  // true
users.every(u => u.status === 'active');   // false
users.reduce((n, u) => n + 1, 0);          // 3

// Group by (PHP: a foreach building an array)
const byStatus = users.reduce((acc, u) => {
  (acc[u.status] ||= []).push(u);
  return acc;
}, {});
```

### ⚠️ `.map()` with async does NOT wait

```js
// ❌ Returns an array of Promises, not values
const results = users.map(async u => await enrich(u));
console.log(results);   // [Promise, Promise, Promise]

// ✅ Await them all
const results = await Promise.all(users.map(async u => await enrich(u)));
```

You'll see the correct form in `app/controllers/admin/adminUserController.js` in the sibling
ticket_system project:

```js
const withAccess = await Promise.all(
  users.map(async (u) => ({ ...u, access: await accessSummary(u.id, u.role) }))
);
```

### `.forEach` cannot be awaited

```js
// ❌ The loop finishes instantly; the saves happen later, unordered
users.forEach(async u => { await save(u); });

// ✅ Use for...of when you need sequential awaits
for (const u of users) { await save(u); }
```

---

# Part 3 — Async, the big one

## 10. Callbacks, promises, async/await

In PHP, `$rows = $db->query(...)` blocks and hands you rows. In Node, I/O never blocks — it
returns a **Promise**, a placeholder for a value that arrives later.

```js
// A promise has three states: pending → fulfilled | rejected
const p = User.findById(1);   // pending immediately
```

### async/await — the only style you need

```js
async function getUser(id) {
  const user = await User.findById(id);   // pauses THIS function, frees the thread
  return user;                            // an async function ALWAYS returns a Promise
}
```

Two rules:
1. `await` only works inside an `async` function (or at the top level of an ESM module).
2. An `async` function **always** returns a Promise — even `return 5` gives you `Promise<5>`.

### The single most common beginner bug: forgetting `await`

```js
// ❌ Verified: this returns a Promise object, not the user
const user = User.findById(1);
console.log(user.name);         // undefined — Promise has no .name

// ✅
const user = await User.findById(1);
console.log(user.name);         // 'jane'
```

**Symptom:** `undefined`, or `[object Promise]` rendered in your EJS page. **Fix:** find the
missing `await`.

### `.then()` — you'll see it, prefer `await`

```js
User.findById(1).then(user => console.log(user.name));

// Equivalent, and easier to read/debug:
const user = await User.findById(1);
console.log(user.name);
```

The one place `.then()`/`.catch()` still wins is fire-and-forget:

```js
// Don't block the response on a notification
notifyUserCreated(user).catch(err => logger.warn(err.message));
```

---

## 11. Error handling in async code

### try/catch works with await

```js
exports.show = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    res.render('users/show', { record: user });
  } catch (err) {
    next(err);            // hand to core/middlewares/errorHandler.js
  }
};
```

**Every async controller in this framework follows that shape.** `next(err)` routes to the
central handler; without it, a thrown error leaves the request hanging until the browser times
out.

### ⚠️ try/catch does NOT catch a promise you didn't await — verified

```js
try {
  Promise.reject(new Error('boom'));     // NOT awaited
  // execution continues past here — the catch never fires
} catch (e) {
  // never reached
}
```

**On Node 24 an unhandled rejection crashes the whole process.** I confirmed this while writing
this guide — the demo script died with `Error: boom` and a non-zero exit. That's *why*
`core/lifecycle.js` treats `unhandledRejection` as fatal and shuts down cleanly: the process is
going to die anyway, so it may as well drain first.

### Custom errors with a status

```js
const err = new Error('Payment declined');
err.status = 402;
throw err;                 // errorHandler.js reads err.status
```

### `finally`

```js
const conn = await pool.getConnection();
try {
  await conn.query('...');
} finally {
  conn.release();          // runs whether or not it threw
}
```

---

## 12. Running things in parallel

Sequential `await`s are the most common performance mistake. **Verified timings** on three
100ms operations:

```js
// ❌ 329ms — each waits for the previous
await wait(100);
await wait(100);
await wait(100);

// ✅ 116ms — all three run at once
await Promise.all([wait(100), wait(100), wait(100)]);
```

Real example from the framework — `Model.paginate()` runs the rows query and the count query
simultaneously:

```js
const [rows, total] = await Promise.all([
  db.findWhere(this.resource, where, { limit, offset, orderBy, search }),
  db.count(this.resource, where, { search }),
]);
```

**Only parallelise independent work.** If B needs A's result, they must be sequential.

| Method | Behaviour |
|---|---|
| `Promise.all([...])` | All succeed, or **rejects on the first failure** |
| `Promise.allSettled([...])` | Waits for all; returns `{status, value/reason}` each |
| `Promise.race([...])` | First to settle wins (used for timeouts) |
| `Promise.any([...])` | First to *succeed* |

```js
// allSettled when partial failure is acceptable
const results = await Promise.allSettled(ids.map(id => fetchUser(id)));
const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
```

`core/health.js` uses `Promise.all` to run every readiness check at once, and
`core/helpers/httpClient.js` uses the `Promise.race` timeout pattern.

---

# Part 4 — Node & the framework

## 13. Node runtime essentials

```js
// Environment (PHP: getenv() / $_ENV)
require('dotenv').config();          // loads .env — done once in server.js
process.env.DB_HOST                  // always a STRING, or undefined
Number(process.env.PORT) || 5010     // convert!
process.env.DEBUG === 'true'         // 'false' is a truthy string — compare explicitly!

// Paths — never concatenate with '/', it breaks on Windows
const path = require('path');
path.join(__dirname, 'views', 'index.ejs');
__dirname     // directory of THIS file
process.cwd() // where node was launched from — usually different!

// Files
const fs = require('fs');
fs.readFileSync(p, 'utf8');          // sync — fine at startup, never per-request
await fs.promises.readFile(p, 'utf8');  // async — use this in a request

// Built-ins you don't need a package for
crypto.randomUUID();
crypto.randomBytes(24).toString('hex');
await fetch('https://...');           // Node 18+, no axios needed
```

> `process.env.X` is **always a string**. `process.env.RATE_LIMIT_ENABLED` being the string
> `'false'` is truthy — which is why `core/Application.js` writes
> `if (process.env.RATE_LIMIT_ENABLED !== 'false')`.

---

## 14. npm and package.json (vs composer)

| composer | npm |
|---|---|
| `composer install` | `npm install` |
| `composer require x` | `npm install x` |
| `composer require --dev x` | `npm install --save-dev x` |
| `composer.lock` | `package-lock.json` |
| `composer install --no-dev` | `npm ci --omit=dev` |

```bash
npm install                  # install everything from package.json
npm ci                       # exact lockfile install — use in CI/Docker
npm run <script>             # run a script
npm outdated                 # what's behind
npm audit                    # vulnerability report
npm uninstall x              # remove
```

This project's scripts:

```bash
npm start           # node server.js
npm run dev         # nodemon — auto-restarts on file change
npm run migrate     # apply SQL migrations
npm run seed        # demo data
npm test            # 132 tests
npm run make -- make:scaffold Product   # code generator
```

**Commit `package-lock.json`.** It's what makes builds reproducible.

---

## 15. How Express actually works

Express is a **pipeline**. A request enters at the top and flows down through middleware until
something sends a response.

```js
app.use(middlewareA);   //  ┐
app.use(middlewareB);   //  │ every request passes through, in order
app.get('/users', h);   //  ┘
```

### A middleware is just a function with three arguments

```js
function myMiddleware(req, res, next) {
  // do something
  next();        // pass to the next middleware — FORGETTING THIS HANGS THE REQUEST
}
```

Three ways to end:

```js
next();              // continue down the chain
res.send('done');    // respond and stop
next(err);           // jump to the error handler
```

> **The #1 Express bug: forgetting `next()`.** The browser spins forever with no error in the
> log. If a request hangs, look for a middleware that neither responded nor called `next()`.

### Error middleware has FOUR arguments

```js
// Express detects error handlers by ARITY (argument count). Four = error handler.
function errorHandler(err, req, res, next) { /* ... */ }
```

Drop the fourth `next` parameter and Express silently treats it as normal middleware and never
calls it. See `core/middlewares/errorHandler.js`.

### req and res

```js
req.params.id       // /users/:id
req.query.q         // ?q=jane        — always strings!
req.body.username   // POST body      — needs express.urlencoded/json
req.session.user    // session
req.headers['x-request-id']
req.id              // set by core/middlewares/requestId.js

res.render('users/index', { title: 'Users' });   // EJS
res.json({ ok: true });
res.redirect('/users');
res.status(404).json({ ... });
```

> **`req.query` and `req.params` are always strings.** `?page=2` gives you `'2'`, not `2`.
> `'2' + 1 === '21'`. Convert explicitly — that's what `parsePagination()` is for.

### The order in this framework

Read `core/Application.js` and `app/routes/web.js` top to bottom — that *is* the pipeline:

```
requestId → helmet → cors → health → rateLimit → morgan → body parsers → methodOverride
  → static → [web tree: session → flash → csrf → sharedLocals → requireAuth → routes]
  → notFound → errorHandler
```

Order matters enormously. `express.urlencoded` must come before anything reading `req.body`;
`session` before `flash`; `notFound` and `errorHandler` last.

---

## 16. EJS templates

EJS is close to plain PHP templating.

| PHP | EJS |
|---|---|
| `<?= $name ?>` | `<%= name %>` (escaped) |
| `<?= $html ?>` raw | `<%- html %>` (**not** escaped) |
| `<?php if (...): ?>` | `<% if (...) { %>` |
| `<?php endif; ?>` | `<% } %>` |
| `<?php foreach ($a as $x): ?>` | `<% a.forEach(function (x) { %>` |
| `<?php endforeach; ?>` | `<% }); %>` |

```html
<h4><%= title %></h4>

<% if (!rows.length) { %>
  <p>No users yet.</p>
<% } else { %>
  <table>
    <% rows.forEach(function (record) { %>
      <tr>
        <td><a href="/users/<%= record.id %>"><%= record.username %></a></td>
        <td><%= record.status %></td>
      </tr>
    <% }); %>
  </table>
<% } %>
```

Three tags:

- `<%= value %>` — output, **HTML-escaped**. Use for anything from the database.
- `<%- value %>` — output **raw**. Only for HTML you deliberately sanitised. Getting this wrong
  is an XSS hole.
- `<% code %>` — run JS, output nothing.

**Every variable must be passed from the controller.** `res.render('users/index', { title, rows })`
makes exactly `title` and `rows` available — plus the globals from
`core/middlewares/sharedLocals.js` (`messages`, `currentUser`, `csrfToken`, `appName`).

> An undefined variable in EJS throws `ReferenceError: x is not defined` — it does *not* silently
> print empty like PHP. Guard with `typeof x !== 'undefined'` if a variable is optional.

---

## 17. Reading a stack trace and debugging

### Anatomy

```
TypeError: Cannot read properties of undefined (reading 'username')
    at exports.show (D:\projects\forge-mvc\app\controllers\web\UserController.js:52:31)
    ^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^ ^^
    what             which file                                                line col
```

Read **top to bottom**: the first line mentioning *your* code (not `node_modules`) is where to
look.

`Cannot read properties of undefined (reading 'x')` means something you expected to be an object
was `undefined`. Usually: a missing `await`, a typo'd property, or a DB lookup that returned
`null`.

### Tools

```js
console.log(user);                       // fine
console.log({ user, page });             // ✅ better — labels the values
console.table(rows);                     // tabular
console.dir(obj, { depth: null });       // full nested output
logger.info('message');                  // this framework — carries the request id
```

```bash
node --inspect server.js       # then open chrome://inspect for real breakpoints
npm run dev                    # nodemon: restart on save
node --check file.js           # syntax check without running
```

### Log-driven debugging in this framework

```bash
# structured logs, one JSON object per line
tail -f storage/logs/app-$(date +%F).log

# follow one request across everything it touched
grep "7f3a1b2c" storage/logs/app-*.log
```

The correlation id makes this work — see [TUTORIAL-SOA.md §4](./TUTORIAL-SOA.md#4-correlation-ids-and-joinable-logs).

---

## 18. The 14 errors you will actually hit

### 1. `Cannot read properties of undefined (reading 'x')`
Something is `undefined`. **Check for a missing `await` first**, then a typo, then a `null` from
the DB.
```js
const user = await User.findById(id);
if (!user) return fail(req, res, { message: 'Not found', status: 404 });
console.log(user.username);
```

### 2. `[object Promise]` rendered in the page, or a Promise logged
Missing `await`.

### 3. The request hangs forever, no error
A middleware didn't call `next()` and didn't respond. Or an async handler threw without
`next(err)`.

### 4. `Cannot set headers after they are sent to the client`
You responded twice. Usually a missing `return`:
```js
// ❌
if (!user) { res.status(404).send('nope'); }
res.render('page');            // runs anyway!

// ✅
if (!user) { return res.status(404).send('nope'); }
```

### 5. `ReferenceError: x is not defined` (in an EJS view)
The controller didn't pass it. Either pass it, or guard with `typeof x !== 'undefined'`.

### 6. `EADDRINUSE: address already in use :::5010`
Something is already on that port.
```bash
netstat -ano | grep :5010          # find the PID
powershell -Command "Stop-Process -Id <PID> -Force"
```

### 7. `ECONNREFUSED 127.0.0.1:3306`
MySQL isn't running. Start it from the WAMP tray icon.

### 8. `Cannot find module './Foo'`
Wrong relative path or wrong case. **Windows is case-insensitive, Linux is not** — `require('./user')`
for `User.js` works locally and breaks in Docker.

### 9. `Cannot use import statement outside a module`
You wrote ESM `import` in a CommonJS file. Use `require()`.

### 10. `Assignment to constant variable`
Reassigning a `const`. Change it to `let` — or you meant to mutate a property, not reassign.

### 11. `Invalid or expired form token (CSRF)`
The form is missing `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`, or you're
posting to the web tree from a tool that has no session.

### 12. A failed form submission redirects to `/` and loses the input
The `redirect('back')` + Referer problem. Already fixed in `core/middlewares/validate.js` —
see gotcha #2 in [TUTORIAL.md](./TUTORIAL.md#22-gotchas-worth-knowing).

### 13. `PayloadTooLargeError`
Body over the default 100kb.
```js
app.use(express.json({ limit: '1mb' }));
```

### 14. The test suite hangs after all tests pass
Something is keeping the event loop alive — an unclosed pool, an interval, a listening server.
In this repo, also check the dev server isn't competing for the test database.

---

# Part 5 — Next

## 19. Notes for agentic AI work

You mentioned agentic AI as a goal. The good news: **the async skills above are exactly the
skills that matter**, and Node is a strong choice for it. A few things worth knowing early.

### Everything is I/O-bound, so parallelism pays enormously

```js
// Classify 20 documents — sequentially this is 20 × latency
const results = await Promise.all(docs.map(d => classify(d)));
```

But watch rate limits — unbounded `Promise.all` over 1,000 items will get you 429'd. Bound the
concurrency. **This version is verified** (peak concurrency 3, input order preserved):

```js
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  // N workers pulling from a shared cursor. Each claims an index, then awaits — so at most
  // `limit` calls are ever in flight, and results land back in the original order.
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const summaries = await mapLimit(docs, 3, doc => summarise(doc));
```

> I got this wrong on the first attempt and only caught it by measuring. My original used
> `queue.splice(0)` inside the worker — which let the *first* worker drain the entire queue and
> process everything sequentially. Peak concurrency was 1, not 3, and it looked completely
> correct. **If you write a concurrency limiter, instrument it and check the peak.**
>
> For production, prefer the well-tested `p-limit` package over hand-rolling.

### Streaming responses

Token-by-token output is the norm for LLM APIs. Node handles it with async iteration:

```js
const stream = await client.messages.stream({ /* ... */ });
for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    res.write(event.delta.text);      // stream straight to the browser
  }
}
res.end();
```

`for await...of` is the async cousin of `for...of` — worth learning once you're comfortable with
`await`.

### Long-running work does not belong in a request

An agent loop can run for minutes. An HTTP request should not. The pattern:

1. `POST /jobs` → create a job row, return `202 Accepted` with an id
2. Do the work in a queue/worker
3. `GET /jobs/:id` polls, or push updates over SSE/WebSocket

This is precisely where the SOA groundwork pays off — see the "message queue" row in
[TUTORIAL-SOA.md §12](./TUTORIAL-SOA.md#12-what-is-still-missing).

### What this framework already gives you

- `core/helpers/httpClient.js` — timeouts, retries, circuit breakers. **LLM APIs are slow and
  flaky; you want all three.** Set a generous `timeoutMs` (30–120s) for model calls.
- Correlation IDs — invaluable for tracing a multi-step agent run across services.
- `APP_MODE=api` — a clean JSON service for an agent backend.
- Graceful shutdown — so a deploy doesn't kill an in-flight agent run.

**One caution:** don't put a 60-second model call behind the default 5-second client timeout, and
don't let an agent loop block the event loop. Both are variations of the same lesson from §1.

---

## 20. A 2-week learning path

You don't need all of this before you start. Suggested order:

**Days 1–2 — read, don't write**
Sections 1–4 here. Then open `app/controllers/web/UserController.js` and read it line by line
against [TUTORIAL-EJS.md §5](./TUTORIAL-EJS.md#5-the-controller). You already know what CRUD
does; you're only learning the syntax.

**Days 3–4 — async**
Sections 10–12. This is the part that's genuinely new coming from PHP. Do the timing experiment
in §12 yourself — seeing 329ms drop to 116ms makes it stick.

**Days 5–7 — build one resource**
```bash
node bin/forge.js make:scaffold Product
```
Fill in the migration, the model's `searchable`, the form fields, and the routes. Break it
deliberately: remove an `await`, drop a `next()`, delete a `_csrf` field — and watch what each
failure looks like. That's the fastest way to learn §18.

**Week 2 — depth**
Sections 6–9 (references and array methods) as you hit them. Write a test
([TUTORIAL.md §17](./TUTORIAL.md#17-testing)). Then read `core/` — by then it'll read as ordinary
code rather than magic.

### Honest advice

- **Use `const`, `===`, and `await` everywhere** and you've avoided most JS foot-guns.
- **When something is `undefined`, look for a missing `await` first.** It's the answer more often
  than not.
- **The framework's tests are executable documentation.** `tests/integration/web.test.js` shows
  the exact shape of every request the app handles.
- **You don't need to learn React.** You're on `VIEW_ENGINE=ejs`; the TSX tree can be deleted
  with `node bin/forge.js clean --yes --ejs` when you start a new project.

---

## Quick reference card

```js
// Always
const x = 1;                 // not var
a === b                      // not ==
await asyncThing();          // not forgetting it
try { } catch (e) { next(e) }// in every async controller

// Truthy traps
Boolean("0")   // true  (PHP: false)
Boolean([])    // true  (PHP: false)
rows.length === 0            // not !rows

// Null-ish
value ?? fallback            // only null/undefined
value || fallback            // also 0, '', false

// Copy
{ ...obj }  [...arr]         // shallow
structuredClone(obj)         // deep

// Parallel
await Promise.all([a(), b()]);

// Env is always a string
Number(process.env.PORT) || 5010
process.env.FLAG === 'true'
```

| Need | Doc |
|---|---|
| Framework reference | [TUTORIAL.md](./TUTORIAL.md) |
| Build a CRUD screen | [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) |
| Deploy as a service | [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) |
| This guide | JS language + Node runtime |
