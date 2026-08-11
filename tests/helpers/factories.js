require('./env');

// Test data builders. Each takes overrides so a test states only the field it cares about and
// lets everything else default — which keeps the intent of each test obvious.

let counter = 0;
const uniq = () => `${Date.now()}${++counter}`;

const DEFAULT_PASSWORD = 'Test@12345';

async function createUser(overrides = {}) {
  const User = require('../../app/models/User');
  const password = overrides.password || DEFAULT_PASSWORD;
  const user = await User.createWithPassword({
    username: overrides.username || `user${uniq()}`,
    password,
    status: overrides.status || 'active',
  });
  // The plaintext comes back so the test can log in as this user; it is never stored.
  return { ...user, password };
}

module.exports = { createUser, DEFAULT_PASSWORD };
