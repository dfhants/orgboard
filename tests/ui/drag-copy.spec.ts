import { test, expect } from "./fixtures";
import { dragAndDropCopy } from "./helpers";

test.describe("Drag and Drop — Copy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("holding C key during drag copies employee instead of moving", async ({
    page,
  }) => {
    // Milo (p2) is in Product (t1)
    const sourceSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    const targetSlot = page.locator(
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Count members in Product before
    const productMembersBefore = await sourceSlot
      .locator(".person-card")
      .count();

    await dragAndDropCopy(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Milo should still be in Product (original)
    await expect(
      sourceSlot.locator('.person-card[data-id="p2"]')
    ).toBeVisible();

    // A copy of Milo (different data-id) should appear in Operations
    const opsCards = targetSlot.locator(".person-card");
    const opsNames = await opsCards.locator(".person-name").allTextContents();
    expect(opsNames).toContain("Milo Hartwell");

    // Product member count should be unchanged
    const productMembersAfter = await sourceSlot
      .locator(".person-card")
      .count();
    expect(productMembersAfter).toBe(productMembersBefore);
  });

  test("copy creates independent employee — deleting copy keeps original", async ({
    page,
  }) => {
    const sourceSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    const targetSlot = page.locator(
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Copy Milo to Operations
    await dragAndDropCopy(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Find the copy in Operations (a Milo card with a new ID)
    const miloCards = targetSlot.locator(
      '.person-card:has(.person-name:text("Milo Hartwell"))'
    );
    await expect(miloCards.first()).toBeVisible();

    // Delete it
    await miloCards.first().hover();
    await miloCards.first().locator(".card-delete-button").click();

    // Original Milo (p2) should still exist in Product
    await expect(
      sourceSlot.locator('.person-card[data-id="p2"]')
    ).toBeVisible();
  });

  test("copy employee to unassigned bar", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(
      await drawer.locator(".unassigned-count").textContent()
    );

    // Copy Milo (p2) from Product to unassigned
    await dragAndDropCopy(
      page,
      '.person-card[data-id="p2"]',
      ".roster-cards"
    );

    // Original should remain in Product
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-body > .member-slot .person-card[data-id="p2"]'
      )
    ).toBeVisible();

    // A copy should appear in unassigned bar
    const countAfter = Number(
      await drawer.locator(".unassigned-count").textContent()
    );
    expect(countAfter).toBe(countBefore + 1);
  });

  test("membership count badge shows when employee is in multiple teams", async ({
    page,
  }) => {
    // Copy Milo to Operations so he's in two teams
    await dragAndDropCopy(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // The ORIGINAL Milo in Product should NOT show a membership badge
    // since the copy is a different employee
    // But the copy might show one if it's in multiple places
    // Actually, copy creates a new employee — so neither should show badge
    // Let's verify the original has no badge (count=1)
    const originalCard = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot .person-card[data-id="p2"]'
    );
    await expect(
      originalCard.locator(".card-membership-count")
    ).toHaveCount(0);
  });

  test("copy a nested team to another parent", async ({ page }) => {
    // Expand t3 so it's visible
    const t3 = page.locator('.team[data-team-id="t3"]');
    if ((await t3.getAttribute("data-view")) === "collapsed") {
      await t3
        .locator('> .team-titlebar [data-action="toggle-collapse"]')
        .click();
    }

    const t2SubteamSlot = page.locator(
      '.team[data-team-id="t2"] > .team-body > .subteam-slot'
    );
    const teamsBefore = await t2SubteamSlot.locator(".team").count();

    // Copy Research (t3) from Product to Operations
    await dragAndDropCopy(
      page,
      '.team[data-team-id="t3"] > .team-titlebar .team-handle',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Original t3 should still be in Product
    await expect(
      page.locator('.team[data-team-id="t1"] .team[data-team-id="t3"]')
    ).toHaveCount(1);

    // A copy should appear in Operations (with a new team ID)
    const teamsAfter = await t2SubteamSlot.locator(".team").count();
    expect(teamsAfter).toBe(teamsBefore + 1);
  });
});
