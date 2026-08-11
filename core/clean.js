// Strips the bundled Users example back to a bare skeleton so the repo can be the starting
// point for a new project. Destructive by design, so bin/forge.js requires --yes.
//
// What it NEVER touches: core/, templates/, bin/, the test helpers, package.json, or your
// .env. You keep the whole framework and all the plumbing — only the demo feature goes.
const fs = require('fs');
const path = require('path');

// Example files, listed explicitly rather than by glob so nothing unexpected is deleted.
const EXAMPLE_FILES = [
  'app/models/User.js',
  'app/controllers/web/UserController.js',
  'app/controllers/web/AuthController.js',
  'app/controllers/api/UserController.js',
  'app/controllers/api/AuthController.js',
  'app/validators/userValidators.js',
  'app/middlewares/requireActiveUser.js',
  'app/middlewares/preventSelfAction.js',
  'database/migrations/001_create_users_table.sql',
  'tests/unit/model.test.js',
  'tests/integration/web.test.js',
  'tests/integration/api.test.js',
  'tests/integration/viewEngines.test.js',
  'tests/integration/postman.test.js',
  'tests/e2e/users.spec.js',
  'postman_collection.json',
];

const EXAMPLE_DIRS = [
  'app/views/users',
  'app/views/auth',
  'app/views-tsx/users',
  'app/views-tsx/auth',
];

// Written back as minimal, still-runnable stubs.
const STUBS = {
  'app/routes/web.js': `// The MVC route tree: sessions, flash, CSRF, rendered views. Mounted at '/' by bootstrap.js.
const express = require('express');
const flash = require('connect-flash');
const router = express.Router();

const { createSessionMiddleware } = require('../../core/session');
const { csrfMiddleware, csrfProtect } = require('../../core/middlewares/csrf');
const sharedLocals = require('../../core/middlewares/sharedLocals');
// const requireAuth = require('../../core/middlewares/requireAuth');
// const validate = require('../../core/middlewares/validate');

router.use(createSessionMiddleware());
router.use(flash());
router.use(csrfMiddleware);
router.use(csrfProtect);
router.use(sharedLocals);

router.get('/', (req, res) => res.render('home', { title: 'Home' }));

// Add your routes here. Generate the pieces with:
//   node bin/forge.js make:scaffold Thing
//
// Anything below a \`router.use(requireAuth)\` line requires a signed-in session:
// router.use(requireAuth);
// router.get('/things', ThingController.index);

module.exports = router;
`,

  'app/routes/api.js': `// The REST API route tree: stateless, JWT-authenticated, JSON only. Mounted at '/api'.
const express = require('express');
const router = express.Router();

const markApi = require('../../core/middlewares/markApi');
// const requireJwt = require('../../core/middlewares/requireJwt');
// const validate = require('../../core/middlewares/validate');

router.use(markApi);

router.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Add your endpoints here:
// router.get('/things', requireJwt, ThingController.index);

// Terminal 404 — without this, an unmatched /api/* path falls through to the web tree and
// gets an HTML response instead of JSON.
router.use((req, res) => {
  res.status(404).json({ success: false, message: \`No API route matches \${req.method} /api\${req.path}\` });
});

module.exports = router;
`,

  'database/seeds/seed.js': `require('dotenv').config();

// Seed your development data here, e.g.
//   const User = require('../../app/models/User');
//   await User.create({ ... });
async function run() {
  console.log('Nothing to seed yet — add your fixtures to database/seeds/seed.js');
  process.exit(0);
}

run().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
`,

  'app/views/home.ejs': `<div class="text-center py-5">
  <h1 class="mb-3"><%= appName %></h1>
  <p class="text-muted">A clean Forge MVC project. Generate your first resource:</p>
  <pre class="d-inline-block text-start bg-light p-3 rounded"><code>node bin/forge.js make:scaffold Thing</code></pre>
</div>
`,

  'app/views-tsx/home.tsx': `import Main from './layouts/Main';
import type { BaseViewProps } from './types';

export default function Home(props: BaseViewProps) {
  return (
    <Main {...props}>
      <div className="text-center py-5">
        <h1 className="mb-3">{props.appName}</h1>
        <p className="text-muted">A clean Forge MVC project. Generate your first resource:</p>
        <pre className="d-inline-block text-start bg-light p-3 rounded">
          <code>node bin/forge.js make:scaffold Thing</code>
        </pre>
      </div>
    </Main>
  );
}
`,

  'app/views-tsx/types.ts': `// Shared prop types for the TSX views. Define one per resource as you add them — this is
// what gives you compile-time checking of the data a controller passes to res.render().
import type { FlashMessages } from './layouts/Main';

export type CurrentUser = { id: number | string; username: string; status: string };

export type BaseViewProps = {
  title: string;
  appName?: string;
  messages?: FlashMessages;
  currentUser?: CurrentUser | null;
  currentPath?: string;
  csrfToken?: string;
};

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type FormErrors = Record<string, string>;
`,
};

function rm(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return false;
  fs.rmSync(abs, { recursive: true, force: true });
  return true;
}

// engine: 'both' (default) | 'ejs' | 'tsx' — drops the view tree you aren't going to use.
function clean(root, { engine = 'both' } = {}) {
  const removed = [];
  const written = [];

  for (const file of EXAMPLE_FILES) if (rm(root, file)) removed.push(file);
  for (const dir of EXAMPLE_DIRS) if (rm(root, dir)) removed.push(`${dir}/`);

  for (const [rel, contents] of Object.entries(STUBS)) {
    // Skip the stub for a view tree that's about to be deleted.
    if (engine === 'ejs' && rel.includes('views-tsx')) continue;
    if (engine === 'tsx' && rel === 'app/views/home.ejs') continue;

    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
    written.push(rel);
  }

  if (engine === 'ejs') {
    if (rm(root, 'app/views-tsx')) removed.push('app/views-tsx/');
    if (rm(root, 'tsconfig.json')) removed.push('tsconfig.json');
  }
  if (engine === 'tsx') {
    if (rm(root, 'app/views')) removed.push('app/views/');
  }

  return { removed, written, engine };
}

module.exports = { clean, EXAMPLE_FILES, EXAMPLE_DIRS };
