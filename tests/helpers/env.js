// MUST be required before anything that touches the DB or reads config — it rewrites the
// environment so tests run against a throwaway database instead of your development one.
// Every test file requires this first, before core/db is ever loaded.
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

process.env.NODE_ENV = 'test';

// Separate database, so a test run can truncate tables without destroying dev data.
// Override with TEST_DB_NAME if you want a different one.
process.env.DB_NAME = process.env.TEST_DB_NAME || `${process.env.DB_NAME || 'forge_mvc'}_test`;
process.env.MONGO_DB_NAME = process.env.TEST_MONGO_DB_NAME || `${process.env.MONGO_DB_NAME || 'forge_mvc'}_test`;

// Deterministic secrets so token assertions don't depend on your local .env.
process.env.SESSION_SECRET = 'test_session_secret';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.JWT_EXPIRES_IN = '1h';

// Keep the log file quiet during test runs.
process.env.LOG_LEVEL = 'error';

module.exports = {};
