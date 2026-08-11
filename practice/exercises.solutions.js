/**
 * SOLUTIONS to practice/exercises.js
 *
 *   node practice/exercises.solutions.js
 *
 * Read these AFTER attempting your own. Where two approaches are worth
 * knowing, the alternative is shown in a comment.
 */

class NotImplemented extends Error {
  constructor() {
    super('not implemented');
    this.name = 'NotImplemented';
  }
}

// ─── ARRAYS ──────────────────────────────────────────────────────────────────

/** reduce is the general tool; the 0 seed makes the empty case work. */
const sum = (nums) => nums.reduce((acc, n) => acc + n, 0);

const evens = (nums) => nums.filter((n) => n % 2 === 0);

/** Dedupe first, then sort descending. Returns null when there is no 2nd. */
function secondLargest(nums) {
  const distinct = [...new Set(nums)].sort((a, b) => b - a);
  return distinct.length < 2 ? null : distinct[1];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Recursive: concat flattens one level, recursion handles the rest. */
const flatten = (arr) =>
  arr.reduce((acc, v) => acc.concat(Array.isArray(v) ? flatten(v) : v), []);

/** Set preserves insertion order, so first-seen order is kept for free. */
const unique = (arr) => [...new Set(arr)];

/** Set lookup is O(1) — filtering with b.includes() would be O(n*m). */
function intersect(a, b) {
  const inB = new Set(b);
  return [...new Set(a)].filter((x) => inB.has(x));
}

// ─── OBJECTS ─────────────────────────────────────────────────────────────────

const invert = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));

const pick = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)));

const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** ?. makes every level safe, so a missing branch yields undefined not a throw. */
const get = (obj, path) => path.split('.').reduce((acc, k) => acc?.[k], obj);

/** structuredClone handles Dates, Maps and cycles — JSON round-tripping does not. */
const deepClone = (obj) => structuredClone(obj);

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

// ─── MAP / SET ───────────────────────────────────────────────────────────────

function countBy(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function groupBy(items, fn) {
  const groups = new Map();
  for (const item of items) {
    const key = fn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function difference(a, b) {
  const inB = new Set(b);
  return [...new Set(a)].filter((x) => !inB.has(x));
}

/** [...str] splits by code point, so emoji count as one character. */
const allUnique = (str) => new Set([...str]).size === [...str].length;

// ─── STRINGS ─────────────────────────────────────────────────────────────────

const titleCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalise = (s) => [...s.toLowerCase().replace(/\s+/g, '')].sort().join('');
const isAnagram = (a, b) => normalise(a) === normalise(b);

const reverseWords = (str) => str.split(' ').reverse().join(' ');

// ─── FUNCTIONS ───────────────────────────────────────────────────────────────

/** A Map keyed by the argument. Note the closure: `cache` outlives the call. */
function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = args.length === 1 ? args[0] : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const value = fn(...args);
    cache.set(key, value);
    return value;
  };
}

/** reduce threads the value left-to-right. reduceRight would give compose(). */
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

function once(fn) {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

// ─── ASYNC ───────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** for...of + await is what makes this sequential. .map would run them all at once. */
async function series(tasks) {
  const results = [];
  for (const task of tasks) results.push(await task());
  return results;
}

/** race: whichever settles first wins — the timer or the real work. */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

/**
 * N workers pulling from a SHARED cursor. Claiming the index synchronously
 * (before any await) is what keeps the workers from grabbing the same item —
 * and writing results[i] by index is what preserves input order.
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function retry(fn, times) {
  let lastError;
  for (let attempt = 0; attempt < times; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < times - 1) await delay(10);
    }
  }
  throw lastError;
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
