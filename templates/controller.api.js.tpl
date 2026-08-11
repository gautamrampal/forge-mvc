const __Name__ = require('../../models/__Name__');
const { ok, fail } = require('../../../core/helpers/response');
const { parsePagination } = require('../../../core/helpers/pagination');

exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await __Name__.paginate({ page, pageSize, orderBy: 'id DESC' });
    ok(res, result);
  } catch (err) {
    next(err);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const record = await __Name__.findById(req.params.id);
    if (!record) return fail(res, '__Name__ not found.', 404);
    ok(res, { record });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const record = await __Name__.create(req.body);
    ok(res, { record }, 201);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const record = await __Name__.update(req.params.id, req.body);
    ok(res, { record });
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  try {
    await __Name__.delete(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
};
