/**
 * CHAPTER 11 — ERRORS & DEBUGGING
 *
 *   node practice/11-errors.js
 *
 * The habit that pays off most: always throw an Error object, never a string.
 * A string carries no stack trace, which turns a five-minute bug into an hour.
 */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.1  try / catch / finally');
  // ═════════════════════════════════════════════════════════════════════════

  const order = [];
  try {
    order.push('try');
    throw new Error('bang');
  } catch (err) {
    order.push('catch: ' + err.message);
  } finally {
    order.push('finally');            // runs whether or not it threw
  }
  console.log(order);                              // → [ 'try', 'catch: bang', 'finally' ]

  // You can omit the binding when you do not need the error itself.
  try {
    JSON.parse('{bad');
  } catch {
    console.log('handled');                        // → handled
  }

  // A `return` inside finally OVERRIDES the one in try. Never do this.
  function tricky() {
    try {
      return 'from try';
    } finally {
      // eslint-disable-next-line no-unsafe-finally
      return 'from finally';
    }
  }
  console.log(tricky());                           // → from finally

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.2  The Error object');
  // ═════════════════════════════════════════════════════════════════════════

  const e = new Error('something failed');
  console.log(e.message);                          // → something failed
  console.log(e.name);                             // → Error
  console.log(typeof e.stack);                     // → string
  console.log(e.stack.split('\n')[0]);             // → Error: something failed
  console.log(e instanceof Error);                 // → true

  // The built-in subclasses, each thrown by a distinct kind of mistake.
  const kinds = [];
  try { null.x; } catch (err) { kinds.push(err.constructor.name); }
  try { undefinedName; } catch (err) { kinds.push(err.constructor.name); }
  try { JSON.parse('{'); } catch (err) { kinds.push(err.constructor.name); }
  try { new Array(-1); } catch (err) { kinds.push(err.constructor.name); }
  try { decodeURIComponent('%'); } catch (err) { kinds.push(err.constructor.name); }
  console.log(kinds.join(', '));
  // → TypeError, ReferenceError, SyntaxError, RangeError, URIError

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.3  You CAN throw anything — but do not');
  // ═════════════════════════════════════════════════════════════════════════

  try {
    throw 'just a string';
  } catch (err) {
    console.log(typeof err);                       // → string
    console.log(err.message);                      // → undefined
    console.log(err.stack);                        // → undefined
  }

  // When catching from code you do not control, normalise first. Note that
  // String(obj) would give the useless "[object Object]", so serialise.
  const toError = (v) => {
    if (v instanceof Error) return v;
    const text = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    return new Error(text, { cause: v });
  };

  console.log(toError('a string').message);        // → a string
  console.log(toError({ code: 'ODD' }).message);   // → {"code":"ODD"}
  console.log(toError(null).message);              // → null
  console.log(toError({ code: 'ODD' }).cause);     // → { code: 'ODD' }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.4  A custom error hierarchy');
  // ═════════════════════════════════════════════════════════════════════════

  class AppError extends Error {
    // Accept and FORWARD options, or `{ cause }` is silently dropped — the
    // usual reason err.cause comes back undefined in a custom error class.
    constructor(message, status = 500, details = {}, options = {}) {
      super(message, options);
      this.name = this.constructor.name;
      this.status = status;
      this.details = details;
      Error.captureStackTrace?.(this, this.constructor);   // hide the ctor frame
    }
  }

  class NotFoundError extends AppError {
    constructor(what) {
      super(`${what} not found`, 404);
    }
  }

  class ValidationError extends AppError {
    constructor(fields) {
      super('Validation failed', 422, { fields });
    }
  }

  const nf = new NotFoundError('User');
  console.log(nf.message);                         // → User not found
  console.log(nf.name);                            // → NotFoundError
  console.log(nf.status);                          // → 404
  console.log(nf instanceof NotFoundError);        // → true
  console.log(nf instanceof AppError);             // → true
  console.log(nf instanceof Error);                // → true

  // Branch on type ONCE, in an error-handling middleware.
  function handle(err) {
    if (err instanceof ValidationError) return { code: 422, body: err.details };
    if (err instanceof NotFoundError) return { code: 404, body: err.message };
    if (err instanceof AppError) return { code: err.status, body: err.message };
    // Never let an unknown error's message reach a client — it may contain
    // credentials, file paths, or SQL.
    return { code: 500, body: 'Internal Server Error' };
  }

  console.log(handle(new ValidationError(['email'])));
                                                   // → { code: 422, body: { fields: [ 'email' ] } }
  console.log(handle(new NotFoundError('Ticket')));
                                                   // → { code: 404, body: 'Ticket not found' }
  console.log(handle(new Error('db password is hunter2')));
                                                   // → { code: 500, body: 'Internal Server Error' }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.5  Keep the original with `cause`');
  // ═════════════════════════════════════════════════════════════════════════

  try {
    try {
      throw new Error('ECONNREFUSED');
    } catch (low) {
      throw new AppError('Could not load users', 503, {}, { cause: low });
    }
  } catch (high) {
    console.log(high.message);                     // → Could not load users
    console.log(high.cause.message);               // → ECONNREFUSED

    // Walking the chain is invaluable in logs.
    const chain = [];
    for (let cur = high; cur; cur = cur.cause) chain.push(cur.message);
    console.log(chain);                            // → [ 'Could not load users', 'ECONNREFUSED' ]
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.6  Async errors');
  // ═════════════════════════════════════════════════════════════════════════

  // With await, ordinary try/catch works.
  try {
    await Promise.reject(new Error('async boom'));
  } catch (err) {
    console.log(err.message);                      // → async boom
  }

  // A throw inside a non-awaited async function is invisible until you attach
  // a handler. On modern Node an unhandled rejection terminates the process.
  const forgotten = (async () => {
    throw new Error('nobody catches me');
  })();
  console.log(await forgotten.catch((err) => err.message));   // → nobody catches me

  // try/catch does NOT reach into a callback that runs later. The catch has
  // to be INSIDE the callback.
  let caught = 'nothing';
  try {
    setTimeout(() => {
      try {
        throw new Error('inside timer');
      } catch (err) {
        caught = err.message;
      }
    }, 5);
  } catch {
    caught = 'outer catch — never runs';
  }
  await delay(20);
  console.log(caught);                             // → inside timer

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.7  Retry only what is worth retrying');
  // ═════════════════════════════════════════════════════════════════════════

  const RETRYABLE = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']);

  let tries = 0;
  async function unstable() {
    tries++;
    if (tries < 3) {
      const err = new Error('temporary');
      err.code = 'ETIMEDOUT';
      throw err;
    }
    return 'ok after ' + tries;
  }

  async function retry(fn, times = 4) {
    for (let i = 0; i < times; i++) {
      try {
        return await fn();
      } catch (err) {
        // Retrying a 400 Bad Request just wastes time and hammers the service.
        if (!RETRYABLE.has(err.code) || i === times - 1) throw err;
        await delay(5 * 2 ** i);
      }
    }
  }

  console.log(await retry(unstable));               // → ok after 3

  console.log(
    await retry(async () => {
      const err = new Error('bad request');
      err.code = 'EBADINPUT';
      throw err;
    }).catch((err) => err.message)
  );                                                // → bad request

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.8  Returning errors instead of throwing');
  // ═════════════════════════════════════════════════════════════════════════

  // Sometimes a failure is an expected outcome, not an exception. Returning a
  // result object makes the caller handle it explicitly.
  const safeJson = (text) => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  console.log(safeJson('{"a":1}'));                 // → { ok: true, value: { a: 1 } }
  console.log(safeJson('{bad').ok);                 // → false

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.9  Express and the process-level net');
  // ═════════════════════════════════════════════════════════════════════════

  // Express 4 SWALLOWS a rejected promise from an async handler — the request
  // hangs forever with no error logged:
  //
  //   app.get('/x', async (req, res) => { throw new Error('boom'); });   // ❌
  //
  // Forward it to next() instead, or wrap once:
  //
  //   const wrap = (fn) => (req, res, next) =>
  //     Promise.resolve(fn(req, res, next)).catch(next);
  //   app.get('/x', wrap(async (req, res) => { ... }));                  // ✅
  //
  // Express 5 forwards rejections automatically.
  //
  // And the last line of defence:
  //
  //   process.on('uncaughtException',  (err)    => { log(err); process.exit(1); });
  //   process.on('unhandledRejection', (reason) => { log(reason); process.exit(1); });
  //
  // Log, then EXIT. After an uncaught exception the process state is unknown,
  // and staying alive is how you corrupt data. Let pm2 / systemd / Kubernetes
  // restart it cleanly.

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fakeNext = (err) => 'next(' + err.message + ')';
  console.log(
    await wrap(async () => {
      throw new Error('boom');
    })({}, {}, fakeNext)
  );                                                // → next(boom)

  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n## 11.10  Debugging toolkit');
  // ═════════════════════════════════════════════════════════════════════════

  // console.log truncates nested objects at depth 2 — a frequent source of
  // "why does it say [Object]".
  const deep = { a: { b: { c: { d: 'buried' } } } };
  console.log(deep);                                // → { a: { b: { c: [Object] } } }

  // Two ways to see all of it:
  console.log(JSON.stringify(deep));                // → {"a":{"b":{"c":{"d":"buried"}}}}
  console.log(require('node:util').inspect(deep, { depth: null, compact: true }));
                                                    // → { a: { b: { c: { d: 'buried' } } } }
  // console.dir(deep, { depth: null })  does the same without the import.

  // console.table(rows) renders an array of records as an ASCII table —
  // genuinely useful for DB results.

  // Other tools worth knowing:
  //   console.time('x') / console.timeEnd('x')   crude timing
  //   node --inspect-brk app.js                  real breakpoints via chrome://inspect
  //   node --trace-warnings                      stack traces for warnings
  //   err.stack                                  the reason to always throw Errors
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

/**
 * SUMMARY
 *
 *   always throw new Error(...)     strings carry no stack
 *   class AppError extends Error    set .name, .status; forward `options`
 *                                   to super() so `cause` survives
 *   err.cause                       chain the original; walk it in logs
 *   catch { }                       binding is optional
 *   never return from finally       it overrides the try's return
 *
 *   try/catch + await               works
 *   try/catch around setTimeout     does NOT — catch inside the callback
 *   unknown errors                  log them, return a generic 500
 *   retry                           only on retryable codes, with backoff
 *
 * Next: 12-json-date-regex.js
 */
