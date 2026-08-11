const crypto = require('node:crypto');
const { runWithContext } = require('../context');

// Header names, in the order we'll trust them. `x-request-id` is the de-facto standard and what
// most load balancers and service meshes already inject.
const INBOUND_HEADERS = ['x-request-id', 'x-correlation-id'];

// A caller-supplied id is echoed rather than replaced — that's the whole point of a correlation
// id — but it's bounded and sanitised first, because it ends up in log files and response
// headers. An unvalidated header could otherwise inject newlines into your logs (log forging)
// or smuggle a header into the response.
function sanitiseId(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/[^\w.\-]/g, '');
  return clean.length > 0 && clean.length <= 128 ? clean : null;
}

// Mount this FIRST, before anything that logs — every line emitted downstream picks the id up
// automatically via AsyncLocalStorage (see core/context.js and core/helpers/logger.js).
module.exports = function requestId(req, res, next) {
  let id = null;
  for (const header of INBOUND_HEADERS) {
    id = sanitiseId(req.headers[header]);
    if (id) break;
  }
  if (!id) id = crypto.randomUUID();

  req.id = id;
  // Echo it back so the caller can correlate from their side too, and so a browser devtools
  // network tab shows the id to paste into a log search.
  res.setHeader('X-Request-Id', id);

  // Everything from here on — including anything it awaits — sees this context.
  runWithContext({ requestId: id, startedAt: Date.now() }, () => next());
};
