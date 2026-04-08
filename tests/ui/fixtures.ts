import { test as base } from "@playwright/test";

/**
 * Custom test fixture that clears IndexedDB before each test
 * so every test starts with a fresh database, then auto-dismisses
 * the landing page by loading demo data.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Navigate to the app origin so we can access IndexedDB
    await page.goto("/");
    // Clear the teamboard IndexedDB database
    await page.evaluate(() =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("teamboard");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      })
    );
    // Reload after DB clear — landing page will appear on first run
    await page.goto("/");
    // Dismiss landing page by choosing "Launch demo"
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector('.team');
    // Wait for debounced IndexedDB flush (300ms) so state persists across reloads
    await page.waitForTimeout(500);
    await use(page);
  },
});

export { expect } from "@playwright/test";
