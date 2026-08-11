const User = require('../../models/User');
const { verifyPassword } = require('../../../core/helpers/hash');
const { signToken } = require('../../../core/helpers/jwt');
const { ok, fail } = require('../../../core/helpers/response');

// The API counterpart to the web AuthController. Same model, same password check — the only
// difference is that a JWT replaces the session, so nothing is stored server-side.

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return fail(res, 'username and password are required.', 422);

    const user = await User.findByUsername(username);
    const valid = user && (await verifyPassword(password, user.password));
    if (!valid) return fail(res, 'Invalid username or password.', 401);
    if (user.status !== 'active') return fail(res, 'That account is inactive.', 403);

    // Keep the payload minimal: a JWT is base64, not encrypted. Anyone holding the token can
    // read every claim in it, so it carries an id and a username — never the password hash.
    const token = signToken({ id: user.id, username: user.username });
    ok(res, { token, user: User.publicFields(user) });
  } catch (err) {
    next(err);
  }
};

// Demonstrates reading the identity that requireJwt attached to req.user. Re-reads from the
// database rather than trusting the token body, so a deactivated account can't keep using a
// token that was valid when it was issued.
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return fail(res, 'User not found.', 404);
    if (user.status !== 'active') return fail(res, 'That account is inactive.', 403);
    ok(res, { user: User.publicFields(user) });
  } catch (err) {
    next(err);
  }
};
