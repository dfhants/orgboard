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

  const deleteTeamButton = (page, id: string) =>
    page.locator(`.team[data-team-id="${id}"] > .team-titlebar [data-action="delete-team"]`);

  test("deleting a team with people asks first, then moves them to unassigned", async ({ page }) => {
    // Research (t3) is nested inside Product: manager p6, member p7
    await expect(page.locator('.team[data-team-id="t3"]')).toBeVisible();
    await deleteTeamButton(page, "t3").click();

    const modal = page.locator("#delete-team-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toHaveText("Delete Research?");
    await expect(modal.locator(".modal-body-text")).toContainText("2 people in it will move to Unassigned");
    // Nothing deleted yet
    await expect(page.locator('.team[data-team-id="t3"]')).toHaveCount(1);

    await modal.locator("#delete-team-confirm").click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.team[data-team-id="t3"]')).toHaveCount(0);
    await expect(page.locator('#unassigned-drawer .person-card[data-id="p6"]')).toHaveCount(1);
    await expect(page.locator('#unassigned-drawer .person-card[data-id="p7"]')).toHaveCount(1);
    await expect(page.locator(".unassigned-count")).toHaveText("4");
  });

  test("delete confirmation mentions sub-teams and everyone inside them", async ({ page }) => {
    // Operations (t2): Noah, Lena, plus sub-team Field with June
    await deleteTeamButton(page, "t2").click();
    const text = page.locator("#delete-team-modal .modal-body-text");
    await expect(text).toContainText("1 sub-team will be deleted too");
    await expect(text).toContainText("3 people in them will move to Unassigned");
  });

  test("cancel, Escape and backdrop all keep the team", async ({ page }) => {
    const modal = page.locator("#delete-team-modal");

    await deleteTeamButton(page, "t2").click();
    await modal.locator("#delete-team-cancel").click();
    await expect(modal).toHaveCount(0);

    await deleteTeamButton(page, "t2").click();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);

    await deleteTeamButton(page, "t2").click();
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);

    await expect(page.locator('.team[data-team-id="t2"]')).toHaveCount(1);
    await expect(page.locator('.team[data-team-id="t4"]')).toHaveCount(1);
  });

  test("an empty team is deleted without asking", async ({ page }) => {
    await page.locator('[data-action="add-root-team"]').click();
    const empty = page.locator(".root-dropzone > .team").last();
    const id = await empty.getAttribute("data-team-id");
    await deleteTeamButton(page, id!).click();
    await expect(page.locator("#delete-team-modal")).toHaveCount(0);
    await expect(page.locator(`.team[data-team-id="${id}"]`)).toHaveCount(0);
  });

  test("card button removes from a team but deletes from unassigned", async ({ page }) => {
    const inTeam = page.locator('.team[data-team-id="t1"] .person-card[data-id="p2"] .card-delete-button');
    await expect(inTeam).toHaveAttribute("title", "Remove from team (moves to Unassigned)");
    await expect(inTeam).toHaveClass(/card-remove-button/);
    await expect(inTeam.locator("svg")).toHaveAttribute("data-lucide", "user-minus");

    const unassigned = page.locator('#unassigned-drawer .person-card[data-id="p9"] .card-delete-button');
    await expect(unassigned).toHaveAttribute("title", "Delete person");
    await expect(unassigned).toHaveClass(/card-destroy-button/);
    await expect(unassigned.locator("svg")).toHaveAttribute("data-lucide", "trash-2");

    // Only the destructive one turns red on hover
    await page.locator('.team[data-team-id="t1"] .person-card[data-id="p2"]').hover();
    await inTeam.hover();
    await page.waitForTimeout(250);
    expect(await inTeam.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(79, 110, 247)");
    await page.locator('#unassigned-drawer .person-card[data-id="p9"]').hover();
    await unassigned.hover();
    await page.waitForTimeout(250);
    expect(await unassigned.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(220, 38, 38)");
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
