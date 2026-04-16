import { test, expect } from "./fixtures";

test.describe("Help Modal", () => {
  test("help button is visible in the action bar", async ({ page }) => {
    const helpBtn = page.locator('[data-action="open-help"]');
    await expect(helpBtn).toBeVisible();
    await expect(helpBtn).toHaveAttribute("title", "Help");
  });

  test("clicking help button opens the help modal", async ({ page }) => {
    await page.locator('[data-action="open-help"]').click();
    const modal = page.locator("#help-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toHaveText("How to use OrgBoard");
  });

  test("help modal contains all documentation sections", async ({ page }) => {
    await page.locator('[data-action="open-help"]').click();
    const modal = page.locator("#help-modal");
    await expect(modal).toBeVisible();

    const sections = modal.locator(".help-section h4");
    await expect(sections).toHaveCount(11);

    const headings = await sections.allTextContents();
    expect(headings.map(h => h.trim())).toEqual([
      "Getting Started",
      "People",
      "Teams",
      "Drag & Drop",
      "Layout & Zoom",
      "Scenarios & Tabs",
      "CSV Import",
      "Validation Checks",
      "Hierarchy View",
      "Stats & Notes",
      "Data & Privacy",
    ]);
  });

  test("close button dismisses the help modal", async ({ page }) => {
    await page.locator('[data-action="open-help"]').click();
    await expect(page.locator("#help-modal")).toBeVisible();

    await page.locator("#help-modal-close").click();
    await expect(page.locator("#help-modal")).not.toBeVisible();
  });

  test("help modal is fullscreen styled", async ({ page }) => {
    await page.locator('[data-action="open-help"]').click();
    const modal = page.locator("#help-modal");
    await expect(modal).toHaveClass(/modal-overlay-fullscreen/);
    await expect(modal.locator(".modal-panel-fullscreen")).toBeVisible();
  });
});
