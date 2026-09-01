// Session storage for the web route tree, selected by SESSION_STORE in .env — the same idea as
// Laravel's SESSION_DRIVER. `db` (the default) persists sessions in whatever database DB_DRIVER
// points at, so the out-of-the-box experience needs no extra infrastructure; `redis` is the
// right choice the moment you run more than one instance; `file`/`sqlite` are zero-infra options
// for a single node; `cookie` stores the whole session client-side in the signed cookie; and
// `memory` is the dev fallback that loses every session on restart.
//
// Every store is constructed lazily inside its own branch, so the only packages that must be
// installed are the ones for the store you actually selected. The heavier native/stale ones
// (connect-sqlite3, connect-memcached) are not in package.json — the error message tells you
// what to install if you pick them.
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const logger = require('./helpers/logger');

// One idle-timeout for the cookie AND every server-side store's TTL. If these drift apart you
// get ghost behavior: a cookie that outlives its server record (random logouts) or server
// records that outlive the cookie (storage that never shrinks).
const SESSION_TTL_MS = 60 * 60 * 1000; // 60 min
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const COOKIE_NAME = 'forge.sid';

const KNOWN_STORES = ['db', 'file', 'sqlite', 'redis', 'memcached', 'cookie', 'memory'];

// Which backend will actually be used, after validation and the test override. Exported so the
// test suite can assert the selection rules without constructing real stores.
function resolveSessionStore() {
  const configured = (process.env.SESSION_STORE || 'db').toLowerCase();
  if (!KNOWN_STORES.includes(configured)) {
    throw new Error(`Unknown SESSION_STORE "${configured}". Supported: ${KNOWN_STORES.join(' | ')}.`);
  }

  // Tests run the app in-process and need it to be garbage-collectable. Server-backed stores
  // open pools/sockets that keep the event loop alive and hang the test runner after the last
  // assertion passes, so under NODE_ENV=test they all collapse to MemoryStore — which is the
  // right choice anyway: each test file wants a clean, isolated session space. `cookie` is the
  // one exception: it holds no server state and opens no handle, and honouring it is what lets
  // the cookie compat shim be exercised by the test suite at all.
  if (process.env.NODE_ENV === 'test' && configured !== 'cookie') return 'memory';
  return configured;
}

// The optional stores are not shipped in package.json (connect-sqlite3 compiles a native
// binary; connect-memcached is rarely wanted) — surface a copy-pasteable fix instead of a
// bare MODULE_NOT_FOUND stack.
function requireOptionalStore(pkg, storeName) {
  try {
    return require(pkg);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(pkg)) {
      throw new Error(`SESSION_STORE=${storeName} needs the optional "${pkg}" package — run: npm install ${pkg}`);
    }
    throw err;
  }
}

function buildDbStore() {
  const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();

  if (driver === 'mysql') {
    const MySQLStore = require('express-mysql-session')(session);
    return new MySQLStore({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      createDatabaseTable: true,
      expiration: SESSION_TTL_MS,
      schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
    });
  }

  if (driver === 'postgres' || driver === 'postgresql') {
    const PgStore = require('connect-pg-simple')(session);
    // Requiring the adapter directly (not through core/db) is safe here: this branch only runs
    // when DB_DRIVER=postgres, so require() returns the exact module instance the adapter index
    // already loaded — the store shares the app's pool instead of opening a second one.
    const { pool } = require('./db/postgres');
    return new PgStore({ pool, tableName: 'sessions', createTableIfMissing: true });
  }

  if (driver === 'mongodb' || driver === 'mongo') {
    const { MongoStore } = require('connect-mongo');
    // connect-mongo manages its own client; defaults mirror core/db/mongodb.js.
    return MongoStore.create({
      mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017',
      dbName: process.env.MONGO_DB_NAME || 'forge_mvc',
      collectionName: 'sessions',
      ttl: SESSION_TTL_SECONDS,
    });
  }

  throw new Error(`SESSION_STORE=db has no session store for DB_DRIVER "${driver}".`);
}

function buildStore(kind) {
  switch (kind) {
    case 'memory':
      if (process.env.NODE_ENV === 'production') {
        logger.warn(
          'SESSION_STORE=memory in production: sessions are lost on every restart, leak memory, ' +
            'and are not shared between instances. Pick db/redis/file — see .env.example.'
        );
      }
      return undefined; // express-session defaults to MemoryStore

    case 'db':
      return buildDbStore();

    case 'file': {
      // One JSON file per session — the Laravel/CI SESSION_DRIVER=file equivalent. The store
      // creates the directory itself and its expired-session reaper is unref'd, so it can't
      // keep the process alive. Its default logger prints every cache miss; route it to debug.
      const FileStore = require('session-file-store')(session);
      return new FileStore({
        path: process.env.SESSION_FILE_DIR || './storage/sessions',
        ttl: SESSION_TTL_SECONDS,
        retries: 1,
        logFn: (...args) => logger.debug(args.join(' ')),
      });
    }

    case 'sqlite': {
      // Still just a file on disk, but writes are transactional — no lost-update race between
      // concurrent requests from the same browser, which the plain file store can suffer.
      const SQLiteStore = requireOptionalStore('connect-sqlite3', 'sqlite')(session);
      const file = process.env.SESSION_SQLITE_FILE || './storage/sessions.sqlite';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      return new SQLiteStore({ dir: path.dirname(file), db: path.basename(file), table: 'sessions' });
    }

    case 'redis': {
      const { RedisStore } = require('connect-redis');
      const { createClient } = require('redis');
      // Must be the node-redis client, NOT ioredis: connect-redis v10 is written against the
      // node-redis API (options-object set(), mGet, scanIterator) — an ioredis client stringifies
      // the SET options to "[object Object]" and every session write fails with a syntax error.
      // The error listener is mandatory: an unhandled 'error' event would crash the process every
      // time Redis blips. connect() is fire-and-forget on purpose — commands issued while the
      // socket is still connecting sit in the client's offline queue, and it reconnects on its own.
      const client = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
      client.on('error', (err) => logger.error(`redis session store: ${err.message}`));
      client.connect().catch((err) => logger.error(`redis session store connect: ${err.message}`));
      // No explicit ttl: connect-redis reads the cookie's maxAge, keeping the two in lockstep.
      return new RedisStore({ client, prefix: 'forge:sess:' });
    }

    case 'memcached': {
      const MemcachedStore = requireOptionalStore('connect-memcached', 'memcached')(session);
      return new MemcachedStore({
        hosts: (process.env.MEMCACHED_HOSTS || '127.0.0.1:11211').split(',').map((h) => h.trim()),
      });
    }

    default:
      // resolveSessionStore() already validated; this is a safety net for future edits.
      throw new Error(`No store builder for SESSION_STORE "${kind}".`);
  }
}

// --- cookie store ----------------------------------------------------------------------------
// cookie-session is not an express-session store — it's a different middleware that keeps the
// whole session payload in the signed cookie. That means zero server storage and free horizontal
// scaling, but also: ~4KB total, the payload is readable by the user (signed, not encrypted),
// and there is no server-side revoke — "log out everywhere" is impossible. Its req.session is a
// plain object without express-session's methods, so the rest of the app (login regenerate,
// logout destroy, save-before-redirect) is kept working by the compat shim below.

function attachCookieSessionShims(req) {
  const sess = req.session;
  if (!sess || typeof sess.destroy === 'function') return;
  // Non-enumerable on purpose: cookie-session serialises the session with JSON.stringify, which
  // only reads enumerable own properties — so the shims never leak into the cookie payload.
  Object.defineProperties(sess, {
    // There is no server-side session id to rotate, so "regenerate" reduces to "start from an
    // empty object" — assignment makes cookie-session mint a fresh Session instance. Caveat for
    // future callers: cookie-session only re-issues the cookie when the new session gets
    // populated (the login flow always does); regenerate-then-store-nothing would leave the
    // browser's previous cookie in place, unlike express-session which always rotates the id.
    regenerate: {
      value(cb) {
        req.session = {};
        attachCookieSessionShims(req);
        if (cb) cb(null);
      },
    },
    destroy: {
      value(cb) {
        req.session = null; // cookie-session clears the cookie on response
        if (cb) cb(null);
      },
    },
    // The cookie is written automatically when the response goes out; nothing to flush early.
    save: { value: (cb) => { if (cb) cb(null); } },
    touch: { value: () => {} },
  });
}

function cookieSessionCompat(req, res, next) {
  attachCookieSessionShims(req);
  // express-session's `rolling: true` re-issues the cookie on every request; cookie-session only
  // re-sends when the content changes. Stamping the current minute onto populated sessions makes
  // the idle timeout roll at minute granularity without a Set-Cookie on literally every response.
  // Guarded on isPopulated so anonymous visitors aren't handed a session cookie just for this.
  if (req.session && req.session.isPopulated) {
    req.session._rolled = Math.floor(Date.now() / 60000);
  }
  next();
}

function createCookieSessionMiddleware() {
  const cookieSession = require('cookie-session');
  return [
    cookieSession({
      name: COOKIE_NAME,
      secret: process.env.SESSION_SECRET,
      maxAge: SESSION_TTL_MS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    }),
    cookieSessionCompat,
  ];
}

// ----------------------------------------------------------------------------------------------

function createSessionMiddleware() {
  const kind = resolveSessionStore();

  // The cookie store swaps the middleware itself, not just the storage behind it. Returning an
  // array is fine: router.use() accepts one.
  if (kind === 'cookie') return createCookieSessionMiddleware();

  return session({
    key: COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    store: buildStore(kind),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS, // 60 min idle timeout
    },
  });
}

module.exports = { createSessionMiddleware, resolveSessionStore, SESSION_TTL_MS };
