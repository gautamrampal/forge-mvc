#!/usr/bin/env node
// Forge MVC scaffolding CLI.
//   node bin/forge.js make:model Post
//   node bin/forge.js make:controller Post           (both web + api)
//   node bin/forge.js make:controller Post --web
//   node bin/forge.js make:controller Post --api
//   node bin/forge.js make:views post
//   node bin/forge.js make:middleware auditLog
//   node bin/forge.js make:migration create_posts_table --table=posts
//   node bin/forge.js make:scaffold Post              (model + both controllers + views, prints route snippet)
//
// Or via the npm script: npm run make -- make:controller Post
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');

// So `make:views` defaults to the project's configured VIEW_ENGINE rather than always EJS.
require('dotenv').config({ path: path.join(ROOT, '.env') });

function toWords(input) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase());
}
const toPascal = (s) => toWords(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const toCamel = (s) => { const p = toPascal(s); return p[0].toLowerCase() + p.slice(1); };
const toKebab = (s) => toWords(s).join('-');
// Good-enough English pluralization for table/route names. Covers the regular cases plus the
// -y/-s/-x/-ch/-sh rules; genuinely irregular nouns (person->people, child->children) aren't
// worth an inflection library here — pass --table=... or rename the folder for those.
function pluralize(word) {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  if (/s$/i.test(word)) return word;
  return word + 's';
}
const toSnakePlural = (s) => {
  const words = toWords(s);
  words[words.length - 1] = pluralize(words[words.length - 1]);
  return words.join('_');
};
const toKebabPlural = (s) => {
  const words = toWords(s);
  words[words.length - 1] = pluralize(words[words.length - 1]);
  return words.join('-');
};

function render(templateFile, replacements) {
  let content = fs.readFileSync(path.join(TEMPLATES, templateFile), 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(`__${key}__`).join(value);
  }
  return content;
}

function writeFile(destPath, content, force) {
  const exists = fs.existsSync(destPath);
  if (exists && !force) {
    console.log(`skip (already exists): ${path.relative(ROOT, destPath)}  (pass --force to overwrite)`);
    return;
  }
  if (exists && force) {
    // --force replaces the file wholesale with the blank template — any code you'd written in
    // it is gone. Loud on purpose.
    console.log(`OVERWRITING (--force, your edits are lost): ${path.relative(ROOT, destPath)}`);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
  console.log(`created: ${path.relative(ROOT, destPath)}`);
}

function makeModel(rawName, opts) {
  const Name = toPascal(rawName);
  const table = opts.table || toSnakePlural(rawName);
  const content = render('model.js.tpl', { Name, table });
  writeFile(path.join(ROOT, 'app', 'models', `${Name}.js`), content, opts.force);
  return { Name, table };
}

function makeController(rawName, opts) {
  const Name = toPascal(rawName);
  const kebab = toKebabPlural(rawName); // route segment, e.g. "posts"
  const wantWeb = opts.web || !opts.api;
  const wantApi = opts.api || !opts.web;
  if (wantWeb) {
    writeFile(
      path.join(ROOT, 'app', 'controllers', 'web', `${Name}Controller.js`),
      render('controller.web.js.tpl', { Name, kebab }),
      opts.force
    );
  }
  if (wantApi) {
    writeFile(
      path.join(ROOT, 'app', 'controllers', 'api', `${Name}Controller.js`),
      render('controller.api.js.tpl', { Name, kebab }),
      opts.force
    );
  }
  return { Name, kebab };
}

// Emits views in whichever flavour the project is configured for (VIEW_ENGINE), overridable
// per-invocation with --ejs / --tsx so you can generate both if you keep both trees around.
function makeViews(rawName, opts) {
  const Name = toPascal(rawName);
  const kebab = toKebabPlural(rawName);
  const engine = opts.tsx ? 'tsx' : opts.ejs ? 'ejs' : (process.env.VIEW_ENGINE || 'ejs').toLowerCase();
  const ext = engine === 'tsx' ? 'tsx' : 'ejs';
  const viewsRoot = engine === 'tsx' ? 'views-tsx' : 'views';
  const dir = path.join(ROOT, 'app', viewsRoot, kebab);

  for (const kind of ['index', 'form', 'detail']) {
    writeFile(path.join(dir, `${kind}.${ext}`), render(`view.${kind}.${ext}.tpl`, { Name, kebab }), opts.force);
  }
  return { Name, kebab, engine };
}

function makeMiddleware(rawName, opts) {
  const name = toCamel(rawName);
  writeFile(path.join(ROOT, 'app', 'middlewares', `${name}.js`), render('middleware.js.tpl', { name }), opts.force);
}

function makeE2E(rawName, opts) {
  const Name = toPascal(rawName);
  const kebab = toKebabPlural(rawName);
  writeFile(path.join(ROOT, 'tests', 'e2e', `${kebab}.spec.js`), render('e2e.spec.js.tpl', { Name, kebab }), opts.force);
  console.log(`
Playwright isn't installed by default (it downloads ~400MB of browsers). To run this spec:
  npm install --save-dev @playwright/test
  npx playwright install chromium
  npm run test:e2e
`);
}

// Introspects the live Express API router rather than parsing route files, so the collection
// always matches what the app actually serves.
function makePostman(_rawName, opts) {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const { buildCollection } = require(path.join(ROOT, 'core', 'postman'));

  const router = require(path.join(ROOT, 'app', 'routes', 'api.js'));
  const collection = buildCollection({
    router,
    appDir: path.join(ROOT, 'app'),
    name: opts.name || process.env.APP_NAME || 'Forge MVC API',
    baseUrl: opts.baseUrl || process.env.APP_BASE_URL || 'http://localhost:5000',
    credentials: { email: opts.email, password: opts.password },
  });

  const outPath = path.isAbsolute(opts.out || '')
    ? opts.out
    : path.join(ROOT, opts.out || 'postman_collection.json');

  writeFile(outPath, JSON.stringify(collection, null, 2), true); // always refresh — it's derived
  const count = collection.item.reduce((n, folder) => n + folder.item.length, 0);
  console.log(`
Wrote ${count} requests across ${collection.item.length} folder(s).
Import it into Postman: File -> Import -> ${path.relative(ROOT, outPath)}
Run the login request first — it stores the JWT in the {{token}} collection variable and every
other request inherits it.
`);
}

function makeMigration(rawName, opts) {
  const name = toWords(rawName).join('_');
  const table = opts.table || toSnakePlural(rawName.replace(/^create_/, '').replace(/_table$/, ''));
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  writeFile(
    path.join(ROOT, 'database', 'migrations', `${stamp}_${name}.sql`),
    render('migration.sql.tpl', { name, table }),
    opts.force
  );
}

function makeScaffold(rawName, opts) {
  const { table } = makeModel(rawName, opts);
  const { kebab } = makeController(rawName, { ...opts, web: true, api: true });
  makeViews(rawName, opts);
  makeMigration(`create_${table}_table`, { ...opts, table });
  console.log(`
Next steps:
  1. Fill in the migration under database/migrations/, then: npm run migrate
  2. Add fields to the generated form view (see the commented example)
  3. Wire up routes — add to app/routes/web.js:
       const ${toPascal(rawName)}Controller = require('../controllers/web/${toPascal(rawName)}Controller');
       router.get('/${kebab}', require('../../core/middlewares/requireAuth'), ${toPascal(rawName)}Controller.list);
       router.get('/${kebab}/create', ${toPascal(rawName)}Controller.showCreate);
       router.post('/${kebab}', ${toPascal(rawName)}Controller.create);
       router.get('/${kebab}/:id', ${toPascal(rawName)}Controller.detail);
       router.get('/${kebab}/:id/edit', ${toPascal(rawName)}Controller.showEdit);
       router.put('/${kebab}/:id', ${toPascal(rawName)}Controller.update);
       router.delete('/${kebab}/:id', ${toPascal(rawName)}Controller.destroy);
     ...and the same shape to app/routes/api.js pointing at controllers/api/${toPascal(rawName)}Controller.
`);
}

// Destructive: strips the bundled example so this repo can start a new project.
function runClean(_rawName, opts) {
  const engine = opts.ejs ? 'ejs' : opts.tsx ? 'tsx' : 'both';

  if (!opts.yes) {
    console.log(`This removes the bundled Users example and resets routes/seeds to stubs.

  Deleted   app/models/User.js, both User + Auth controllers, userValidators,
            requireActiveUser, preventSelfAction, the users/auth views,
            001_create_users_table.sql, the example tests, postman_collection.json
  Reset     app/routes/web.js, app/routes/api.js, database/seeds/seed.js
  Kept      everything in core/, templates/, bin/, tests/helpers/, your .env
${engine !== 'both' ? `  Views     keeping ${engine} only — the other view tree will be deleted\n` : ''}
Re-run with --yes to proceed:
  node bin/forge.js clean --yes            # keep both view trees
  node bin/forge.js clean --yes --ejs      # keep EJS only
  node bin/forge.js clean --yes --tsx      # keep TSX only`);
    process.exit(1);
  }

  const { clean } = require(path.join(ROOT, 'core', 'clean'));
  const { removed, written } = clean(ROOT, { engine });

  removed.forEach((f) => console.log(`removed: ${f}`));
  written.forEach((f) => console.log(`reset:   ${f}`));

  console.log(`
Clean. Next steps for your new project:
  1. Drop the old database:   DROP DATABASE <name>;  (or point DB_NAME at a new one in .env)
  2. Update APP_NAME in .env${engine !== 'both' ? `\n  3. Set VIEW_ENGINE=${engine} in .env` : ''}
  ${engine !== 'both' ? '4' : '3'}. Generate your first resource:
       node bin/forge.js make:scaffold Thing
  ${engine !== 'both' ? '5' : '4'}. npm run migrate && npm start
`);
}

function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      opts[key] = value === undefined ? true : value;
    } else {
      positional.push(arg);
    }
  }
  return { opts, positional };
}

function main() {
  const [, , command, ...rest] = process.argv;
  const { opts, positional } = parseArgs(rest);
  const name = positional[0];

  const commands = {
    'make:model': () => makeModel(name, opts),
    'make:controller': () => makeController(name, opts),
    'make:views': () => makeViews(name, opts),
    'make:middleware': () => makeMiddleware(name, opts),
    'make:migration': () => makeMigration(name, opts),
    'make:scaffold': () => makeScaffold(name, opts),
    'make:e2e': () => makeE2E(name, opts),
    'make:postman': () => makePostman(name, opts),
    'clean': () => runClean(name, opts),
  };

  // Everything except make:postman needs a <name> argument.
  const NAMELESS = new Set(['make:postman', 'clean']);

  if (!command || !commands[command]) {
    console.log(`Forge MVC generator

Usage:
  node bin/forge.js make:model <Name> [--table=table_name]
  node bin/forge.js make:controller <Name> [--web] [--api]
  node bin/forge.js make:views <Name> [--ejs] [--tsx]   # defaults to VIEW_ENGINE
  node bin/forge.js make:middleware <name>
  node bin/forge.js make:migration <name> [--table=table_name]
  node bin/forge.js make:scaffold <Name>        # model + controllers + views + migration + route snippet
  node bin/forge.js make:e2e <Name>             # Playwright browser spec
  node bin/forge.js make:postman                # Postman v2.1 collection from the live API routes
                    [--out=file.json] [--name="My API"] [--baseUrl=http://...]
                    [--email=... --password=...]

  node bin/forge.js clean --yes                 # strip the example, ready for a new project
                    [--ejs | --tsx]             # ...and keep only that view tree

All make: commands accept --force to overwrite existing files.`);
    process.exit(command ? 1 : 0);
  }

  if (!name && !NAMELESS.has(command)) {
    console.error(`Missing <name> argument for ${command}.`);
    process.exit(1);
  }

  commands[command]();
}

main();
