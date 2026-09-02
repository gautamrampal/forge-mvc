require('./env');
const fs = require('fs');
const path = require('path');

const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');

// Creates the test database and applies migrations. Safe to call repeatedly — migrations use
// CREATE TABLE IF NOT EXISTS.
async function migrateTestDb() {
  if (driver === 'mysql') {
    const mysql = require('mysql2/promise');
    const cfg = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || undefined,
      multipleStatements: true,
    };
    const bootstrap = await mysql.createConnection(cfg);
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await bootstrap.end();

    const conn = await mysql.createConnection({ ...cfg, database: process.env.DB_NAME });
    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      await conn.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
    await conn.end();
    return;
  }
  // Mongo needs no migrations; Postgres users should add database/migrations/postgres/.
}

// Wipes all data between tests so each one starts from a known-empty state. FK checks are
// disabled around the truncate so that adding a table which references users later doesn't
// make the order of this list significant.
async function resetTestDb() {
  const db = require('../../core/db');

  if (driver === 'mysql') {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['users', 'products']) {
      await db.query(`TRUNCATE TABLE \`${table}\``);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    return;
  }

  if (driver === 'postgres' || driver === 'postgresql') {
    await db.query('TRUNCATE TABLE users, products RESTART IDENTITY CASCADE');
    return;
  }

  if (driver === 'mongodb') {
    const mongo = await db.connect();
    for (const collection of ['users', 'products']) {
      await mongo.collection(collection).deleteMany({});
    }
  }
}

// Closes pooled connections so the test process can exit instead of hanging on an open socket.
async function closeTestDb() {
  const db = require('../../core/db');
  if (db.pool && typeof db.pool.end === 'function') await db.pool.end();
  if (driver === 'mongodb' && db.close) await db.close();
}

module.exports = { migrateTestDb, resetTestDb, closeTestDb, driver };
