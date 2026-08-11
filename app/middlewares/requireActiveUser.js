const User = require('../models/User');

// Re-checks on every request that the signed-in account still exists and is still active.
//
// Why this is needed: a session is a snapshot taken at login. If an admin deactivates or
// deletes someone who is already signed in, that person keeps browsing with a perfectly valid
// session cookie until it expires — core/middlewares/requireAuth.js only proves "you logged in
// at some point", not "you are still allowed in". This closes that window.
//
// The cost is one extra query per request. That's the right trade for an admin panel; on a
// high-traffic public app you'd cache the lookup or push a revocation flag into the session
// store instead.
module.exports = async function requireActiveUser(req, res, next) {
  try {
    const sessionUser = req.session.user;
    if (!sessionUser) return next(); // requireAuth handles the anonymous case

    const current = await User.findById(sessionUser.id);

    if (!current || current.status !== 'active') {
      return req.session.destroy(() => {
        // No flash here: the session (and therefore the flash store) is gone. Signal through
        // the query string so the login page can explain what happened.
        res.redirect('/login?reason=deactivated');
      });
    }

    // Refresh the session copy so a username change shows up immediately in the navbar.
    req.session.user = User.publicFields(current);
    res.locals.currentUser = req.session.user;
    next();
  } catch (err) {
    next(err);
  }
};
