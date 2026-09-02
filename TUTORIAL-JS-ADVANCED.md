# Advanced JavaScript — The Language Beyond the Basics

The parts of JavaScript you need once you stop fighting the syntax and start reading other
people's code: the object model, iteration protocols, metaprogramming, memory, and the numeric
and date traps that produce wrong data rather than errors.

Every output below was **run on this repo's toolchain** — Node v24.11.1. Where a claim is
verified, it says so, and the printed value is what the machine printed.

**Read this after** [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) (the 12-chapter
practice course) and [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md). This document assumes you can
already write a class, a closure and an `async` function.

---

## Contents

**Part 1 — The object model**
1. [Prototypes: what a class actually is](#1-prototypes-what-a-class-actually-is)
2. [`this` — the five binding rules](#2-this--the-five-binding-rules)
3. [Property descriptors, getters, and hidden fields](#3-property-descriptors-getters-and-hidden-fields)
4. [Classes: private fields, statics, brand checks](#4-classes-private-fields-statics-brand-checks)
5. [Immutability: `freeze` is shallow](#5-immutability-freeze-is-shallow)

**Part 2 — Iteration**

6. [The iteration protocol](#6-the-iteration-protocol)
7. [Generators, including the two-way channel](#7-generators-including-the-two-way-channel)
8. [Async generators and `for await`](#8-async-generators-and-for-await)
9. [Iterator helpers — lazy pipelines](#9-iterator-helpers--lazy-pipelines)

**Part 3 — Metaprogramming**

10. [Symbols](#10-symbols)
11. [Proxy and Reflect](#11-proxy-and-reflect)

**Part 4 — Memory and copying**

12. [Copying: shallow, deep, and `structuredClone`](#12-copying-shallow-deep-and-structuredclone)
13. [WeakMap, WeakRef, and caches that can be collected](#13-weakmap-weakref-and-caches-that-can-be-collected)

**Part 5 — Data that goes wrong quietly**

14. [Numbers: floats, money, and 64-bit ids](#14-numbers-floats-money-and-64-bit-ids)
15. [Coercion and comparison](#15-coercion-and-comparison)
16. [Dates and timezones](#16-dates-and-timezones)
17. [What `JSON.stringify` destroys](#17-what-jsonstringify-destroys)
18. [Regex features worth knowing](#18-regex-features-worth-knowing)
19. [Intl — formatting for humans](#19-intl--formatting-for-humans)

**Part 6 — Errors and modern syntax**

20. [Error subclassing, `cause`, and `AggregateError`](#20-error-subclassing-cause-and-aggregateerror)
21. [Modern syntax you can use on Node 18+](#21-modern-syntax-you-can-use-on-node-18)

**Part 7 — Reference**

22. [Symptom → cause → fix](#22-symptom--cause--fix)
23. [Exercises](#23-exercises)
24. [Cheat sheet](#24-cheat-sheet)

---

# Part 1 — The object model

## 1. Prototypes: what a class actually is

JavaScript has no classical inheritance. `class` is syntax over **prototype delegation**: an
object holds a hidden link to another object, and a property miss follows that link.

**Verified:**

```js
class Animal { speak() { return 'generic'; } }
class Dog extends Animal { speak() { return 'woof'; } }
const d = new Dog();

Object.getPrototypeOf(d) === Dog.prototype              // true
Object.getPrototypeOf(Dog.prototype) === Animal.prototype  // true
```

So the chain is `d → Dog.prototype → Animal.prototype → Object.prototype → null`. Looking up
`d.speak` walks it and stops at the first hit — which is why `Dog`'s `speak` wins.

The consequence that matters in practice: **methods are not on your instances.** **Verified:**

```js
Object.hasOwn(d, 'speak')            // false — it's on the prototype
Object.hasOwn(Dog.prototype, 'speak') // true
```

```js
class C { x = 1; m() {} }
const c = new C();
Object.hasOwn(c, 'x')   // true  — class FIELDS are own properties, per instance
Object.hasOwn(c, 'm')   // false — methods are shared on the prototype
```

Three things follow, all of which show up in this codebase:

- **`{...instance}` loses the methods.** Spreading copies own enumerable properties only, so you
  get the data and none of the behaviour. Fine for `User.publicFields(row)`, which is exactly
  what it wants; a bug if you expected a working object back.
- **`static` members live on the constructor**, which is why [core/Model.js](core/Model.js) works
  the way it does. `class Product extends Model { static table = 'products' }` means
  `Product.find()` finds `Model.find` through the *constructor's* prototype chain, and inside it
  `this` is `Product` — so `this.table` reads `'products'`. That is the entire mechanism behind
  the framework's model layer, and it needs no instances at all.
- **`instanceof` walks the chain**, so it is a chain test, not a type test. It fails across
  realms (a `Worker`, a `vm` context) — one reason `Array.isArray()` exists.

Two APIs for reading the chain: `Object.getPrototypeOf(obj)` (use this) and `obj.__proto__`
(legacy, avoid). Never *set* a prototype after creation — `Object.setPrototypeOf` deoptimises the
object permanently in V8.

---

## 2. `this` — the five binding rules

`this` is decided **at the call site**, by which of these applies first:

| # | Rule | Call looks like | `this` is |
|---|---|---|---|
| 1 | `new` | `new Foo()` | the fresh instance |
| 2 | Explicit | `f.call(o)`, `f.apply(o)`, `f.bind(o)` | `o` |
| 3 | Method | `o.f()` | `o` |
| 4 | Plain call | `f()` | `undefined` (strict/class) or `globalThis` (sloppy) |
| 5 | Arrow | any | whatever `this` was **where the arrow was written** |

Rule 4 is the bug factory, and its two flavours differ in how loudly they fail. **Verified:**

```js
const obj = { n: 1, method() { return this.n; } };
const detached = obj.method;

// In a class body or 'use strict' — this is undefined:
detached();   // THROWS: Cannot read properties of undefined (reading 'n')

// In a plain CommonJS module (sloppy mode) — this is globalThis:
detached();   // undefined      ← no error, just silently wrong
```

That second line is why the bug survives code review: nothing throws, a value is just `undefined`
three layers away from the cause. It happens whenever a method is passed as a callback:

```js
// ❌ loses `this`
router.get('/products', ProductController.index.bind(null));
setTimeout(job.run, 1000);
rows.map(this.format);

// ✅ keep it
setTimeout(() => job.run(), 1000);
rows.map((r) => this.format(r));
```

This framework side-steps the whole problem: controllers are **plain exported functions**, not
methods on a class, so there is no `this` to lose. Keep it that way.

For a class that must hand out a callable method, a class field with an arrow is the fix
(**verified** — returns `5` when fully detached):

```js
class Job {
  n = 5;
  run = () => this.n;    // bound per instance, at construction
}
const f = new Job().run;
f();                     // 5
```

⚠️ Never use an arrow for a **method that needs `this`** on a prototype, and never for an object
literal's method — an arrow captures the enclosing scope's `this`, which at module level is
`module.exports`, not your object.

---

## 3. Property descriptors, getters, and hidden fields

Every property has metadata: `value`, `writable`, `enumerable`, `configurable` (or `get`/`set`
instead of `value`). Assignment gives you all-true; `defineProperty` lets you choose.

**Verified** — a non-enumerable property is invisible to `Object.keys`, spread, and `JSON`, but
still readable:

```js
const o = {};
Object.defineProperty(o, 'hidden', { value: 1, enumerable: false });

Object.keys(o)        // []
JSON.stringify(o)     // '{}'
o.hidden              // 1
```

That is a legitimate tool for the exact problem [app/models/User.js](app/models/User.js) solves
by hand — keeping `password` out of every serialisation. The framework's explicit
`publicFields()` is the better choice here (it is obvious at the call site, and it works on plain
rows returned by a driver), but you should recognise the technique when you see it.

**Getters** compute on read and *do* serialise, which surprises people. **Verified:**

```js
const rect = { w: 3, h: 4, get area() { return this.w * this.h; } };
rect.area              // 12
JSON.stringify(rect)   // {"w":3,"h":4,"area":12}   ← the getter ran
```

So a getter that hits the database or throws will do so inside `JSON.stringify`, in the middle of
your response serialisation, where the stack trace makes no sense. **Keep getters cheap and
total** — pure arithmetic on already-loaded fields, nothing else.

Useful descriptor reads:

```js
Object.getOwnPropertyDescriptor(o, 'hidden');
Object.getOwnPropertyNames(o);        // includes non-enumerables
Object.entries(o);                    // own + enumerable + string-keyed only
```

---

## 4. Classes: private fields, statics, brand checks

**Verified**, all available on Node 24:

```js
class Account {
  #balance = 0;                                    // truly private — not just convention
  static #instances = 0;                           // private static
  static { /* static initialisation block */ }     // runs once, at class definition

  get balance() { return this.#balance; }
  static isAccount(o) { return #balance in o; }     // brand check
}

new Account().balance          // 0
Account.isAccount(new Account())  // true
Account.isAccount({})             // false
```

`#private` is enforced by the language: it is unreachable from outside, invisible to
`Object.keys`, and untouched by `JSON.stringify` or spread. `_underscore` is a naming convention
and protects nothing.

`#field in obj` is the **brand check** — the reliable "is this really one of mine?" test, and
unlike `instanceof` it cannot be faked by an object with the right prototype.

Two class facts worth internalising:

- **A class body is always strict mode**, even in a sloppy CommonJS file. That's why §2's
  detached-method failure is a throw rather than a silent `undefined` inside classes.
- **Field initialisers run in order, per instance, before the constructor body.** A field
  referencing a later field gets `undefined`.

For this framework, note what classes are *for*: `core/Model.js` is a class used entirely through
statics (no instances), and controllers are not classes at all. Don't introduce class hierarchies
where a module of functions will do — the layering rule in [AGENTS.md](./AGENTS.md) is about
files, not inheritance.

---

## 5. Immutability: `freeze` is shallow

**Verified**, and this catches everyone once:

```js
const cfg = Object.freeze({ a: 1, nested: { b: 2 } });
cfg.a = 5;             // silently ignored in sloppy mode → a stays 1
cfg.nested.b = 99;     // ✅ succeeds — nested.b is now 99
```

Two separate traps in three lines:

1. **Only the top level is frozen.** Nested objects are untouched.
2. **The failed write is silent** in sloppy mode. In strict mode (and so in every class body and
   every ESM file) the same assignment **throws** `TypeError: Cannot assign to read only
   property`. Same code, different behaviour depending on where it sits.

For a deep freeze, recurse:

```js
function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(o);
}
```

`const` is a different thing entirely and worth restating: it freezes the **binding**, not the
value. `const a = []; a.push(1)` is legal. See
[TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) ch. 1.

In practice, prefer *not mutating* to enforced immutability — return new objects
(`{ ...row, status: 'active' }`) and keep `Object.freeze` for genuine constants like a config
object or a lookup table that must not drift.

---

# Part 2 — Iteration

## 6. The iteration protocol

`for...of`, spread, destructuring and `Promise.all(iterable)` all work through one contract: an
object is **iterable** if it has a `[Symbol.iterator]()` method returning an object with
`next() → { value, done }`.

Implement it and your own type works everywhere a built-in does. **Verified** — prints `1,2,3,4`:

```js
class Range {
  constructor(from, to) { this.from = from; this.to = to; }
  *[Symbol.iterator]() { for (let i = this.from; i <= this.to; i++) yield i; }
}

[...new Range(1, 4)];              // [1, 2, 3, 4]
for (const n of new Range(1, 4)) {}
const [first, second] = new Range(1, 4);
```

Which things are iterable is worth memorising, because the gaps are the surprises:

| Iterable | Not iterable |
|---|---|
| `Array`, `String` (by code point), `Map`, `Set` | **plain objects** |
| `arguments`, `NodeList`, `TypedArray` | `WeakMap`, `WeakSet` |
| Generators, streams (async), `URLSearchParams` | anything without `[Symbol.iterator]` |

A plain object not being iterable is why you reach for `Object.entries(obj)` to loop it — and why
`for...in` (which walks *keys*, including inherited ones) is a different, more dangerous tool.
Use `for...of Object.entries()`.

---

## 7. Generators, including the two-way channel

A generator function (`function*`) returns an iterator that runs its body lazily, pausing at each
`yield`. The obvious use is producing sequences without building an array.

The less obvious and more powerful property: **`yield` is an expression, so data flows both
ways.** Whatever you pass to `next(v)` becomes the value of the paused `yield`. **Verified:**

```js
function* conversation() {
  const name = yield 'name?';
  const age  = yield `hi ${name}, age?`;
  return `${name} is ${age}`;
}

const g = conversation();
g.next().value        // 'name?'
g.next('Ada').value   // 'hi Ada, age?'
g.next(36).value      // 'Ada is 36'
```

Where generators genuinely earn their place in a codebase like this one:

**Paging a large table without loading it.** This is the pattern behind
[TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §14's constant-memory CSV export:

```js
async function* allProducts(pageSize = 500) {
  for (let page = 1; ; page++) {
    const { rows } = await Product.paginate({ page, pageSize });
    if (!rows.length) return;
    yield* rows;                       // yield* delegates to another iterable
  }
}

for await (const product of allProducts()) { /* one row at a time */ }
```

**Infinite or computed sequences**, safely, because nothing is produced until asked:

```js
function* ids() { let n = 1; while (true) yield `ID-${n++}`; }
```

Three mechanics to know: `return()` finishes a generator early (a `break` out of `for...of` calls
it for you, so `try/finally` inside a generator still runs its cleanup); `throw()` injects an
error at the pause point; and a generator is single-use — once done, it stays done.

---

## 8. Async generators and `for await`

An `async function*` yields promises and is consumed with `for await`. This is the natural shape
for anything paged, streamed, or rate-limited.

```js
async function* poll(client, path, everyMs) {
  while (true) {
    yield await client.get(path);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

for await (const page of poll(api, '/jobs', 5000)) {
  if (page.done) break;      // break stops the generator and runs its finally blocks
}
```

`for await` also consumes Node streams directly, which is the cleanest way to read a request
body or a file line by line (see [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §12).

⚠️ `for await` is **sequential by design** — one iteration completes before the next starts. That
is the point when you're limiting load, and a performance bug when the items are independent. For
independent work use `Promise.all` or the `mapLimit` helper in
[TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §20.

`Array.fromAsync()` (**verified** present on Node 24) collects an async iterable into an array —
convenient, but it defeats the purpose if the whole reason you were streaming was memory.

---

## 9. Iterator helpers — lazy pipelines

**Verified** on Node 24: iterators now have `.map`, `.filter`, `.take`, `.drop`, `.flatMap`,
`.reduce`, `.toArray`, `.some`, `.every`, `.find`.

```js
[...[1, 2, 3, 4, 5].values().map((n) => n * 2).take(3)]   // [2, 4, 6]  ← verified
```

The difference from array methods is **laziness**. `array.map(f).filter(g).slice(0, 3)` builds two
full intermediate arrays and runs `f` on every element. The iterator version pulls elements one at
a time and stops as soon as `take(3)` is satisfied — so `f` runs three times, and it works on an
infinite generator:

```js
function* ids() { let n = 1; while (true) yield n++; }

ids().filter((n) => n % 7 === 0).take(5).toArray();   // [7, 14, 21, 28, 35]
```

Use array methods for small collections (clearer, and `.sort()` needs the whole thing anyway) and
iterator helpers when the source is large, infinite, or expensive per element.

---

# Part 3 — Metaprogramming

## 10. Symbols

A `Symbol` is a guaranteed-unique property key. Its purpose is metadata that must not collide with
anyone else's keys and must not appear in ordinary iteration.

**Verified:**

```js
const S = Symbol('id');
const o = { [S]: 7, normal: 1 };

Object.keys(o)         // ['normal']    ← symbol key hidden
JSON.stringify(o)      // {"normal":1}  ← and not serialised
o[S]                   // 7             ← but perfectly readable

Symbol('x') === Symbol('x')          // false — every Symbol() is unique
Symbol.for('x') === Symbol.for('x')  // true  — the global registry, keyed by string
```

The **well-known symbols** are the real payoff, because they are the language's extension points:

| Symbol | Controls |
|---|---|
| `Symbol.iterator` | `for...of`, spread, destructuring (§6) |
| `Symbol.asyncIterator` | `for await` (§8) |
| `Symbol.toPrimitive` | how your object behaves in `+`, `==`, template literals |
| `Symbol.toStringTag` | `Object.prototype.toString.call(x)` — the `[object X]` name |
| `Symbol.hasInstance` | what `instanceof` says about your object |

```js
class Money {
  constructor(cents) { this.cents = cents; }
  [Symbol.toPrimitive](hint) {
    return hint === 'number' ? this.cents : `₹${(this.cents / 100).toFixed(2)}`;
  }
}
`${new Money(123456)}`   // '₹1234.56'
```

Recognising `Symbol.iterator` in someone else's class is the everyday value here. Defining your
own symbol keys is occasionally useful for framework-level metadata — and, like `Proxy`, easy to
overuse.

---

## 11. Proxy and Reflect

A `Proxy` wraps an object and intercepts operations on it. `Reflect` gives you the default
behaviour of those operations so your trap can delegate.

**Verified** — the `get` trap fires for both a present and a missing key:

```js
const logged = [];
const p = new Proxy({ a: 1 }, {
  get(target, key, receiver) {
    logged.push(String(key));
    return Reflect.get(target, key, receiver);
  },
});
p.a; p.b;
logged;     // ['a', 'b']
```

Traps exist for `get`, `set`, `has`, `deleteProperty`, `ownKeys`, `apply`, `construct` and more.
Legitimate uses: a strict config object that throws on an unknown key (far better than
`undefined` leaking into a query), negative array indices, an observable model for a view layer,
or recording calls in a test double.

```js
// Fail fast on a config typo, at the read, with the key in the message
const config = new Proxy(Object.freeze({ port: 5000 }), {
  get(t, k) {
    if (!(k in t)) throw new Error(`Unknown config key: ${String(k)}`);
    return t[k];
  },
});
```

⚠️ **Three reasons to use this sparingly.** Proxies are slow relative to plain property access, so
never put one on a hot path. They make debugging harder — a stack trace points at your trap, not
at the caller. And they let a module change semantics invisibly, which is exactly the kind of
magic [AGENTS.md](./AGENTS.md) is written to keep out of this codebase (no DI container, no
decorators, no auto-discovery). Know them so you can read a library that uses them; reach for a
plain function first.

`Reflect` is independently useful without proxies: `Reflect.has(o, k)`, `Reflect.ownKeys(o)`
(strings *and* symbols), `Reflect.getPrototypeOf(o)`.

---

# Part 4 — Memory and copying

## 12. Copying: shallow, deep, and `structuredClone`

Three levels, and picking the wrong one gives you aliasing bugs that surface far from the copy.

```js
const shallow = { ...row };                    // one level; nested objects are SHARED
const shallow2 = Object.assign({}, row);       // same
const deep = structuredClone(row);             // real deep copy, built in
```

**Verified** for `structuredClone`, including the things `JSON` round-tripping ruins:

```js
const o = { d: new Date(0), m: new Map([[1, 'a']]), n: { deep: true } };
const c = structuredClone(o);
c.n.deep = false;

o.n.deep            // true   ← independent copy
c.m instanceof Map  // true   ← Map survived
c.d instanceof Date // true   ← Date survived
```

Compare that with the old `JSON.parse(JSON.stringify(x))` trick, which silently turns `Date` into
a string, `Map`/`Set` into `{}`, and drops `undefined` and functions entirely (§17). Use
`structuredClone`.

Its limits: it **cannot clone functions**, DOM-less host objects, or class identity — a cloned
instance becomes a plain object, losing its prototype. And it throws on a function rather than
skipping it, which is a feature (loud failure) once you know it.

Cycles are handled correctly by `structuredClone` and crash `JSON.stringify` with
`Converting circular structure to JSON`.

---

## 13. WeakMap, WeakRef, and caches that can be collected

`Map` holds its keys **strongly**: a module-level `Map` used as a cache keeps every key alive
forever, which is the classic Node memory leak
([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §21).

`WeakMap` holds keys **weakly** — when nothing else references a key object, the entry can be
collected. **Verified** properties:

```js
const wm = new WeakMap();
wm.set(key, 'meta');
wm.has(key)                // true
wm.size                    // undefined  ← no size
wm[Symbol.iterator]        // undefined  ← not iterable, cannot be enumerated
```

Those two absences are not oversights: exposing size or iteration would let you observe garbage
collection, which the language refuses to make observable. So `WeakMap` is only useful for
*attaching* data to an object you already hold — per-request metadata keyed by `req`, memoised
results keyed by an input object, private state in a library.

`WeakRef` and `FinalizationRegistry` (**verified** present) let you hold a value weakly and get a
callback when it's collected. Both are escape hatches for cache libraries. In application code,
prefer a bounded cache with an explicit eviction policy (`Map` + max size + LRU, or a TTL) —
predictable beats clever, and you can reason about the memory ceiling.

---

# Part 5 — Data that goes wrong quietly

## 14. Numbers: floats, money, and 64-bit ids

Every JS number is an IEEE-754 double. Two consequences produce **wrong data, not errors**.

**Money.** **Verified:**

```js
0.1 + 0.2              // 0.30000000000000004
0.1 + 0.2 === 0.3      // false
(1.005).toFixed(2)     // '1.00'   ← not '1.01'
(2.675).toFixed(2)     // '2.67'   ← not '2.68'
```

`toFixed` does not "round wrong" — 1.005 is not exactly 1.005 in binary, it is slightly below, and
rounding is faithful to the stored value. There is no formatting fix. **Store money as integer
minor units** (paise, cents) and divide only for display:

```js
// ✅ integers all the way through the model and the database
const totalPaise = items.reduce((sum, i) => sum + i.pricePaise * i.qty, 0);
// verified: (10 + 20) / 100 → '0.30'
const display = (totalPaise / 100).toFixed(2);
```

Use `DECIMAL` (not `FLOAT`/`DOUBLE`) if the column must be decimal, and remember MySQL returns
`DECIMAL` as a **string** by default — deliberately, to avoid this exact problem. Don't
`Number()` it and undo the protection.

**Large integers.** **Verified:**

```js
Number.MAX_SAFE_INTEGER                                    // 9007199254740991
Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2 // true  ← silently equal
9007199254740993                                            // 9007199254740992  ← digit lost
9007199254740993n.toString()                                // '9007199254740993' ← BigInt is exact
```

This is a live risk for `BIGINT` primary keys, Snowflake ids, and anything from a payment
provider. Above 2⁵³ they lose precision *as they parse*, before your code sees them. **Keep large
external ids as strings**, and note that `User.usernameTaken()` in
[app/models/User.js](app/models/User.js) already compares ids with `String(...) !== String(...)`
for exactly this class of reason.

**Also verified**, and a routine source of wrong output:

```js
[10, 9, 100, 1].sort()               // [1, 10, 100, 9]   ← lexicographic by default!
[10, 9, 100, 1].sort((a, b) => a - b) // [1, 9, 10, 100]
```

Parsing user input, **verified**:

```js
parseInt('12px')   // 12    ← stops at the first non-digit
Number('12px')     // NaN   ← all-or-nothing
Number('')         // 0     ← ⚠️ empty string becomes zero
parseInt('')       // NaN
```

So validate first (`app/validators/`), then convert with `Number`, and check `Number.isNaN`
explicitly rather than relying on `||` — which is [AGENTS.md](./AGENTS.md) rule 8 and the
`?page_size=0` bug in its gotcha table.

---

## 15. Coercion and comparison

**Verified** `==` results, which is the whole argument for `===`:

```js
0 == ''            // true
0 == '0'           // true
'' == '0'          // false   ← so == is not transitive
null == undefined  // true
null == 0          // false   ← null is not numeric-coerced
NaN == NaN         // false
```

Rules that make this navigable rather than memorisable:

- **`===` always**, except the single idiom `x == null` to mean "null or undefined".
- **`NaN` is not equal to itself.** Test with `Number.isNaN(x)` — not the global `isNaN`, which
  coerces first (`isNaN('abc')` is `true`).
- **`Object.is`** is `===` with two fixes: **verified** `Object.is(NaN, NaN)` is `true` and
  `Object.is(0, -0)` is `false`.
- **Objects compare by identity.** `{a:1} === {a:1}` is `false`; there is no built-in deep
  equality outside `assert.deepStrictEqual` in tests.

The falsy list is worth having memorised, because `||` acts on all of it: `false`, `0`, `-0`,
`0n`, `''`, `null`, `undefined`, `NaN`. Everything else is truthy — including `[]`, `{}`, `'0'`,
`'false'` and, per [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) §11, **every Promise**.

---

## 16. Dates and timezones

`Date` is a UTC instant with methods that render in the **machine's local zone**. That split is
the entire problem. **Verified on this machine** (offset `-330` minutes, i.e. UTC+05:30):

```js
new Date(0).getFullYear()   // 1970
new Date(0).toISOString()   // '1970-01-01T00:00:00.000Z'
new Date().getTimezoneOffset()   // -330
```

Which means the exact same instant is "1970-01-01 00:00 UTC" and "1970-01-01 05:30 local". A
`getDate()` here and a `toISOString().slice(0,10)` there disagree about which *day* something
happened — and that's the "-1 day ages" bug in the [AGENTS.md](./AGENTS.md) gotcha table, whose
fix was pinning `time_zone='+00:00'` on the MySQL connection *and* `timezone:'+00:00'` in the pool
config (see [core/db/mysql.js](core/db/mysql.js)).

The discipline that avoids all of it:

1. **Store UTC.** `DATETIME` in UTC, or `TIMESTAMP`. Never a local-time string.
2. **Transport ISO-8601.** `toISOString()` in JSON, always.
3. **Format at the edge only**, with the user's zone made explicit (§19).
4. **Never do date arithmetic with `setDate`/`getMonth`** across a DST boundary. `new
   Date(y, m, d)` uses local time; `Date.UTC(y, m, d)` does not — pick deliberately.
5. **Month is 0-indexed** in the constructor and in `getMonth()`. January is `0`. This never stops
   being a bug source.

`Date` cannot represent "a date with no time" or "a time in a named zone", which is why real apps
reach for `date-fns` or `luxon`. (`Temporal`, the language's fix for all of this, is **verified
not available** on Node 24 here — `typeof Temporal` is `undefined`. Don't write against it yet.)

---

## 17. What `JSON.stringify` destroys

**Verified.** This object:

```js
{ u: undefined, f(){}, s: Symbol('x'), d: new Date(0), n: NaN,
  i: Infinity, big: 1, set: new Set([1]), m: new Map() }
```

serialises to:

```json
{"d":"1970-01-01T00:00:00.000Z","n":null,"i":null,"big":1,"set":{},"m":{}}
```

Read the losses off that output:

| Input | Becomes |
|---|---|
| `undefined`, a function, a symbol value | **the key vanishes entirely** |
| `Date` | an ISO string — and it does **not** come back as a `Date` |
| `NaN`, `Infinity` | `null` |
| `Map`, `Set` | `{}` — all contents lost, silently |
| `BigInt` | throws `TypeError: Do not know how to serialize a BigInt` |
| a cycle | throws `Converting circular structure to JSON` |

Two habits follow. First, **an API response is a contract, so build it explicitly** —
`User.publicFields(user)` rather than throwing a driver row at `res.json` and hoping. Second, for
copying, use `structuredClone` (§12), never a JSON round-trip.

`toJSON()` lets a class control its own serialisation, and it is the clean way to keep a secret
out of every response at once:

```js
class Session {
  constructor(id, token) { this.id = id; this.token = token; }
  toJSON() { return { id: this.id };  }   // token never leaves the process
}
```

The two extra arguments are underused: `JSON.stringify(value, replacer, space)`. A `replacer`
array whitelists keys (`['id', 'name']`), and `space` is what makes a log line readable.

---

## 18. Regex features worth knowing

**All verified on Node 24.**

```js
// Named groups — readable, and self-documenting at the destructure
'2026-09-02'.match(/(?<y>\d{4})-(?<m>\d{2})/).groups.y     // '2026'

// Lookbehind
'price: $42'.match(/(?<=\$)\d+/)[0]                        // '42'

// matchAll — every match with its groups, as an iterator
[...'a1b2'.matchAll(/([a-z])(\d)/g)].map((m) => m[2]).join('')   // '12'

// The v flag: set operations inside a character class
/[\p{ASCII}--[0-9]]/v.test('a')     // true   — ASCII except digits
/^[\p{ASCII}--[0-9]]$/v.test('5')   // false

// RegExp.escape — escape user input for use in a pattern
typeof RegExp.escape                // 'function'
```

That last one matters for this codebase. `Model.paginate({ search })` does a contains-match, and
each adapter escapes it (`LIKE ESCAPE` / `ILIKE` / `$regex`) — but if you ever build a regex from
user input yourself, `RegExp.escape` is what stops `.` from matching everything and, worse, stops
a crafted pattern from becoming a CPU denial of service.

⚠️ **Catastrophic backtracking** is the regex risk that matters on a single-threaded server. A
pattern like `/^(a+)+$/` against a long non-matching string takes exponential time and blocks
every request ([TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §3). Avoid nested
quantifiers over overlapping character sets, and never build a pattern from unescaped user input.

Two mechanics that cause "the regex works once then fails": a `/g` or `/y` regex carries
`lastIndex` between calls, so **never reuse a `/g` regex object across `.test()` calls**; and
`String.replace` with a non-global regex replaces only the first match (use `replaceAll` or `/g`).

---

## 19. Intl — formatting for humans

Built in, no dependency, and it handles the cases hand-rolled formatting gets wrong. **Verified:**

```js
new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(1234567.891)
// '₹12,34,567.89'      ← lakh/crore grouping, not thousands
new Intl.RelativeTimeFormat('en').format(-1, 'day')
// '1 day ago'
```

That Indian digit grouping (`12,34,567`) is the example that should retire hand-written
formatters for good — no amount of `replace(/\B(?=(\d{3})+(?!\d))/g, ',')` produces it.

The pieces you'll use:

```js
new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short',
                                   timeZone: 'Asia/Kolkata' }).format(date);
new Intl.ListFormat('en').format(['a', 'b', 'c']);        // 'a, b, and c'
new Intl.PluralRules('en').select(1);                     // 'one'
new Intl.Collator('en').compare;                          // locale-correct sort comparator
```

Two notes: pass `timeZone` explicitly whenever the output is for a specific user (§16), and build
the formatter **once** at module level, not per row — constructing an `Intl` formatter is
comparatively expensive, and a 5,000-row table will feel it.

---

# Part 6 — Errors and modern syntax

## 20. Error subclassing, `cause`, and `AggregateError`

**Verified**, both available:

```js
new Error('outer', { cause: new Error('inner') }).cause.message   // 'inner'
new AggregateError([new Error('a'), new Error('b')], 'both').errors.length   // 2
```

`cause` is the right way to add context without destroying the original stack — the mistake it
replaces is `throw new Error(err.message)`, which loses where the failure actually happened:

```js
try {
  await notifications.post('/send', payload);
} catch (err) {
  throw new Error('Could not notify user', { cause: err });   // ✅ both layers survive
}
```

A small error hierarchy pays for itself the moment more than one caller needs to distinguish
failures. This shape works with the framework's `errorHandler`, which reads `err.status`
([core/middlewares/errorHandler.js:14](core/middlewares/errorHandler.js:14)):

```js
class AppError extends Error {
  constructor(message, status = 500, options) {
    super(message, options);
    this.name = this.constructor.name;      // otherwise every subclass logs as 'Error'
    this.status = status;
    Error.captureStackTrace?.(this, this.constructor);   // drop the constructor frame
  }
}
class NotFoundError extends AppError { constructor(what) { super(`${what} not found`, 404); } }
class ValidationError extends AppError {
  constructor(fields) { super('Validation failed', 422); this.fields = fields; }
}
```

Three rules regardless of hierarchy: **always throw an `Error`** (a thrown string has no stack);
set `name`, or your subclass is indistinguishable in logs; and `AggregateError` is what
`Promise.any` rejects with — check `.errors` rather than `.message` when you use it.

---

## 21. Modern syntax you can use on Node 18+

Everything here is **verified working on this repo's Node 24**, and all of it is CommonJS-safe.

```js
// Grouping — replaces a reduce-into-an-object
Object.groupBy([1, 2, 3, 4], (n) => (n % 2 ? 'odd' : 'even'))   // {odd:[1,3], even:[2,4]}
Map.groupBy(rows, (r) => r.status)                              // when keys aren't strings

// Non-mutating array methods — safe on shared/frozen data
[3, 1, 2].toSorted()          // [1,2,3], original untouched (verified)
[1, 2, 3].with(1, 9)          // [1,9,3]
[1, 2, 3].toReversed()
[1, 2, 3, 4].findLast((n) => n < 3)    // 2
[1, 2, 3].at(-1)              // 3   — also on strings: 'abc'.at(-1) === 'c'

// Set algebra — no more manual filter/includes
new Set([1,2,3]).union(new Set([2,3,4]))         // {1,2,3,4}   (verified)
new Set([1,2,3]).intersection(new Set([2,3,4]))  // {2,3}
new Set([1,2,3]).difference(new Set([2,3,4]))    // {1}
// also: symmetricDifference, isSubsetOf, isSupersetOf, isDisjointFrom

// Misc
Object.hasOwn(obj, 'k')       // replaces obj.hasOwnProperty('k')
Promise.withResolvers()       // { promise, resolve, reject } — no executor closure needed
Array.fromAsync(asyncIterable)
structuredClone(obj)          // §12
```

`Promise.withResolvers()` is the tidy way to bridge an event-based API into a promise:

```js
const { promise, resolve, reject } = Promise.withResolvers();
worker.on('message', resolve);
worker.on('error', reject);
return promise;
```

Two cautions. `toSorted`/`with`/`union` and the iterator helpers are recent — if a `package.json`
`engines` field or a deployment target says Node 18, check before using them (`Object.groupBy` and
`Set.prototype.union` are Node 22+). And nothing here changes rule 6 in
[AGENTS.md](./AGENTS.md): still CommonJS, still no top-level `await`.

---

# Part 7 — Reference

## 22. Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot read properties of undefined (reading 'x')` inside a method | detached method lost `this` | call it as a method, or use a bound class field (§2) |
| A method silently sees `undefined` fields, no error | same, but in sloppy CommonJS — `this` is `globalThis` | same (§2) |
| Spreading an instance loses its methods | methods live on the prototype | don't spread instances (§1) |
| A frozen object still changed | `Object.freeze` is shallow | `deepFreeze`, or stop mutating (§5) |
| An assignment to a frozen object throws in one file, not another | strict vs sloppy mode | expect the throw; classes/ESM are strict (§5) |
| A `Date` came back from an API as a string | `JSON.stringify` has no Date type | parse it explicitly at the boundary (§17) |
| A `Map` serialised as `{}` | JSON can't represent Maps | convert to an array/object first (§17) |
| `Do not know how to serialize a BigInt` | BigInt in a JSON payload | send it as a string (§17) |
| `Converting circular structure to JSON` | a cycle | `structuredClone`, or build the payload explicitly (§12, §17) |
| A copy's nested change affected the original | shallow copy | `structuredClone` (§12) |
| Totals off by a paisa/cent | float arithmetic on money | integer minor units (§14) |
| A big id ends in the wrong digit | above `MAX_SAFE_INTEGER` | keep it a string, or BigInt (§14) |
| `[1, 10, 100, 9]` from a numeric sort | default sort is lexicographic | `sort((a,b) => a-b)` (§14) |
| `?page_size=0` became 25 | `parseInt(x) \|\| default` swallows 0 | explicit `Number.isNaN` check (§14, AGENTS.md rule 8) |
| Ages off by one, "-1 day" | local vs UTC day boundary | store and transport UTC (§16) |
| A date is a month off | `getMonth()`/constructor are 0-indexed | remember January is 0 (§16) |
| `.test()` returns false every other call | a `/g` regex kept `lastIndex` | don't reuse a `/g` regex object (§18) |
| The server freezes on one request | catastrophic regex backtracking | fix the pattern; escape user input (§18) |
| Memory grows and never drops | a module-level `Map` cache with no eviction | bound it, or `WeakMap` (§13) |
| `JSON.stringify` ran my database call | a getter did I/O and serialisation triggered it | keep getters pure (§3) |
| `Object.keys` misses a property that clearly exists | non-enumerable, or a symbol key | `getOwnPropertyNames` / `Reflect.ownKeys` (§3, §10) |
| Every custom error logs as `Error` | subclass didn't set `name` | `this.name = this.constructor.name` (§20) |
| An error's stack points at the wrong place | rethrown as a new Error | `{ cause: err }` (§20) |

---

## 23. Exercises

1. Prove that `Dog.prototype.speak` is not an own property of a `Dog` instance, then explain why
   `{...dog}` has no `speak`. (§1)

2. Write a `Money` class with `#paise`, a `toJSON` that emits an integer, and a
   `Symbol.toPrimitive` for display. Verify `JSON.stringify` and template interpolation both do
   the right thing. (§4, §10, §17)

3. Take `const detached = obj.method` and make it work three ways: `bind`, an arrow wrapper, and a
   class field. Which one survives being passed to `setTimeout`? (§2)

4. Write `deepFreeze` and prove `Object.freeze` alone doesn't stop `cfg.nested.b = 99`. Then run
   the same assignment in a `'use strict'` file and note the difference. (§5)

5. Add `[Symbol.iterator]` to a `Paginator` class so `for...of` walks pages. Then convert it to
   `[Symbol.asyncIterator]` and drive it with `for await`. (§6, §8)

6. Build an async generator over `Product.paginate` and export a 100k-row CSV with flat memory.
   Compare peak heap against loading all rows first. (§7,
   [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) §12)

7. Compute an order total two ways — floats, and integer paise — for 1,000 items at ₹19.99. Which
   one matches the sum a human would compute? (§14)

8. Store a timestamp, then render it with `getDate()` and with `toISOString().slice(0,10)` while
   your machine's zone is UTC+05:30. Explain the disagreement. (§16)

9. Wrap a config object in a `Proxy` that throws on an unknown key. Then argue for or against
   using it in `core/` given [AGENTS.md](./AGENTS.md)'s no-magic rule. (§11)

---

## 24. Cheat sheet

```js
// ── Object model ──────────────────────────────────────────────────────────────
Object.getPrototypeOf(o)          // the chain; methods live here, not on instances
Object.hasOwn(o, 'k')             // own property? (replaces hasOwnProperty)
Reflect.ownKeys(o)                // strings AND symbols, enumerable or not
class C { #priv; static { } ; static isC(o) { return #priv in o; } }   // brand check
// `this`: new > call/apply/bind > o.f() > plain (undefined strict / globalThis sloppy) > arrow

// ── Iteration ─────────────────────────────────────────────────────────────────
*[Symbol.iterator]() {}           // makes for...of / spread / destructuring work
async *gen() {}  for await (…)    // sequential by design
xs.values().map(f).take(3)        // lazy iterator helpers — stops early, works on infinite

// ── Copying ───────────────────────────────────────────────────────────────────
{...o}                            // shallow — nested objects SHARED
structuredClone(o)                // deep; keeps Date/Map/Set; loses functions & prototypes
JSON.parse(JSON.stringify(o))     // ❌ destroys Date, Map, Set, undefined

// ── Numbers ───────────────────────────────────────────────────────────────────
0.1 + 0.2 !== 0.3                 // store money as integer minor units
Number.MAX_SAFE_INTEGER           // 9007199254740991 — BIGINT ids stay strings
[10,9,100].sort((a,b)=>a-b)       // default sort is LEXICOGRAPHIC
Number('') === 0                  // validate before converting; ?? not ||

// ── Comparison ────────────────────────────────────────────────────────────────
===  always            x == null  the one allowed ==
Number.isNaN(x)        not the global isNaN
Object.is(NaN, NaN)    true;  Object.is(0, -0) false

// ── Dates ─────────────────────────────────────────────────────────────────────
store UTC → transport toISOString() → format at the edge with an explicit timeZone
getMonth() is 0-indexed;  no Temporal on Node 24 (verified)

// ── Errors ────────────────────────────────────────────────────────────────────
throw new AppError(msg, 404, { cause: err })   // status for errorHandler.js; cause keeps stack
this.name = this.constructor.name              // or every subclass logs as 'Error'

// ── Modern, verified on Node 24 ───────────────────────────────────────────────
Object.groupBy / Map.groupBy      toSorted / toReversed / with / at / findLast
Set: union intersection difference isSubsetOf      Object.hasOwn
Promise.withResolvers()           Array.fromAsync()      RegExp.escape()
Error cause + AggregateError      structuredClone        /v regex flag
```

---

| Next | |
|---|---|
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | the runtime — event loop, streams, modules, threads |
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | promises and async/await from first principles |
| [TUTORIAL-JS-ESSENTIALS.md](./TUTORIAL-JS-ESSENTIALS.md) | the runnable 12-chapter practice course |
| [TUTORIAL-TESTING.md](./TUTORIAL-TESTING.md) | proving all of this works — `node:test`, fixtures, coverage |
