import { test as base, expect } from "@playwright/test";

/**
 * Landing page tests use a minimal fixture that clears IndexedDB
 * but does NOT auto-dismiss the landing page.
 */
const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto("/");
    await page.evaluate(() =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("teamboard");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      })
    );
    await use(page);
  },
});

test.describe("Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".landing-page");
  });

  test("shows landing page on first launch", async ({ page }) => {
    const landing = page.locator(".landing-page");
    await expect(landing).toBeVisible();
    await expect(page.locator(".landing-title")).toHaveText("Welcome to TeamBoard");
    await expect(page.locator(".landing-subtitle")).toContainText("How would you like to get started?");
  });

  test("has three option cards", async ({ page }) => {
    const cards = page.locator(".landing-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).locator(".landing-card-title")).toHaveText("Launch demo");
    await expect(cards.nth(1).locator(".landing-card-title")).toHaveText("Import from CSV");
    await expect(cards.nth(2).locator(".landing-card-title")).toHaveText("Start blank");
  });

  test("Launch demo loads sample data and shows board", async ({ page }) => {
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");

    // Landing page should be gone
    await expect(page.locator(".landing-page")).toHaveCount(0);

    // Should have default demo teams
    await expect(page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text')).toHaveText("Product");
    await expect(page.locator('.team[data-team-id="t2"] > .team-titlebar .team-name-text')).toHaveText("Operations");

    // Should have unassigned employees
    const rosterCards = page.locator(".roster-cards .person-card");
    await expect(rosterCards).toHaveCount(2);
  });

  test("Start blank shows empty board", async ({ page }) => {
    await page.locator('[data-landing-action="blank"]').click();

    // Landing page should be gone
    await expect(page.locator(".landing-page")).toHaveCount(0);

    // Board should have no teams
    await expect(page.locator(".team")).toHaveCount(0);

    // Unassigned bar should be empty
    await expect(page.locator(".roster-cards .person-card")).toHaveCount(0);

    // Root dropzone should be visible with empty state
    await expect(page.locator(".root-dropzone")).toBeVisible();
  });

  test("Import opens CSV import modal", async ({ page }) => {
    await page.locator('[data-landing-action="import"]').click();
    await expect(page.locator("#csv-import-modal")).toBeVisible();
    await expect(page.locator(".csv-import-panel .modal-title")).toHaveText("Import from CSV");
  });

  test("unassigned drawer is hidden on landing page", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    // Drawer should be hidden (display:none) or not present
    await expect(drawer).toBeHidden();
  });

  test("tabs are visible on landing page", async ({ page }) => {
    const tabs = page.locator(".scenario-tab");
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toContainText("Scenario 1");
  });

  test("plus tab shows landing page for new scenario", async ({ page }) => {
    // First dismiss landing with demo data
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");

    // Click + to create new tab
    await page.locator(".scenario-tab-add").click();

    // Landing page should appear for new scenario
    await expect(page.locator(".landing-page")).toBeVisible();
    await expect(page.locator(".scenario-tab")).toHaveCount(2);
  });

  test("landing page shows for uninitialized tab after switch", async ({ page }) => {
    // Dismiss landing with demo data
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");
    await page.waitForTimeout(500);

    // Create second tab (landing page appears)
    await page.locator(".scenario-tab-add").click();
    await expect(page.locator(".landing-page")).toBeVisible();

    // Switch to first tab (board should appear)
    await page.locator(".scenario-tab").first().click();
    await page.waitForSelector(".team");

    // Both tabs should still exist
    await expect(page.locator(".scenario-tab")).toHaveCount(2);

    // Switch back to second tab — should show landing again
    await page.locator(".scenario-tab").nth(1).click();
    await expect(page.locator(".landing-page")).toBeVisible();
  });
});

test.describe("CSV Import Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".landing-page");
    await page.locator('[data-landing-action="import"]').click();
    await page.waitForSelector("#csv-import-modal");
  });

  test("shows file picker step initially", async ({ page }) => {
    await expect(page.locator(".csv-file-label")).toBeVisible();
    const nextBtn = page.locator("#csv-import-next");
    await expect(nextBtn).toBeDisabled();
  });

  test("modal is fullscreen", async ({ page }) => {
    await expect(page.locator("#csv-import-modal")).toHaveClass(/modal-overlay-fullscreen/);
    await expect(page.locator(".csv-import-panel")).toHaveClass(/modal-panel-fullscreen/);
  });

  test("cancel closes modal", async ({ page }) => {
    await page.locator("#csv-import-cancel").click();
    await expect(page.locator("#csv-import-modal")).toHaveCount(0);
  });

  test("X button closes modal", async ({ page }) => {
    await page.locator("#csv-import-cancel-x").click();
    await expect(page.locator("#csv-import-modal")).toHaveCount(0);
  });

  test("loads CSV file and shows preview", async ({ page }) => {
    const csvContent = "Name,Role,Location,Timezone,Team\nAlice,Engineer,NYC,EST (UTC−5),Alpha\nBob,Designer,London,GMT (UTC+0),Alpha\nCharlie,PM,Tokyo,JST (UTC+9),Beta";

    // Upload CSV via file input
    const fileInput = page.locator("#csv-file-input");
    await fileInput.setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Preview should appear
    await expect(page.locator(".csv-preview-table")).toBeVisible();
    await expect(page.locator(".csv-file-name")).toContainText("test.csv");
    await expect(page.locator(".csv-file-name")).toContainText("3 rows");

    // Next button should be enabled
    await expect(page.locator("#csv-import-next")).toBeEnabled();
  });

  test("auto-maps columns from CSV headers", async ({ page }) => {
    const csvContent = "Name,Role,Location,Timezone,Team\nAlice,Engineer,NYC,EST (UTC−5),Alpha";

    await page.locator("#csv-file-input").setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Advance to mapping step
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Check auto-mapped values
    const nameSelect = page.locator('select[data-field="name"]');
    await expect(nameSelect).toHaveValue("0"); // "Name" is column 0

    const roleSelect = page.locator('select[data-field="role"]');
    await expect(roleSelect).toHaveValue("1"); // "Role" is column 1

    const teamSelect = page.locator('select[data-field="team"]');
    await expect(teamSelect).toHaveValue("4"); // "Team" is column 4
  });

  test("back button returns to file step", async ({ page }) => {
    const csvContent = "Name,Role\nAlice,Engineer";

    await page.locator("#csv-file-input").setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    await page.locator("#csv-import-back").click();
    await expect(page.locator('[data-csv-step="file"]')).toBeVisible();
    await expect(page.locator("#csv-mapping-step")).toBeHidden();
  });

  test("full import flow with team hierarchy mode", async ({ page }) => {
    const csvContent = "Name,Role,Location,Timezone,Team,Manager\nAlice,Lead,NYC,EST (UTC−5),Alpha,\nBob,Engineer,London,GMT (UTC+0),Alpha,Alice\nCharlie,Designer,Tokyo,JST (UTC+9),Beta,";

    await page.locator("#csv-file-input").setInputFiles({
      name: "team-data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Step 1 → Step 2 (mapping)
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Step 2 → Step 3 (load mode)
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Select team hierarchy (default)
    await expect(page.locator('input[value="team-hierarchy"]')).toBeChecked();

    // Import
    await page.locator("#csv-import-next").click();

    // Modal should close and board should show teams
    await expect(page.locator("#csv-import-modal")).toHaveCount(0);
    await expect(page.locator(".landing-page")).toHaveCount(0);

    // Should have teams created from CSV
    await expect(page.locator(".team")).toHaveCount(2);
    const teamNames = await page.locator(".team > .team-titlebar .team-name-text").allTextContents();
    expect(teamNames.sort()).toEqual(["Alpha", "Beta"]);
  });

  test("full import flow with unassigned mode", async ({ page }) => {
    const csvContent = "Name,Role\nAlice,Engineer\nBob,Designer";

    await page.locator("#csv-file-input").setInputFiles({
      name: "people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping → Mode
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();

    // Select unassigned mode
    await page.locator('input[value="unassigned"]').click();

    // Import
    await page.locator("#csv-import-next").click();

    // Should have no teams, people in unassigned
    await expect(page.locator(".team")).toHaveCount(0);
    const rosterCards = page.locator(".roster-cards .person-card");
    await expect(rosterCards).toHaveCount(2);
  });

  test("CSV with invalid data shows error", async ({ page }) => {
    const csvContent = "only-one-header";

    await page.locator("#csv-file-input").setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Should show error message
    await expect(page.locator(".csv-error")).toBeVisible();
    await expect(page.locator("#csv-import-next")).toBeDisabled();
  });
});

test.describe("CSV Import into Existing Scenario", () => {
  /**
   * Use the standard fixture (auto-dismisses landing) for these tests,
   * since we need an existing scenario with teams.
   */
  const stdTest = base.extend({
    page: async ({ page }, use) => {
      await page.goto("/");
      await page.evaluate(() =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase("teamboard");
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve();
        })
      );
      await page.goto("/");
      await page.locator('[data-landing-action="demo"]').click();
      await page.waitForSelector(".team");
      await page.waitForTimeout(500);
      await use(page);
    },
  });

  stdTest("import button is visible in toolbar", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
    await expect(page.locator("#import-csv-btn")).toBeVisible();
  });

  stdTest("import into existing only shows unassigned mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Click import button
    await page.locator("#import-csv-btn").click();
    await expect(page.locator("#csv-import-modal")).toBeVisible();

    const csvContent = "Name,Role\nNewPerson,Tester";
    await page.locator("#csv-file-input").setInputFiles({
      name: "extra.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Mapping → Import (skips mode step for existing scenario)
    await page.locator("#csv-import-next").click();

    // Modal should close
    await expect(page.locator("#csv-import-modal")).toHaveCount(0);

    // Person should appear in unassigned bar
    await expect(page.locator(".roster-cards").getByText("NewPerson")).toBeVisible();
  });

  stdTest("import into existing does not overwrite teams", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Count existing teams
    const teamsBefore = await page.locator(".team").count();

    // Import people
    await page.locator("#import-csv-btn").click();
    const csvContent = "Name,Role,Team\nAlpha Person,Dev,NewTeam";
    await page.locator("#csv-file-input").setInputFiles({
      name: "extra.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Mapping → Import (skips mode step for existing scenario)
    await page.locator("#csv-import-next").click();

    // Teams should be unchanged
    await expect(page.locator(".team")).toHaveCount(teamsBefore);

    // Person should be in unassigned
    await expect(page.locator(".roster-cards").getByText("Alpha Person")).toBeVisible();
  });
});
