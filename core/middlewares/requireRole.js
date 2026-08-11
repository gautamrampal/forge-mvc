// Works for both auth strategies: req.session.user (web) or req.user (JWT/api) — whichever
// requireAuth/requireJwt populated earlier in the chain.
module.exports = function requireRole(...roles) {
  return (req, res, next) => {
    const actor = (req.session && req.session.user) || req.user;
    if (!actor || !roles.includes(actor.role)) {
      if (req.isApi) return res.status(403).json({ success: false, message: 'Forbidden' });
      return res.status(403).render('errors/403', { title: 'Forbidden', layout: false });
    }
    next();
  };
};
