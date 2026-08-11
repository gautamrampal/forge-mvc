const multer = require('multer');
const logger = require('../helpers/logger');
const { wantsJson } = require('../Controller');

module.exports = function errorHandler(err, req, res, next) {
  logger.error(err.stack || err.message);

  if (err instanceof multer.MulterError || err.code === 'UPLOAD_REJECTED') {
    if (wantsJson(req)) return res.status(400).json({ success: false, message: err.message });
    req.flash('error', err.message || 'File upload failed.');
    return res.redirect('back');
  }

  const status = err.status || 500;
  // Same reasoning as core/middlewares/notFound.js: APP_MODE=api has no view engine, so never
  // try to render an error page there.
  if (wantsJson(req) || req.app.get('mode') === 'api') {
    return res.status(status).json({ success: false, message: status === 500 && process.env.NODE_ENV === 'production' ? 'Server error' : err.message });
  }
  res.status(status).render('errors/500', {
    title: 'Something went wrong',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    layout: false,
  });
};
