import { test, expect } from "./fixtures";

test.describe("Notes Panel", () => {
  test("collapsed sidebar shows Notes strip with label", async ({ page }) => {
    const panel = page.locator("#stats-panel");
    await expect(panel).toBeVisible();
    const strip = panel.locator(".notes-strip");
    await expect(strip).toBeVisible();
    await expect(strip.locator(".stats-panel-strip-label")).toHaveText("NOTES");
  });

  test("clicking Notes strip opens the notes tab", async ({ page }) => {
    await page.click(".notes-strip");
    const panel = page.locator("#stats-panel");
    await expect(panel).toHaveClass(/is-open/);
    await expect(panel.locator(".stats-panel-tab.is-active")).toHaveText("Notes");
  });

  test("clicking close button collapses the panel", async ({ page }) => {
    await page.click(".notes-strip");
    await expect(page.locator("#stats-panel")).toHaveClass(/is-open/);
    await page.click('[data-action="close-right-panel"]');
    await expect(page.locator("#stats-panel")).not.toHaveClass(/is-open/);
  });

  test("textarea is visible when notes tab is open", async ({ page }) => {
    await page.click(".notes-strip");
    const textarea = page.locator("#notes-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute("placeholder", "Type scenario notes here…");
  });

  test("typing notes persists across close and reopen", async ({ page }) => {
    await page.click(".notes-strip");
    await page.fill("#notes-textarea", "Sprint planning notes");
    await page.click('[data-action="close-right-panel"]');
    await expect(page.locator("#stats-panel")).not.toHaveClass(/is-open/);

    // Reopen
    await page.click(".notes-strip");
    await expect(page.locator("#notes-textarea")).toHaveValue("Sprint planning notes");
  });

  test("copy button visible in expanded notes tab", async ({ page }) => {
    await page.click(".notes-strip");
    await expect(page.locator('[data-action="copy-notes"]')).toBeVisible();
  });

  test("no copy button visible when panel is collapsed", async ({ page }) => {
    await expect(page.locator('[data-action="copy-notes"]')).toHaveCount(0);
  });

  test("copy button copies notes to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.click(".notes-strip");
    await page.fill("#notes-textarea", "Copy me");
    await page.click('[data-action="copy-notes"]');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe("Copy me");
  });

  test("switching from Stats to Notes tab preserves panel open", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(page.locator(".stats-panel-tab.is-active")).toHaveText("Stats");
    await page.click('[data-action="switch-to-notes"]');
    await expect(page.locator(".stats-panel-tab.is-active")).toHaveText("Notes");
    await expect(page.locator("#notes-textarea")).toBeVisible();
  });

  test("no left margin on page-shell (notes panel moved to right)", async ({ page }) => {
    const marginLeft = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".page-shell")!).marginLeft
    );
    expect(marginLeft).toBe("0px");
  });

  test("unassigned bar has no left offset", async ({ page }) => {
    const leftEdge = await page.evaluate(() =>
      document.querySelector(".unassigned-bar")!.getBoundingClientRect().left
    );
    expect(leftEdge).toBe(0);
  });
});
