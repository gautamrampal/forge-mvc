// Runs every .sql file in database/migrations/ once, tracked in a schema_migrations table.
// Only meaningful for the SQL adapters (mysql/postgres) — MongoDB collections are created
// implicitly on first insert, so `npm run migrate` is a no-op there.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();

async function runMysql() {
  const mysql = require('mysql2/promise');
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  const bootstrap = await mysql.createConnection({
    host: DB_HOST, port: Number(DB_PORT) || 3306, user: DB_USER, password: DB_PASSWORD || undefined, multipleStatements: true,
  });
  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await bootstrap.end();

  const conn = await mysql.createConnection({
    host: DB_HOST, port: Number(DB_PORT) || 3306, user: DB_USER, password: DB_PASSWORD || undefined, database: DB_NAME, multipleStatements: true,
  });
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const [rows] = await conn.query('SELECT id FROM schema_migrations WHERE filename = ?', [file]);
    if (rows.length) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    console.log(`applying: ${file}`);
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
  }
  await conn.end();
}

async function runPostgres() {
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD || undefined, database: process.env.DB_NAME,
  });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  const dir = path.join(__dirname, 'migrations', 'postgres');
  if (!fs.existsSync(dir)) {
    console.log('No database/migrations/postgres/ directory found — see TUTORIAL.md "Switching database" for the Postgres DDL equivalents.');
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await client.query('SELECT id FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    console.log(`applying: ${file}`);
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }
  await client.end();
}

async function run() {
  if (driver === 'mysql') return runMysql();
  if (driver === 'postgres' || driver === 'postgresql') return runPostgres();
  console.log(`DB_DRIVER=${driver} — nothing to migrate (MongoDB collections are created on first write).`);
}

run()
  .then(() => console.log('migrations complete.'))
  .catch((err) => {
    console.error('migration failed:', err);
    process.exit(1);
  });
