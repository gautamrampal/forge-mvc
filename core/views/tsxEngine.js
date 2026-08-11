// Renders .tsx React components as an Express view engine, so `res.render('posts/index', data)`
// works identically whether the project is using EJS or TSX. Controllers never change.
//
// Two pieces:
//   1. A require hook that transpiles .tsx/.ts on the fly with esbuild (no build step, no
//      dist/ folder to keep in sync — you edit a .tsx and reload).
//   2. An Express engine function that imports the module, renders its default export to
//      static HTML, and hands the string back to Express.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// ---------------------------------------------------------------------------
// 1. Runtime TSX/TS require hook
// ---------------------------------------------------------------------------
// jsx: 'automatic' uses React 17+'s new transform, which pulls in react/jsx-runtime itself —
// so view files don't need `import React from 'react'` at the top of every file.
function compile(module_, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = esbuild.transformSync(source, {
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs',
    target: 'node18',
    jsx: 'automatic',
    sourcefile: filename,
    sourcemap: 'inline',
  });
  return module_._compile(code, filename);
}

let hookInstalled = false;
function installRequireHook() {
  if (hookInstalled) return;
  require.extensions['.tsx'] = compile;
  require.extensions['.ts'] = compile;
  hookInstalled = true;
}

// ---------------------------------------------------------------------------
// 2. The Express view engine
// ---------------------------------------------------------------------------
// Express hands us (filePath, options, callback). `options` is the merged locals plus a few
// internals (settings/_locals/cache) that would be noise as component props, so strip them.
const EXPRESS_INTERNALS = new Set(['settings', '_locals', 'cache', 'layout']);

function toProps(options) {
  const props = {};
  for (const [key, value] of Object.entries(options)) {
    if (!EXPRESS_INTERNALS.has(key)) props[key] = value;
  }
  return props;
}

function renderFile(filePath, options, callback) {
  try {
    // In development, drop the cached module so edits show up on reload without restarting.
    // In production the require cache is left alone — views compile once and stay compiled.
    if (process.env.NODE_ENV !== 'production') {
      delete require.cache[require.resolve(filePath)];
    }

    const mod = require(filePath);
    const Component = mod.default || mod;
    if (typeof Component !== 'function') {
      throw new Error(
        `${path.basename(filePath)} must export a React component as its default export ` +
          `(got ${typeof Component}).`
      );
    }

    const html = renderToStaticMarkup(React.createElement(Component, toProps(options)));
    // renderToStaticMarkup emits the markup only — prepend the doctype so browsers use
    // standards mode rather than quirks mode.
    callback(null, `<!doctype html>\n${html}`);
  } catch (err) {
    callback(err);
  }
}

module.exports = { installRequireHook, renderFile };
