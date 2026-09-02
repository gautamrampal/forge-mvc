// Runs once before the whole Playwright suite: creates the E2E database, applies migrations,
// and seeds the account the specs log in with. Playwright's webServer starts after this
// resolves, so the app always finds a ready schema.
const path = require('path');

module.exports = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

  process.env.NODE_ENV = 'test';

  // Point at the E2E database via TEST_DB_NAME, not DB_NAME. tests/helpers/db.js requires
  // tests/helpers/env.js, which rewrites DB_NAME to TEST_DB_NAME ?? `${DB_NAME}_test` — so
  // setting DB_NAME here would be silently overwritten, and this setup would migrate, truncate
  // and seed the *unit-test* database while Playwright's webServer pointed the app at an E2E
  // database that was never created.
  const e2eDbName = process.env.E2E_DB_NAME || 'forge_mvc_e2e';
  process.env.TEST_DB_NAME = e2eDbName;
  process.env.TEST_MONGO_DB_NAME = e2eDbName;

  const { migrateTestDb, resetTestDb } = require('../helpers/db');
  await migrateTestDb();
  await resetTestDb();

  // Seed the fixture account the specs sign in as. Going through User.createWithPassword (rather
  // than User.create with hand-written columns) means this cannot drift from the schema or from
  // the way production hashes a password — the model is the only path either can change through.
  const User = require('../../app/models/User');
  await User.createWithPassword({
    username: process.env.E2E_USERNAME || 'e2e',
    password: process.env.E2E_PASSWORD || 'E2E@12345',
    status: 'active',
  });

  const db = require('../../core/db');
  if (db.pool && db.pool.end) await db.pool.end();
};
