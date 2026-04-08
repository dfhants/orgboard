import { test, expect } from "./fixtures";

test.describe("Edit Person", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("clicking edit button opens modal pre-filled with employee data", async ({
    page,
  }) => {
    // Hover over Milo (p2) to reveal actions
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toHaveText("Edit person");

    // Fields should be pre-filled with Milo's data
    await expect(modal.locator("#ep-name")).toHaveValue("Milo Hartwell");
    await expect(modal.locator("#ep-role")).toHaveValue("Senior Engineer");
    await expect(modal.locator("#ep-location")).toHaveValue("London, UK");
    await expect(modal.locator("#ep-timezone")).toHaveValue("GMT (UTC+0)");
  });

  test("saving edits updates the person card", async ({ page }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    await modal.locator("#ep-name").fill("Milo Updated");
    await modal.locator("#ep-role").fill("Staff Engineer");
    await modal.locator("#edit-person-submit").click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Card should show updated name and role
    const updatedCard = page.locator('.person-card[data-id="p2"]');
    await expect(updatedCard.locator(".person-name")).toContainText(
      "Milo Updated"
    );
    await expect(updatedCard.locator(".person-role")).toContainText(
      "Staff Engineer"
    );
  });

  test("cancel button closes modal without saving changes", async ({
    page,
  }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    await modal.locator("#ep-name").fill("Should Not Save");
    await modal.locator("#edit-person-cancel").click();

    // Modal should close
    await expect(modal).not.toBeVisible();

    // Name should remain unchanged
    await expect(
      page.locator('.person-card[data-id="p2"] .person-name')
    ).toContainText("Milo Hartwell");
  });

  test("clicking overlay closes modal without saving", async ({ page }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    await expect(modal).toBeVisible();

    await modal.locator("#ep-name").fill("Should Not Save");
    // Click the overlay (not the panel)
    await modal.click({ position: { x: 5, y: 5 } });

    await expect(modal).not.toBeVisible();
    await expect(
      page.locator('.person-card[data-id="p2"] .person-name')
    ).toContainText("Milo Hartwell");
  });

  test("submitting with empty name does not close modal", async ({ page }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    await modal.locator("#ep-name").fill("");
    await modal.locator("#edit-person-submit").click();

    // Modal stays open
    await expect(modal).toBeVisible();
  });

  test("editing timezone updates card background color", async ({ page }) => {
    const card = page.locator('.person-card[data-id="p2"]');
    const colorBefore = await card.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    await card.hover();
    await card.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    // Change timezone to something different
    await modal.locator("#ep-timezone").selectOption("JST (UTC+9)");
    await modal.locator("#edit-person-submit").click();

    const colorAfter = await page
      .locator('.person-card[data-id="p2"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(colorAfter).not.toBe(colorBefore);
  });

  test("requested checkbox state is preserved on edit", async ({ page }) => {
    // Add a person with requested checked
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Requested Person");
    await page.locator("#ap-requested").check();
    await page.locator("#add-person-submit").click();

    // Find the new card in unassigned bar
    const newCard = page.locator(
      '#unassigned-drawer .person-card:has(.person-name:text("Requested Person"))'
    );
    await expect(newCard).toHaveClass(/card-requested/);

    // Edit the person
    await newCard.hover();
    await newCard.locator('[data-action="edit-employee"]').click();

    const modal = page.locator("#edit-person-modal");
    // Requested checkbox should be checked
    await expect(modal.locator("#ep-requested")).toBeChecked();

    // Save without changes
    await modal.locator("#edit-person-submit").click();
    // Card should still have requested class
    await expect(
      page.locator(
        '#unassigned-drawer .person-card:has(.person-name:text("Requested Person"))'
      )
    ).toHaveClass(/card-requested/);
  });
});
