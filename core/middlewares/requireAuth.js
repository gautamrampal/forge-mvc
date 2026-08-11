// Session-based auth guard for the MVC (web) route tree. Expects app-level login code to set
// req.session.user = { id, name, email, role, ... } on success (see app/controllers/web/AuthController.js).
module.exports = function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    req.session && (req.session.postLoginRedirect = req.originalUrl);
    return res.redirect('/login');
  }
  res.locals.currentUser = req.session.user;
  next();
};
