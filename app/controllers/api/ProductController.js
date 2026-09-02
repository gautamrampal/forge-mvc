const Product = require('../../models/Product');
const { ok, fail } = require('../../../core/helpers/response');
const { parsePagination } = require('../../../core/helpers/pagination');

// The API twin of controllers/web/ProductController.js. Note how thin both are: every real
// rule (uniqueness, the sort allowlist, the response shape) lives on the model, so the two
// controllers stay in agreement without sharing code they'd have to keep in sync by hand.
//
// This one uses ok()/fail() from core/helpers/response.js — plain JSON, no view path. The web
// twin uses respond()/fail() from core/Controller.js, which serves HTML or JSON depending on
// the caller. Section 11 of TUTORIAL-CRUD.md covers when to collapse the two into one action.

function pickFields(body) {
  return {
    sku: body.sku,
    name: body.name,
    description: body.description || null,
    price_paise: body.price_paise,
    status: body.status,
  };
}

// GET /api/products?q=widget&status=active&sort=price&page=1&page_size=25
exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);

    const where = {};
    if (req.query.status === 'active' || req.query.status === 'inactive') {
      where.status = req.query.status;
    }

    const result = await Product.paginate({
      where,
      search: Product.searchFor(req.query.q),
      page,
      pageSize,
      orderBy: Product.orderByFor(req.query.sort),
    });

    result.rows = result.rows.map(Product.publicFields);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

// GET /api/products/:id
exports.detail = async (req, res, next) => {
  try {
    const record = await Product.findById(req.params.id);
    if (!record) return fail(res, 'Product not found.', 404);
    return ok(res, { record: Product.publicFields(record) });
  } catch (err) {
    return next(err);
  }
};

// POST /api/products
exports.create = async (req, res, next) => {
  try {
    const fields = pickFields(req.body);
    if (await Product.skuTaken(fields.sku)) {
      return fail(res, `SKU ${fields.sku} is already in use.`, 409);
    }
    const record = await Product.create(fields);
    return ok(res, { record: Product.publicFields(record) }, 201);
  } catch (err) {
    return next(err);
  }
};

// PUT /api/products/:id
exports.update = async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) return fail(res, 'Product not found.', 404);

    const fields = pickFields(req.body);
    if (await Product.skuTaken(fields.sku, existing.id)) {
      return fail(res, `SKU ${fields.sku} is already in use.`, 409);
    }

    const record = await Product.update(existing.id, fields);
    return ok(res, { record: Product.publicFields(record) });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/products/:id
exports.destroy = async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) return fail(res, 'Product not found.', 404);
    await Product.delete(existing.id);
    return ok(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
};
