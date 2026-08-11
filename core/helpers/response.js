// Plain JSON helpers for API-only controllers that don't need the dual-mode respond() in
// core/Controller.js — use whichever fits how you write a given endpoint.
function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, message = 'Something went wrong', status = 400, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

module.exports = { ok, fail };
