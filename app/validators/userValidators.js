const { body } = require('express-validator');

// Shared field rules so create and update can't drift apart.
const username = () =>
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username may only contain letters, numbers, dots, underscores and hyphens');

const status = () =>
  body('status').isIn(['active', 'inactive']).withMessage('Status must be active or inactive');

exports.createUserRules = [
  username(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  status(),
];

// On update the password field is optional — blank means "keep the current one" — but if the
// admin does type something, it still has to meet the length rule.
exports.updateUserRules = [
  username(),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  status(),
];

exports.loginRules = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];
