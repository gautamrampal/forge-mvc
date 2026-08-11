const db = require('./db');

// Base class for every app model. Extend it, set a `table` (works as the SQL table name or the
// Mongo collection name — same property either way), and you get a consistent CRUD API no
// matter which DB_DRIVER is active. Add your own static methods for anything beyond simple
// equality lookups (joins, aggregations, full-text search, etc.) using `this.db` directly —
// models are still where all data-access code lives, per the MVC layering rule (see TUTORIAL.md).
class Model {
  static table = null;
  static db = db;

  static get resource() {
    if (!this.table) {
      throw new Error(`${this.name} must set a static \`table\` (SQL table name or Mongo collection name).`);
    }
    return this.table;
  }

  // opts: { limit, offset, orderBy, search }
  // `search` is { fields: ['username', 'email'], term: 'jane' } — a case-insensitive
  // contains-match across those columns, ANDed with `where` so a search narrows the current
  // filter rather than replacing it. Each adapter implements it natively (LIKE / ILIKE /
  // $regex) and escapes the term, so user input can't inject wildcards or regex metacharacters.
  static async find(where = {}, opts = {}) {
    return db.findWhere(this.resource, where, opts);
  }

  static async findOne(where = {}) {
    return db.findOne(this.resource, where);
  }

  static async findById(id) {
    return db.findOne(this.resource, { id });
  }

  static async count(where = {}, opts = {}) {
    return db.count(this.resource, where, opts);
  }

  static async create(data) {
    return db.insert(this.resource, data);
  }

  static async update(id, data) {
    return db.update(this.resource, id, data);
  }

  static async delete(id) {
    return db.remove(this.resource, id);
  }

  // Server-side pagination used by every index/list page and API list endpoint.
  //
  // The count query must apply the SAME where + search as the rows query, or the pager lies:
  // you'd get "1 of 4 pages" while every page after the first comes back empty.
  static async paginate({ where = {}, search = null, page = 1, pageSize = 25, orderBy } = {}) {
    const p = Math.max(1, Number(page));
    const size = Math.max(1, Number(pageSize));
    const [rows, total] = await Promise.all([
      db.findWhere(this.resource, where, { limit: size, offset: (p - 1) * size, orderBy, search }),
      db.count(this.resource, where, { search }),
    ]);
    return { rows, total, page: p, pageSize: size, totalPages: Math.max(1, Math.ceil(total / size)) };
  }

  // Raw SQL escape hatch (SQL adapters only — throws a clear error under Mongo, where you
  // should use `db.collection(name)` from core/db/mongodb.js for aggregation pipelines).
  static async raw(sql, params = []) {
    return db.query(sql, params);
  }
}

module.exports = Model;
