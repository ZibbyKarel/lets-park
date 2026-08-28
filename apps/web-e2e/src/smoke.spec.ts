import { expect, test } from '@playwright/test';

/**
 * Scaffolding smoke test.
 *
 * It needs no external stack (no database, no OIDC provider): Playwright's
 * `webServer` config starts `nx run web:dev` and the test only asserts that the
 * Next.js app renders its root route. Real end-to-end scenarios arrive in
 * Fáze 7 once auth and the backend are in place.
 */
test('renders the web app root route', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toBeVisible();
});
