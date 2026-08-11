// Flash messages + a few view globals, available in every EJS/TSX template on the web route
// tree without each controller having to pass them explicitly.
module.exports = function sharedLocals(req, res, next) {
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info'),
  };

  // Always defined, even on public pages. requireAuth also sets this, but pages *outside* the
  // auth chain (a login screen, a public landing page) still render the shared layout — and an
  // EJS `<% if (currentUser) %>` throws ReferenceError on an undefined variable rather than
  // treating it as falsy. Defaulting to null here means one layout works for both.
  res.locals.currentUser = (req.session && req.session.user) || null;

  res.locals.currentPath = req.path;
  res.locals.appName = process.env.APP_NAME || 'Forge MVC';
  next();
};
