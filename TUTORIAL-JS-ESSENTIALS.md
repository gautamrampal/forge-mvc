# JavaScript Essentials — A Practice Course

A standalone, runnable course covering the JavaScript you need day to day: **values, arrays,
objects, Map/Set, loops, iteration, functions, arrow functions, promises, classes, errors, JSON,
dates and regex.**

It lives in `practice/` and depends on nothing. No database, no server, no `npm install` — just
Node. You can work through it before touching the framework, on a laptop with no project set up.

**Every value shown here was produced by running the code**, and every `// →` comment inside the
chapters is machine-checked against real output (see [Checking the comments](#checking-the-comments)).
Where a measured result contradicted what I expected to write, this document records the
measurement and explains it — there are three such places, flagged with 🔬.

One convention: prose excerpts below sometimes quote strings (`→ "string"`) for readability, where
a chapter prints Node's own console formatting (`→ string`). The values are the same; only the
display differs.

---

## How to use it

Each chapter is ordinary JavaScript with the result of every line in a comment beside it:

```js
console.log([10, 9, 100].sort());                 // → [ 1, 10, 100, 9 ]
console.log([10, 9, 100].sort((a, b) => a - b));  // → [ 9, 10, 100 ]
```

So a chapter reads as a document, runs as a program, and edits as a sandbox. Run one:

```bash
node practice/01-values-and-types.js
```

Everything, or a subset:

```bash
node practice/run-all.js
```

```bash
node practice/run-all.js 02 08
```

Work through them in order, roughly one sitting each. Then edit — change a value and predict the
new output before re-running. That loop is the whole method.

### Checking the comments

Because the comments *are* the answers, a wrong one would teach the wrong thing silently. So there
is a checker that runs every chapter and compares all 745 annotations against real output:

```bash
node practice/verify.js
```

```
✓ 01-values-and-types.js         63 annotations verified
✓ 02-arrays.js                   77 annotations verified
...
  745 annotations across 12 chapters — all match real output
```

Run it after editing a chapter. It has already caught three mistakes of mine, including a
`.then()` whose output landed at the very end of the file rather than where it was written.

### The exercises

```bash
node practice/exercises.js
```

39 self-checking exercises. Every one starts stubbed and reports `not implemented`. Fill them in,
re-run, and watch `○` become `✓`. The checker prints what it expected and what it got, so you are
never guessing. Annotated solutions are in `practice/exercises.solutions.js` — they pass 39/39.

```
──────────────────────────────────────────────────────────────────────────
  0/39 passing   0 failing   39 not started
──────────────────────────────────────────────────────────────────────────

  Everything is still stubbed — open this file and start with sum().
```

---

## The twelve chapters

| File | Covers |
|---|---|
| `01-values-and-types.js` | Primitives, `typeof`, null vs undefined, the 8 falsy values, `==` coercion, references, `const`, `Object.freeze` |
| `02-arrays.js` | Creating, holes, mutating vs non-mutating, sorting, map/filter/reduce/find, grouping, dedupe, async in loops, destructuring |
| `03-objects.js` | Access, shorthand, iteration, `entries`/`fromEntries`, shallow copying, destructuring, `?.` and `??`, `this`, prototypes |
| `04-map-set.js` | Map vs object (4 concrete reasons), Set, set algebra, WeakMap/WeakSet, when to reach for which |
| `05-loops-and-iteration.js` | `for`, `for...of`, `for...in`, `while`, `break`/`continue`, the iteration protocol, generators, `for await...of` |
| `06-functions.js` | Declarations vs expressions, hoisting, parameters, closures, higher-order functions, currying, `call`/`apply`/`bind`, recursion |
| `07-arrow-functions.js` | Every syntax form, the object-literal trap, the four differences from `function`, where arrows shine and where they are wrong |
| `08-promises.js` | States, chaining, all four combinators, sequential vs parallel (measured), concurrency limits, the event loop |
| `09-strings-and-numbers.js` | Template literals, slicing, searching, Unicode, floating point, parsing user input, rounding, formatting |
| `10-classes.js` | Fields, private `#`, getters, statics, inheritance, `super`, prototypes, strict mode, mixins, `toJSON` |
| `11-errors.js` | try/catch/finally, custom error hierarchies, `cause`, async errors, retry, process handlers, debugging tools |
| `12-json-date-regex.js` | What `stringify` silently drops, replacer/reviver, UTC discipline, date arithmetic, regex flags and traps, CommonJS vs ESM |
| `exercises.js` | 39 self-checking exercises |
| `exercises.solutions.js` | Annotated solutions, 39/39 passing |
| `verify.js` | Checks every result comment against real output |

---

## 1. Values and types

Seven primitives — string, number, bigint, boolean, undefined, symbol, null — plus objects.

```
typeof "hi"          → "string"
typeof 42            → "number"
typeof 42n           → "bigint"
typeof null          → "object"      ← a 25-year-old bug, kept for compatibility
typeof []            → "object"      ← arrays are objects
Array.isArray([])    → true          ← the actual test
```

### The eight falsy values

`false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, `NaN`. **Everything else is truthy** — and
this is where PHP habits break:

```
Boolean("0")     → true      ← PHP says false
Boolean([])      → true      ← PHP says false
Boolean({})      → true
Boolean(" ")     → true
```

So never test an array for emptiness with `!arr`:

```
!empty             → false     ← WRONG, an empty array is truthy
empty.length === 0 → true      ← RIGHT
```

### `==` is not transitive

```
0 == ""      → true
0 == "0"     → true
"" == "0"    → false     ← ...but these two are not equal
null == 0    → false     ← null loosely equals ONLY undefined
[1] == 1     → true
```

Use `===`. The only defensible `==` is `x == null` to catch both null and undefined at once.

### `const` is not immutability

```js
const cfg = { debug: false };
cfg.debug = true;   // fine — the binding is constant, the object is not
cfg = {};           // TypeError: Assignment to constant variable.
```

And `Object.freeze` is shallow:

```
frozen.x after write        → 1      ← blocked
frozen.nested.y (shallow!)  → 99     ← NOT blocked
```

---

## 2. Arrays

### Empty slots are not `undefined`

```
new Array(3)              → prints as [null,null,null]
0 in new Array(3)         → false     ← the index does not exist
0 in [undefined]          → true      ← this one does
new Array(3).map(()=>1)   → holes are SKIPPED, still empty
Array(3).fill(0).map(()=>1) → [1,1,1] ← fill first
```

### Mutating vs non-mutating

The single most common source of accidental bugs. **Mutating:** `push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`. **Non-mutating:** `slice`, `concat`, `map`,
`filter`, `reduce`, `flat`, `join`, and the newer `toSorted`, `toReversed`, `with`.

```
sort() → LEXICOGRAPHIC!      → [1,10,100,9]     ← default sort stringifies
sort((a,b)=>a-b) numeric     → [1,9,10,100]
orig.toSorted()              → [1,2,3]
orig unchanged               → [3,1,2]          ← the whole point
```

`[10, 9, 100, 1].sort()` giving `[1, 10, 100, 9]` is not a quirk you can ignore — it silently
corrupts any numeric ordering. Always pass a comparator.

### reduce, the general-purpose tool

```
sum of totals        → 225
group by customer    → {"alice":[1,3],"bob":[2]}
index by id          → {"1":"alice","2":"bob","3":"alice"}
count by customer    → {"alice":2,"bob":1}
```

Grouping is common enough that Node 21+ has `Object.groupBy(items, fn)` built in.

### async inside array methods

```
map(async) returns          → "Promise,Promise,Promise"
await Promise.all(map)      → [2,4,6]
```

`.map(async ...)` gives you an array of promises, not values. And `forEach` cannot be awaited at
all:

```
after forEach (sync check)  → []                 ← nothing has happened yet
after for...of              → [1,2,3,"seq1","seq2","seq3"]
```

Use `for...of` when you need sequence, `Promise.all(map)` when you want parallelism.

---

## 3. Objects

### Iteration

```
Object.keys       → ["alice","bob","carol"]
Object.values     → [90,75,82]
Object.entries    → [["alice",90],["bob",75],["carol",82]]
```

`Object.entries` + `Object.fromEntries` is the object equivalent of map/filter:

```
transform values → {"alice":95,"bob":80,"carol":87}
filter an object → {"alice":90,"carol":82}
sort by value    → {"alice":90,"carol":82,"bob":75}
```

### Spread is shallow

```
copy.name changed independently → "A"
⚠️  original.meta.seen           → 999    ← nested object is SHARED
```

Fresh comparison:

```
src.meta.seen after deep.meta.seen = 0  → 1      ← structuredClone: safe
...same line with spread → leaks        → 777    ← spread: leaks
```

Use `structuredClone(obj)` for a real deep copy. It keeps Dates, Maps, Sets and cycles;
`JSON.parse(JSON.stringify(x))` destroys all of them.

### `?.` and `??`

```
cfg.cache?.host        → undefined      ← no throw
cfg.db.port || 3306    → 3306           ⚠️  0 is falsy, default wins wrongly
cfg.db.port ?? 3306    → 0              ✅ only null/undefined trigger it
```

This exact distinction caused a real bug in this framework: `parseInt(x) || default` turned
`?page_size=0` into 25. `??` is what you want for anything that can legitimately be `0` or `""`.

### `this`

Regular functions get `this` from **how they are called**. Arrows inherit it from **where they
were written**.

```
method as function()             → ["object","obj"]
method as arrow (this = module)  → ["object",undefined]

map(function(){}) — this lost    → ["undefineda","undefinedb"]
map(arrow) — this kept           → [">a",">b"]
```

Detach a method and `this` goes with it:

```
detached()  // this = globalThis here  → NaN                    ← fails SILENTLY
strict mode → actually throws          ✗ TypeError: Cannot read properties of undefined
detached.call(counter)                 → 2
detached.bind(counter)()               → 3
```

🔬 **A correction worth reading.** I first labelled that line `this === undefined`. Running it
proved otherwise: a CommonJS file is non-strict, so `this` falls back to the global object and
`undefined++` yields `NaN` — no error, just a wrong number flowing downstream. In an ES module or
a class body (both always strict) the same code throws. The silent version is the dangerous one,
which is why both are now shown side by side.

---

## 4. Map and Set

### Four concrete reasons to prefer Map over a plain object

**1. Any key type.** Objects stringify every key.

```
map.get(42)    // number  → "number 42"
map.get("42")  // string  → "string 42"       ← genuinely different keys
map.get(NaN)             → "even NaN works"
```

An object cannot do this:

```
object keys           → ["42","[object Object]"]
plain[42]  // collided → "string"
```

Two different objects used as keys both became `"[object Object]"` and clobbered each other.

**2. Insertion order is guaranteed.** Objects reorder integer-like keys:

```
Map keys — insertion order    → ["z","a","10","2"]
Object keys — integers jump first! → ["2","10","z","a"]
```

**3. No inherited keys.**

```
({}).toString exists         → "function"
new Map().has("toString")    → false
```

**4. `map.size` is a property**, not an `Object.keys(o).length` array build.

### Set

```
new Set([1,2,2,3,3,3])   → Set(3) { 1, 2, 3 }
[...new Set(dupes)]      → [1,2,3]
```

Set compares with SameValueZero — like `===` but `NaN` equals itself:

```
Set of two identical-looking objects → 2    ← identity, not contents
NaN is deduped (unlike ===)          → 1
0 and -0 collapse                    → 1
```

Set algebra, both ways:

```
union                → Set(5) { 1, 2, 3, 4, 5 }
intersection         → Set(2) { 3, 4 }
difference A-B       → Set(2) { 1, 2 }

A.union(B)           → Set(5) { 1, 2, 3, 4, 5 }     ← Node 22+ built-ins
A.intersection(B)    → Set(2) { 3, 4 }
```

### Neither is indexable

```
set[0]            → undefined     ← not an error, just wrong
[...set][0]       → 2
map["apple"]      → undefined     ⚠️  does not read the entry
map.get("apple")  → 5             ← the only way
```

### Which to reach for

```
Plain object  →  fixed, known, string keys. JSON payloads. Config.
Map           →  keys unknown ahead of time, non-string keys, order matters,
                 or you add/delete a lot. Caches, lookup tables, grouping.
Set           →  "is this in the collection?" and deduplication.
WeakMap/Set   →  metadata attached to objects you do not own the lifetime of.
```

---

## 5. Loops and iteration

### `let` vs `var` in a loop

```
var  → all closures share ONE i   → [3,3,3]
let  → fresh binding each pass    → [0,1,2]
```

### `for...of` gives values, `for...in` gives keys

```
for (const f of fruits)              → ["apple","banana","cherry"]
for...in on an array → STRING indices → ["0","1","2"]
typeof that key                       → "string"
```

`for...in` also walks the prototype chain:

```
for...in sees inherited keys  → ["own","inherited"]
guarded with Object.hasOwn    → ["own"]
Object.keys — own only        → ["own"]
```

Rule: `for...of` for arrays, `for...of Object.entries(obj)` for objects. `for...in` almost never.

### You cannot break out of `forEach`

```
return in forEach = continue  → [1,2,4]
use .some() to stop early     → [1,2]
```

### The iteration protocol

Anything with a `[Symbol.iterator]` method returning `{ next() }` works with `for...of`, spread,
and destructuring. Implement it and your own objects join in:

```
for...of over a custom object → [1,2,3,4]
spread works too              → [1,2,3,4]
destructuring works too       → {"a":1,"b":2}
```

### Generators

`function*` and `yield` build iterators without the boilerplate — and they are **lazy**, so
infinite sequences are fine:

```
take(naturals(), 5)                    → [1,2,3,4,5]
lazy pipeline: evens, squared, first 4 → [4,16,36,64]
```

Nothing is computed until asked for. Practical uses:

```
depth-first tree walk  → ["root","a","a1","b"]
chunk([1..7], 3)       → [[1,2,3],[4,5,6],[7]]
```

### Which loop?

```
Array, need values        →  for...of          (can break/await)
Array, need a new array   →  .map()
Array, need a subset      →  .filter()
Array, need one value     →  .reduce() / .find()
Object                    →  for (const [k,v] of Object.entries(o))
Need index                →  for...of arr.entries()  or classic for
Fixed count               →  for (let i=0; i<n; i++)
Unknown count             →  while
Sequential await          →  for...of  (NEVER forEach)
Parallel await            →  await Promise.all(arr.map(fn))
Stream / paged I/O        →  for await...of
Lazy / infinite           →  generator
```

---

## 6. Functions and closures

### Declarations hoist, expressions do not

```js
console.log(declared(2, 3));   // → 5   works: declarations are hoisted
function declared(a, b) { return a + b; }

notYet();                      // ReferenceError
const notYet = function () {};
```

### Parameters

Only `undefined` triggers a default. `null` is a real value and passes straight through:

```js
function withDefaults(a, b = 10, c = a + b) { return { a, b, c }; }

withDefaults(1);              // → { a: 1, b: 10, c: 11 }
withDefaults(1, undefined);   // → { a: 1, b: 10, c: 11 }
withDefaults(1, null);        // → { a: 1, b: null, c: 1 }
```

Destructured parameters are the Forge controller idiom. The trailing `= {}` is what lets you call
it with no arguments at all — without it, destructuring `undefined` throws:

```js
function query({ table, where = {}, limit = 10 } = {}) { return { table, where, limit }; }

query({ table: 'users' });    // → { table: 'users', where: {}, limit: 10 }
query();                      // → { table: undefined, where: {}, limit: 10 }
```

### Closures

A function remembers the scope it was born in. Nothing outside can reach `count` — this is real
privacy, the JavaScript equivalent of a PHP private property:

```js
function makeCounter() {
  let count = 0;
  return { inc: () => ++count, get: () => count };
}

const c1 = makeCounter();
const c2 = makeCounter();
c1.inc(); c1.inc(); c2.inc();

c1.get();     // → 2
c2.get();     // → 1   independent instance
c1.count;     // → undefined   unreachable
```

That mechanism is what makes `memoize` and `once` possible — the cache, and the "already ran"
flag, live in the closure:

```js
const square = memoize((n) => { realCalls++; return n * n; });
square(4); square(4); square(4);
square(4);      // → 16
realCalls;      // → 1
```

### call, apply, bind

```js
intro.call(person, 'Hi', '!');       // → Hi, Ann!
intro.apply(person, ['Hi', '?']);    // → Hi, Ann?

const bound = intro.bind(person, 'Hey');
bound('.');                          // → Hey, Ann.
bound.call({ name: 'Other' }, '.');  // → Hey, Ann.   bind is permanent
```

---

## 7. Arrow functions

Arrows are not merely a shorter `function`. They differ in four ways, and every one of them will
eventually decide whether your code works.

### Every syntax form

```js
x => x * 2                 // implicit return — the expression IS the return value
(a, b) => a + b            // two or more params always need parens
() => 42                   // zero params need empty parens
x => { return x * 2 }      // block body needs an explicit return
x => ({ a: x })            // ⚠️  parens, or {} is read as a block
(...args) => args          // rest, since arrows have no `arguments`
async x => x               // async arrow
```

### The object-literal trap

A `{` after `=>` starts a **block**, not an object. `id:` is then parsed as a label and `x` as a
useless expression, so the function returns undefined:

```js
const broken = (x) => { id: x };
broken(7);                              // → undefined

const fixed = (x) => ({ id: x });
fixed(7);                               // → { id: 7 }
```

It bites hardest inside `.map`, where the result is a silently all-undefined array:

```js
[1, 2].map((n) => { value: n });        // → [ undefined, undefined ]
[1, 2].map((n) => ({ value: n }));      // → [ { value: 1 }, { value: 2 } ]
```

### The four differences

| | `function` | arrow |
|---|---|---|
| `this` | from the call site | inherited from where it was written |
| `arguments` | yes | no — use `...rest` |
| `new` | constructible | `TypeError: not a constructor` |
| `.prototype` | yes | `undefined` |

Arrows also cannot be generators, and follow `const` rules rather than hoisting.

### Why `this` is the difference that matters

A regular function gets `this` from **how it is called**. An arrow has none of its own and uses
whatever `this` was **where it was written**. That single rule explains everything below.

Wrong for an object method:

```js
const counter = {
  count: 10,
  asFunction: function () { return this.count; },
  asArrow: () => this.count,
};

counter.asFunction();    // → 10
counter.asArrow();       // → undefined   `this` is the module, not counter
```

Right for a callback inside a method, because the callback inherits the method's `this`:

```js
const cart = {
  prefix: '#',
  items: ['a', 'b'],
  withArrow()    { return this.items.map((i) => this.prefix + i); },
  withFunction() { return this.items.map(function (i) { return (this && this.prefix) + i; }); },
};

cart.withArrow();      // → [ '#a', '#b' ]
cart.withFunction();   // → [ 'undefineda', 'undefinedb' ]
```

And decisive when a method is **detached** — which is exactly what happens when you hand one to
`setTimeout`, an event listener, or `.map`:

```js
class Timer {
  constructor() {
    this.ticks = 0;
    this.tickArrow = () => ++this.ticks;   // class field: bound to the instance forever
  }
  tickMethod() { return ++this.ticks; }
}

const t = new Timer();
const loose = t.tickMethod;
const looseArrow = t.tickArrow;

loose();          // TypeError — `this` is undefined
looseArrow();     // → 3

t.tickMethod.call(t);      // → 4
t.tickMethod.bind(t)();    // → 5
(() => t.tickMethod())();  // → 6
```

### Where arrows shine

Array pipelines, comparators, promise chains, and — the Forge middleware idiom — a function that
returns a function:

```js
orders.filter((o) => o.total > 50).map((o) => o.id);   // → [ 1, 3 ]
orders.reduce((sum, o) => sum + o.total, 0);           // → 240
[10, 9, 100].sort((a, b) => a - b);                    // → [ 9, 10, 100 ]

const requireRole = (role) => (req) => (req.role === role ? 'allowed' : 'denied');
requireRole('admin')({ role: 'admin' });               // → allowed
requireRole('admin')({ role: 'guest' });               // → denied
```

### Where they are wrong

Object methods and prototype methods that use `this`; anything needing `new`; generators (no arrow
syntax exists); and deep recursion, where a named `function` gives a clearer stack trace.

---

## 8. Promises

### The combinators

| | Resolves with | Rejects when |
|---|---|---|
| `Promise.all` | array of all values, in order | **any** input rejects |
| `Promise.allSettled` | array of `{status, value/reason}` | never |
| `Promise.race` | first to **settle** | if the first to settle rejects |
| `Promise.any` | first to **succeed** | all reject (`AggregateError`) |

```
Promise.all → values IN ORDER          → ["a","b","c"]
Promise.all rejects on FIRST failure   → "one failed"
allSettled → never rejects             → [{"status":"fulfilled","value":"good"},
                                          {"status":"rejected","reason":Error: bad}]
Promise.race → first to SETTLE         → "fast"
Promise.any → first to SUCCEED         → "winner"
any → AggregateError if all fail       → "AggregateError (2 errors)"
```

`race` is how you build a timeout:

```
fast enough  → "done"
too slow     → "timeout"
```

### Sequential vs parallel — measured

```
sequential awaits result → [1,2]
Promise.all result       → [1,2]
speedup                  → "99ms → 54ms"
```

Same answer, half the time. Two 40ms operations run one after another take ~80ms; run together
they take ~40ms. **Await in sequence only when B genuinely needs A's result.**

In a loop:

```
for...of + await   → elapsed ≈60ms
Promise.all(map)   → elapsed ≈20ms
```

### Concurrency limits

Unlimited `Promise.all` over 10,000 rows will exhaust your DB pool. Cap it:

```
mapLimit results (order kept)        → [10,20,30,40,50,60]
measured peak concurrency (limit 2)  → 2
```

The trick is N workers pulling from a shared cursor, claiming their index **synchronously** before
any `await`, and writing `results[i]` by index so input order survives.

🔬 **Why this one is measured, not asserted.** An earlier version of this helper in
`TUTORIAL-JS.md` used `queue.splice(0)`, which let the first worker drain the entire queue —
measured peak concurrency was **1**, not 3. It looked correct in review and was completely broken.
The exercise checker now asserts the peak concurrency directly, so a wrong implementation cannot
pass.

### The event loop

Scheduled from top-level synchronous code:

```
["sync","nextTick","promise","queueMicrotask","setTimeout","setImmediate"]
```

```
sync code           — runs to completion first, always
process.nextTick    — drained next, before promise callbacks
promise / microtask — .then, await resumption, queueMicrotask
timers              — setTimeout / setInterval
check               — setImmediate
```

🔬 **But that order is context-dependent.** Scheduling the identical five calls from *inside* an
async function gives a different answer:

```
scheduled from inside async  → ["promise","queueMicrotask","nextTick","setImmediate","setTimeout"]
nextTick still first here?   → false
```

Queued from inside a microtask, the already-draining microtask queue finishes before the
`nextTick` queue is revisited — so `nextTick` lands *after* the promise callbacks, reversing the
textbook rule. The relative order of `setTimeout` and `setImmediate` flipped too.

Do not build logic on either ordering. Only two things are worth relying on:

- all synchronous code finishes before **any** callback runs
- all microtasks drain before the next timer or immediate

The practical consequence matters more than the ordering: **a long synchronous loop blocks all of
it.** One CPU-bound `for` loop in a request handler freezes every other request in the process.

---

## 9. Strings and numbers

### Unicode

```
"café".length        → 4
"👋".length          → 2      ← surrogate pair, counted as two UTF-16 units
[..."👋"].length     → 1      ← correct
"👋".split("")       → 2      ← BROKEN, splits the pair
```

Use `[...str]` or `Array.from(str)` whenever user-supplied text might contain emoji.

### Floating point

```
0.1 + 0.2              → 0.30000000000000004
0.1 + 0.2 === 0.3      → false
epsilon compare        → true
MONEY RULE             → "store integer cents, never floats"
```

### Parsing user input

Query strings and form fields are always strings.

```
Number("42px")   → NaN      ← strict
parseInt("42px") → 42       ← lenient
Number("")       → 0        ⚠️
Number(" ")      → 0        ⚠️
Number(null)     → 0        ⚠️
Number([])       → 0        ⚠️
```

And the trap that bit this framework for real:

```
safe parse "abc" → default    → 1
safe parse "0"   → 0          → 0    ← preserved
⚠️  parseInt(v)||d loses 0    → 1    ← the bug
```

`parseInt(v) || fallback` silently converts a legitimate `0` into your default. Check
`Number.isNaN` explicitly.

### `isNaN` vs `Number.isNaN`

```
isNaN("abc")         → true      ← coerces first, almost never what you want
Number.isNaN("abc")  → false     ← strict
```

### Rounding

```
Math.round(2.5)   → 3
Math.round(-2.5)  → -2      ⚠️  rounds toward +∞, not away from zero
Math.trunc(-2.9)  → -2
(3.14159).toFixed(2)     → "3.14"     ← a STRING
typeof toFixed result    → "string"
+(3.14159).toFixed(2)    → 3.14       ← back to a number
```

And modulo keeps the dividend's sign:

```
-10 % 3                    → -1
true modulo for negatives  → 2        ← ((n % m) + m) % m
```

---

## 10. Classes

```js
class User {
  static table = 'users';     // on the class
  #password;                  // truly private
  role = 'member';            // instance field

  constructor(name, password) { this.name = name; this.#password = password; }
  greet() { return `Hi ${this.name}`; }
  get display() { return `${this.name} (${this.role})`; }
  static fromRow(row) { return new User(row.name, row.pw); }
}
```

Private fields are genuinely private — not a convention:

```
Object.keys(u)      → ["role","name"]           ← # excluded
JSON.stringify(u)   → {"role":"member","name":"Ann"}
u.#password from outside  ✗ SyntaxError: Private field '#password' must be declared
                            in an enclosing class
```

### Inheritance

```
a.greet()  // overridden   → "Hi Root [admin]"
a instanceof Admin         → true
a instanceof User          → true
Admin.table  // inherited  → "users"
using `this` before super()  ✗ ReferenceError: Must call super constructor...
```

### Class bodies are always strict

```
detached class method       ✗ TypeError: Cannot read properties of undefined
bound version works         → true
unbound h.handle passed around ✗ TypeError: Cannot read properties of undefined
```

Bind in the constructor, or use an arrow class field, whenever a method is passed as a callback.

### Controlling serialisation

```
JSON.stringify(money)  → {"amount":"199.99","currency":"INR"}
`${money}`  // toString → "₹199.99"
```

`toJSON()` is how you keep secrets out of API responses:

```
JSON.stringify(session)  → {"id":1}     ← the secret never leaves
```

---

## 11. Errors

### Always throw an `Error`

```
caught a string  → "string"
err.message      → undefined
err.stack        → undefined
```

No stack means blind debugging. When catching from code you do not control, normalise:

```
normalise a string      → "just a string"
normalise an object     → "{\"code\":\"ODD\"}"
normalise null          → "null"
original kept as .cause → {"code":"ODD"}
```

`String(v)` on an object gives the useless `"[object Object]"` — serialise instead.

### A custom error hierarchy

```js
class AppError extends Error {
  constructor(message, status = 500, details = {}, options = {}) {
    super(message, options);            // forward options so `cause` survives
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
```

Then branch on type in one place:

```
ValidationError →  {"code":422,"body":{"fields":["email"]}}
NotFoundError   →  {"code":404,"body":"Ticket not found"}
unknown Error   →  {"code":500,"body":"Internal Server Error"}
```

Unknown errors get a generic message — never leak an internal message to a client.

Keep the original with `cause`:

```
high-level message      → "Could not load users"
...root cause preserved → "ECONNREFUSED"
full cause chain        → ["Could not load users","ECONNREFUSED"]
```

Forgetting to forward `options` to `super()` is the usual reason `err.cause` comes back
`undefined` in a custom error class.

### `finally` overrides `return`

```
tricky()  → "from finally"
LESSON    → "never return from finally"
```

### Async errors

`try/catch` works with `await`. It does **not** reach into a callback that throws later:

```
caught where?  → "inside timer"     ← only because the catch is INSIDE the callback
```

And Express 4 swallows a rejected promise from an async handler — the request hangs forever. Wrap
it:

```js
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get('/x', wrap(async (req, res) => { ... }));
```

Express 5 forwards them automatically.

### The last line of defence

```js
process.on('uncaughtException', (err) => { log(err); process.exit(1); });
process.on('unhandledRejection', (reason) => { log(reason); process.exit(1); });
```

Log, then **exit**. After an uncaught exception the process is in an unknown state; staying alive
is how you corrupt data. Let pm2 / systemd / Kubernetes restart it.

---

## 12. JSON, dates, regex

### What `JSON.stringify` silently destroys

```
Functions, undefined and symbols  → the KEY disappears entirely
Infinity and NaN                  → become null
Date                              → becomes an ISO string (never a Date again)
Map and Set                       → become {} — your data is GONE
```

```
Map survived?         → {}
[1, undefined, 3]     → "[1,null,3]"     ← in an array, undefined becomes null
{a: undefined}        → "{}"             ← in an object, the key vanishes
JSON.stringify({n:1n})  ✗ TypeError: Do not know how to serialize a BigInt
JSON.stringify(circular) ✗ TypeError: Converting circular structure to JSON
```

The replacer is a one-line secret redactor:

```
fn replacer — redact secrets → {"user":"ann","password":"[redacted]","token":"[redacted]"}
```

### Dates: store UTC, render local

```
from parts (month is 0-BASED!)  → "2024-01-15T00:00:00.000Z"
⚠️  month 0 = January            → Date.UTC(2024, 11, 25) is December
"2024-01-15"       → UTC midnight
"2024-01-15T00:00" → LOCAL midnight
detect invalid     → Number.isNaN(d.getTime())
```

Setters mutate in place, so clone first:

```
mutated              → "2024-02-14"
...it even rolls the month → 1
clone was safe       → "2024-01-15"
```

**Store UTC. Always.** This is not theoretical: in the ticket portal the MySQL connection
defaulted to system time (IST) while the app rendered UTC, so freshly created tickets displayed an
age of "-1 day". The fix was pinning the connection timezone to `+00:00`.

### Regex

```
match (no /g) → details      → ["555-1234","555","1234"]     ← full match + groups
match with /g → all, no groups → ["555-1234","555-9876"]
matchAll → all WITH groups   → ["1234","9876"]
no match returns null        → null                          ← always guard
m.groups                     → {"year":"2024","month":"01","day":"15"}
```

Escape user input before building a pattern:

```
new RegExp("(") — user input  ✗ SyntaxError: Invalid regular expression
escaped is safe               → true
```

And the state trap that catches everyone:

```
1st test  (lastIndex before: 0)  → "true  → lastIndex now 1"
2nd test  — same string!         → "true  → lastIndex now 2"
3rd test  — FALSE, and resets    → "false → lastIndex now 0"
```

A `/g` regex remembers where it stopped. Calling `.test()` repeatedly on the *same string* walks
forward and eventually returns `false`. Drop the `/g` for `.test()`, or reset `lastIndex`.

Finally, avoid nested quantifiers on user input — `/(a+)+$/` against a long non-matching string
can hang the event loop for minutes, freezing the whole server (ReDoS).

---

## 13. Modules

Forge uses CommonJS.

```js
module.exports = MyClass;              // one thing
module.exports = { helperA, helperB }; // several
exports.helperA = helperA;             // incrementally

// ⚠️  exports = {...} does NOT work — it just rebinds the local variable
```

|  | CommonJS (`.js`) | ESM (`.mjs` / `"type":"module"`) |
|---|---|---|
| import | `require('x')` | `import x from 'x'` |
| export | `module.exports = x` | `export default x` |
| loading | synchronous | asynchronous |
| `__dirname` | available | `import.meta.dirname` |
| top-level await | no | yes |

You can always load an ESM-only package from CommonJS with a dynamic import — which is exactly how
Forge loads `file-type`:

```js
const mod = await import('some-esm-only-package');
```

**Module code runs once per process.** Anything created at the top level — a DB pool, a counter, a
config object — is shared by every request. That is correct for a pool and a bug for per-request
state; use `AsyncLocalStorage` for the latter (see `core/context.js`).

---

## Where to go next

You now have the language. The framework docs pick up from here:

| Document | Read it for |
|---|---|
| [TUTORIAL-JS.md](./TUTORIAL-JS.md) | Node-specific essentials for PHP migrants — the runtime, the module system, and the 14 errors you'll actually hit |
| [TUTORIAL-ASYNC.md](./TUTORIAL-ASYNC.md) | The long-form version of chapter 08 — promises, async/await, combinators, concurrency limits, and framework patterns |
| [TUTORIAL-JS-ADVANCED.md](./TUTORIAL-JS-ADVANCED.md) | The long-form version of chapters 01–12 — prototypes, `this`, generators, Proxy, numbers, dates, JSON |
| [TUTORIAL-NODE-RUNTIME.md](./TUTORIAL-NODE-RUNTIME.md) | The runtime beneath the language — event loop, streams, modules, threads |
| [LEARNING-PATH.md](./LEARNING-PATH.md) | Every document in this repo, in reading order |
| [TUTORIAL.md](./TUTORIAL.md) | Framework reference — databases, helpers, JWT, email, uploads, testing, deployment |
| [TUTORIAL-EJS.md](./TUTORIAL-EJS.md) | Complete CRUD walkthrough with EJS templates |
| [TUTORIAL-SOA.md](./TUTORIAL-SOA.md) | Running as a service — health probes, correlation IDs, graceful shutdown |

A suggested pace: one chapter per sitting, the exercises after chapter 08, then start building.
Come back to `04-map-set.js`, `07-arrow-functions.js` and `08-promises.js` — those three carry the
most weight in real application code.
