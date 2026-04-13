import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Sort All Teams", () => {
  const sortBtn = (page) =>
    page.locator('#action-bar [data-action="open-sort-modal"]');

  test("sort button is visible on the action bar", async ({ page }) => {
    const btn = sortBtn(page);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute("title", "Sort all teams");
  });

  test("sort button is not on team titlebar", async ({ page }) => {
    const teamSortBtn = page.locator('.team-titlebar [data-action="open-sort-modal"]');
    await expect(teamSortBtn).toHaveCount(0);
  });

  test("clicking sort button opens sort modal", async ({ page }) => {
    await sortBtn(page).click();
    const modal = page.locator("#sort-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toHaveText("Sort all teams");
  });

  test("sort modal shows two sort layers by default (level + name)", async ({ page }) => {
    await sortBtn(page).click();
    const layers = page.locator("#sort-modal .sort-layer");
    await expect(layers).toHaveCount(2);
    // First layer: Level ascending
    await expect(layers.nth(0).locator(".sort-layer-key")).toHaveValue("level");
    await expect(layers.nth(0).locator(".sort-layer-dir")).toHaveAttribute("data-dir", "asc");
    // Second layer: Name ascending
    await expect(layers.nth(1).locator(".sort-layer-key")).toHaveValue("name");
    await expect(layers.nth(1).locator(".sort-layer-dir")).toHaveAttribute("data-dir", "asc");
  });

  test("sort layer has a key dropdown and direction toggle", async ({ page }) => {
    await sortBtn(page).click();
    const layer = page.locator("#sort-modal .sort-layer").first();
    await expect(layer.locator(".sort-layer-key")).toBeVisible();
    await expect(layer.locator(".sort-layer-dir")).toBeVisible();
  });

  test("key dropdown has all five sort options", async ({ page }) => {
    await sortBtn(page).click();
    const options = await page.locator("#sort-modal .sort-layer").first().locator(".sort-layer-key option").allInnerTexts();
    expect(options).toEqual(["Name", "Role", "Level", "Timezone", "Location"]);
  });

  test("cancel button closes modal", async ({ page }) => {
    await sortBtn(page).click();
    await expect(page.locator("#sort-modal")).toBeVisible();
    await page.locator("#sort-modal-cancel").click();
    await expect(page.locator("#sort-modal")).not.toBeVisible();
  });

  test("clicking overlay closes modal", async ({ page }) => {
    await sortBtn(page).click();
    await expect(page.locator("#sort-modal")).toBeVisible();
    await page.locator("#sort-modal").click({ position: { x: 5, y: 5 } });
    await expect(page.locator("#sort-modal")).not.toBeVisible();
  });

  test("can add a third sort layer", async ({ page }) => {
    await sortBtn(page).click();
    // Default has 2 layers
    await expect(page.locator("#sort-modal .sort-layer")).toHaveCount(2);
    await page.locator("#sort-add-layer").click();
    const layers = page.locator("#sort-modal .sort-layer");
    await expect(layers).toHaveCount(3);
    // Third layer should have a different key from the first two
    const key1 = await layers.nth(0).locator(".sort-layer-key").inputValue();
    const key2 = await layers.nth(1).locator(".sort-layer-key").inputValue();
    const key3 = await layers.nth(2).locator(".sort-layer-key").inputValue();
    expect(key3).not.toEqual(key1);
    expect(key3).not.toEqual(key2);
  });

  test("can remove a sort layer", async ({ page }) => {
    await sortBtn(page).click();
    // Default has 2 layers
    await expect(page.locator("#sort-modal .sort-layer")).toHaveCount(2);
    await page.locator("#sort-modal .sort-layer-remove").first().click();
    await expect(page.locator("#sort-modal .sort-layer")).toHaveCount(1);
  });

  test("single layer has no remove button", async ({ page }) => {
    await sortBtn(page).click();
    // Default has 2 layers — remove one to get to 1
    await page.locator("#sort-modal .sort-layer-remove").first().click();
    await expect(page.locator("#sort-modal .sort-layer")).toHaveCount(1);
    await expect(page.locator("#sort-modal .sort-layer-remove")).toHaveCount(0);
  });

  test("toggling direction switches asc/desc", async ({ page }) => {
    await sortBtn(page).click();
    const dirBtn = page.locator("#sort-modal .sort-layer-dir").first();
    await expect(dirBtn).toHaveAttribute("data-dir", "asc");
    await dirBtn.click();
    await expect(dirBtn).toHaveAttribute("data-dir", "desc");
    await dirBtn.click();
    await expect(dirBtn).toHaveAttribute("data-dir", "asc");
  });

  test("apply sorts members by level then name (default)", async ({ page }) => {
    await sortBtn(page).click();
    // Default is Level asc + Name asc
    await page.locator("#sort-modal-apply").click();
    await expect(page.locator("#sort-modal")).not.toBeVisible();

    // Check team t1 members are sorted by level first, then name
    const team = page.locator('.team[data-team-id="t1"]');
    const levels = await team.locator("> .team-body .member-slot > .member-entry[data-member-type='employee'] .person-level").allInnerTexts();
    const numericLevels = levels.map((l) => parseInt(l.replace(/\D/g, ""), 10));
    const sortedLevels = [...numericLevels].sort((a, b) => a - b);
    expect(numericLevels).toEqual(sortedLevels);
  });

  test("apply sorts members by name ascending", async ({ page }) => {
    await sortBtn(page).click();
    // Change first layer to Name, remove second layer
    await page.locator("#sort-modal .sort-layer-key").first().selectOption("name");
    await page.locator("#sort-modal .sort-layer-remove").last().click();
    await page.locator("#sort-modal-apply").click();

    const team = page.locator('.team[data-team-id="t1"]');
    const members = await team.locator("> .team-body .member-slot > .member-entry[data-member-type='employee'] .person-name").allInnerTexts();
    const sorted = [...members].sort((a, b) => a.localeCompare(b));
    expect(members).toEqual(sorted);
  });

  test("add-layer button hidden when all keys used", async ({ page }) => {
    await sortBtn(page).click();
    // Default has 2 layers, add 3 more (5 total = all keys)
    for (let i = 0; i < 3; i++) {
      await page.locator("#sort-add-layer").click();
    }
    await expect(page.locator("#sort-modal .sort-layer")).toHaveCount(5);
    await expect(page.locator("#sort-add-layer")).not.toBeVisible();
  });

  test("multi-layer sort applies across all teams", async ({ page }) => {
    await sortBtn(page).click();
    // Change first layer to Role
    await page.locator("#sort-modal .sort-layer-key").first().selectOption("role");
    // Add second layer: Name
    await page.locator("#sort-add-layer").click();
    await page.locator("#sort-modal .sort-layer-key").nth(1).selectOption("name");
    await page.locator("#sort-modal-apply").click();

    // Both teams should be sorted by role first, then name
    for (const teamId of ["t1", "t2"]) {
      const team = page.locator(`.team[data-team-id="${teamId}"]`);
      const memberCount = await team.locator("> .team-body .member-slot > .member-entry[data-member-type='employee']").count();
      if (memberCount < 2) continue;
      const roles = await team.locator("> .team-body .member-slot > .member-entry[data-member-type='employee'] .person-role").allInnerTexts();
      const sortedRoles = [...roles].sort((a, b) => a.localeCompare(b));
      expect(roles).toEqual(sortedRoles);
    }
  });

  test("sort button shows active indicator after applying sort", async ({ page }) => {
    const btn = sortBtn(page);
    await expect(btn).not.toHaveClass(/is-active/);
    await btn.click();
    await page.locator("#sort-modal-apply").click();
    await expect(btn).toHaveClass(/is-active/);
  });

  test("sort is re-applied after drag-and-drop", async ({ page }) => {
    // Apply level + name sort (default)
    await sortBtn(page).click();
    await page.locator("#sort-modal-apply").click();

    const team = page.locator('.team[data-team-id="t1"]');

    // Drag an unassigned employee into t1 members area
    await dragAndDrop(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    // After drop, members should still be sorted by level then name
    const afterLevels = await team.locator("> .team-body .member-slot > .member-entry[data-member-type='employee'] .person-level").allInnerTexts();
    const numericLevels = afterLevels.map((l) => parseInt(l.replace(/\D/g, ""), 10));
    const sortedLevels = [...numericLevels].sort((a, b) => a - b);
    expect(numericLevels).toEqual(sortedLevels);
  });

  test("sort modal re-opens with previously applied layers", async ({ page }) => {
    // Apply a name-only sort
    await sortBtn(page).click();
    await page.locator("#sort-modal .sort-layer-key").first().selectOption("name");
    await page.locator("#sort-modal .sort-layer-remove").last().click();
    await page.locator("#sort-modal-apply").click();

    // Re-open modal — should show the saved layers
    await sortBtn(page).click();
    const layers = page.locator("#sort-modal .sort-layer");
    await expect(layers).toHaveCount(1);
    await expect(layers.nth(0).locator(".sort-layer-key")).toHaveValue("name");
  });

  test("clear sort removes active sort and indicator", async ({ page }) => {
    const btn = sortBtn(page);
    // Apply sort first
    await btn.click();
    await page.locator("#sort-modal-apply").click();
    await expect(btn).toHaveClass(/is-active/);

    // Re-open and clear
    await btn.click();
    await page.locator("#sort-modal-clear").click();
    await expect(page.locator("#sort-modal")).not.toBeVisible();
    await expect(btn).not.toHaveClass(/is-active/);
  });

  test("clear sort button is not shown when no sort is active", async ({ page }) => {
    await sortBtn(page).click();
    await expect(page.locator("#sort-modal-clear")).toHaveCount(0);
  });
});
