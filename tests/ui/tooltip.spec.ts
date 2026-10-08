import { test, expect } from "./fixtures";

test.describe("Tooltips", () => {
  const tip = (page) => page.locator(".tooltip.is-visible");

  test("hovering an icon button shows its title in a styled tooltip", async ({ page }) => {
    const button = page.locator('.action-bar [data-action="zoom-fit"]');
    await button.hover();
    await expect(tip(page)).toHaveText("Fit board to screen");

    // Above the button, horizontally centred on it
    const [t, b] = await Promise.all([tip(page).boundingBox(), button.boundingBox()]);
    expect(t!.y + t!.height).toBeLessThanOrEqual(b!.y);
    expect(Math.abs(t!.x + t!.width / 2 - (b!.x + b!.width / 2))).toBeLessThanOrEqual(2);
  });

  test("the native title is suppressed while showing and restored after", async ({ page }) => {
    const button = page.locator('.action-bar [data-action="zoom-fit"]');
    await button.hover();
    await expect(tip(page)).toBeVisible();
    await expect(button).toHaveAttribute("title", "");

    await page.mouse.move(5, 300);
    await expect(tip(page)).toHaveCount(0);
    await expect(button).toHaveAttribute("title", "Fit board to screen");
  });

  test("tooltip flips below a control at the top of the window", async ({ page }) => {
    const button = page.locator("#export-db-btn");
    await button.hover();
    await expect(tip(page)).toHaveText("Export database");
    const [t, b] = await Promise.all([tip(page).boundingBox(), button.boundingBox()]);
    expect(t!.y).toBeGreaterThanOrEqual(b!.y + b!.height);
  });

  test("card and team option buttons have tooltips", async ({ page }) => {
    await page.locator('.person-card[data-id="p2"]').hover();
    await page.locator('.person-card[data-id="p2"] .card-edit-button').hover();
    await expect(tip(page)).toHaveText("Edit person");
    await page.locator('.person-card[data-id="p2"] .card-delete-button').hover();
    await expect(tip(page)).toHaveText("Remove from team (moves to Unassigned)");

    await page.locator('.team[data-team-id="t1"] > .team-titlebar [data-action="add-child-team"]').hover();
    await expect(tip(page)).toHaveText("Add sub-team");
    await page.locator('.team[data-team-id="t1"] > .team-titlebar [data-action="delete-team"]').hover();
    await expect(tip(page)).toHaveText("Delete team");
  });

  test("team name has a rename tooltip, and clicking it still starts editing", async ({ page }) => {
    const name = page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text');
    await name.hover();
    await expect(tip(page)).toHaveText("Click to rename");
    await name.click();
    await expect(tip(page)).toHaveCount(0);
    await expect(page.locator('.team[data-team-id="t1"] .team-name-input')).toBeFocused();
  });

  test("pressing the button dismisses the tooltip", async ({ page }) => {
    const button = page.locator('.action-bar [data-action="zoom-in"]');
    await button.hover();
    await expect(tip(page)).toBeVisible();
    await page.mouse.down();
    await expect(tip(page)).toHaveCount(0);
    await page.mouse.up();
  });

  test("hovering inside a team does not pop up the team's ribbon title", async ({ page }) => {
    const box = await page.locator('.team[data-team-id="t1"]').boundingBox();
    await page.mouse.move(box!.x + box!.width - 5, box!.y + box!.height - 5);
    await page.waitForTimeout(600);
    await expect(tip(page)).toHaveCount(0);
    await expect(page.locator('.team[data-team-id="t1"]')).toHaveAttribute("title", /timezone spread/);
  });

  test("every icon-only control on the board has a title", async ({ page }) => {
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll("button, a")]
        .filter((el) => (el.textContent || "").trim().length <= 1)
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => !el.getAttribute("title"))
        .map((el) => el.className));
    expect(missing).toEqual([]);
  });
});
