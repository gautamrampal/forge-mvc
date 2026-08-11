/**
 * CHAPTER 08 — PROMISES & ASYNC/AWAIT
 *
 *   node practice/08-promises.js
 *
 * The chapter that matters most for server work. Section 8.6 (sequential vs
 * parallel) is where most real performance is won or lost, and 8.9 explains
 * why a single CPU-bound loop can freeze an entire Node server.
 *
 * Note the shape of this file: almost everything lives inside `main()`,
 * because top-level `await` does not exist in CommonJS.
 */

const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const failAfter = (ms, msg) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

// Scheduled here, from genuinely SYNCHRONOUS top-level code, so section 8.9
// can show the canonical event-loop ordering.
const syncOrder = ['sync'];
setTimeout(() => syncOrder.push('setTimeout'), 0);
setImmediate(() => syncOrder.push('setImmediate'));
Promise.resolve().then(() => syncOrder.push('promise'));
process.nextTick(() => syncOrder.push('nextTick'));
queueMicrotask(() => syncOrder.push('queueMicrotask'));

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.1  A promise is a box that will hold a value');
  // ═════════════════════════════════════════════════════════════════════════

  const p = Promise.resolve(42);
  console.log(p instanceof Promise);              // → true

  // The promise is NOT the value. Logging one shows the wrapper.
  console.log(String(p));                         // → [object Promise]
  console.log(await p);                           // → 42

  // Three states: pending → fulfilled, or pending → rejected. Once settled,
  // a promise never changes again.
  console.log(await Promise.resolve(1));          // → 1
  console.log(await new Promise((res) => res('x')));   // → x

  // An async function ALWAYS returns a promise, whatever you return.
  console.log((async () => 1)() instanceof Promise);   // → true
  console.log((async () => {})() instanceof Promise);  // → true

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.2  Rejection is just the other outcome');
  // ═════════════════════════════════════════════════════════════════════════

  // .catch() handles it...
  console.log(await Promise.reject(new Error('boom')).catch((e) => e.message));   // → boom

  // ...and with await, ordinary try/catch works.
  try {
    await failAfter(1, 'thrown');
  } catch (err) {
    console.log(err.message);                     // → thrown
  }

  // `throw` inside an async function becomes a rejection.
  console.log(
    await (async () => {
      throw new Error('from async');
    })().catch((e) => e.message)
  );                                              // → from async

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.3  .then chains');
  // ═════════════════════════════════════════════════════════════════════════

  // Each .then returns a NEW promise, which is what makes chaining work.
  console.log(
    await Promise.resolve(1)
      .then((x) => x + 1)
      .then((x) => x * 10)
      .then((x) => `result: ${x}`)
  );                                              // → result: 20

  // Return a promise from inside .then and it is flattened and awaited.
  console.log(await Promise.resolve(1).then((x) => delay(5, x + 100)));   // → 101

  // Forget the `return` and the next link gets undefined. A silent classic.
  console.log(
    await Promise.resolve(1).then((x) => {
      delay(5, x + 100);
    })
  );                                              // → undefined

  // catch RECOVERS: the chain continues with the replacement value.
  console.log(
    await Promise.reject(new Error('x'))
      .catch(() => 'fallback')
      .then((v) => v + '!')
  );                                              // → fallback!

  // finally runs either way and does NOT change the value.
  console.log(await Promise.resolve('kept').finally(() => 'ignored'));   // → kept

  const order = [];
  await Promise.reject(new Error('e'))
    .then(() => order.push('then (skipped)'))
    .catch((e) => order.push('catch: ' + e.message))
    .finally(() => order.push('finally'));
  console.log(order);                             // → [ 'catch: e', 'finally' ]

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.4  The four combinators');
  // ═════════════════════════════════════════════════════════════════════════

  // all — every value, in INPUT order (not completion order). Rejects as soon
  // as any single input rejects.
  console.log(await Promise.all([delay(30, 'a'), delay(20, 'b'), delay(10, 'c')]));
                                                  // → [ 'a', 'b', 'c' ]
  console.log(
    await Promise.all([delay(10, 'ok'), failAfter(5, 'one failed')]).catch((e) => e.message)
  );                                              // → one failed

  // allSettled — never rejects. Use it when partial success is acceptable.
  const settled = await Promise.allSettled([delay(5, 'good'), failAfter(5, 'bad')]);
  console.log(settled.map((s) => s.status));      // → [ 'fulfilled', 'rejected' ]
  console.log(settled.filter((s) => s.status === 'fulfilled').map((s) => s.value));
                                                  // → [ 'good' ]
  console.log(settled.filter((s) => s.status === 'rejected').map((s) => s.reason.message));
                                                  // → [ 'bad' ]

  // race — first to SETTLE wins, success or failure.
  console.log(await Promise.race([delay(10, 'fast'), delay(50, 'slow')]));   // → fast
  console.log(
    await Promise.race([failAfter(5, 'fast failure'), delay(50, 'ok')]).catch((e) => e.message)
  );                                              // → fast failure

  // any — first to SUCCEED. Ignores rejections unless they all fail.
  console.log(await Promise.any([failAfter(5, 'nope'), delay(20, 'winner')]));   // → winner
  console.log(
    await Promise.any([failAfter(5, 'a'), failAfter(6, 'b')]).catch((e) => e.constructor.name)
  );                                              // → AggregateError

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.5  race gives you timeouts for free');
  // ═════════════════════════════════════════════════════════════════════════

  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);

  console.log(await withTimeout(delay(10, 'done'), 50));                       // → done
  console.log(await withTimeout(delay(100, 'slow'), 20).catch((e) => e.message)); // → timeout

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.6  Sequential vs parallel — measured, not asserted');
  // ═════════════════════════════════════════════════════════════════════════

  // Two independent 40ms operations, awaited one after the other.
  const seqStart = Date.now();
  const s1 = await delay(40, 1);
  const s2 = await delay(40, 2);
  const seqMs = Date.now() - seqStart;
  console.log([s1, s2]);                          // → [ 1, 2 ]
  console.log(seqMs >= 75);                       // → true

  // The same work, started together.
  const parStart = Date.now();
  const [p1, p2] = await Promise.all([delay(40, 1), delay(40, 2)]);
  const parMs = Date.now() - parStart;
  console.log([p1, p2]);                          // → [ 1, 2 ]
  console.log(parMs < 70);                        // → true

  // Same answer, half the wall time. Await in SEQUENCE only when the second
  // call genuinely needs the first one's result.
  console.log(seqMs > parMs);                     // → true

  // You can also start both, then await — the work begins at creation time,
  // not at the await.
  const bothStart = Date.now();
  const pa = delay(40, 'a');                      // running already
  const pb = delay(40, 'b');                      // running already
  console.log([await pa, await pb]);              // → [ 'a', 'b' ]
  console.log(Date.now() - bothStart < 70);       // → true

  // In a loop: for...of awaits one at a time.
  const loopStart = Date.now();
  const loopOut = [];
  for (const n of [1, 2, 3]) loopOut.push(await delay(20, n));
  console.log(loopOut);                           // → [ 1, 2, 3 ]
  console.log(Date.now() - loopStart >= 55);      // → true

  // Promise.all over a map runs them together.
  const mapStart = Date.now();
  console.log(await Promise.all([1, 2, 3].map((n) => delay(20, n))));   // → [ 1, 2, 3 ]
  console.log(Date.now() - mapStart < 50);        // → true

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.7  Concurrency limits');
  // ═════════════════════════════════════════════════════════════════════════

  // Unlimited Promise.all over 10,000 rows will exhaust your DB pool. Cap it
  // with N workers pulling from a shared cursor.
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    let active = 0;
    let peak = 0;

    const worker = async () => {
      while (cursor < items.length) {
        // Claim the index SYNCHRONOUSLY, before any await, or two workers
        // will grab the same item.
        const i = cursor++;
        active++;
        peak = Math.max(peak, active);
        results[i] = await fn(items[i]);
        active--;
      }
    };

    // Writing results[i] by index is what preserves input order.
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return { results, peak };
  }

  const { results, peak } = await mapLimit([1, 2, 3, 4, 5, 6], 2, (n) => delay(10, n * 10));
  console.log(results);                           // → [ 10, 20, 30, 40, 50, 60 ]
  console.log(peak);                              // → 2

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.8  Three traps');
  // ═════════════════════════════════════════════════════════════════════════

  // 1. A promise starts running the MOMENT it is created, not when awaited.
  const log = [];
  const eager = new Promise((res) => {
    log.push('executor ran immediately');
    res(1);
  });
  console.log(log);                               // → [ 'executor ran immediately' ]
  await eager;

  // 2. An unhandled rejection crashes the process on modern Node. Attach the
  //    catch even when you do not await the promise.
  const risky = failAfter(5, 'ignored');
  risky.catch(() => {});
  console.log('handled');                         // → handled

  // 3. await inside forEach does nothing useful — forEach ignores the promise.
  const feOrder = [];
  [1, 2, 3].forEach(async (n) => {
    await delay(5);
    feOrder.push(n);
  });
  console.log(feOrder);                           // → []
  await delay(30);
  console.log(feOrder.length);                    // → 3

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.9  The event loop');
  // ═════════════════════════════════════════════════════════════════════════

  // Scheduled at the top of this file from synchronous code.
  // (joined into one string — Node wraps long arrays across several lines)
  console.log(syncOrder.join(' → '));
  // → sync → nextTick → promise → queueMicrotask → setTimeout → setImmediate

  // Now schedule the identical five calls from INSIDE this async function —
  // that is, while the engine is already draining the microtask queue.
  const nested = [];
  setTimeout(() => nested.push('setTimeout'), 0);
  setImmediate(() => nested.push('setImmediate'));
  Promise.resolve().then(() => nested.push('promise'));
  process.nextTick(() => nested.push('nextTick'));
  queueMicrotask(() => nested.push('queueMicrotask'));
  await delay(20);

  console.log(nested.join(' → '));
  // → promise → queueMicrotask → nextTick → setImmediate → setTimeout

  // nextTick is no longer first. The already-draining microtask queue finishes
  // before the nextTick queue is revisited, which reverses the textbook rule.
  console.log(nested[0] === 'nextTick');          // → false

  // So do not build logic on the exact ordering. Only two things are safe:
  //   - all synchronous code finishes before ANY callback runs
  //   - all microtasks drain before the next timer or immediate
  //
  // The consequence that actually matters: a long synchronous loop blocks
  // every one of these queues, freezing all other requests in the process.
  const blockStart = Date.now();
  let acc = 0;
  for (let i = 0; i < 5e7; i++) acc += i;         // nothing else can run here
  console.log(Date.now() - blockStart >= 0);      // → true

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.10  Bridging callback-style APIs');
  // ═════════════════════════════════════════════════════════════════════════

  const cbStyle = (n, cb) =>
    setTimeout(() => (n < 0 ? cb(new Error('negative')) : cb(null, n * 2)), 5);

  // By hand: wrap it once in a promise constructor.
  const promisified = (n) =>
    new Promise((res, rej) => cbStyle(n, (err, v) => (err ? rej(err) : res(v))));

  console.log(await promisified(5));                            // → 10
  console.log(await promisified(-1).catch((e) => e.message));   // → negative

  // Or let Node do it, for any (err, value) callback signature.
  const { promisify } = require('node:util');
  console.log(await promisify(cbStyle)(21));      // → 42

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 8.11  Retry with exponential backoff');
  // ═════════════════════════════════════════════════════════════════════════

  let attempts = 0;
  async function flaky() {
    attempts++;
    if (attempts < 3) throw new Error('temporary');
    return 'succeeded on attempt ' + attempts;
  }

  async function retry(fn, times = 5, base = 5) {
    for (let i = 0; i < times; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === times - 1) throw err;
        await delay(base * 2 ** i);               // 5, 10, 20, 40 ...
      }
    }
  }

  console.log(await retry(flaky));                // → succeeded on attempt 3
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

/**
 * SUMMARY
 *
 *   all         every value in input order; rejects on the first failure
 *   allSettled  never rejects; [{status, value|reason}]
 *   race        first to SETTLE, success or failure
 *   any         first to SUCCEED; AggregateError if all fail
 *
 *   await a; await b;                 SEQUENTIAL — only if b needs a
 *   await Promise.all([a, b])         PARALLEL — the default choice
 *   for (const x of xs) await f(x)    sequential loop
 *   await Promise.all(xs.map(f))      parallel loop
 *   xs.forEach(async ...)             broken; the promises are dropped
 *
 *   Promises run at CREATION, not at await.
 *   Cap concurrency before it caps your connection pool.
 *   A synchronous loop blocks every queue in the process.
 *
 * Next: 09-strings-and-numbers.js
 */
