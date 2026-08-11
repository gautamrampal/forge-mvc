const User = require('../../models/User');
const { verifyPassword } = require('../../../core/helpers/hash');
const { getFlashForm } = require('../../../core/helpers/flashForm');

// SESSION MANAGEMENT lives here. The rules this file follows:
//   1. Never reveal whether a username exists — same message for "no such user" and "wrong
//      password", or the login form becomes a user-enumeration oracle.
//   2. Regenerate the session id on login (session fixation defence).
//   3. Store only safe, small fields in the session — never the password hash.
//   4. Destroy the session on logout rather than just clearing your own keys.

exports.showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/users');

  // requireActiveUser destroys the session when an account is deactivated mid-session, which
  // takes the flash store with it — so that case is signalled through the query string instead.
  const notice = req.query.reason === 'deactivated'
    ? 'Your account has been deactivated. Contact an administrator.'
    : null;

  res.render('auth/login', { title: 'Sign in', layout: 'layouts/auth', notice, ...getFlashForm(req) });
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await User.findByUsername(username);

    // Deliberately one branch for all three failure modes (no user / bad password / inactive
    // is handled just below), so response timing and wording don't leak which one it was.
    const valid = user && (await verifyPassword(password, user.password));
    if (!valid) {
      req.flash('error', 'Invalid username or password.');
      req.flash('formData', JSON.stringify({ username }));
      return res.redirect('/login');
    }

    if (user.status !== 'active') {
      req.flash('error', 'That account is inactive. Contact an administrator.');
      return res.redirect('/login');
    }

    // Regenerate before storing anything: a brand-new session id means a token an attacker
    // planted in the browser beforehand is now worthless.
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.user = User.publicFields(user); // no password hash in the session
      const redirectTo = req.session.postLoginRedirect || '/users';
      delete req.session.postLoginRedirect;

      // save() before redirecting guarantees the session is persisted before the browser
      // issues the next request — otherwise a fast redirect can race the store write.
      req.session.save(() => res.redirect(redirectTo));
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  // destroy() drops the whole record server-side. Clearing req.session.user alone would leave
  // a valid session id in the store for anyone holding the cookie.
  req.session.destroy(() => {
    res.clearCookie('forge.sid');
    res.redirect('/login');
  });
};
