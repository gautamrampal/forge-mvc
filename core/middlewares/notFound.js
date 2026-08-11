const { wantsJson } = require('../Controller');

module.exports = function notFound(req, res) {
  // In APP_MODE=api there is no view engine configured at all, so rendering an EJS error page
  // would itself throw (turning a clean 404 into a confusing 500). Always answer in JSON there.
  if (wantsJson(req) || req.app.get('mode') === 'api') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  res.status(404).render('errors/404', { title: 'Not Found', layout: false });
};
