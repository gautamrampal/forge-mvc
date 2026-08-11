/**
 * CHAPTER 05 — LOOPS & ITERATION
 *
 *   node practice/05-loops-and-iteration.js
 *
 * `for...of` is the answer roughly 80% of the time. The rest of this chapter
 * is about the other 20%, and about what makes `for...of` work at all — the
 * iteration protocol, and generators built on top of it.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.1  The classic for');
// ═══════════════════════════════════════════════════════════════════════════

const out = [];
for (let i = 0; i < 3; i++) out.push(i);
console.log(out);                                // → [ 0, 1, 2 ]

const down = [];
for (let i = 3; i > 0; i--) down.push(i);
console.log(down);                               // → [ 3, 2, 1 ]

const stepped = [];
for (let i = 0; i < 10; i += 3) stepped.push(i);
console.log(stepped);                            // → [ 0, 3, 6, 9 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.2  let vs var — why `let` exists');
// ═══════════════════════════════════════════════════════════════════════════

// `var` is function-scoped: ONE binding, shared by every closure made in the
// loop. By the time they run, the loop has finished and i is 3.
const withVar = [];
for (var i = 0; i < 3; i++) withVar.push(() => i);
console.log(withVar.map((f) => f()));            // → [ 3, 3, 3 ]

// `let` is block-scoped: a FRESH binding per iteration.
const withLet = [];
for (let j = 0; j < 3; j++) withLet.push(() => j);
console.log(withLet.map((f) => f()));            // → [ 0, 1, 2 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.3  for...of gives VALUES — your default loop');
// ═══════════════════════════════════════════════════════════════════════════

const fruits = ['apple', 'banana', 'cherry'];

const values = [];
for (const f of fruits) values.push(f);
console.log(values);                             // → [ 'apple', 'banana', 'cherry' ]

// Need the index too? .entries() yields [index, value] pairs.
const indexed = [];
for (const [idx, f] of fruits.entries()) indexed.push(`${idx}:${f}`);
console.log(indexed);                            // → [ '0:apple', '1:banana', '2:cherry' ]

// It works on anything iterable, not just arrays.
const chars = [];
for (const c of 'hi') chars.push(c);
console.log(chars);                              // → [ 'h', 'i' ]

const fromMap = [];
for (const [k, v] of new Map([['a', 1]])) fromMap.push(`${k}=${v}`);
console.log(fromMap);                            // → [ 'a=1' ]

const fromSet = [];
for (const x of new Set([1, 2])) fromSet.push(x);
console.log(fromSet);                            // → [ 1, 2 ]

// Unlike map/filter, for...of can `break` and can `await`. That is when to
// reach for it instead of an array method.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.4  for...in gives KEYS — rarely what you want');
// ═══════════════════════════════════════════════════════════════════════════

const inKeys = [];
for (const k in fruits) inKeys.push(k);
console.log(inKeys);                             // → [ '0', '1', '2' ]

// Note those are STRINGS, so arithmetic on them concatenates.
console.log(typeof inKeys[0]);                   // → string

// It also walks the prototype chain, picking up inherited keys.
const parent = { inherited: 1 };
const kid = Object.create(parent);
kid.own = 2;

const all = [];
for (const k in kid) all.push(k);
console.log(all);                                // → [ 'own', 'inherited' ]

const ownOnly = [];
for (const k in kid) if (Object.hasOwn(kid, k)) ownOnly.push(k);
console.log(ownOnly);                            // → [ 'own' ]

// Object.keys needs no guard — it is own-properties only.
console.log(Object.keys(kid));                   // → [ 'own' ]

// The rule: for...of over arrays, Object.entries over objects.
const pairs = [];
for (const [k, v] of Object.entries({ host: 'db', port: 3306 })) pairs.push(`${k}=${v}`);
console.log(pairs);                              // → [ 'host=db', 'port=3306' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.5  while and do...while');
// ═══════════════════════════════════════════════════════════════════════════

let n = 0;
const whileOut = [];
while (n < 3) whileOut.push(n++);
console.log(whileOut);                           // → [ 0, 1, 2 ]

// do...while always runs at least once — the test comes after the body.
let d = 10;
const doOut = [];
do {
  doOut.push(d);
  d++;
} while (d < 3);
console.log(doOut);                              // → [ 10 ]

// The real use for while: an unknown number of iterations, e.g. paging until
// the API returns an empty batch.
const pages = [['a', 'b'], ['c'], []];
let page = 0;
const collected = [];
while (true) {
  const batch = pages[page++];
  if (!batch || batch.length === 0) break;
  collected.push(...batch);
}
console.log(collected);                          // → [ 'a', 'b', 'c' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.6  break, continue, labels');
// ═══════════════════════════════════════════════════════════════════════════

const bc = [];
for (const x of [1, 2, 3, 4, 5]) {
  if (x === 4) break;          // leave the loop entirely
  if (x % 2 === 0) continue;   // skip to the next iteration
  bc.push(x);
}
console.log(bc);                                 // → [ 1, 3 ]

// A label lets break/continue target an OUTER loop.
const found = [];
outer: for (const x of [1, 2]) {
  for (const y of ['a', 'b']) {
    if (y === 'b') continue outer;
    found.push(`${x}${y}`);
  }
}
console.log(found);                              // → [ '1a', '2a' ]

// You cannot break out of forEach. `return` only skips one iteration.
const fe = [];
[1, 2, 3, 4].forEach((x) => {
  if (x === 3) return;
  fe.push(x);
});
console.log(fe);                                 // → [ 1, 2, 4 ]

// If you need early exit from an array method, .some() stops on true.
const early = [];
[1, 2, 3, 4].some((x) => {
  if (x === 3) return true;
  early.push(x);
  return false;
});
console.log(early);                              // → [ 1, 2 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.7  The iteration protocol');
// ═══════════════════════════════════════════════════════════════════════════

// `for...of`, spread and array-destructuring all work on ONE condition: the
// value has a [Symbol.iterator] method returning an object with .next().
console.log(typeof [][Symbol.iterator]);         // → function
console.log(typeof ''[Symbol.iterator]);         // → function
console.log(typeof new Map()[Symbol.iterator]);  // → function

// A plain object has none, which is exactly why for...of rejects it.
console.log(typeof {}[Symbol.iterator]);         // → undefined

try {
  for (const x of { a: 1 }) console.log(x);
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

// Driving an iterator by hand shows what the loop is really doing.
const it = ['x', 'y'][Symbol.iterator]();
console.log(it.next());                          // → { value: 'x', done: false }
console.log(it.next());                          // → { value: 'y', done: false }
console.log(it.next());                          // → { value: undefined, done: true }

// Implement it yourself and your object joins in everywhere.
const range = {
  from: 1,
  to: 4,
  [Symbol.iterator]() {
    let cur = this.from;
    const last = this.to;
    return {
      next: () => (cur <= last ? { value: cur++, done: false } : { value: undefined, done: true }),
    };
  },
};

const ranged = [];
for (const v of range) ranged.push(v);
console.log(ranged);                             // → [ 1, 2, 3, 4 ]
console.log([...range]);                         // → [ 1, 2, 3, 4 ]

const [firstVal, secondVal] = range;
console.log([firstVal, secondVal]);              // → [ 1, 2 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.8  Generators — iterators without the boilerplate');
// ═══════════════════════════════════════════════════════════════════════════

// function* + yield. Each yield hands a value out and PAUSES until asked again.
function* countTo(limit) {
  for (let i = 1; i <= limit; i++) yield i;
}
console.log([...countTo(4)]);                    // → [ 1, 2, 3, 4 ]

const gen = countTo(2);
console.log(gen.next());                         // → { value: 1, done: false }
console.log(gen.next());                         // → { value: 2, done: false }
console.log(gen.next());                         // → { value: undefined, done: true }

// Because they are lazy, an infinite generator is perfectly safe — nothing is
// computed until something asks for the next value.
function* naturals() {
  let i = 1;
  while (true) yield i++;
}

function* take(iter, count) {
  let i = 0;
  for (const v of iter) {
    if (i++ >= count) return;
    yield v;
  }
}
console.log([...take(naturals(), 5)]);           // → [ 1, 2, 3, 4, 5 ]

// A lazy pipeline: nothing is materialised, so this never builds a big array.
function* mapGen(iter, fn) {
  for (const v of iter) yield fn(v);
}
function* filterGen(iter, pred) {
  for (const v of iter) if (pred(v)) yield v;
}
console.log([...take(mapGen(filterGen(naturals(), (x) => x % 2 === 0), (x) => x * x), 4)]);
                                                 // → [ 4, 16, 36, 64 ]

// yield* delegates to another iterable.
function* inner() {
  yield 'b';
  yield 'c';
}
function* outerGen() {
  yield 'a';
  yield* inner();
  yield 'd';
}
console.log([...outerGen()]);                    // → [ 'a', 'b', 'c', 'd' ]

// Generators can also RECEIVE values: the argument to next() becomes the
// result of the paused yield expression.
function* dialogue() {
  const name = yield 'What is your name?';
  const age = yield `Hi ${name}, age?`;
  return `${name} is ${age}`;
}
const conv = dialogue();
console.log(conv.next().value);                  // → What is your name?
console.log(conv.next('Ann').value);             // → Hi Ann, age?
console.log(conv.next(30).value);                // → Ann is 30

// Two everyday uses:
const tree = {
  name: 'root',
  children: [{ name: 'a', children: [{ name: 'a1', children: [] }] }, { name: 'b', children: [] }],
};
function* walk(node) {
  yield node.name;
  for (const c of node.children) yield* walk(c);
}
console.log([...walk(tree)]);                    // → [ 'root', 'a', 'a1', 'b' ]

function* chunk(arr, size) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
console.log([...chunk([1, 2, 3, 4, 5, 6, 7], 3)]);
                                                 // → [ [ 1, 2, 3 ], [ 4, 5, 6 ], [ 7 ] ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 5.9  for await...of — streams and paged I/O');
// ═══════════════════════════════════════════════════════════════════════════

async function* fetchPages() {
  for (let p = 1; p <= 3; p++) {
    await new Promise((r) => setTimeout(r, 5));  // pretend network call
    yield `page${p}`;
  }
}

async function main() {
  const got = [];
  for await (const p of fetchPages()) got.push(p);
  console.log(got);                              // → [ 'page1', 'page2', 'page3' ]

  // It also unwraps an array of promises, one at a time and in order.
  const settled = [];
  for await (const v of [Promise.resolve('a'), Promise.resolve('b')]) settled.push(v);
  console.log(settled);                          // → [ 'a', 'b' ]
}

main();

/**
 * WHICH LOOP?
 *
 *   Array, need values        for...of                   (can break / await)
 *   Array, need a new array   .map()
 *   Array, need a subset      .filter()
 *   Array, need one value     .reduce() / .find()
 *   Object                    for (const [k,v] of Object.entries(o))
 *   Need the index            for...of arr.entries()  or a classic for
 *   Fixed count               for (let i = 0; i < n; i++)
 *   Unknown count             while
 *   Sequential await          for...of                   (never forEach)
 *   Parallel await            await Promise.all(arr.map(fn))
 *   Stream / paged I/O        for await...of
 *   Lazy or infinite          generator
 *
 * Next: 06-functions.js
 */
