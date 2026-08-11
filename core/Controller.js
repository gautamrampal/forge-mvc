// Not a base class to extend — controllers in this framework stay plain exported functions,
// same as any Express app (`exports.list = async (req, res, next) => {...}`). This module is
// the thin helper that lets ONE controller action serve both a rendered page and a JSON
// response, so you can genuinely run "full MVC" and "REST API" from the same codebase instead
// of maintaining two parallel implementations.

// True when the caller wants JSON instead of an HTML page: mounted under /api (see
// core/middlewares/markApi.js), an XHR/fetch request, an explicit Accept header, or ?format=json
// for quick testing in a browser address bar.
function wantsJson(req) {
  return !!req.isApi || req.xhr || (req.headers.accept || '').includes('application/json') || req.query.format === 'json';
}

// respond(req, res, { view, data, json, status, redirect })
//   view      EJS view name for the HTML path (e.g. 'posts/index')
//   data      locals passed to the view AND the default JSON payload if `json` isn't given
//   json      override payload for the JSON path only, when it should differ from `data`
//   status    HTTP status (default 200)
//   redirect  HTML-path-only redirect target after a write (POST/PUT/DELETE); JSON path ignores
//             it and just returns the payload, since API clients follow their own navigation
function respond(req, res, { view, data = {}, json, status = 200, redirect } = {}) {
  if (wantsJson(req)) {
    return res.status(status).json({ success: status < 400, ...(json || data) });
  }
  if (redirect) return res.redirect(redirect);
  return res.status(status).render(view, data);
}

// fail(req, res, { message, status, view, data }) — the error-path counterpart to respond().
function fail(req, res, { message = 'Something went wrong', status = 400, view, data = {} } = {}) {
  if (wantsJson(req)) {
    return res.status(status).json({ success: false, message });
  }
  req.flash && req.flash('error', message);
  if (view) return res.status(status).render(view, data);
  // See core/middlewares/validate.js for why this is spelled out instead of res.redirect('back').
  return res.redirect(req.get('Referer') || req.originalUrl || '/');
}

module.exports = { wantsJson, respond, fail };
