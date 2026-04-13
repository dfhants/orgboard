import { test, expect } from "./fixtures";

test.describe("Delete", () => {
  test("delete an employee from a team moves them to unassigned", async ({ page }) => {
    // Milo Hartwell (p2) is a member of Product team t1
    const card = page.locator('.team[data-team-id="t1"] .person-card[data-id="p2"]');
    await expect(card).toBeVisible();

    // Hover to reveal actions, then click delete
    await card.hover();
    await card.locator(".card-delete-button").click();

    // Card should be gone from the team
    await expect(page.locator('.team[data-team-id="t1"] .person-card[data-id="p2"]')).toHaveCount(0);

    // Card should now appear in the unassigned bar
    await expect(page.locator('#unassigned-drawer .person-card[data-id="p2"]')).toBeVisible();
  });

  test("delete an employee from unassigned removes them entirely", async ({ page }) => {
    // Eli Vasquez (p9) is in the unassigned bar
    const card = page.locator('#unassigned-drawer .person-card[data-id="p9"]');
    await expect(card).toBeVisible();

    await card.hover();
    await card.locator(".card-delete-button").click();

    // Card should be gone from the entire page
    await expect(page.locator('.person-card[data-id="p9"]')).toHaveCount(0);
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

    // Manager should be in the unassigned bar
    await expect(page.locator('#unassigned-drawer .person-card[data-id="p1"]')).toBeVisible();
  });
});
