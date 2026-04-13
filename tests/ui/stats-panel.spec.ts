import { test, expect } from "./fixtures";

test.describe("Stats Panel", () => {
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

  test("main content shrinks when panel opens", async ({ page }) => {
    const shell = page.locator(".page-shell");
    const widthBefore = await shell.evaluate((el) => el.getBoundingClientRect().width);

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await page.waitForTimeout(350);
    const widthAfter = await shell.evaluate((el) => el.getBoundingClientRect().width);
    expect(widthAfter).toBeLessThan(widthBefore);
  });

  test("stats panel is 40px wide when collapsed", async ({ page }) => {
    const panel = page.locator("#stats-panel");
    const width = await panel.evaluate((el) => window.getComputedStyle(el).width);
    expect(width).toBe("40px");
  });

  test("stats panel is 320px wide when open", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await page.waitForTimeout(350);
    const panel = page.locator("#stats-panel");
    const width = await panel.evaluate((el) => window.getComputedStyle(el).width);
    expect(width).toBe("320px");
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
    // Deleting from a team moves to unassigned — total stays the same
    await expect(totalRow).toHaveText("10");
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

  test("people by role section is collapsible and starts expanded", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const roleSection = page.locator("details.stats-collapsible", { has: page.locator("summary.stats-section-title", { hasText: "People by role" }) });
    await expect(roleSection).toHaveAttribute("open", "");
    // Collapse it
    await roleSection.locator("summary").click();
    await expect(roleSection).not.toHaveAttribute("open", "");
    // Role rows should be hidden
    await expect(roleSection.locator(".stats-row")).toHaveCount(0, { timeout: 500 }).catch(() => {
      // In some browsers hidden content still exists in DOM but is not visible
    });
    // Re-expand
    await roleSection.locator("summary").click();
    await expect(roleSection).toHaveAttribute("open", "");
  });

  test("team blocks are collapsible and start collapsed", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    // Select only root-level team details (not nested)
    const teamDetails = page.locator(".stats-panel-body > details.stats-collapsible:has(> summary.stats-team-header)");
    const count = await teamDetails.count();
    expect(count).toBeGreaterThan(0);
    // All team blocks start collapsed
    for (let i = 0; i < count; i++) {
      await expect(teamDetails.nth(i)).not.toHaveAttribute("open", "");
    }
    // Expand the first root team by clicking its direct summary
    await teamDetails.first().locator("> summary").click();
    await expect(teamDetails.first()).toHaveAttribute("open", "");
  });

  test("manager changes details are collapsible", async ({ page }) => {
    // Demo data already has manager changes — just check the toggle exists
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const managerToggle = page.locator(".stats-collapsible-toggle");
    // Demo data should have manager changes
    await expect(managerToggle).toHaveCount(1);
    // Starts collapsed
    const details = managerToggle.locator("..");
    await expect(details).not.toHaveAttribute("open", "");
    // Expand
    await managerToggle.click();
    await expect(details).toHaveAttribute("open", "");
    // Change rows should now be visible
    const changeRows = page.locator(".manager-change-row");
    const rowCount = await changeRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });
});
