import { test, expect } from "./fixtures";

test.describe("Scenario Tabs", () => {
  test("default single tab on fresh load", async ({ page }) => {
    const tabs = page.locator(".scenario-tab");
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveClass(/is-active/);
    await expect(tabs.first().locator(".scenario-tab-name")).toContainText("Scenario 1");
  });

  test("single tab has no close button", async ({ page }) => {
    const tab = page.locator(".scenario-tab").first();
    await expect(tab.locator(".scenario-tab-close")).toHaveCount(0);
  });

  test("plus button creates a new scenario tab", async ({ page }) => {
    await page.locator(".scenario-tab-add").click();

    const tabs = page.locator(".scenario-tab");
    await expect(tabs).toHaveCount(2);

    // New tab should be active
    await expect(tabs.nth(1)).toHaveClass(/is-active/);
    await expect(tabs.nth(1).locator(".scenario-tab-name")).toContainText("Scenario 2");

    // Original tab should not be active
    await expect(tabs.first()).not.toHaveClass(/is-active/);
  });

  test("switching tabs loads different state", async ({ page }) => {
    // Rename team in first scenario
    const teamName = page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text');
    await teamName.click();
    const input = page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-input');
    await input.fill("First Scenario Team");
    await input.press("Enter");
    await page.waitForTimeout(100);

    // Create second scenario — landing page appears
    await page.locator(".scenario-tab-add").click();
    await page.waitForSelector(".landing-page");
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");

    // Second scenario should have default team name
    await expect(
      page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text')
    ).toHaveText("Product");

    // Switch back to first scenario
    await page.locator(".scenario-tab").first().click();
    await page.waitForSelector(".team");

    // Should have renamed team
    await expect(
      page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text')
    ).toHaveText("First Scenario Team");
  });

  test("tab can be renamed by clicking the name", async ({ page }) => {
    const tabName = page.locator(".scenario-tab-name").first();
    await tabName.click();

    const tabInput = page.locator(".scenario-tab-input");
    await expect(tabInput).toBeVisible();
    await tabInput.fill("My Custom Scenario");
    await tabInput.press("Enter");

    await expect(page.locator(".scenario-tab-name").first()).toHaveText("My Custom Scenario");
  });

  test("tab rename persists after reload", async ({ page }) => {
    const tabName = page.locator(".scenario-tab-name").first();
    await tabName.click();

    const tabInput = page.locator(".scenario-tab-input");
    await tabInput.fill("Persistent Tab Name");
    await tabInput.press("Enter");
    await page.waitForTimeout(350);

    await page.reload();
    await page.waitForSelector(".team");

    await expect(page.locator(".scenario-tab-name").first()).toHaveText("Persistent Tab Name");
  });

  test("close tab removes it and switches to another", async ({ page }) => {
    // Create second scenario
    await page.locator(".scenario-tab-add").click();
    await expect(page.locator(".scenario-tab")).toHaveCount(2);

    // Both tabs should now have close buttons
    await expect(page.locator(".scenario-tab-close")).toHaveCount(2);

    // Close the second tab (active)
    page.on("dialog", (dialog) => dialog.accept());
    await page.locator(".scenario-tab-close").last().click();

    await expect(page.locator(".scenario-tab")).toHaveCount(1);
    await expect(page.locator(".scenario-tab").first()).toHaveClass(/is-active/);
  });

  test("all tabs survive page reload", async ({ page }) => {
    // Create two more scenarios — dismiss landing each time
    await page.locator(".scenario-tab-add").click();
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");
    await page.locator(".scenario-tab-add").click();
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");
    await expect(page.locator(".scenario-tab")).toHaveCount(3);
    await page.waitForTimeout(350);

    // Reload
    await page.reload();
    await page.waitForSelector(".team");

    // All 3 tabs should be restored
    await expect(page.locator(".scenario-tab")).toHaveCount(3);
  });

  test("active tab is restored after reload", async ({ page }) => {
    // Create second scenario — dismiss landing
    await page.locator(".scenario-tab-add").click();
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");
    await expect(page.locator(".scenario-tab")).toHaveCount(2);

    // Switch to first tab
    await page.locator(".scenario-tab").first().click();
    await page.waitForSelector(".team");
    // Wait for IDB flush (300ms debounce + async write)
    await page.waitForTimeout(350);

    // Reload
    await page.reload();
    await page.waitForSelector(".team");

    // First tab should be active
    await expect(page.locator(".scenario-tab").first()).toHaveClass(/is-active/);
  });

  test("each scenario has independent notes", async ({ page }) => {
    // Open notes and type in first scenario
    await page.locator('[data-action="toggle-notes-panel"]').first().click();
    await page.locator("#notes-textarea").fill("Notes for scenario 1");

    // Create second scenario — dismiss landing
    await page.locator(".scenario-tab-add").click();
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");

    // Notes panel should be closed in new scenario — open it
    await page.locator('[data-action="toggle-notes-panel"]').first().click();
    await expect(page.locator("#notes-textarea")).toHaveValue("");

    // Type different notes
    await page.locator("#notes-textarea").fill("Notes for scenario 2");

    // Switch back to first scenario
    await page.locator(".scenario-tab").first().click();
    await page.waitForSelector(".team");

    // First scenario had notes panel open (saved in state) — should still be open
    await expect(page.locator("#notes-textarea")).toHaveValue("Notes for scenario 1");
  });

  test("plus button is always visible at end of tab strip", async ({ page }) => {
    await expect(page.locator(".scenario-tab-add")).toBeVisible();

    // Add a tab
    await page.locator(".scenario-tab-add").click();
    await expect(page.locator(".scenario-tab-add")).toBeVisible();
  });
});
