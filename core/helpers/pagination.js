// Parses page/pageSize query-string params with sane bounds. Pair with Model.paginate():
//   const { page, pageSize } = parsePagination(req.query);
//   const result = await Post.paginate({ page, pageSize, orderBy: 'id DESC' });

// Distinguishes "absent or not a number" (fall back to the default) from "a number out of
// range" (clamp it). The obvious `parseInt(x) || default` conflates the two, because 0 is
// falsy — so ?page_size=0 would silently return the default page size while ?page=0 clamped
// to 1, two different behaviours for the same class of bad input.
function toIntOr(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parsePagination(query = {}, { defaultPageSize = 25, maxPageSize = 100 } = {}) {
  const page = Math.max(1, toIntOr(query.page, 1));
  const pageSize = Math.min(maxPageSize, Math.max(1, toIntOr(query.page_size, defaultPageSize)));
  return { page, pageSize };
}

module.exports = { parsePagination };
