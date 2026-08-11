// PostgreSQL adapter — same contract as core/db/mysql.js (see comment there), just built on
// `pg` with $1,$2 placeholders and RETURNING * instead of a second lookup after write.
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME,
  max: 10,
});

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

// See the note in core/db/mysql.js — LIKE wildcards in user input must be escaped.
function escapeLike(term) {
  return String(term).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Same contract as the MySQL adapter, but with $n placeholders and ILIKE — Postgres's LIKE is
// case-sensitive, and a search box that misses "Jane" when you type "jane" feels broken.
function buildWhere(where = {}, search = null, startAt = 1) {
  const clauses = [];
  const params = [];
  let n = startAt;

  for (const [key, value] of Object.entries(where)) {
    clauses.push(`${key} = $${n++}`);
    params.push(value);
  }

  if (search && search.term && Array.isArray(search.fields) && search.fields.length) {
    const ors = search.fields.map((f) => `${f} ILIKE $${n++}`);
    clauses.push(`(${ors.join(' OR ')})`);
    search.fields.forEach(() => params.push(`%${escapeLike(search.term)}%`));
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function findWhere(table, where = {}, { limit, offset, orderBy = 'id DESC', search = null } = {}) {
  const { sql: whereSql, params } = buildWhere(where, search);
  let sql = `SELECT * FROM "${table}" ${whereSql} ORDER BY ${orderBy}`;
  if (limit != null) {
    sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset || 0));
  }
  return query(sql, params);
}

async function findOne(table, where = {}) {
  const rows = await findWhere(table, where, { limit: 1 });
  return rows[0] || null;
}

async function count(table, where = {}, { search = null } = {}) {
  const { sql: whereSql, params } = buildWhere(where, search);
  const rows = await query(`SELECT COUNT(*) AS c FROM "${table}" ${whereSql}`, params);
  return Number(rows[0].c);
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const rows = await query(
    `INSERT INTO "${table}" (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    keys.map((k) => data[k])
  );
  return rows[0];
}

async function update(table, id, data) {
  const keys = Object.keys(data);
  const rows = await query(
    `UPDATE "${table}" SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => data[k]), id]
  );
  return rows[0] || null;
}

async function remove(table, id) {
  const res = await pool.query(`DELETE FROM "${table}" WHERE id = $1`, [id]);
  return res.rowCount > 0;
}

async function connect() {
  await pool.query('SELECT 1');
  return pool;
}

module.exports = { driver: 'postgres', pool, connect, query, findWhere, findOne, count, insert, update, remove, buildWhere };
