const { test, expect } = require('@playwright/test');

// Update these to match a seeded account (see tests/e2e/global-setup.js).
const USER = { email: 'e2e@forge.test', password: 'E2E@12345' };

async function login(page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', USER.email);
  await page.fill('input[name="password"]', USER.password);
  await page.click('button[type="submit"]');
}

test.describe('__kebab__', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('lists __kebab__', async ({ page }) => {
    await page.goto('/__kebab__');
    await expect(page.locator('h4')).toContainText('__Name__');
  });

  test('creates a __Name__', async ({ page }) => {
    await page.goto('/__kebab__/create');

    // TODO: fill in your fields, e.g.
    // await page.fill('input[name="name"]', `Test ${Date.now()}`);

    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/__kebab__$/);
  });

  test('shows validation errors for invalid input', async ({ page }) => {
    await page.goto('/__kebab__/create');
    await page.click('button[type="submit"]');   // submit empty
    await expect(page).toHaveURL(/\/__kebab__\/create/);
    // await expect(page.locator('.invalid-feedback').first()).toBeVisible();
  });

  test('deletes a __Name__', async ({ page }) => {
    await page.goto('/__kebab__');
    const firstRow = page.locator('tbody tr').first();
    if ((await firstRow.count()) === 0) test.skip(true, 'no __Name__ to delete');

    await firstRow.locator('a').first().click();
    page.on('dialog', (dialog) => dialog.accept());
    await page.click('button:has-text("Delete")');
    await expect(page).toHaveURL(/\/__kebab__$/);
  });
});
