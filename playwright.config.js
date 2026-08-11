// Playwright drives a real browser against a real server — it catches what supertest can't:
// broken JavaScript, CSS that hides a button, a form that doesn't actually submit.
//
// Playwright is NOT installed by default (it downloads ~400MB of browsers). Enable it with:
//   npm install --save-dev @playwright/test
//   npx playwright install chromium
//   npm run test:e2e
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 5099;
const baseURL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // specs share one database — see tests/e2e/global-setup.js
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',   // a full timeline to replay when something fails in CI
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Boots the app against the E2E database and waits for it to answer before running specs.
  webServer: {
    command: `node server.js`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      DB_NAME: process.env.E2E_DB_NAME || 'forge_mvc_e2e',
      SESSION_SECRET: 'e2e_session_secret',
      JWT_SECRET: 'e2e_jwt_secret',
    },
  },

  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
});
