// express-validator result handler, dual-mode: JSON error list for the API tree, flash +
// redirect-back for the web tree.
//
// IMPORTANT — a lesson learned the hard way: never use Express's res.redirect('back'). It reads
// the Referer header, and helmet's default Referrer-Policy is 'no-referrer', which strips that
// header from same-origin form posts too. With it missing, Express silently falls back to '/',
// so a failed form submission dumps the user on their dashboard with no visible error instead of
// back on the form — looks exactly like "my data didn't save" with no clue why. See
// core/Application.js, which sets referrerPolicy: 'same-origin' specifically to keep this
// working, and the explicit fallback chain below as a second line of defense.
const { validationResult } = require('express-validator');
const { wantsJson } = require('../Controller');

module.exports = function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const grouped = {};
  errors.array().forEach((e) => {
    if (!grouped[e.path]) grouped[e.path] = e.msg;
  });

  if (wantsJson(req)) {
    return res.status(422).json({ success: false, message: 'Validation failed.', errors: grouped });
  }

  req.flash('formErrors', JSON.stringify(grouped));
  req.flash('formData', JSON.stringify(req.body));
  req.flash('error', 'Please fix the highlighted errors and try again.');
  return res.redirect(req.get('Referer') || req.originalUrl || '/');
};
