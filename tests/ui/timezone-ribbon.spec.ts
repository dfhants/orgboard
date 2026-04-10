import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Timezone Spread Ribbon", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("each team has a data-tz-gap attribute", async ({ page }) => {
    const teams = page.locator(".team");
    const count = await teams.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(teams.nth(i)).toHaveAttribute("data-tz-gap", /.*/);
    }
  });

  test("Product team (t1) has red ribbon (18h gap)", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    await expect(team).toHaveAttribute("data-tz-gap", "18");
    // Red ribbon color
    const ribbonColor = await team.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(ribbonColor).toBe("#f87171");
  });

  test("Operations team (t2) has amber ribbon (7h gap)", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t2"]');
    await expect(team).toHaveAttribute("data-tz-gap", "7");
    const ribbonColor = await team.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(ribbonColor).toBe("#fbbf24");
  });

  test("Research team (t3) has green ribbon (1h gap)", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t3"]');
    await expect(team).toHaveAttribute("data-tz-gap", "1");
    const ribbonColor = await team.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(ribbonColor).toBe("#34d399");
  });

  test("Field team (t4) has green ribbon (0h gap, single employee)", async ({
    page,
  }) => {
    const team = page.locator('.team[data-team-id="t4"]');
    await expect(team).toHaveAttribute("data-tz-gap", "0");
    const ribbonColor = await team.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(ribbonColor).toBe("#34d399");
  });

  test("ribbon pseudo-element uses --ribbon-color", async ({ page }) => {
    const ribbonBg = await page
      .locator('.team[data-team-id="t2"]')
      .evaluate((el) => getComputedStyle(el, "::before").background);
    // Should contain the amber color
    expect(ribbonBg).toContain("rgb(251, 191, 36)"); // #fbbf24
  });

  test("ribbon updates after moving employee to change timezone gap", async ({
    page,
  }) => {
    // Field (t4) currently has gap=0 (just p8 CST/-6, green ribbon).
    // Move p9 (BRT, UTC-3) from unassigned into Field.
    // New gap: -6 to -3 = 3h, still green.
    const fieldBefore = await page
      .locator('.team[data-team-id="t4"]')
      .getAttribute("data-tz-gap");
    expect(fieldBefore).toBe("0");

    await dragAndDrop(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    const fieldAfter = await page
      .locator('.team[data-team-id="t4"]')
      .getAttribute("data-tz-gap");
    expect(fieldAfter).toBe("3");

    const ribbonColor = await page
      .locator('.team[data-team-id="t4"]')
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
      );
    expect(ribbonColor).toBe("#34d399"); // still green
  });

  test("team title shows timezone spread tooltip", async ({ page }) => {
    const title = await page
      .locator('.team[data-team-id="t1"]')
      .getAttribute("title");
    expect(title).toBe("18h timezone spread");
  });

  test("no data-check-status attribute by default (no checks active)", async ({
    page,
  }) => {
    const teams = page.locator(".team");
    const count = await teams.count();
    for (let i = 0; i < count; i++) {
      await expect(teams.nth(i)).not.toHaveAttribute("data-check-status");
    }
  });
});

test.describe("Check-Status Ribbon", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  async function addHasManagerCheck(page: import("@playwright/test").Page) {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");
    // Close the panel to trigger a re-render with ribbons
    await page.click('[data-action="close-right-panel"]');
  }

  test("adding has-manager check turns ribbons green/red", async ({
    page,
  }) => {
    await addHasManagerCheck(page);

    // Product (t1) has manager (p1) → green
    const t1 = page.locator('.team[data-team-id="t1"]');
    await expect(t1).toHaveAttribute("data-check-status", "pass");
    const t1Color = await t1.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(t1Color).toBe("#34d399");

    // Field (t4) has no manager → red
    const t4 = page.locator('.team[data-team-id="t4"]');
    await expect(t4).toHaveAttribute("data-check-status", "fail");
    const t4Color = await t4.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(t4Color).toBe("#f87171");
  });

  test("mixed checks produce amber ribbon", async ({ page }) => {
    // Add has-manager check (Field t4 fails)
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();

    // Also add timezone-gap with max 1h (will fail for teams with > 1h spread)
    await page
      .locator('.check-type-card[data-type="timezone-gap"]')
      .click();
    const tzInst = page.locator(
      '.check-instance[data-type="timezone-gap"]'
    );
    await tzInst.locator('[data-cr="maxHours"]').fill("1");

    await page.click("#criterion-submit");
    await page.click('[data-action="close-right-panel"]');

    // Research (t3): has manager ✓, 1h gap ✓ → pass (green)
    const t3 = page.locator('.team[data-team-id="t3"]');
    await expect(t3).toHaveAttribute("data-check-status", "pass");

    // Operations (t2): has manager ✓, 7h gap ✗ → mixed (amber)
    const t2 = page.locator('.team[data-team-id="t2"]');
    await expect(t2).toHaveAttribute("data-check-status", "mixed");
    const t2Color = await t2.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(t2Color).toBe("#fbbf24");
  });

  test("disabling all checks falls back to timezone ribbon", async ({
    page,
  }) => {
    await addHasManagerCheck(page);

    // Verify check-status is active
    await expect(
      page.locator('.team[data-team-id="t4"]')
    ).toHaveAttribute("data-check-status", "fail");

    // Disable the check via the panel
    await page.click(".checks-strip");
    await page.click(
      '.check-card [data-action="toggle-criterion"]'
    );
    await page.click('[data-action="close-right-panel"]');

    // Now all teams should no longer have data-check-status
    const teams = page.locator(".team");
    const count = await teams.count();
    for (let i = 0; i < count; i++) {
      await expect(teams.nth(i)).not.toHaveAttribute("data-check-status");
    }

    // Field (t4) should show timezone spread ribbon again (green, 0h gap)
    const t4Color = await page
      .locator('.team[data-team-id="t4"]')
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
      );
    expect(t4Color).toBe("#34d399");
  });

  test("tooltip shows check summary when checks active", async ({
    page,
  }) => {
    await addHasManagerCheck(page);

    // Product (t1) has manager → all pass
    const t1Title = await page
      .locator('.team[data-team-id="t1"]')
      .getAttribute("title");
    expect(t1Title).toContain("1/1 checks passing");

    // Field (t4) no manager → fail listed
    const t4Title = await page
      .locator('.team[data-team-id="t4"]')
      .getAttribute("title");
    expect(t4Title).toContain("0/1 checks passing");
    expect(t4Title).toContain("\u2717");
  });
});

test.describe("Pin to Ribbon", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  async function addTwoChecks(page: import("@playwright/test").Page) {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    // Add has-manager check
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    // Add timezone-gap check (max 1h ⇒ most teams fail)
    await page
      .locator('.check-type-card[data-type="timezone-gap"]')
      .click();
    const tzInst = page.locator(
      '.check-instance[data-type="timezone-gap"]'
    );
    await tzInst.locator('[data-cr="maxHours"]').fill("1");
    await page.click("#criterion-submit");
  }

  test("pin button appears on each check card", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    const pinBtn = page.locator('[data-action="pin-criterion"]');
    await expect(pinBtn).toHaveCount(1);
    await expect(pinBtn).toHaveAttribute("title", "Pin to ribbon");
  });

  test("clicking pin toggles pinned state", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    const pinBtn = page.locator('[data-action="pin-criterion"]');

    // Initially unpinned
    await expect(pinBtn).not.toHaveClass(/is-pinned/);
    await expect(pinBtn).toHaveAttribute("title", "Pin to ribbon");

    // Click to pin
    await pinBtn.click();
    const pinBtnAfter = page.locator('[data-action="pin-criterion"]');
    await expect(pinBtnAfter).toHaveClass(/is-pinned/);
    await expect(pinBtnAfter).toHaveAttribute("title", "Unpin from ribbon");
  });

  test("pinning a check filters ribbon to only that check", async ({
    page,
  }) => {
    await addTwoChecks(page);

    // Before pinning: Operations (t2) has-manager ✓ + tz-gap ✗ → mixed
    await page.click('[data-action="close-right-panel"]');
    const t2 = page.locator('.team[data-team-id="t2"]');
    await expect(t2).toHaveAttribute("data-check-status", "mixed");

    // Pin only has-manager check (first card)
    await page.click(".checks-strip");
    const pinBtns = page.locator('[data-action="pin-criterion"]');
    await pinBtns.first().click();
    await page.click('[data-action="close-right-panel"]');

    // Now ribbon should only reflect has-manager: t2 has manager → pass
    await expect(t2).toHaveAttribute("data-check-status", "pass");
    const t2Color = await t2.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ribbon-color").trim()
    );
    expect(t2Color).toBe("#34d399");

    // Field (t4) has no manager → still fail
    const t4 = page.locator('.team[data-team-id="t4"]');
    await expect(t4).toHaveAttribute("data-check-status", "fail");
  });

  test("unpinning all checks reverts to all-enabled-checks behavior", async ({
    page,
  }) => {
    await addTwoChecks(page);

    // Pin first check
    const pinBtns = page.locator('[data-action="pin-criterion"]');
    await pinBtns.first().click();

    // Verify Operations is pass (only has-manager)
    await page.click('[data-action="close-right-panel"]');
    await expect(
      page.locator('.team[data-team-id="t2"]')
    ).toHaveAttribute("data-check-status", "pass");

    // Unpin it
    await page.click(".checks-strip");
    await page.locator('[data-action="pin-criterion"]').first().click();
    await page.click('[data-action="close-right-panel"]');

    // Now both checks drive the ribbon again: t2 → mixed
    await expect(
      page.locator('.team[data-team-id="t2"]')
    ).toHaveAttribute("data-check-status", "mixed");
  });

  test("pin state persists after page reload", async ({ page }) => {
    await page.click(".checks-strip");
    await page.click(".checks-add-button");
    await page.locator('.check-type-card[data-type="has-manager"]').click();
    await page.click("#criterion-submit");

    // Pin the check
    await page.locator('[data-action="pin-criterion"]').click();
    await expect(
      page.locator('[data-action="pin-criterion"]')
    ).toHaveClass(/is-pinned/);

    // Close panel, wait for debounced save, then reload
    await page.click('[data-action="close-right-panel"]');
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector(".team");

    // Open checks panel — the check should still be pinned
    await page.click(".checks-strip");
    await expect(
      page.locator('[data-action="pin-criterion"]')
    ).toHaveClass(/is-pinned/);
  });
});
