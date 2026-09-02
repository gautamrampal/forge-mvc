const Product = require('../../models/Product');
const { respond, fail } = require('../../../core/Controller');
const { getFlashForm } = require('../../../core/helpers/flashForm');
const { parsePagination } = require('../../../core/helpers/pagination');

// HTTP ONLY (AGENTS.md rule 2): read req, call the model, respond. No SQL, no business rules.
// Every action is async, wraps its body in try/catch, and calls next(err) — Express 4 swallows
// a rejected handler promise, so without that the request hangs and core/lifecycle.js shuts the
// process down on the unhandled rejection. See TUTORIAL-ASYNC.md section 15.

// The one place request input becomes model input. Named explicitly rather than passing
// req.body through, so a client cannot set a column we didn't intend (mass assignment).
function pickFields(body) {
  return {
    sku: body.sku,
    name: body.name,
    description: body.description || null,
    price_paise: body.price_paise,
    status: body.status,
  };
}

// GET /products
exports.list = async (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const q = String(req.query.q || '').trim();

    const where = {};
    if (req.query.status === 'active' || req.query.status === 'inactive') {
      where.status = req.query.status;         // allowlisted — never `where.status = req.query.status`
    }

    const result = await Product.paginate({
      where,
      search: Product.searchFor(q),
      page,
      pageSize,
      orderBy: Product.orderByFor(req.query.sort),   // mapped, never interpolated raw
    });

    return respond(req, res, {
      view: 'products/index',
      data: {
        title: 'Products',
        q,
        status: where.status || '',
        sort: req.query.sort || '',
        ...result,
        rows: result.rows.map(Product.publicFields),
      },
    });
  } catch (err) {
    return next(err);
  }
};

// GET /products/create
exports.showCreate = (req, res) => {
  const { formErrors, formData } = getFlashForm(req);
  res.render('products/form', {
    title: 'New Product',
    record: { status: 'active', ...formData },
    formErrors,
    formData,
  });
};

// POST /products
exports.create = async (req, res, next) => {
  try {
    const fields = pickFields(req.body);

    if (await Product.skuTaken(fields.sku)) {
      return fail(req, res, {
        message: `SKU ${fields.sku} is already in use.`,
        status: 409,
        view: 'products/form',
        data: { title: 'New Product', record: req.body, formErrors: { sku: 'Already in use' }, formData: req.body },
      });
    }

    const record = await Product.create(fields);
    req.flash('success', 'Product created.');
    return respond(req, res, {
      status: 201,
      redirect: `/products/${record.id}`,
      json: { record: Product.publicFields(record) },
    });
  } catch (err) {
    return next(err);
  }
};

// GET /products/:id
exports.detail = async (req, res, next) => {
  try {
    const record = await Product.findById(req.params.id);
    if (!record) {
      return fail(req, res, { message: 'Product not found.', status: 404, view: 'errors/404' });
    }
    return respond(req, res, {
      view: 'products/detail',
      data: { title: `Product #${record.id}`, record: Product.publicFields(record) },
    });
  } catch (err) {
    return next(err);
  }
};

// GET /products/:id/edit
exports.showEdit = async (req, res, next) => {
  try {
    const record = await Product.findById(req.params.id);
    if (!record) {
      req.flash('error', 'Product not found.');
      return res.redirect('/products');
    }
    const { formErrors, formData } = getFlashForm(req);
    return res.render('products/form', {
      title: `Edit Product #${record.id}`,
      record: { ...Product.publicFields(record), ...formData },
      formErrors,
      formData,
    });
  } catch (err) {
    return next(err);
  }
};

// PUT /products/:id   (browsers send POST + _method=PUT; see core/Application.js)
exports.update = async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return fail(req, res, { message: 'Product not found.', status: 404, view: 'errors/404' });
    }

    const fields = pickFields(req.body);
    if (await Product.skuTaken(fields.sku, existing.id)) {
      return fail(req, res, {
        message: `SKU ${fields.sku} is already in use.`,
        status: 409,
        view: 'products/form',
        data: {
          title: `Edit Product #${existing.id}`,
          record: { ...existing, ...req.body },
          formErrors: { sku: 'Already in use' },
          formData: req.body,
        },
      });
    }

    const record = await Product.update(existing.id, fields);
    req.flash('success', 'Product updated.');
    return respond(req, res, {
      redirect: `/products/${existing.id}`,
      json: { record: Product.publicFields(record) },
    });
  } catch (err) {
    return next(err);
  }
};

// DELETE /products/:id
exports.destroy = async (req, res, next) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return fail(req, res, { message: 'Product not found.', status: 404, view: 'errors/404' });
    }
    await Product.delete(existing.id);
    req.flash('success', 'Product deleted.');
    return respond(req, res, { redirect: '/products', json: { deleted: true } });
  } catch (err) {
    return next(err);
  }
};
