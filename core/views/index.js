// Picks the view engine from VIEW_ENGINE (ejs | tsx) — the only place the framework decides how
// a page gets rendered. Both engines are driven through Express's standard `res.render(view,
// data)` interface, so switching one to the other requires no controller changes at all.
//
//   ejs  -> app/views/*.ejs      + express-ejs-layouts (layout set via `layout` local)
//   tsx  -> app/views-tsx/*.tsx  + React SSR (layout is just a component you wrap with)
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const logger = require('../helpers/logger');

const ENGINES = ['ejs', 'tsx'];

function configureViews(app, { appDir }) {
  const engine = (process.env.VIEW_ENGINE || 'ejs').toLowerCase();
  if (!ENGINES.includes(engine)) {
    throw new Error(`Unknown VIEW_ENGINE "${engine}". Supported: ${ENGINES.join(' | ')}.`);
  }

  if (engine === 'tsx') {
    const { installRequireHook, renderFile } = require('./tsxEngine');
    installRequireHook();
    app.engine('tsx', renderFile);
    app.set('view engine', 'tsx');
    app.set('views', path.join(appDir, 'views-tsx'));
    // No express-ejs-layouts here: in TSX a "layout" is just a component the view wraps its
    // content in, which needs no framework support.
  } else {
    app.set('view engine', 'ejs');
    app.set('views', path.join(appDir, 'views'));
    app.set('layout', 'layouts/main');
    app.use(expressLayouts);
  }

  app.set('viewEngine', engine);
  logger.debug(`View engine: ${engine}`);
  return engine;
}

module.exports = { configureViews, ENGINES };
