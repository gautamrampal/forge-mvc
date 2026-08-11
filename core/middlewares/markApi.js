// Mount this on your API route tree (see app/routes/api.js) so core/Controller.js's respond()
// knows to return JSON even for a plain browser navigation to an /api/* URL.
module.exports = function markApi(req, res, next) {
  req.isApi = true;
  next();
};
