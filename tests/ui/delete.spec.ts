import { test, expect } from "./fixtures";

test.describe("Delete", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("delete an employee via card delete button", async ({ page }) => {
    // Milo Hartwell (p2) is a member of Product team t1
    const card = page.locator('.person-card[data-id="p2"]');
    await expect(card).toBeVisible();

    // Hover to reveal actions, then click delete
    await card.hover();
    await card.locator(".card-delete-button").click();

    // Card should be gone from the entire page
    await expect(page.locator('.person-card[data-id="p2"]')).toHaveCount(0);
  });

  test("delete a team removes it from the board", async ({ page }) => {
    // Research team (t3) is nested inside Product
    const team = page.locator('.team[data-team-id="t3"]');
    await expect(team).toBeVisible();

    // Delete via team menu
    await page
      .locator('.team[data-team-id="t3"] [data-action="open-team-menu"]')
      .click();
    await page
      .locator('.team-menu-item[data-menu-action="delete"][data-team-id="t3"]')
      .click();

    // Team should be gone
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveCount(0);
  });

  test("deleting manager from manager slot empties the slot", async ({
    page,
  }) => {
    // Ava Richardson (p1) is manager of Product (t1)
    const managerCard = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot > .manager-slot .person-card'
    );
    await expect(managerCard).toBeVisible();
    await expect(managerCard.locator(".person-name")).toHaveText(
      "Ava Richardson"
    );

    await managerCard.hover();
    await managerCard.locator(".card-delete-button").click();

    // Manager slot should now have no person card
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-body > .member-slot > .manager-slot .person-card'
      )
    ).toHaveCount(0);
  });
});
