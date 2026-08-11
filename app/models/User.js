const Model = require('../../core/Model');
const { hashPassword } = require('../../core/helpers/hash');

// THE MODEL LAYER — every database access for users lives here. Controllers call these methods
// and never write a query themselves. That separation is what lets the same model serve the web
// controller, the API controller, and the test suite without duplication.
class User extends Model {
  static table = 'users';

  // Which columns the list screen's search box looks at. Declared on the model rather than in
  // the controller so the web and API list endpoints can't drift apart — and so it's obvious
  // where to add a column when the table grows. Never put `password` in here.
  static searchable = ['username'];

  // Turns a raw query string into the { fields, term } shape Model.paginate expects, or null
  // when there's nothing to search for. Trimming matters: a box containing only spaces should
  // behave as an empty search, not match every row containing a space.
  static searchFor(term) {
    const trimmed = String(term || '').trim();
    return trimmed ? { fields: this.searchable, term: trimmed } : null;
  }

  static async findByUsername(username) {
    return this.findOne({ username });
  }

  // Hashing belongs here, not in the controller: it means there is exactly one path a password
  // can take into the database, so no future controller can accidentally store plaintext.
  static async createWithPassword({ username, password, status = 'active' }) {
    return this.create({ username, password: await hashPassword(password), status });
  }

  // Password is optional on update — a blank field in the edit form means "leave it alone",
  // which is what an admin editing someone else's account almost always intends.
  static async updateProfile(id, { username, status, password }) {
    const changes = { username, status };
    if (password) changes.password = await hashPassword(password);
    return this.update(id, changes);
  }

  // Case-insensitive uniqueness check that ignores the row being edited, so saving a user
  // without changing their username doesn't trip "already taken".
  static async usernameTaken(username, exceptId = null) {
    const existing = await this.findByUsername(username);
    if (!existing) return false;
    return exceptId == null || String(existing.id) !== String(exceptId);
  }

  static async countActive() {
    return this.count({ status: 'active' });
  }

  // Never let a serialised user carry its password hash into a session, an API response, or a
  // rendered page. Call this at every boundary that leaves the model layer.
  static publicFields(user) {
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
  }
}

module.exports = User;
