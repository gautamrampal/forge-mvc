const { body } = require('express-validator');

// Shared field rules so create and update can't drift apart — same pattern as userValidators.js.
const sku = () =>
  body('sku')
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage('SKU must be 1-32 characters')
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('SKU may only contain capital letters, numbers and hyphens');

const name = () =>
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required (max 255 characters)');

const description = () =>
  body('description').optional({ checkFalsy: true }).trim().isLength({ max: 5000 })
    .withMessage('Description must be 5000 characters or fewer');

// Money arrives as rupees from the form and is stored as an integer count of paise. Doing the
// conversion here — in one place, with .toInt() — means the controller and the model only ever
// see integers, so no float ever touches the money path.
const pricePaise = () =>
  body('price_paise')
    .isInt({ min: 0, max: 2147483647 })
    .withMessage('Price must be a whole number of paise (0 or more)')
    .toInt();

const status = () =>
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive');

exports.createProductRules = [sku(), name(), description(), pricePaise(), status()];
exports.updateProductRules = [sku(), name(), description(), pricePaise(), status()];
