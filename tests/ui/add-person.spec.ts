import { test, expect } from "./fixtures";

test.describe("Add Person", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("clicking add-person button opens the modal", async ({ page }) => {
    await page.locator("#add-person-btn").click();
    await expect(page.locator("#add-person-modal")).toBeVisible();
    await expect(page.locator(".modal-panel .modal-title")).toHaveText(
      "Add person"
    );
    await expect(page.locator("#ap-name")).toBeVisible();
    await expect(page.locator("#ap-role")).toBeVisible();
    await expect(page.locator("#ap-location")).toBeVisible();
    await expect(page.locator("#ap-timezone")).toBeVisible();
  });

  test("cancel button closes modal without adding person", async ({
    page,
  }) => {
    await page.locator("#add-person-btn").click();
    await expect(page.locator("#add-person-modal")).toBeVisible();

    const countBefore = await page
      .locator("#unassigned-drawer .unassigned-count")
      .textContent();

    await page.locator("#add-person-cancel").click();
    await expect(page.locator("#add-person-modal")).not.toBeVisible();

    // Count unchanged
    await expect(
      page.locator("#unassigned-drawer .unassigned-count")
    ).toHaveText(countBefore!);
  });

  test("clicking overlay closes modal without adding person", async ({
    page,
  }) => {
    await page.locator("#add-person-btn").click();
    await expect(page.locator("#add-person-modal")).toBeVisible();

    // Click the overlay background (not the panel) to close
    await page.locator("#add-person-modal").click({ position: { x: 5, y: 5 } });
    await expect(page.locator("#add-person-modal")).not.toBeVisible();
  });

  test("submitting a new person adds them to unassigned bar", async ({
    page,
  }) => {
    const countBefore = await page
      .locator("#unassigned-drawer .unassigned-count")
      .textContent();

    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Test Person");
    await page.locator("#ap-role").fill("Tester");
    await page.locator("#ap-location").fill("New York");
    await page.locator("#add-person-submit").click();

    // Modal closes
    await expect(page.locator("#add-person-modal")).not.toBeVisible();

    // New person appears in unassigned bar
    await expect(
      page.locator("#unassigned-drawer .person-card .person-name", {
        hasText: "Test Person",
      })
    ).toBeVisible();

    // Count incremented
    const countAfter = await page
      .locator("#unassigned-drawer .unassigned-count")
      .textContent();
    expect(Number(countAfter)).toBe(Number(countBefore) + 1);
  });

  test("submitting with empty name does not close modal", async ({ page }) => {
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("");
    await page.locator("#add-person-submit").click();

    // Modal stays open
    await expect(page.locator("#add-person-modal")).toBeVisible();
  });

  test("adding person with requested flag shows card-requested class", async ({
    page,
  }) => {
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Requested Hire");
    await page.locator("#ap-requested").check();
    await page.locator("#add-person-submit").click();

    const card = page.locator(
      '#unassigned-drawer .person-card:has(.person-name:text("Requested Hire"))'
    );
    await expect(card).toHaveClass(/card-requested/);
  });

  test("adding person with notes displays notes on card", async ({ page }) => {
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Notes Person");
    await page.locator("#ap-notes").fill("Prefers morning meetings");
    await page.locator("#add-person-submit").click();

    const card = page.locator(
      '#unassigned-drawer .person-card:has(.person-name:text("Notes Person"))'
    );
    await expect(card.locator(".card-notes")).toBeVisible();
    await expect(card.locator(".card-notes")).toContainText(
      "Prefers morning meetings"
    );
  });

  test("HTML in name is escaped, not rendered as markup", async ({ page }) => {
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill('<img src=x onerror="alert(1)">');
    await page.locator("#add-person-submit").click();

    // The text should be rendered literally, not as an element
    const card = page.locator("#unassigned-drawer .person-card").last();
    const nameText = await card.locator(".person-name").textContent();
    expect(nameText).toContain("<img");
    // No actual img element should exist inside the name
    await expect(card.locator(".person-name img")).toHaveCount(0);
  });

  test("add-person button is in the action bar", async ({ page }) => {
    await expect(page.locator(".action-bar #add-person-btn")).toBeVisible();
  });

  test("add-person button works when drawer is collapsed", async ({ page }) => {
    // Collapse the drawer
    await page.locator("#unassigned-drawer .drawer-chevron").click();
    await expect(page.locator("#unassigned-drawer")).toHaveClass(/is-collapsed/);

    // Button in the board header should still be visible and functional
    await expect(page.locator("#add-person-btn")).toBeVisible();
    await page.locator("#add-person-btn").click();
    await expect(page.locator("#add-person-modal")).toBeVisible();
  });
});
