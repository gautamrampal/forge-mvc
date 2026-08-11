const User = require('../../models/User');
const { ok, fail } = require('../../../core/helpers/response');
const { parsePagination } = require('../../../core/helpers/pagination');

// The API twin of controllers/web/UserController.js. Note how thin both are: all the real work
// (hashing, uniqueness, queries) is in the model, so the two controllers stay in agreement
// without sharing code they'd have to keep in sync by hand.

// GET /api/users?q=jane&status=active&page=1&page_size=25
exports.index = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const where = {};
    if (req.query.status) where.status = req.query.status;

    // Same searchable fields as the web list, because both ask the model rather than
    // hard-coding a column list of their own.
    const search = User.searchFor(req.query.q);

    const result = await User.paginate({ where, search, page, pageSize, orderBy: 'id DESC' });
    result.rows = result.rows.map(User.publicFields);
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

exports.show = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 'User not found.', 404);
    ok(res, { record: User.publicFields(user) });
  } catch (err) {
    next(err);
  }
};

exports.store = async (req, res, next) => {
  try {
    const { username, password, status } = req.body;
    if (await User.usernameTaken(username)) return fail(res, 'That username is already taken.', 409);

    const user = await User.createWithPassword({ username, password, status: status || 'active' });
    ok(res, { record: User.publicFields(user) }, 201);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 'User not found.', 404);

    const { username, password, status } = req.body;
    if (await User.usernameTaken(username, user.id)) return fail(res, 'That username is already taken.', 409);

    if (status === 'inactive' && user.status === 'active' && (await User.countActive()) <= 1) {
      return fail(res, 'You cannot deactivate the last active account.', 409);
    }

    const updated = await User.updateProfile(user.id, { username, status, password });
    ok(res, { record: User.publicFields(updated) });
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 'User not found.', 404);

    // Self-deletion is blocked by preventSelfAction on the route; this guards the other way
    // an admin could lock everyone out.
    if (user.status === 'active' && (await User.countActive()) <= 1) {
      return fail(res, 'You cannot delete the last active account.', 409);
    }

    await User.delete(user.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
};
