const __Name__ = require('../../models/__Name__');
const { respond, fail } = require('../../../core/Controller');
const { getFlashForm } = require('../../../core/helpers/flashForm');
const { parsePagination } = require('../../../core/helpers/pagination');

exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    // Declare the searchable columns on the model:  static searchable = ['name', 'email'];
    // searchFor() returns null for an empty term, so paginate falls back to an unfiltered list.
    const q = String(req.query.q || '').trim();
    const search = __Name__.searchFor ? __Name__.searchFor(q) : null;

    const result = await __Name__.paginate({ search, page, pageSize, orderBy: 'id DESC' });
    respond(req, res, { view: '__kebab__/index', data: { title: '__Name__s', q, ...result } });
  } catch (err) {
    next(err);
  }
};

exports.showCreate = (req, res) => {
  const { formErrors, formData } = getFlashForm(req);
  res.render('__kebab__/form', { title: 'New __Name__', record: formData, formErrors, formData });
};

exports.create = async (req, res, next) => {
  try {
    const record = await __Name__.create(req.body);
    req.flash('success', '__Name__ created.');
    respond(req, res, { redirect: '/__kebab__', json: { record }, status: 201 });
  } catch (err) {
    next(err);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const record = await __Name__.findById(req.params.id);
    if (!record) return fail(req, res, { message: '__Name__ not found.', status: 404, view: 'errors/404' });
    respond(req, res, { view: '__kebab__/detail', data: { title: '__Name__ #' + record.id, record } });
  } catch (err) {
    next(err);
  }
};

exports.showEdit = async (req, res, next) => {
  try {
    const record = await __Name__.findById(req.params.id);
    if (!record) {
      req.flash('error', '__Name__ not found.');
      return res.redirect('/__kebab__');
    }
    const { formErrors, formData } = getFlashForm(req);
    res.render('__kebab__/form', { title: 'Edit __Name__', record: { ...record, ...formData }, formErrors, formData });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const record = await __Name__.update(req.params.id, req.body);
    req.flash('success', '__Name__ updated.');
    respond(req, res, { redirect: '/__kebab__/' + req.params.id, json: { record } });
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  try {
    await __Name__.delete(req.params.id);
    req.flash('success', '__Name__ deleted.');
    respond(req, res, { redirect: '/__kebab__' });
  } catch (err) {
    next(err);
  }
};
