// MySQL adapter — implements the common driver contract every adapter must expose:
//   query(sql, params) -> rows[]
//   findWhere(table, where, {limit, offset, orderBy}) -> rows[]
//   findOne(table, where) -> row | null
//   count(table, where) -> number
//   insert(table, data) -> the inserted row
//   update(table, id, data) -> the updated row
//   remove(table, id) -> boolean
// core/Model.js calls these by name without caring which database is behind them.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  timezone: '+00:00',
});

// Many local MySQL installs (XAMPP/WAMP among them) run with time_zone=SYSTEM — i.e. the host's
// local zone, not UTC — so NOW()/CURRENT_TIMESTAMP silently write local time. If your app then
// treats stored timestamps as UTC when rendering them in a user's timezone, every timestamp is
// off by your UTC offset. Forcing UTC per-connection here is cheap insurance against that.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// `%` and `_` are wildcards in a LIKE pattern, so a user typing "100%" would otherwise match
// everything after "100". Escape them (and the escape char itself) before interpolating.
function escapeLike(term) {
  return String(term).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Builds the WHERE clause from an equality map plus an optional free-text search:
//   where  = { status: 'active' }                      -> status = ?
//   search = { fields: ['username'], term: 'jane' }    -> AND (username LIKE ?)
// The two combine with AND, so a search narrows within the current filter rather than
// replacing it — which is what users expect from a filter + search bar pair.
function buildWhere(where = {}, search = null) {
  const clauses = [];
  const params = [];

  for (const [key, value] of Object.entries(where)) {
    clauses.push(`\`${key}\` = ?`);
    params.push(value);
  }

  if (search && search.term && Array.isArray(search.fields) && search.fields.length) {
    const ors = search.fields.map((f) => `\`${f}\` LIKE ? ESCAPE '\\\\'`);
    clauses.push(`(${ors.join(' OR ')})`);
    search.fields.forEach(() => params.push(`%${escapeLike(search.term)}%`));
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function findWhere(table, where = {}, { limit, offset, orderBy = 'id DESC', search = null } = {}) {
  const { sql: whereSql, params } = buildWhere(where, search);
  let sql = `SELECT * FROM \`${table}\` ${whereSql} ORDER BY ${orderBy}`;
  if (limit != null) {
    sql += ' LIMIT ? OFFSET ?';
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
  const rows = await query(`SELECT COUNT(*) AS c FROM \`${table}\` ${whereSql}`, params);
  return Number(rows[0].c);
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const [result] = await pool.query(
    `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k])
  );
  return findOne(table, { id: result.insertId });
}

async function update(table, id, data) {
  const keys = Object.keys(data);
  await pool.query(
    `UPDATE \`${table}\` SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => data[k]), id]
  );
  return findOne(table, { id });
}

async function remove(table, id) {
  const [result] = await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
  return result.affectedRows > 0;
}

async function connect() {
  await pool.query('SELECT 1');
  return pool;
}

module.exports = { driver: 'mysql', pool, connect, query, findWhere, findOne, count, insert, update, remove, buildWhere };
