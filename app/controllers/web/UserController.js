const User = require('../../models/User');
const { respond, fail } = require('../../../core/Controller');
const { getFlashForm } = require('../../../core/helpers/flashForm');
const { parsePagination } = require('../../../core/helpers/pagination');

// THE CONTROLLER LAYER — parse the request, delegate to the model, choose a response.
// No SQL here, and no HTML either: the query lives in app/models/User.js and the markup lives
// in app/views/. A controller you can read top-to-bottom in ten seconds is the goal.

// READ (list) ------------------------------------------------------------------------------
exports.index = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    // Only pass a filter the user actually chose — an empty string would match nothing.
    const where = {};
    if (req.query.status) where.status = req.query.status;

    // Free-text search across User.searchable, ANDed with the status filter above so the two
    // controls compose ("inactive users whose name contains 'jane'") instead of fighting.
    const q = String(req.query.q || '').trim();
    const search = User.searchFor(q);

    const result = await User.paginate({ where, search, page, pageSize, orderBy: 'id DESC' });
    result.rows = result.rows.map(User.publicFields); // strip password hashes before rendering

    respond(req, res, {
      view: 'users/index',
      // The view echoes these back into the search box, the filter dropdown and every
      // pagination link — otherwise clicking "page 2" silently drops the user's query.
      data: { title: 'Users', filterStatus: req.query.status || '', q, ...result },
    });
  } catch (err) {
    next(err);
  }
};

// READ (one) -------------------------------------------------------------------------------
exports.show = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(req, res, { message: 'User not found.', status: 404 });

    respond(req, res, {
      view: 'users/show',
      data: { title: user.username, record: User.publicFields(user) },
    });
  } catch (err) {
    next(err);
  }
};

// CREATE (form) ----------------------------------------------------------------------------
exports.create = (req, res) => {
  // getFlashForm returns whatever a failed submission flashed, so the form comes back filled in
  // with the user's input and the offending fields marked — see core/middlewares/validate.js.
  const { formErrors, formData } = getFlashForm(req);
  res.render('users/form', { title: 'New user', record: formData, formErrors });
};

// CREATE (save) ----------------------------------------------------------------------------
exports.store = async (req, res, next) => {
  try {
    const { username, password, status } = req.body;

    // A UNIQUE index protects the database, but catching it here produces a friendly field
    // error instead of a 500 from a driver-level constraint violation.
    if (await User.usernameTaken(username)) {
      req.flash('formErrors', JSON.stringify({ username: 'That username is already taken' }));
      req.flash('formData', JSON.stringify({ username, status }));
      req.flash('error', 'Please fix the highlighted errors and try again.');
      return res.redirect('/users/create');
    }

    const user = await User.createWithPassword({ username, password, status });
    req.flash('success', `User "${username}" created.`);
    respond(req, res, { redirect: '/users', json: { record: User.publicFields(user) }, status: 201 });
  } catch (err) {
    next(err);
  }
};

// UPDATE (form) ----------------------------------------------------------------------------
exports.edit = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/users');
    }
    const { formErrors, formData } = getFlashForm(req);
    res.render('users/form', {
      title: `Edit ${user.username}`,
      // Flashed input wins over stored values, so a failed edit keeps what was typed.
      record: { ...User.publicFields(user), ...formData },
      formErrors,
    });
  } catch (err) {
    next(err);
  }
};

// UPDATE (save) ----------------------------------------------------------------------------
exports.update = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(req, res, { message: 'User not found.', status: 404 });

    const { username, password, status } = req.body;

    if (await User.usernameTaken(username, user.id)) {
      req.flash('formErrors', JSON.stringify({ username: 'That username is already taken' }));
      req.flash('formData', JSON.stringify({ username, status }));
      req.flash('error', 'Please fix the highlighted errors and try again.');
      return res.redirect(`/users/${user.id}/edit`);
    }

    // Deactivating the last active account would lock everyone out of the app permanently.
    if (status === 'inactive' && user.status === 'active' && (await User.countActive()) <= 1) {
      req.flash('error', 'You cannot deactivate the last active account.');
      return res.redirect(`/users/${user.id}/edit`);
    }

    const updated = await User.updateProfile(user.id, { username, status, password });
    req.flash('success', `User "${username}" updated.`);
    respond(req, res, { redirect: `/users/${user.id}`, json: { record: User.publicFields(updated) } });
  } catch (err) {
    next(err);
  }
};

// DELETE -----------------------------------------------------------------------------------
// The "can't delete yourself" rule is enforced by app/middlewares/preventSelfAction.js on the
// route, so it isn't repeated here.
exports.destroy = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(req, res, { message: 'User not found.', status: 404 });

    if (user.status === 'active' && (await User.countActive()) <= 1) {
      req.flash('error', 'You cannot delete the last active account.');
      return res.redirect('/users');
    }

    await User.delete(user.id);
    req.flash('success', `User "${user.username}" deleted.`);
    respond(req, res, { redirect: '/users', json: { deleted: true } });
  } catch (err) {
    next(err);
  }
};
