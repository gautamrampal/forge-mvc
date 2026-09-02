const Model = require('../../core/Model');

// THE MODEL LAYER — every database access for products lives here (AGENTS.md rule 1).
// Controllers call these methods and never write a query themselves, which is what keeps
// DB_DRIVER swappable and gives the web and API controllers one shared source of truth.
class Product extends Model {
  static table = 'products';

  // Columns the list screen's search box looks at. Declared on the model rather than in each
  // controller so the web and API lists can't drift apart. Never put a secret column here.
  static searchable = ['sku', 'name'];

  // Returns null for an empty/whitespace-only term so paginate() falls back to an unfiltered
  // list instead of searching for "" and matching every row.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed && this.searchable.length ? { fields: this.searchable, term: trimmed } : null;
  }

  static async findBySku(sku) {
    return this.findOne({ sku });
  }

  // Case-insensitive uniqueness check that ignores the row being edited, so saving a product
  // without changing its SKU doesn't trip "already taken". Same shape as User.usernameTaken.
  static async skuTaken(sku, exceptId = null) {
    const existing = await this.findBySku(sku);
    if (!existing) return false;
    return exceptId == null || String(existing.id) !== String(exceptId);
  }

  static async countActive() {
    return this.count({ status: 'active' });
  }

  // The ONE place a user-supplied sort column is translated into a real one. `orderBy` is an
  // identifier, so it is interpolated into the SQL rather than parameterised — an unmapped
  // value here would be SQL injection. See TUTORIAL-SECURITY.md section 4.
  static SORTABLE = {
    newest: 'created_at DESC',
    oldest: 'created_at ASC',
    name: 'name ASC',
    price: 'price_paise DESC',
  };

  static orderByFor(sort) {
    return this.SORTABLE[sort] ?? 'id DESC';
  }

  // The shape that leaves the model layer. Products have no secrets today, but having one
  // function per model means there is a single place to add the redaction when they do —
  // and it keeps `SELECT *` columns from silently becoming part of your API contract.
  static publicFields(product) {
    if (!product) return null;
    const { id, sku, name, description, price_paise, status, created_at, updated_at } = product;
    return {
      id,
      sku,
      name,
      description,
      price_paise,
      price: (price_paise / 100).toFixed(2), // display only — never compute from this
      status,
      created_at,
      updated_at,
    };
  }
}

module.exports = Product;
