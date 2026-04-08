import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Stats Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("stats panel renders collapsed by default with strip icon and label", async ({ page }) => {
    const panel = page.locator("#stats-panel");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveClass(/is-open/);
    const strip = panel.locator(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(strip).toBeVisible();
    await expect(strip.locator(".stats-panel-strip-label")).toHaveText("STATS");
  });

  test("clicking collapsed strip opens the stats panel", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const panel = page.locator("#stats-panel");
    await expect(panel).toHaveClass(/is-open/);
    await expect(panel.locator(".stats-panel-tab.is-active")).toHaveText("Stats");
  });

  test("clicking close button collapses the panel", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(page.locator("#stats-panel")).toHaveClass(/is-open/);
    await page.click('[data-action="close-right-panel"]');
    await expect(page.locator("#stats-panel")).not.toHaveClass(/is-open/);
  });

  test("overview section shows correct totals", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const body = page.locator(".stats-panel-body");

    // Default state: 10 total, 8 assigned, 2 unassigned, 4 teams
    const rows = body.locator(".stats-section").first().locator(".stats-row");
    await expect(rows.filter({ hasText: "Total people" }).locator(".stats-row-value")).toHaveText("10");
    await expect(rows.filter({ has: page.locator('.stats-row-label', { hasText: /^Assigned$/ }) }).locator(".stats-row-value")).toHaveText("8");
    await expect(rows.filter({ has: page.locator('.stats-row-label', { hasText: /^Unassigned$/ }) }).locator(".stats-row-value")).toHaveText("2");
    await expect(rows.filter({ hasText: "Teams" }).locator(".stats-row-value")).toHaveText("4");
  });

  test("team blocks render for each root team", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const teamHeaders = page.locator(".stats-panel-body .stats-team-header");
    // Root teams: Product and Operations, plus nested: Research and Field
    await expect(teamHeaders).toHaveCount(4);
    await expect(teamHeaders.filter({ hasText: "Product" })).toHaveCount(1);
    await expect(teamHeaders.filter({ hasText: "Operations" })).toHaveCount(1);
    await expect(teamHeaders.filter({ hasText: "Research" })).toHaveCount(1);
    await expect(teamHeaders.filter({ hasText: "Field" })).toHaveCount(1);
  });

  test("timezone badges appear in the panel", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const tzBadges = page.locator(".stats-panel-body .stats-tz-badge");
    const count = await tzBadges.count();
    expect(count).toBeGreaterThan(0);
  });

  test("unassigned bar adjusts right when panel opens", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const rightBefore = await drawer.evaluate((el) => {
      return window.getComputedStyle(el).right;
    });
    expect(rightBefore).toBe("40px");

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    // Wait for transition
    await page.waitForTimeout(400);
    const rightAfter = await drawer.evaluate((el) => {
      return window.getComputedStyle(el).right;
    });
    expect(rightAfter).toBe("320px");
  });

  test("page-shell has right margin for collapsed stats panel", async ({ page }) => {
    const shell = page.locator(".page-shell");
    const marginRight = await shell.evaluate((el) => window.getComputedStyle(el).marginRight);
    expect(marginRight).toBe("40px");
  });

  test("page-shell right margin expands when stats panel opens", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await page.waitForTimeout(400);
    const shell = page.locator(".page-shell");
    const marginRight = await shell.evaluate((el) => window.getComputedStyle(el).marginRight);
    expect(marginRight).toBe("320px");
  });

  test("stats update after deleting an employee", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const totalRow = page.locator(".stats-section").first().locator(".stats-row").filter({ hasText: "Total people" }).locator(".stats-row-value");
    await expect(totalRow).toHaveText("10");

    // Close panel, delete an employee, reopen
    await page.click('[data-action="close-right-panel"]');
    const firstCard = page.locator(".member-slot .person-card").first();
    await firstCard.hover();
    const deleteBtn = firstCard.locator('button[data-action="delete-employee"]');
    await deleteBtn.click();

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(totalRow).toHaveText("9");
  });

  test("stats update after adding a person", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const totalRow = page.locator(".stats-section").first().locator(".stats-row").filter({ hasText: "Total people" }).locator(".stats-row-value");
    await expect(totalRow).toHaveText("10");

    // Close panel, add a person, then check
    await page.click('[data-action="close-right-panel"]');
    await page.click("#add-person-btn");
    await page.fill("#ap-name", "Test Person");
    await page.click("#add-person-submit");

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const unassignedRow = page.locator(".stats-section").first().locator(".stats-row").filter({ hasText: "Unassigned" }).locator(".stats-row-value");
    await expect(unassignedRow).toHaveText("3");
  });

  test("no stats toggle button in the toolbar", async ({ page }) => {
    await expect(page.locator("#stats-toggle-btn")).toHaveCount(0);
  });
});
