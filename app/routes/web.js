// THE WEB (MVC) ROUTE TREE — sessions, flash messages, CSRF protection, rendered views.
// Mounted at '/' by bootstrap.js.
//
// Read top to bottom, this file is the complete list of URLs the web app answers, and the
// middleware chain each one passes through. That's deliberate: nothing is auto-discovered.
const express = require('express');
const flash = require('connect-flash');
const router = express.Router();

const { createSessionMiddleware } = require('../../core/session');
const { csrfMiddleware, csrfProtect } = require('../../core/middlewares/csrf');
const sharedLocals = require('../../core/middlewares/sharedLocals');
const requireAuth = require('../../core/middlewares/requireAuth');
const validate = require('../../core/middlewares/validate');

const requireActiveUser = require('../middlewares/requireActiveUser');
const preventSelfAction = require('../middlewares/preventSelfAction');

const { loginRules, createUserRules, updateUserRules } = require('../validators/userValidators');

const AuthController = require('../controllers/web/AuthController');
const UserController = require('../controllers/web/UserController');

// --- Middleware that applies to every web request, in order --------------------------------
router.use(createSessionMiddleware()); // 1. read/create the session from the cookie
router.use(flash());                   // 2. one-request-only messages (needs the session)
router.use(csrfMiddleware);            // 3. mint a token and expose it to views
router.use(csrfProtect);               // 4. reject state-changing requests without that token
router.use(sharedLocals);              // 5. flash + currentUser + appName available in all views

router.get('/', (req, res) => res.redirect(req.session.user ? '/users' : '/login'));

// --- Public (no session required) -----------------------------------------------------------
router.get('/login', AuthController.showLogin);
router.post('/login', loginRules, validate, AuthController.login);
router.post('/logout', AuthController.logout);

// --- Everything below requires a signed-in, still-active account -----------------------------
// requireAuth  -> "are you signed in?" (checks the session)
// requireActiveUser -> "are you STILL allowed in?" (re-checks the database)
// Order matters: requireAuth redirects anonymous visitors before we spend a query on them.
router.use(requireAuth, requireActiveUser);

// --- Users CRUD ------------------------------------------------------------------------------
// Static paths come before parameterised ones: '/users/create' must be matched by its own route
// rather than being swallowed by '/users/:id' with id="create".
router.get('/users', UserController.index);
router.get('/users/create', UserController.create);
router.post('/users', createUserRules, validate, UserController.store);
router.get('/users/:id', UserController.show);
router.get('/users/:id/edit', UserController.edit);
router.put('/users/:id', updateUserRules, validate, UserController.update);
router.delete('/users/:id', preventSelfAction('You cannot delete your own account.'), UserController.destroy);

module.exports = router;
