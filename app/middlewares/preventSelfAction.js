const { fail } = require('../../core/Controller');

// Blocks destructive actions against your own account — deleting yourself, or deactivating
// yourself and getting locked out on the next request by requireActiveUser.
//
// This is a route guard rather than a check inside the controller because it applies to several
// routes (delete, toggle-status) and it reads better at the route table: you can see at a glance
// which endpoints are self-protected.
module.exports = function preventSelfAction(message = 'You cannot perform this action on your own account.') {
  return (req, res, next) => {
    const actor = (req.session && req.session.user) || req.user;
    if (actor && String(actor.id) === String(req.params.id)) {
      return fail(req, res, { message, status: 403 });
    }
    next();
  };
};
