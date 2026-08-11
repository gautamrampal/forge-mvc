// Builds the session middleware for the web route tree. Ships a persistent MySQL-backed store
// out of the box (matching the default DB_DRIVER); for postgres/mongodb, add the matching
// connect-pg-simple / connect-mongo package and swap the store below — the in-memory fallback
// works for local development but leaks memory and loses every session on restart, so it warns
// loudly rather than failing silently in production.
const session = require('express-session');
const logger = require('./helpers/logger');

function buildStore() {
  const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();

  // Tests run the app in-process and need it to be garbage-collectable. The MySQL store opens
  // its own pool and schedules a recurring expired-session sweep, both of which keep the event
  // loop alive and hang the test runner after the last assertion passes. MemoryStore is the
  // right choice here anyway: each test file wants a clean, isolated session space.
  if (process.env.NODE_ENV === 'test') return undefined;

  if (driver === 'mysql') {
    const MySQLStore = require('express-mysql-session')(session);
    return new MySQLStore({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      createDatabaseTable: true,
      schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
    });
  }

  logger.warn(
    `No persistent session store wired up for DB_DRIVER=${driver}. Falling back to MemoryStore ` +
      '(fine for local dev; add connect-pg-simple or connect-mongo for production — see TUTORIAL.md "Sessions").'
  );
  return undefined; // express-session defaults to MemoryStore
}

function createSessionMiddleware() {
  return session({
    key: 'forge.sid',
    secret: process.env.SESSION_SECRET,
    store: buildStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 60 min idle timeout
    },
  });
}

module.exports = { createSessionMiddleware };
