const Model = require('../../core/Model');

class __Name__ extends Model {
  static table = '__table__';

  // Columns the list screen's search box looks at. Add your text columns here — never a
  // password or other secret. Leave it empty and the search box simply matches nothing.
  static searchable = [];

  // Returns null for an empty/whitespace-only term, so paginate() falls back to an unfiltered
  // list instead of searching for "" and matching every row.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed && this.searchable.length ? { fields: this.searchable, term: trimmed } : null;
  }

  // Add query methods specific to __Name__ here. Simple lookups can use the inherited
  // find/findOne/findById/paginate; anything more (joins, aggregation, full-text search)
  // should use `this.db` (SQL) or `this.db.connect()` + `.collection(this.table)` (Mongo)
  // directly — see core/Model.js and TUTORIAL.md "Writing models".
}

module.exports = __Name__;
