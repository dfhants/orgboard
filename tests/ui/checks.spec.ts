import { test, expect } from "./fixtures";

test.describe("Checks Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  // ─── Sidebar strip layout ───

  test("collapsed sidebar shows Stats, Checks, and Notes strips", async ({ page }) => {
    const panel = page.locator("#stats-panel");
    await expect(panel).not.toHaveClass(/is-open/);
    await expect(panel.locator(".stats-panel-strip").first()).toBeVisible();
    await expect(panel.locator(".checks-strip")).toBeVisible();
    await expect(panel.locator(".notes-strip")).toBeVisible();
    await expect(panel.locator(".stats-panel-strip").first().locator(".stats-panel-strip-label")).toHaveText("STATS");
    await expect(panel.locator(".checks-strip .stats-panel-strip-label")).toHaveText("CHECKS");
    await expect(panel.locator(".notes-strip .stats-panel-strip-label")).toHaveText("NOTES");
  });

  test("clicking Checks strip opens the checks panel", async ({ page }) => {
    await page.click(".checks-strip");
    const panel = page.locator("#stats-panel");
    await expect(panel).toHaveClass(/is-open/);
    await expect(panel.locator(".stats-panel-tab.is-active")).toHaveText("Checks");
  });

  test("clicking Stats strip opens the stats panel content", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const panel = page.locator("#stats-panel");
    await expect(panel).toHaveClass(/is-open/);
    await expect(panel.locator(".stats-panel-tab.is-active")).toHaveText("Stats");
  });

  test("tabs switch between Stats and Checks without closing", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(page.locator(".stats-panel-tab.is-active")).toHaveText("Stats");

    // Switch to Checks tab
    await page.click('[data-action="switch-to-checks"]');
    await expect(page.locator("#stats-panel")).toHaveClass(/is-open/);
    await expect(page.locator(".stats-panel-tab.is-active")).toHaveText("Checks");

    // Switch back to Stats tab
    await page.click('[data-action="switch-to-stats"]');
    await expect(page.locator(".stats-panel-tab.is-active")).toHaveText("Stats");
  });

  test("close button collapses back to all strips", async ({ page }) => {
    await page.click(".checks-strip");
    await expect(page.locator("#stats-panel")).toHaveClass(/is-open/);
    await page.click('[data-action="close-right-panel"]');
    await expect(page.locator("#stats-panel")).not.toHaveClass(/is-open/);
    await expect(page.locator(".stats-panel-strip").first()).toBeVisible();
    await expect(page.locator(".checks-strip")).toBeVisible();
    await expect(page.locator(".notes-strip")).toBeVisible();
  });

  // ─── Empty state ───

  test("checks panel shows empty state when no criteria exist", async ({ page }) => {
    await page.click(".checks-strip");
    await expect(page.locator(".checks-empty")).toBeVisible();
    await expect(page.locator(".checks-empty")).toContainText("No checks defined");
  });

  test("add check button is visible in empty state", async ({ page }) => {
    await page.click(".checks-strip");
    await expect(page.locator(".checks-add-button")).toBeVisible();
  });

  // ─── Add criterion modal ───

  test("add check button opens fullscreen criterion modal", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await expect(page.locator("#criterion-modal")).toBeVisible();
    await expect(page.locator(".modal-title")).toHaveText("Add checks");
  });

  test("criterion modal shows all check types as cards", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    const cards = page.locator(".check-type-card");
    await expect(cards).toHaveCount(11);
    // Verify first card label
    await expect(cards.first().locator(".check-type-card-label")).toHaveText("Team size");
  });

  test("criterion modal cards show description", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    const card = page.locator('.check-type-card[data-type="employee-count"]');
    await expect(card.locator(".check-type-card-desc")).toContainText("number of people");
  });

  test("clicking a card adds an instance to the list", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await expect(page.locator(".check-instance")).toHaveCount(0);
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await expect(page.locator(".check-instance")).toHaveCount(1);
    await expect(page.locator(".check-instance-label")).toHaveText("Manager assigned");
  });

  test("many check instances render in two-column grid and scroll", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");

    // Add all 11 check types
    const cards = page.locator(".check-type-card");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards.nth(i).click();
    }
    await expect(page.locator(".check-instance")).toHaveCount(11);

    // The instance list should use a two-column grid
    const list = page.locator(".check-instance-list");
    const cols = await list.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );
    const colCount = cols.split(" ").length;
    expect(colCount).toBe(2);

    // The list should overflow and scroll
    const overflows = await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight
    );
    expect(overflows).toBe(true);

    // Each instance should render at its natural height (config visible, not clipped)
    const firstInstance = page.locator(".check-instance").first();
    const firstConfig = firstInstance.locator(".check-instance-config");
    const configBox = await firstConfig.boundingBox();
    expect(configBox!.height).toBeGreaterThan(20);
  });

  test("submit button shows count of instances", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    const btn = page.locator("#criterion-submit");
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveText("Select checks above");

    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText("Add 1 check");

    await page.locator('.check-type-card[data-type="all-assigned"]').click();
    await expect(btn).toHaveText("Add 2 checks");
  });

  test("can remove an instance before submitting", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await expect(page.locator(".check-instance")).toHaveCount(1);
    await page.locator(".check-instance-remove").click();
    await expect(page.locator(".check-instance")).toHaveCount(0);
    await expect(page.locator("#criterion-submit")).toBeDisabled();
  });

  test("cancel closes criterion modal without saving", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.click("#criterion-cancel");
    await expect(page.locator("#criterion-modal")).toHaveCount(0);
    await expect(page.locator(".checks-empty")).toBeVisible();
  });

  test("can add a has-manager check", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");

    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    await expect(page.locator("#criterion-modal")).toHaveCount(0);
    await expect(page.locator(".check-card")).toHaveCount(1);
    await expect(page.locator(".check-card-name")).toContainText("manager");
  });

  test("can add an employee-count check with filter", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");

    await page.locator('.check-type-card[data-type="employee-count"]').click();
    const inst = page.locator('.check-instance[data-type="employee-count"]');
    await inst.locator('[data-cr="operator"]').selectOption(">=");
    await inst.locator('[data-cr="value"]').fill("2");
    await inst.locator('[data-cr="filter-field"]').selectOption("level");
    await inst.locator('[data-cr="filter-op"]').selectOption(">=");
    await inst.locator('[data-cr="filter-value"]').fill("5");
    await page.click("#criterion-submit");

    await expect(page.locator(".check-card")).toHaveCount(1);
  });

  test("auto-generates name from description", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="all-assigned"]').click();
    await page.click("#criterion-submit");

    const name = page.locator(".check-card-name");
    await expect(name).toContainText("assigned");
  });

  test("can add multiple checks at once", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");

    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.locator('.check-type-card[data-type="all-assigned"]').click();
    await page.locator('.check-type-card[data-type="timezone-gap"]').click();
    await page.click("#criterion-submit");

    await expect(page.locator("#criterion-modal")).toHaveCount(0);
    await expect(page.locator(".check-card")).toHaveCount(3);
  });

  test("can add same check type multiple times with different config", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");

    // Add two team-size checks
    await page.locator('.check-type-card[data-type="employee-count"]').click();
    await page.locator('.check-type-card[data-type="employee-count"]').click();
    const instances = page.locator('.check-instance[data-type="employee-count"]');
    await expect(instances).toHaveCount(2);

    // Configure first: at least 3
    await instances.nth(0).locator('[data-cr="operator"]').selectOption(">=");
    await instances.nth(0).locator('[data-cr="value"]').fill("3");
    // Configure second: at most 10
    await instances.nth(1).locator('[data-cr="operator"]').selectOption("<=");
    await instances.nth(1).locator('[data-cr="value"]').fill("10");
    await page.click("#criterion-submit");

    await expect(page.locator(".check-card")).toHaveCount(2);
    const names = page.locator(".check-card-name");
    await expect(names.nth(0)).toContainText("at least 3");
    await expect(names.nth(1)).toContainText("at most 10");
  });

  // ─── Criterion actions ───

  test("can toggle a criterion enabled/disabled", async ({ page }) => {
    // Add a check first
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    const card = page.locator(".check-card");
    await expect(card).not.toHaveClass(/disabled/);

    // Hover and click disable
    await card.hover();
    await card.locator('[data-action="toggle-criterion"]').click();
    await expect(page.locator(".check-card")).toHaveClass(/disabled/);
  });

  test("can delete a criterion", async ({ page }) => {
    // Add a check
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");
    await expect(page.locator(".check-card")).toHaveCount(1);

    // Delete it
    const card = page.locator(".check-card");
    await card.hover();
    await card.locator('[data-action="delete-criterion"]').click();
    await expect(page.locator(".check-card")).toHaveCount(0);
  });

  test("can edit a criterion", async ({ page }) => {
    // Add a check
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    // Edit it
    const card = page.locator(".check-card");
    await card.hover();
    await card.locator('[data-action="edit-criterion"]').click();
    await expect(page.locator("#criterion-modal")).toBeVisible();
    await expect(page.locator(".modal-title")).toHaveText("Edit check");
    await page.fill('[data-cr="name"]', "Updated name");
    await page.click("#criterion-submit");

    await expect(page.locator(".check-card-name")).toHaveText("Updated name");
  });

  // ─── Check evaluation ───

  test("has-manager check shows pass/fail per team", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    // Default demo data: Field team (t4) has no manager, others do
    const details = page.locator(".check-detail-row");
    const failDetails = details.filter({ has: page.locator('[data-lucide="x"]') });
    // At least one team should fail (Field has no manager)
    await expect(failDetails.first()).toBeVisible();
  });

  test("summary shows correct pass/fail count", async ({ page }) => {
    await page.click(".checks-strip");

    // Add a check that passes
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="employee-count"]').click();
    const inst = page.locator('.check-instance[data-type="employee-count"]');
    await inst.locator('[data-cr="operator"]').selectOption(">=");
    await inst.locator('[data-cr="value"]').fill("1");
    await page.click("#criterion-submit");

    const summary = page.locator(".checks-summary");
    await expect(summary).toBeVisible();
    await expect(summary.locator(".checks-summary-count")).toContainText("1/1 passing");
  });

  // ─── Criteria persist across panel close/open ───

  test("criteria survive panel close and reopen", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    // Close and reopen
    await page.click('[data-action="close-right-panel"]');
    await page.click(".checks-strip");
    await expect(page.locator(".check-card")).toHaveCount(1);
  });

  test("criteria persist across page reload", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="all-assigned"]').click();
    await page.click("#criterion-submit");
    // The check should now be visible
    await expect(page.locator(".check-card")).toHaveCount(1);

    // Close the panel so saved state has it closed
    await page.click('[data-action="close-right-panel"]');
    // Wait for DB flush
    await page.waitForTimeout(500);

    // Reload — state should persist
    await page.reload();
    await page.waitForSelector(".team");

    // Open the checks panel again
    await page.click(".checks-strip");
    await expect(page.locator(".check-card")).toHaveCount(1);
  });
});

test.describe("Checks Panel – Level Field", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("level badge shows on person cards in demo data", async ({ page }) => {
    const levelBadges = page.locator(".person-level");
    const count = await levelBadges.count();
    expect(count).toBeGreaterThan(0);
    // First person card should have an L-prefixed badge
    await expect(levelBadges.first()).toHaveText(/^L\d+$/);
  });

  test("edit person modal has level field", async ({ page }) => {
    const card = page.locator(".person-card").first();
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();
    await expect(page.locator("#ep-level")).toBeVisible();
    // Demo data has levels set
    const val = await page.locator("#ep-level").inputValue();
    expect(Number(val)).toBeGreaterThan(0);
  });

  test("add person modal has level field", async ({ page }) => {
    await page.click("#add-person-btn");
    await expect(page.locator("#ap-level")).toBeVisible();
  });

  test("can set level when adding a person", async ({ page }) => {
    await page.click("#add-person-btn");
    await page.fill("#ap-name", "Test Level Person");
    await page.fill("#ap-level", "6");
    await page.click("#add-person-submit");

    // Find the new person card and check for level badge
    const newCard = page.locator('.person-card', { hasText: "Test Level Person" });
    await expect(newCard.locator(".person-level")).toHaveText("L6");
  });

  test("can edit level on existing person", async ({ page }) => {
    const card = page.locator(".person-card").first();
    const personName = await card.locator(".person-name").textContent();
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();
    await page.fill("#ep-level", "10");
    await page.click("#edit-person-submit");

    const updatedCard = page.locator('.person-card', { hasText: personName!.trim() });
    await expect(updatedCard.locator(".person-level")).toHaveText("L10");
  });
});
