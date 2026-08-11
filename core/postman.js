// Builds a Postman v2.1 collection by introspecting the real Express API router, so the
// collection can't silently drift out of sync with the routes — add a route, regenerate, it's
// there. Express exposes each registered route on `router.stack`, which is what we walk.
const path = require('path');

// Framework-level conventions every list endpoint supports (see core/helpers/pagination.js and
// Model.paginate). Emitted disabled, which is how Postman shows an optional parameter — visible
// and one click away, without being sent by default.
const LIST_QUERY_PARAMS = [
  { key: 'q', value: '', description: 'Free-text search across the model\'s `searchable` columns', disabled: true },
  { key: 'page', value: '1', description: 'Page number (1-based)', disabled: true },
  { key: 'page_size', value: '25', description: 'Rows per page (max 100)', disabled: true },
];

// Express path params are :id; Postman uses :id too but wants a matching variable entry, and
// its URL model splits the path into segments.
function toPostmanUrl(routePath, { isList = false } = {}) {
  const clean = routePath.replace(/\/$/, '') || '/';
  const segments = clean.split('/').filter(Boolean);
  const variables = segments
    .filter((s) => s.startsWith(':'))
    .map((s) => ({ key: s.slice(1), value: '1', description: `${s.slice(1)} of the record` }));

  return {
    raw: `{{baseUrl}}/api${clean}`,
    host: ['{{baseUrl}}'],
    path: ['api', ...segments],
    ...(variables.length ? { variable: variables } : {}),
    ...(isList ? { query: LIST_QUERY_PARAMS } : {}),
  };
}

// Reads the router's stack into a flat [{method, path}] list.
function extractRoutes(router) {
  const routes = [];
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const routePath = layer.route.path;
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all') continue;
      routes.push({ method: method.toUpperCase(), path: routePath });
    }
  }
  return routes;
}

// Groups /auth/login, /auth/me … under "auth"; /posts, /posts/:id … under "posts".
function groupName(routePath) {
  const first = routePath.split('/').filter(Boolean)[0];
  return first && !first.startsWith(':') ? first : 'root';
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ');

function humanName(method, routePath) {
  const segments = routePath.split('/').filter(Boolean);
  const named = segments.filter((s) => !s.startsWith(':'));
  const hasParam = segments.some((s) => s.startsWith(':'));

  // Action-style endpoints (/auth/login, /auth/register, /orders/:id/refund) get named after
  // the action, not the CRUD verb — otherwise every POST under /auth collapses into the same
  // "Create auth" label and the collection is unreadable.
  if (named.length > 1) {
    const action = named[named.length - 1];
    return hasParam ? `${titleCase(action)} ${named[0]}` : titleCase(action);
  }

  const resource = named[0] || 'root';
  switch (method) {
    case 'GET': return hasParam ? `Get ${resource} by id` : `List ${resource}`;
    case 'POST': return `Create ${resource}`;
    case 'PUT':
    case 'PATCH': return `Update ${resource}`;
    case 'DELETE': return `Delete ${resource}`;
    default: return `${method} ${routePath}`;
  }
}

// A best-effort example body so the request is runnable immediately rather than an empty shell.
// Derived from the validator field names when we can find them.
function exampleBody(method, routePath, validatorFields) {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return null;

  if (routePath.includes('/auth/login')) {
    return { email: '{{email}}', password: '{{password}}' };
  }
  if (routePath.includes('/auth/register')) {
    return { name: 'New User', email: '{{email}}', password: '{{password}}' };
  }
  const resource = routePath.split('/').filter(Boolean)[0];
  const fields = validatorFields[resource];
  if (fields && fields.length) {
    return Object.fromEntries(fields.map((f) => [f, `<${f}>`]));
  }
  return {};
}

// Scrapes body('fieldName') out of app/validators/*.js so generated example bodies use the real
// field names. Static text matching, not execution — good enough and avoids side effects.
function readValidatorFields(appDir) {
  const fs = require('fs');
  const dir = path.join(appDir, 'validators');
  const byResource = {};
  if (!fs.existsSync(dir)) return byResource;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const fields = [...source.matchAll(/body\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    // postValidators.js -> "posts"
    const base = file.replace(/Validators?\.js$/i, '').replace(/\.js$/, '').toLowerCase();
    const resource = base.endsWith('s') ? base : `${base}s`;
    if (fields.length) byResource[resource] = [...new Set(fields)];
  }
  return byResource;
}

function buildRequest({ method, path: routePath }, validatorFields) {
  const body = exampleBody(method, routePath, validatorFields);
  const isLogin = routePath.includes('/auth/login') || routePath.includes('/auth/register');

  // A "list" endpoint is a GET with no :param — those are the ones that paginate and search.
  const isList = method === 'GET' && !routePath.includes('/:') && !routePath.includes('/auth/');

  const request = {
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: toPostmanUrl(routePath, { isList }),
    ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
  };

  const item = { name: humanName(method, routePath), request };

  // Login/register auto-capture the token into the collection variable, so every other request
  // is authenticated the moment you run one of them — no copy-pasting JWTs by hand.
  if (isLogin) {
    item.event = [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'const data = pm.response.json();',
            'if (data && data.token) {',
            '  pm.collectionVariables.set("token", data.token);',
            '  console.log("Saved token to the {{token}} collection variable.");',
            '}',
            'pm.test("status is ok", function () {',
            '  pm.expect(pm.response.code).to.be.oneOf([200, 201]);',
            '});',
          ],
        },
      },
    ];
    // These two are the way you *obtain* a token, so they must not require one.
    item.request.auth = { type: 'noauth' };
  }

  return item;
}

function buildCollection({ router, appDir, name, baseUrl, credentials = {} }) {
  const routes = extractRoutes(router);
  const validatorFields = readValidatorFields(appDir);

  const folders = new Map();
  for (const route of routes) {
    const group = groupName(route.path);
    if (!folders.has(group)) folders.set(group, []);
    folders.get(group).push(buildRequest(route, validatorFields));
  }

  // Auth first — you need a token before anything else is useful.
  const ordered = [...folders.entries()].sort(([a], [b]) => (a === 'auth' ? -1 : b === 'auth' ? 1 : a.localeCompare(b)));

  return {
    info: {
      name,
      description:
        `Auto-generated from the Express routes in app/routes/api.js.\n\n` +
        `Getting started:\n` +
        `1. Run "Create auth" (login) — it stores the JWT in the {{token}} collection variable.\n` +
        `2. Every other request inherits Bearer {{token}} automatically.\n\n` +
        `Regenerate after changing routes: node bin/forge.js make:postman`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: baseUrl, type: 'string' },
      { key: 'token', value: '', type: 'string' },
      { key: 'email', value: credentials.email || 'demo@forge.test', type: 'string' },
      { key: 'password', value: credentials.password || 'Demo@12345', type: 'string' },
    ],
    item: ordered.map(([group, items]) => ({ name: group, item: items })),
  };
}

module.exports = { buildCollection, extractRoutes };
