/**
 * SELF-CHECKING EXERCISES
 *
 *   node practice/exercises.js
 *
 * Every function below throws "not implemented". Replace each body, re-run,
 * and watch the ✗ turn into ✓. The checker tells you what it expected and
 * what it got, so you never have to guess.
 *
 * Stuck? The matching topic file is named in each exercise header.
 * Solutions: practice/exercises.solutions.js
 */

class NotImplemented extends Error {
  constructor() {
    super('not implemented');
    this.name = 'NotImplemented';
  }
}
const TODO = () => {
  throw new NotImplemented();
};

// ─── ARRAYS (see 02-arrays.js) ───────────────────────────────────────────────

/** Sum every number in the array. sum([1,2,3]) → 6 ; sum([]) → 0 */
function sum(nums) {
  return TODO();
}

/** Return only the even numbers. evens([1,2,3,4]) → [2,4] */
function evens(nums) {
  return TODO();
}

/** Second largest DISTINCT value. secondLargest([5,1,5,3]) → 3 ; [5] → null */
function secondLargest(nums) {
  return TODO();
}

/** Split into chunks of n. chunk([1,2,3,4,5], 2) → [[1,2],[3,4],[5]] */
function chunk(arr, size) {
  return TODO();
}

/** Flatten any depth WITHOUT using .flat(). flatten([1,[2,[3]]]) → [1,2,3] */
function flatten(arr) {
  return TODO();
}

/** Remove duplicates, keep first-seen order. unique([3,1,3,2]) → [3,1,2] */
function unique(arr) {
  return TODO();
}

/** Intersection of two arrays, order from a. intersect([1,2,3],[2,3,4]) → [2,3] */
function intersect(a, b) {
  return TODO();
}

// ─── OBJECTS (see 03-objects.js) ─────────────────────────────────────────────

/** Invert keys and values. invert({a:'x'}) → {x:'a'} */
function invert(obj) {
  return TODO();
}

/** Keep only the listed keys. pick({a:1,b:2}, ['a']) → {a:1} */
function pick(obj, keys) {
  return TODO();
}

/** Remove the listed keys. omit({a:1,b:2}, ['a']) → {b:2} */
function omit(obj, keys) {
  return TODO();
}

/** Read a dotted path safely. get({a:{b:1}}, 'a.b') → 1 ; missing → undefined */
function get(obj, path) {
  return TODO();
}

/** Deep clone — mutating the result must not touch the input. */
function deepClone(obj) {
  return TODO();
}

/** true if both have the same keys and values, recursively. */
function deepEqual(a, b) {
  return TODO();
}

// ─── MAP / SET (see 04-map-set.js) ───────────────────────────────────────────

/** Count occurrences. Return a Map. countBy(['a','b','a']) → Map{a=>2, b=>1} */
function countBy(items) {
  return TODO();
}

/** Group objects by the value of fn. Return a Map of key → array. */
function groupBy(items, fn) {
  return TODO();
}

/** Items in a that are not in b, deduped. difference([1,2,2,3],[3]) → [1,2] */
function difference(a, b) {
  return TODO();
}

/** true if the string has no repeated character. */
function allUnique(str) {
  return TODO();
}

// ─── STRINGS (see 09-strings-and-numbers.js) ────────────────────────────────

/** 'hello world' → 'Hello World' */
function titleCase(str) {
  return TODO();
}

/** '  Hello, World! ' → 'hello-world' */
function slugify(str) {
  return TODO();
}

/** true if the two strings are anagrams, ignoring case and spaces. */
function isAnagram(a, b) {
  return TODO();
}

/** Reverse the words but not the letters. 'a b c' → 'c b a' */
function reverseWords(str) {
  return TODO();
}

// ─── FUNCTIONS (see 06-functions.js, 07-arrow-functions.js) ──────────────────

/** Return a function that caches results per argument. */
function memoize(fn) {
  return TODO();
}

/** Run fn left-to-right: pipe(f, g)(x) === g(f(x)) */
function pipe(...fns) {
  return TODO();
}

/** Return a function that can only ever run once; later calls return the first result. */
function once(fn) {
  return TODO();
}

// ─── ASYNC (see 08-promises.js) ──────────────────────────────────────────────

/** Resolve after ms milliseconds. */
function delay(ms) {
  return TODO();
}

/** Run every task SEQUENTIALLY, return results in order. tasks are () => Promise */
async function series(tasks) {
  return TODO();
}

/** Reject with Error('timeout') if promise takes longer than ms. */
function withTimeout(promise, ms) {
  return TODO();
}

/** Run tasks with at most `limit` in flight. Results stay in input order. */
async function mapLimit(items, limit, fn) {
  return TODO();
}

/** Retry fn up to `times`, waiting 10ms between attempts. Throw the last error. */
async function retry(fn, times) {
  return TODO();
}

// ═════════════════════════════════════════════════════════════════════════════
//  THE CHECKER — you do not need to edit below this line
// ═════════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
let notDone = 0;
const failures = [];

function fmt(v) {
  if (v instanceof Map) return `Map{${[...v].map(([k, x]) => `${k}=>${fmt(x)}`).join(', ')}}`;
  if (v instanceof Set) return `Set{${[...v].map(fmt).join(', ')}}`;
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function same(a, b) {
  if (a instanceof Map && b instanceof Map) {
    return a.size === b.size && [...a].every(([k, v]) => b.has(k) && same(v, b.get(k)));
  }
  if (a instanceof Set && b instanceof Set) {
    return a.size === b.size && [...a].every((v) => b.has(v));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

async function check(label, actualFn, expected) {
  let actual;
  try {
    actual = await actualFn();
  } catch (err) {
    if (err instanceof NotImplemented) {
      notDone++;
      console.log(`   ○ ${label.padEnd(46)} (not implemented yet)`);
      return;
    }
    failed++;
    failures.push(`${label}\n       threw ${err.constructor.name}: ${err.message}`);
    console.log(`   ✗ ${label.padEnd(46)} threw ${err.message}`);
    return;
  }
  if (same(actual, expected)) {
    passed++;
    console.log(`   ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n       expected ${fmt(expected)}\n       actual   ${fmt(actual)}`);
    console.log(`   ✗ ${label.padEnd(46)} expected ${fmt(expected)}, got ${fmt(actual)}`);
  }
}

function group(name) {
  console.log(`\n▸ ${name}`);
}

// Tests that assert on a REJECTION use .catch(). Without this, the stub's
// NotImplemented would be caught there and reported as a wrong answer rather
// than as "not started".
const rethrowTodo = (err) => {
  if (err instanceof NotImplemented) throw err;
  return err;
};

async function run() {
  console.log('\n' + '─'.repeat(74));
  console.log('  PRACTICE EXERCISES');
  console.log('─'.repeat(74));

  group('Arrays');
  await check('sum([1,2,3])', () => sum([1, 2, 3]), 6);
  await check('sum([])', () => sum([]), 0);
  await check('evens([1,2,3,4])', () => evens([1, 2, 3, 4]), [2, 4]);
  await check('secondLargest([5,1,5,3])', () => secondLargest([5, 1, 5, 3]), 3);
  await check('secondLargest([5])', () => secondLargest([5]), null);
  await check('chunk([1,2,3,4,5], 2)', () => chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  await check('flatten([1,[2,[3,[4]]]])', () => flatten([1, [2, [3, [4]]]]), [1, 2, 3, 4]);
  await check('unique([3,1,3,2])', () => unique([3, 1, 3, 2]), [3, 1, 2]);
  await check('intersect([1,2,3],[2,3,4])', () => intersect([1, 2, 3], [2, 3, 4]), [2, 3]);

  group('Objects');
  await check("invert({a:'x',b:'y'})", () => invert({ a: 'x', b: 'y' }), { x: 'a', y: 'b' });
  await check("pick({a:1,b:2,c:3},['a','c'])", () => pick({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
  await check("omit({a:1,b:2},['a'])", () => omit({ a: 1, b: 2 }, ['a']), { b: 2 });
  await check("get({a:{b:{c:7}}},'a.b.c')", () => get({ a: { b: { c: 7 } } }, 'a.b.c'), 7);
  await check("get({a:1},'x.y')", () => get({ a: 1 }, 'x.y'), undefined);
  await check('deepClone is independent', () => {
    const src = { a: { b: 1 } };
    const out = deepClone(src);
    out.a.b = 99;
    return src.a.b;
  }, 1);
  await check('deepEqual({a:[1,{b:2}]}, same)', () => deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), true);
  await check('deepEqual({a:1},{a:2})', () => deepEqual({ a: 1 }, { a: 2 }), false);

  group('Map / Set');
  await check("countBy(['a','b','a'])", () => countBy(['a', 'b', 'a']), new Map([['a', 2], ['b', 1]]));
  await check('groupBy by .type', () =>
    groupBy([{ type: 'x', n: 1 }, { type: 'y', n: 2 }, { type: 'x', n: 3 }], (o) => o.type),
    new Map([['x', [{ type: 'x', n: 1 }, { type: 'x', n: 3 }]], ['y', [{ type: 'y', n: 2 }]]])
  );
  await check('difference([1,2,2,3],[3])', () => difference([1, 2, 2, 3], [3]), [1, 2]);
  await check("allUnique('abc')", () => allUnique('abc'), true);
  await check("allUnique('aba')", () => allUnique('aba'), false);

  group('Strings');
  await check("titleCase('hello big world')", () => titleCase('hello big world'), 'Hello Big World');
  await check("slugify('  Hello, World! ')", () => slugify('  Hello, World! '), 'hello-world');
  await check("isAnagram('Listen','Silent')", () => isAnagram('Listen', 'Silent'), true);
  await check("isAnagram('abc','abd')", () => isAnagram('abc', 'abd'), false);
  await check("reverseWords('a b c')", () => reverseWords('a b c'), 'c b a');

  group('Functions');
  await check('memoize calls fn once per arg', () => {
    let calls = 0;
    const m = memoize((n) => {
      calls++;
      return n * 2;
    });
    m(2);
    m(2);
    m(3);
    return [m(2), calls];
  }, [4, 2]);
  await check('pipe(x=>x+1, x=>x*2)(5)', () => pipe((x) => x + 1, (x) => x * 2)(5), 12);
  await check('once runs a single time', () => {
    let calls = 0;
    const o = once(() => ++calls);
    o();
    o();
    o();
    return calls;
  }, 1);

  group('Async');
  await check('delay(10) resolves', async () => {
    const t = Date.now();
    await delay(10);
    return Date.now() - t >= 8;
  }, true);
  await check('series keeps order', async () =>
    series([() => Promise.resolve(1), () => Promise.resolve(2)]), [1, 2]);
  await check('series is SEQUENTIAL', async () => {
    const log = [];
    const task = (n, ms) => async () => {
      await new Promise((r) => setTimeout(r, ms));
      log.push(n);
      return n;
    };
    await series([task(1, 20), task(2, 5)]);
    return log;
  }, [1, 2]);
  await check('withTimeout passes when fast', async () =>
    withTimeout(new Promise((r) => setTimeout(() => r('ok'), 5)), 50), 'ok');
  await check('withTimeout rejects when slow', async () =>
    withTimeout(new Promise((r) => setTimeout(() => r('slow'), 60)), 15).catch((e) => rethrowTodo(e).message), 'timeout');
  await check('mapLimit keeps input order', async () =>
    mapLimit([1, 2, 3, 4], 2, async (n) => n * 10), [10, 20, 30, 40]);
  await check('mapLimit respects the limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n;
    });
    return peak;
  }, 2);
  await check('retry succeeds on the 3rd try', async () => {
    let n = 0;
    return retry(async () => {
      if (++n < 3) throw new Error('fail');
      return n;
    }, 5);
  }, 3);
  await check('retry rethrows after the last attempt', async () => {
    let n = 0;
    return retry(async () => {
      n++;
      throw new Error('always');
    }, 3).catch((e) => [rethrowTodo(e).message, n]);
  }, ['always', 3]);

  // ── summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(74));
  const total = passed + failed + notDone;
  console.log(`  ${passed}/${total} passing   ${failed} failing   ${notDone} not started`);
  console.log('─'.repeat(74));

  if (failures.length) {
    console.log('\n  DETAILS\n');
    for (const f of failures) console.log('   • ' + f + '\n');
  }
  if (notDone === total) {
    console.log('\n  Everything is still stubbed — open this file and start with sum().\n');
  } else if (failed === 0 && notDone === 0) {
    console.log('\n  All green. Compare yours with exercises.solutions.js.\n');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
