/**
 * CHAPTER 02 — ARRAYS
 *
 *   node practice/02-arrays.js
 *
 * The single most important distinction here is MUTATING vs NON-MUTATING.
 * Half of all accidental array bugs come from calling a method that changed
 * the original when you assumed it returned a copy.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.1  Creating');
// ═══════════════════════════════════════════════════════════════════════════

console.log([1, 2, 3]);                          // → [ 1, 2, 3 ]
console.log(Array.from('abc'));                  // → [ 'a', 'b', 'c' ]
console.log(Array.from({ length: 4 }, (_, i) => i));   // → [ 0, 1, 2, 3 ]
console.log([...Array(4).keys()]);               // → [ 0, 1, 2, 3 ]

// Array(n) makes n EMPTY SLOTS — not n undefined values. Note how Node prints
// them, and note that they are not the same as undefined.
console.log(new Array(3));                       // → [ <3 empty items> ]
console.log(new Array(3).length);                // → 3
console.log(0 in new Array(3));                  // → false
console.log(0 in [undefined]);                   // → true

// Most array methods SKIP holes, which makes them a silent trap:
console.log(new Array(3).map(() => 1));          // → [ <3 empty items> ]
console.log(Array(3).fill(0));                   // → [ 0, 0, 0 ]
console.log(Array(3).fill(0).map(() => 1));      // → [ 1, 1, 1 ]

// Array(3) vs Array.of(3):
console.log(Array.of(3));                        // → [ 3 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.2  Reading');
// ═══════════════════════════════════════════════════════════════════════════

const letters = ['a', 'b', 'c', 'd'];
console.log(letters[0]);                         // → a
console.log(letters[99]);                        // → undefined
console.log(letters.at(-1));                     // → d
console.log(letters.at(-2));                     // → c
console.log(letters.length);                     // → 4

// length is writable, which gives a blunt truncation trick:
const trunc = [1, 2, 3, 4, 5];
trunc.length = 3;
console.log(trunc);                              // → [ 1, 2, 3 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.3  MUTATING methods — these change the original');
// ═══════════════════════════════════════════════════════════════════════════

// push pop shift unshift splice sort reverse fill copyWithin
const m = [3, 1, 2];

m.push(4);                       // add to end, returns new length
console.log(m);                                  // → [ 3, 1, 2, 4 ]

m.pop();                         // remove from end, returns the item
console.log(m);                                  // → [ 3, 1, 2 ]

m.unshift(0);                    // add to front
console.log(m);                                  // → [ 0, 3, 1, 2 ]

m.shift();                       // remove from front
console.log(m);                                  // → [ 3, 1, 2 ]

// splice(start, deleteCount, ...insert) — the general-purpose surgery tool
m.splice(1, 1, 'X', 'Y');
console.log(m);                                  // → [ 3, 'X', 'Y', 2 ]

m.reverse();
console.log(m);                                  // → [ 2, 'Y', 'X', 3 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.4  sort() — the default is LEXICOGRAPHIC');
// ═══════════════════════════════════════════════════════════════════════════

// sort() with no comparator converts every element to a string first. On
// numbers that is almost always wrong, and it fails silently.
console.log([10, 9, 100, 1].sort());             // → [ 1, 10, 100, 9 ]
console.log([10, 9, 100, 1].sort((a, b) => a - b));   // → [ 1, 9, 10, 100 ]
console.log([10, 9, 100, 1].sort((a, b) => b - a));   // → [ 100, 10, 9, 1 ]

const people = [
  { name: 'carol', age: 30 },
  { name: 'alice', age: 25 },
  { name: 'bob', age: 35 },
];

// Copy before sorting if you do not want to disturb the caller's array.
console.log([...people].sort((a, b) => a.age - b.age).map((p) => p.name));
                                                 // → [ 'alice', 'carol', 'bob' ]
console.log([...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.name));
                                                 // → [ 'alice', 'bob', 'carol' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.5  The non-mutating twins (Node 20+)');
// ═══════════════════════════════════════════════════════════════════════════

// Prefer these — they remove the whole class of "who mutated my array" bugs.
const orig = [3, 1, 2];
console.log(orig.toSorted((a, b) => a - b));     // → [ 1, 2, 3 ]
console.log(orig.toReversed());                  // → [ 2, 1, 3 ]
console.log(orig.with(0, 99));                   // → [ 99, 1, 2 ]
console.log(orig);                               // → [ 3, 1, 2 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.6  NON-mutating methods — these return something new');
// ═══════════════════════════════════════════════════════════════════════════

const n = [1, 2, 3, 4, 5];
console.log(n.slice(1, 3));                      // → [ 2, 3 ]
console.log(n.slice(-2));                        // → [ 4, 5 ]
// (kept to six elements: Node prints longer numeric arrays across several lines)
console.log(n.concat([6]));                      // → [ 1, 2, 3, 4, 5, 6 ]
console.log(n.join(' - '));                      // → 1 - 2 - 3 - 4 - 5
console.log([...n, 6]);                          // → [ 1, 2, 3, 4, 5, 6 ]
console.log(n);                                  // → [ 1, 2, 3, 4, 5 ]

// Flattening
console.log([1, [2, [3, [4]]]].flat());          // → [ 1, 2, [ 3, [ 4 ] ] ]
console.log([1, [2, [3, [4]]]].flat(2));         // → [ 1, 2, 3, [ 4 ] ]
console.log([1, [2, [3, [4]]]].flat(Infinity));  // → [ 1, 2, 3, 4 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.7  map / filter / reduce — the daily three');
// ═══════════════════════════════════════════════════════════════════════════

const nums = [1, 2, 3, 4, 5, 6];

// map: same length, each item transformed
console.log(nums.map((x) => x * 2));             // → [ 2, 4, 6, 8, 10, 12 ]
console.log(['a', 'b'].map((v, i) => `${i}:${v}`));   // → [ '0:a', '1:b' ]

// filter: fewer items, same values
console.log(nums.filter((x) => x % 2 === 0));    // → [ 2, 4, 6 ]

// reduce: any shape you like. The second argument is the STARTING value —
// omit it and an empty array throws.
console.log(nums.reduce((acc, x) => acc + x, 0));    // → 21
console.log(nums.reduce((a, b) => (a > b ? a : b))); // → 6
console.log([].reduce((a, b) => a + b, 0));          // → 0

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.8  Searching');
// ═══════════════════════════════════════════════════════════════════════════

console.log(nums.find((x) => x > 3));            // → 4
console.log(nums.find((x) => x > 99));           // → undefined
console.log(nums.findIndex((x) => x > 3));       // → 3
console.log(nums.findIndex((x) => x > 99));      // → -1
console.log(nums.findLast((x) => x < 4));        // → 3
console.log(nums.some((x) => x > 5));            // → true
console.log(nums.every((x) => x > 0));           // → true
console.log(nums.includes(3));                   // → true
console.log(nums.indexOf(3));                    // → 2
console.log([1, 2].flatMap((x) => [x, x]));      // → [ 1, 1, 2, 2 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.9  reduce for real work');
// ═══════════════════════════════════════════════════════════════════════════

const orders = [
  { id: 1, customer: 'alice', total: 100 },
  { id: 2, customer: 'bob', total: 50 },
  { id: 3, customer: 'alice', total: 75 },
];

console.log(orders.reduce((s, o) => s + o.total, 0));    // → 225

// Group into arrays. `||=` creates the array on first sight of a key.
const grouped = orders.reduce((acc, o) => {
  (acc[o.customer] ||= []).push(o.id);
  return acc;
}, {});
console.log(grouped);                            // → { alice: [ 1, 3 ], bob: [ 2 ] }

// Build a lookup table — turns an O(n) scan into an O(1) read.
const byId = orders.reduce((acc, o) => {
  acc[o.id] = o.customer;
  return acc;
}, {});
console.log(byId);                               // → { '1': 'alice', '2': 'bob', '3': 'alice' }

// Count occurrences.
const counts = orders.reduce((acc, o) => {
  acc[o.customer] = (acc[o.customer] || 0) + 1;
  return acc;
}, {});
console.log(counts);                             // → { alice: 2, bob: 1 }

// Node 21+ has grouping built in:
console.log(Object.keys(Object.groupBy(orders, (o) => o.customer)));
                                                 // → [ 'alice', 'bob' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.10  Chaining and deduplication');
// ═══════════════════════════════════════════════════════════════════════════

// Read a chain top to bottom as a pipeline.
console.log(
  orders
    .filter((o) => o.total > 60)
    .map((o) => o.customer)
    .filter((c, i, self) => self.indexOf(c) === i)
);                                               // → [ 'alice' ]

console.log([...new Set([1, 2, 2, 3, 3, 3])]);   // → [ 1, 2, 3 ]

// Dedupe objects by a key, keeping the first of each.
const seen = new Set();
console.log(
  orders.filter((o) => !seen.has(o.customer) && seen.add(o.customer)).map((o) => o.customer)
);                                               // → [ 'alice', 'bob' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.11  Destructuring');
// ═══════════════════════════════════════════════════════════════════════════

const [first, second, ...rest] = [1, 2, 3, 4, 5];
console.log(first);                              // → 1
console.log(second);                             // → 2
console.log(rest);                               // → [ 3, 4, 5 ]

// Skip positions with bare commas.
const [, , third] = [1, 2, 3];
console.log(third);                              // → 3

// Defaults apply only when the value is undefined.
const [p = 10, q = 20] = [1];
console.log(p);                                  // → 1
console.log(q);                                  // → 20

// Swap without a temp variable.
let x = 1;
let y = 2;
[x, y] = [y, x];
console.log([x, y]);                             // → [ 2, 1 ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 2.12  async inside array methods — read this twice');
// ═══════════════════════════════════════════════════════════════════════════

const double = async (v) => v * 2;

// .map(async ...) gives you an array of PROMISES, not values.
const promises = [1, 2, 3].map(async (v) => await double(v));
console.log(promises.map((pr) => pr.constructor.name));
                                                 // → [ 'Promise', 'Promise', 'Promise' ]

// forEach cannot be awaited at all: it ignores the returned promise, so the
// loop finishes before any of the work does.
const log = [];
[1, 2, 3].forEach(async (v) => {
  await double(v);
  log.push(v);
});
console.log(log);                                // → []

// The two correct shapes. Everything below runs inside an async function
// because top-level await is not available in CommonJS.
async function main() {
  // Parallel — all three start at once, results stay in order.
  console.log(await Promise.all([1, 2, 3].map((v) => double(v))));   // → [ 2, 4, 6 ]

  // Sequential — use when each step depends on the previous one.
  const out = [];
  for (const v of [1, 2, 3]) {
    out.push(await double(v));
  }
  console.log(out);                              // → [ 2, 4, 6 ]
}

main();

/**
 * SUMMARY
 *
 *   MUTATES:      push pop shift unshift splice sort reverse fill
 *   RETURNS NEW:  slice concat map filter reduce flat join
 *                 toSorted toReversed with        (Node 20+, prefer these)
 *
 *   sort()        stringifies — always pass (a, b) => a - b for numbers
 *   Array(3)      empty slots, skipped by map — use .fill() first
 *   arr.at(-1)    last element
 *   find          value or undefined;  findIndex  index or -1
 *
 *   async work:   await Promise.all(arr.map(fn))   parallel
 *                 for (const x of arr) await ...   sequential
 *                 arr.forEach(async ...)           broken, never do this
 *
 * Next: 03-objects.js
 */
