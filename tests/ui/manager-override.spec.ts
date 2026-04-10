import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Manager Override", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("clicking split button opens manager picker modal", async ({
    page,
  }) => {
    // Milo (p2) is a member of Product (t1)
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    const modal = page.locator("#manager-override-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".manager-pick-list")).toBeVisible();
    // Should show available managers
    await expect(
      modal.locator(".manager-pick-item").first()
    ).toBeVisible();
  });

  test("selecting a manager applies override pill to card", async ({
    page,
  }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    // Pick a different manager (Noah from Operations — first item, own team manager is excluded)
    const modal = page.locator("#manager-override-modal");
    await modal.locator(".manager-pick-item").nth(0).click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Card should now show a manager-override-pill with split icon
    const pill = page.locator('.person-card[data-id="p2"] .manager-override-pill');
    await expect(pill).toBeVisible();
    await expect(pill.locator('[data-lucide="split"]')).toBeAttached();
  });

  test("cancel button on picker closes without applying override", async ({
    page,
  }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    await expect(page.locator("#manager-override-modal")).toBeVisible();

    await page.locator("#manager-override-cancel").click();
    await expect(page.locator("#manager-override-modal")).not.toBeVisible();

    // No override pill should appear
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toHaveCount(0);
  });

  test("merge button removes an existing override", async ({ page }) => {
    // First, set an override on Milo
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();
    await page
      .locator("#manager-override-modal .manager-pick-item")
      .nth(0)
      .click();

    // Confirm override exists
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();

    // Now click the merge button to reset
    const updatedCard = page.locator('.person-card[data-id="p2"]');
    await updatedCard.hover();
    await updatedCard.locator(".card-merge-button").click();

    // Override pill should be gone
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toHaveCount(0);
  });

  test("deleting overridden manager auto-removes override from card", async ({
    page,
  }) => {
    // Set an override on Milo to Noah (first item — own team manager excluded)
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();
    await page
      .locator("#manager-override-modal .manager-pick-item")
      .nth(0)
      .click();

    // Confirm override exists
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();

    // Get the manager name from the override pill
    const pillText = await page
      .locator('.person-card[data-id="p2"] .manager-override-pill')
      .textContent();

    // Find and delete that manager
    // Noah (p4) is Operations manager — delete him
    const noahCard = page.locator('.person-card[data-id="p4"]');
    await noahCard.hover();
    await noahCard.locator('[data-action="delete-employee"]').click();

    // After deletion, Milo's override should be auto-cleaned
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toHaveCount(0);
  });

  test("picker modal excludes the team's own manager", async ({ page }) => {
    // Milo (p2) is in Product (t1), managed by Ava (p1)
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    const modal = page.locator("#manager-override-modal");
    await expect(modal).toBeVisible();

    // Ava (p1) is the Product team manager — she should NOT appear
    await expect(
      modal.locator('.manager-pick-item[data-manager-id="p1"]')
    ).toHaveCount(0);

    // Other managers should still appear
    await expect(
      modal.locator('.manager-pick-item[data-manager-id="p4"]')
    ).toBeVisible(); // Noah
    await expect(
      modal.locator('.manager-pick-item[data-manager-id="p6"]')
    ).toBeVisible(); // Iris
  });

  test("selecting first listed manager immediately shows override pill", async ({
    page,
  }) => {
    // Regression: previously, the first item was the team's own manager,
    // and selecting it silently did nothing due to cleanupManagerOverrides.
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    const modal = page.locator("#manager-override-modal");
    await modal.locator(".manager-pick-item").first().click();

    // Override pill must appear immediately
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();
  });

  test("tree popover override updates the main board card", async ({
    page,
  }) => {
    // Open hierarchy modal
    await page.locator('[data-action="view-hierarchy"]').click();
    const modal = page.locator("#hierarchy-modal");
    await expect(modal).toBeVisible();

    // Enter edit mode
    await modal.locator('[data-action="toggle-tree-edit"]').click();

    // Click Milo's tree node to open override popover
    await page
      .locator(
        '[data-tree-click="member"][data-employee-id="p2"]'
      )
      .click();

    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();

    // Team's own manager (Ava/p1) should not appear in popover
    await expect(
      popover.locator('[data-tree-assign="p1"]')
    ).toHaveCount(0);

    // Pick first available manager
    await popover
      .locator(".tree-popover-item:not(.tree-popover-reset)")
      .first()
      .click();

    // Close the hierarchy modal
    await page.locator("#hierarchy-modal-close").click();
    await expect(modal).not.toBeVisible();

    // The main board card should already show the override pill
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();
  });

  test("manager card shows split button for setting override", async ({
    page,
  }) => {
    // Ava (p1) is the manager of Product (t1) — her card should have a split button
    const card = page.locator('.person-card[data-id="p1"]');
    await card.hover();
    await expect(card.locator(".card-split-button")).toBeVisible();
  });

  test("manager can set their own override via split button", async ({
    page,
  }) => {
    // Ava (p1) is the manager of Product (t1) — set an override for her
    const card = page.locator('.person-card[data-id="p1"]');
    await card.hover();
    await card.locator(".card-split-button").click();

    const modal = page.locator("#manager-override-modal");
    await expect(modal).toBeVisible();

    // Should not list Ava herself
    await expect(
      modal.locator('.manager-pick-item[data-manager-id="p1"]')
    ).toHaveCount(0);

    // Pick the first available manager
    await modal.locator(".manager-pick-item").first().click();
    await expect(modal).not.toBeVisible();

    // Manager card should show override pill
    await expect(
      page.locator('.person-card[data-id="p1"] .manager-override-pill')
    ).toBeVisible();
  });

  test("manager override pill can be reset via merge button", async ({
    page,
  }) => {
    // Set an override on Ava (p1)
    const card = page.locator('.person-card[data-id="p1"]');
    await card.hover();
    await card.locator(".card-split-button").click();
    await page
      .locator("#manager-override-modal .manager-pick-item")
      .first()
      .click();

    await expect(
      page.locator('.person-card[data-id="p1"] .manager-override-pill')
    ).toBeVisible();

    // Reset it
    const updated = page.locator('.person-card[data-id="p1"]');
    await updated.hover();
    await updated.locator(".card-merge-button").click();

    await expect(
      page.locator('.person-card[data-id="p1"] .manager-override-pill')
    ).toHaveCount(0);
  });

  test("member override survives drag to manager slot", async ({ page }) => {
    // Set override on Milo (p2) in Product (t1)
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator(".card-split-button").click();
    await page
      .locator("#manager-override-modal .manager-pick-item")
      .first()
      .click();

    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();

    // Delete Ava (p1) from the manager slot to make room
    const avaCard = page.locator('.person-card[data-id="p1"]');
    await avaCard.hover();
    await avaCard.locator('[data-action="delete-employee"]').click();

    // Drag Milo to the now-empty manager slot of Product
    await dragAndDrop(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t1"] .manager-slot'
    );

    // Milo is now the manager — override pill should survive
    await expect(
      page.locator('.person-card[data-id="p2"] .manager-override-pill')
    ).toBeVisible();
  });
});
