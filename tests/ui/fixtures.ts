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
    // Clear the orgboard IndexedDB database
    await page.evaluate(() =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("orgboard");
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
    await page.waitForTimeout(350);
    await use(page);
  },
});

export { expect } from "@playwright/test";

/**
 * Bulk-add unassigned employees by injecting directly into app state.
 * Much faster than clicking through the add-person modal N times.
 */
export async function addUnassignedPeople(
  page: import("@playwright/test").Page,
  count: number,
  prefix = "Person"
): Promise<void> {
  await page.evaluate(
    ({ count, prefix }) => {
      const t = (window as any).__test;
      const state = t.getState();
      let seq = t.getEmployeeSequence();
      for (let i = 0; i < count; i++) {
        const id = `p${++seq}`;
        state.employees[id] = {
          id,
          name: `${prefix} ${i}`,
          role: "Engineer",
          location: "Remote",
          timezone: "EST (UTC−5)",
          notes: "",
          requested: false,
          level: 5,
          currentManager: "",
        };
        state.unassignedEmployees.push(id);
      }
      t.setEmployeeSequence(seq);
      t.render();
    },
    { count, prefix }
  );
}
