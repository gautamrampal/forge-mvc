// THE REST API ROUTE TREE — stateless, JWT-authenticated, JSON only. Mounted at '/api' by
// bootstrap.js (before the web tree — see the comment there for why order matters).
//
// No session and no CSRF here: a Bearer token is not a credential the browser attaches
// automatically, so there's nothing ambient for a cross-site request to ride on.
const express = require('express');
const router = express.Router();

const markApi = require('../../core/middlewares/markApi');
const requireJwt = require('../../core/middlewares/requireJwt');
const validate = require('../../core/middlewares/validate');
const preventSelfAction = require('../middlewares/preventSelfAction');

const { createUserRules, updateUserRules } = require('../validators/userValidators');
const { createProductRules, updateProductRules } = require('../validators/productValidators');

const AuthController = require('../controllers/api/AuthController');
const UserController = require('../controllers/api/UserController');
const ProductApiController = require('../controllers/api/ProductController');

router.use(markApi); // tells respond()/validate()/errorHandler to answer in JSON

// --- Auth (public) --------------------------------------------------------------------------
router.post('/auth/login', AuthController.login);
router.get('/auth/me', requireJwt, AuthController.me);

// --- Users (all protected) ---------------------------------------------------------------
router.get('/users', requireJwt, UserController.index);
router.get('/users/:id', requireJwt, UserController.show);
router.post('/users', requireJwt, createUserRules, validate, UserController.store);
router.put('/users/:id', requireJwt, updateUserRules, validate, UserController.update);
router.delete(
  '/users/:id',
  requireJwt,
  preventSelfAction('You cannot delete your own account.'),
  UserController.destroy
);

// --- Products ------------------------------------------------------------------------------
// Mounted ABOVE the terminal 404 below (AGENTS.md rule 5) — anything declared after it is
// unreachable. Every route carries requireJwt: the API tree has no session to fall back on.
router.get('/products', requireJwt, ProductApiController.list);
router.get('/products/:id', requireJwt, ProductApiController.detail);
router.post('/products', requireJwt, createProductRules, validate, ProductApiController.create);
router.put('/products/:id', requireJwt, updateProductRules, validate, ProductApiController.update);
router.delete('/products/:id', requireJwt, ProductApiController.destroy);

// Terminal 404 for anything under /api that didn't match above.
//
// Without this, an unmatched /api/* request falls out of this router and into the web tree
// (mounted at '/'), whose `router.use(requireAuth, ...)` then redirects it to /login — so an
// API client hitting a typo'd endpoint would get a 302 to an HTML page instead of a JSON error.
router.use((req, res) => {
  res.status(404).json({ success: false, message: `No API route matches ${req.method} /api${req.path}` });
});

module.exports = router;
