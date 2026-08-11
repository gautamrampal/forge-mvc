/**
 * CHAPTER 04 — MAP, SET, WeakMap, WeakSet
 *
 *   node practice/04-map-set.js
 *
 * A plain object is a fine dictionary until the keys stop being simple
 * strings you control. This chapter is mostly about knowing when that line
 * has been crossed.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.1  Map basics');
// ═══════════════════════════════════════════════════════════════════════════

const m = new Map();
m.set('a', 1);
m.set('b', 2);

console.log(m);                                  // → Map(2) { 'a' => 1, 'b' => 2 }
console.log(m.get('a'));                         // → 1
console.log(m.get('nope'));                      // → undefined
console.log(m.has('a'));                         // → true
console.log(m.size);                             // → 2

m.delete('a');
console.log(m);                                  // → Map(1) { 'b' => 2 }

// set() returns the map, so calls chain.
console.log(new Map().set('x', 1).set('y', 2));  // → Map(2) { 'x' => 1, 'y' => 2 }

// Build from pairs, or straight from an object.
console.log(new Map([['a', 1], ['b', 2]]));      // → Map(2) { 'a' => 1, 'b' => 2 }
console.log(new Map(Object.entries({ a: 1 })));  // → Map(1) { 'a' => 1 }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.2  Reason 1 to prefer Map — any key type');
// ═══════════════════════════════════════════════════════════════════════════

const objKey = { id: 1 };
const anyKeys = new Map([
  [objKey, 'an object'],
  [42, 'number 42'],
  ['42', 'string 42'],
  [NaN, 'even NaN'],
]);

console.log(anyKeys.get(objKey));                // → an object
console.log(anyKeys.get(42));                    // → number 42
console.log(anyKeys.get('42'));                  // → string 42
console.log(anyKeys.get(NaN));                   // → even NaN
console.log(anyKeys.size);                       // → 4

// An object stringifies EVERY key, so those distinctions collapse.
const plain = {};
plain[42] = 'number';
plain['42'] = 'string';        // same key — overwrites the line above
plain[{ id: 1 }] = 'obj';      // key becomes "[object Object]"
plain[{ id: 2 }] = 'obj2';     // ...the SAME key again

console.log(Object.keys(plain));                 // → [ '42', '[object Object]' ]
console.log(plain[42]);                          // → string

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.3  Reason 2 — insertion order is guaranteed');
// ═══════════════════════════════════════════════════════════════════════════

console.log([...new Map([['z', 1], ['a', 2], ['10', 3], ['2', 4]]).keys()]);
                                                 // → [ 'z', 'a', '10', '2' ]

// An object silently reorders integer-like keys to the front, ascending.
console.log(Object.keys({ z: 1, a: 2, 10: 3, 2: 4 }));
                                                 // → [ '2', '10', 'z', 'a' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.4  Reason 3 — no inherited keys');
// ═══════════════════════════════════════════════════════════════════════════

// Every plain object already "has" these, which can corrupt a lookup built
// from user input.
console.log(typeof {}.constructor);              // → function
console.log(typeof {}.toString);                 // → function

console.log(new Map().get('constructor'));       // → undefined
console.log(new Map().has('toString'));          // → false

// Reason 4 is simply that map.size is a property, where Object.keys(o).length
// builds a throwaway array first.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.5  Iterating a Map');
// ═══════════════════════════════════════════════════════════════════════════

const stock = new Map([['apple', 5], ['banana', 0], ['cherry', 12]]);

// for...of over a Map yields [key, value] pairs — destructure them.
const lines = [];
for (const [k, v] of stock) {
  lines.push(`${k}:${v}`);
}
console.log(lines);                              // → [ 'apple:5', 'banana:0', 'cherry:12' ]

console.log([...stock.keys()]);                  // → [ 'apple', 'banana', 'cherry' ]
console.log([...stock.values()]);                // → [ 5, 0, 12 ]
console.log([...stock.entries()][0]);            // → [ 'apple', 5 ]

// Note the argument order: VALUE first, then key. Easy to get backwards.
const collected = [];
stock.forEach((value, key) => collected.push(`${key}=${value}`));
console.log(collected);                          // → [ 'apple=5', 'banana=0', 'cherry=12' ]

// Maps have no map/filter of their own — spread to an array and back.
console.log([...stock].filter(([, v]) => v > 0).map(([k]) => k));
                                                 // → [ 'apple', 'cherry' ]
console.log([...stock.values()].reduce((a, b) => a + b, 0));      // → 17
console.log(new Map([...stock].filter(([, v]) => v > 0)));
                                                 // → Map(2) { 'apple' => 5, 'cherry' => 12 }
console.log(Object.fromEntries(stock));          // → { apple: 5, banana: 0, cherry: 12 }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.6  The two patterns you will actually use');
// ═══════════════════════════════════════════════════════════════════════════

// Grouping: "get the bucket, creating it if absent".
const rows = [
  { dept: 'eng', name: 'ann' },
  { dept: 'ops', name: 'bob' },
  { dept: 'eng', name: 'cal' },
];
const byDept = new Map();
for (const r of rows) {
  if (!byDept.has(r.dept)) byDept.set(r.dept, []);
  byDept.get(r.dept).push(r.name);
}
console.log(byDept);                             // → Map(2) { 'eng' => [ 'ann', 'cal' ], 'ops' => [ 'bob' ] }

// Counting. `?? 0` rather than `|| 0` — though here either works, `??` is the
// habit to build, since a stored 0 is a legitimate value.
const counts = new Map();
for (const w of ['a', 'b', 'a', 'c', 'a']) {
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
console.log(counts);                             // → Map(3) { 'a' => 3, 'b' => 1, 'c' => 1 }
console.log([...counts].sort((a, b) => b[1] - a[1])[0]);          // → [ 'a', 3 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.7  Set — unique values');
// ═══════════════════════════════════════════════════════════════════════════

const st = new Set([1, 2, 2, 3, 3, 3]);
console.log(st);                                 // → Set(3) { 1, 2, 3 }
console.log(st.size);                            // → 3
console.log(st.has(2));                          // → true

st.add(4);
st.add(4);                                       // no-op, already present
console.log(st);                                 // → Set(4) { 1, 2, 3, 4 }

st.delete(1);
console.log(st);                                 // → Set(3) { 2, 3, 4 }

// The everyday use: deduplication.
console.log([...new Set([1, 1, 2, 3, 3])]);      // → [ 1, 2, 3 ]
console.log(Array.from(new Set('hello')));       // → [ 'h', 'e', 'l', 'o' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.8  Set compares like === (with two exceptions)');
// ═══════════════════════════════════════════════════════════════════════════

// Objects are compared by IDENTITY, so two identical-looking ones both stay.
console.log(new Set([{ a: 1 }, { a: 1 }]).size);      // → 2

const shared = { a: 1 };
console.log(new Set([shared, shared]).size);          // → 1

// The exceptions: NaN equals itself here, and 0/-0 collapse.
console.log(new Set([NaN, NaN]).size);                // → 1
console.log(new Set([0, -0]).size);                   // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.9  Set algebra');
// ═══════════════════════════════════════════════════════════════════════════

const A = new Set([1, 2, 3, 4]);
const B = new Set([3, 4, 5]);

// The portable way — works on any Node version.
console.log(new Set([...A, ...B]));                        // → Set(5) { 1, 2, 3, 4, 5 }
console.log(new Set([...A].filter((x) => B.has(x))));      // → Set(2) { 3, 4 }
console.log(new Set([...A].filter((x) => !B.has(x))));     // → Set(2) { 1, 2 }
console.log([...B].every((x) => A.has(x)));                // → false

// Built in from Node 22.
console.log(A.union(B));                                   // → Set(5) { 1, 2, 3, 4, 5 }
console.log(A.intersection(B));                            // → Set(2) { 3, 4 }
console.log(A.difference(B));                              // → Set(2) { 1, 2 }
console.log(A.symmetricDifference(B));                     // → Set(3) { 1, 2, 5 }
console.log(A.isSubsetOf(B));                              // → false

// A Set as a "have I seen this?" tracker. `.add()` returns the set (truthy),
// so this filters down to first occurrences in one pass.
const seen = new Set();
console.log(['a', 'b', 'a', 'c', 'b'].filter((x) => !seen.has(x) && seen.add(x)));
                                                           // → [ 'a', 'b', 'c' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.10  Neither Map nor Set is indexable');
// ═══════════════════════════════════════════════════════════════════════════

// These read a PROPERTY, not an entry. No error — just quietly undefined.
console.log(st[0]);                              // → undefined
console.log(stock['apple']);                     // → undefined

console.log([...st][0]);                         // → 2
console.log(stock.get('apple'));                 // → 5

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 4.11  WeakMap and WeakSet');
// ═══════════════════════════════════════════════════════════════════════════

// Keys MUST be objects, and are held weakly: if nothing else references the
// key, the entry is garbage-collected. A regular Map would keep it alive
// forever — a classic slow memory leak in long-running servers.
const wm = new WeakMap();
const owner = { id: 1 };
wm.set(owner, { secret: 'private data' });

console.log(wm.get(owner));                      // → { secret: 'private data' }
console.log(wm.has({ id: 1 }));                  // → false

try {
  wm.set('a string', 1);
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

// No size, and not iterable — you cannot enumerate what might vanish.
console.log(wm.size);                            // → undefined

// Typical use: cache derived data against an object you did not create.
const cache = new WeakMap();
function expensive(obj) {
  if (cache.has(obj)) return 'from cache';
  cache.set(obj, obj.id * 2);
  return 'computed';
}
console.log(expensive(owner));                   // → computed
console.log(expensive(owner));                   // → from cache

/**
 * SUMMARY — which container?
 *
 *   plain object   fixed, known, string keys. JSON payloads. Config.
 *   Map            keys unknown ahead of time, non-string keys, order matters,
 *                  or lots of add/delete. Caches, lookup tables, grouping.
 *   Set            membership tests and deduplication.
 *   WeakMap/Set    metadata about objects whose lifetime you do not control.
 *
 *   map.get(k) / map.set(k, v) / map.size     — never map[k]
 *   for (const [k, v] of map)                 — destructure the pair
 *   forEach((value, key) => ...)              — value comes FIRST
 *   [...map] / Object.fromEntries(map)        — to array / to object
 *
 * Next: 05-loops-and-iteration.js
 */
