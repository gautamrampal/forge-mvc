// Runs once before the whole Playwright suite: creates the E2E database, applies migrations,
// and seeds the account the specs log in with. Playwright's webServer starts after this
// resolves, so the app always finds a ready schema.
const path = require('path');

module.exports = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = process.env.E2E_DB_NAME || 'forge_mvc_e2e';

  const { migrateTestDb, resetTestDb } = require('../helpers/db');
  await migrateTestDb();
  await resetTestDb();

  // Seed the fixture account the specs sign in as.
  const { hashPassword } = require('../../core/helpers/hash');
  const User = require('../../app/models/User');
  await User.create({
    name: 'E2E User',
    email: 'e2e@forge.test',
    password_hash: await hashPassword('E2E@12345'),
    role: 'admin',
  });

  const db = require('../../core/db');
  if (db.pool && db.pool.end) await db.pool.end();
};
