// Stateless auth guard for the REST API route tree — verifies a Bearer token instead of
// checking a session cookie, so API clients (mobile apps, other services) don't need cookies.
const { verifyToken } = require('../helpers/jwt');

module.exports = function requireJwt(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing Authorization: Bearer <token> header.' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};
