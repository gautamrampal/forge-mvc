// Picks the active database adapter based on DB_DRIVER — the only place in the framework that
// branches on which database you're using. Everything above this (core/Model.js, your app
// models) talks to whichever adapter comes back through the exact same function names.
const driver = (process.env.DB_DRIVER || 'mysql').toLowerCase();

const adapters = {
  mysql: () => require('./mysql'),
  postgres: () => require('./postgres'),
  postgresql: () => require('./postgres'),
  mongodb: () => require('./mongodb'),
  mongo: () => require('./mongodb'),
};

if (!adapters[driver]) {
  throw new Error(`Unknown DB_DRIVER "${driver}". Supported: mysql | postgres | mongodb.`);
}

module.exports = adapters[driver]();
