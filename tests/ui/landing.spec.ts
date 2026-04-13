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
        const req = indexedDB.deleteDatabase("orgboard");
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
    await expect(page.locator(".landing-title")).toHaveText("Welcome to OrgBoard");
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

    // Centered empty-board message should be visible
    await expect(page.locator(".empty-board-title")).toHaveText("No teams yet");
    await expect(page.locator(".empty-board-hint")).toContainText(
      "Create a team or import a CSV to get started"
    );
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
    await page.waitForTimeout(350);

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

  test("action bar is hidden when switching back to landing tab", async ({ page }) => {
    // Dismiss landing with demo data so action bar is created
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");
    await expect(page.locator("#action-bar")).toBeVisible();

    // Create new tab — landing should appear, action bar should hide
    await page.locator(".scenario-tab-add").click();
    await expect(page.locator(".landing-page")).toBeVisible();
    await expect(page.locator("#action-bar")).toBeHidden();

    // Switch back to board tab — action bar should reappear
    await page.locator(".scenario-tab").first().click();
    await page.waitForSelector(".team");
    await expect(page.locator("#action-bar")).toBeVisible();

    // Switch to landing tab again — action bar should hide again
    await page.locator(".scenario-tab").nth(1).click();
    await expect(page.locator(".landing-page")).toBeVisible();
    await expect(page.locator("#action-bar")).toBeHidden();
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

  test("clicking label triggers file chooser", async ({ page }) => {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator(".csv-file-label").click();
    const chooser = await fileChooserPromise;
    expect(chooser).toBeTruthy();
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

    // Check auto-mapped values — selects are per-column with field as value
    const nameSelect = page.locator('select[data-col="0"]');
    await expect(nameSelect).toHaveValue("name"); // "Name" column → name field

    const roleSelect = page.locator('select[data-col="1"]');
    await expect(roleSelect).toHaveValue("role"); // "Role" column → role field

    const teamSelect = page.locator('select[data-col="4"]');
    await expect(teamSelect).toHaveValue("team"); // "Team" column → team field
  });

  test("mapping step shows data preview with mapping dropdowns", async ({
    page,
  }) => {
    const csvContent =
      "Name,Role,Location\nAlice,Engineer,NYC\nBob,Designer,London";

    await page.locator("#csv-file-input").setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Table should include the data rows
    const table = page.locator(".csv-mapping-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(2);

    // Mapping selects should be in the header
    await expect(table.locator(".csv-mapping-select")).toHaveCount(3);
  });

  test("shows timezone inference hint when location mapped but timezone skipped", async ({
    page,
  }) => {
    const csvContent = "Name,Location\nAlice,NYC";

    await page.locator("#csv-file-input").setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Location is auto-mapped, timezone is not — hint should appear
    await expect(page.locator(".csv-mapping-hints")).toContainText(
      "Timezone will be inferred from location"
    );
  });

  test("timezone inference hint hidden when timezone column is mapped", async ({
    page,
  }) => {
    const csvContent =
      "Name,Location,Timezone\nAlice,NYC,EST (UTC−5)";

    await page.locator("#csv-file-input").setInputFiles({
      name: "test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Both location and timezone are auto-mapped — no hint
    const hints = page.locator(".csv-mapping-hints");
    await expect(hints).toHaveText("");
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

  test("team hierarchy option is hidden when team column is empty", async ({
    page,
  }) => {
    const csvContent =
      "Name,Role,Manager,Team\nAlice,Lead,,\nBob,Engineer,Alice,\nCharlie,Designer,Alice,";

    await page.locator("#csv-file-input").setInputFiles({
      name: "mgr-only.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping → Mode
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Team hierarchy option should be hidden
    await expect(
      page.locator('input[value="team-hierarchy"]').locator("..")
    ).toBeHidden();

    // People hierarchy should be auto-selected
    await expect(page.locator('input[value="people-hierarchy"]')).toBeChecked();
  });

  test("manager-based import nests teams for multi-level hierarchies", async ({
    page,
  }) => {
    // Alex → Jordan, Morgan; Jordan → Robin, Charlie
    const csvContent = [
      "Name,Role,Manager",
      "Alex,VP,",
      "Jordan,Director,Alex",
      "Morgan,Director,Alex",
      "Robin,Manager,Jordan",
      "Charlie,Manager,Jordan",
      "Sam,Engineer,Morgan",
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "nested.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="people-hierarchy"]').click();
    await page.locator("#csv-import-next").click();

    await expect(page.locator("#csv-import-modal")).toHaveCount(0);

    // Only Alex's team should be at root level
    const rootTeams = page.locator(".root-dropzone > .team");
    await expect(rootTeams).toHaveCount(1);
    const rootName = await rootTeams
      .locator("> .team-titlebar .team-name-text")
      .textContent();
    expect(rootName).toBe("Alex's Team");

    // Alex's team should contain Jordan's Team and Morgan's Team as nested teams
    const alexTeam = rootTeams.first();
    const nestedTeams = alexTeam.locator(
      "> .team-body > .subteam-slot > .member-entry > .child-team > .team"
    );
    await expect(nestedTeams).toHaveCount(2);
    const nestedNames = await nestedTeams
      .locator("> .team-titlebar .team-name-text")
      .allTextContents();
    expect(nestedNames.sort()).toEqual(["Jordan's Team", "Morgan's Team"]);

    // Jordan's Team should contain Robin's and Charlie's names as members (not sub-teams, since they don't manage anyone with data)
    // But Robin and Charlie DO manage nobody → they are leaf employees in Jordan's team
    // Actually wait — Robin and Charlie are listed as "Manager" role but nobody reports to them
    // So they should just be employee members of Jordan's team

    // Total teams: Alex's, Jordan's, Morgan's = 3
    await expect(page.locator(".team")).toHaveCount(3);
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

  test("hides team-hierarchy and auto-selects people-hierarchy when no team data", async ({
    page,
  }) => {
    const csvContent =
      "Name,Role,Manager,Team\nAlice,Lead,,\nBob,Engineer,Alice,\nCharlie,Designer,Alice,";

    await page.locator("#csv-file-input").setInputFiles({
      name: "mgr-only.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping → Mode
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Team hierarchy option should be hidden
    await expect(
      page.locator('input[value="team-hierarchy"]').locator("..")
    ).toBeHidden();

    // People hierarchy should be auto-selected and visible
    await expect(page.locator('input[value="people-hierarchy"]')).toBeChecked();
    await expect(
      page.locator('input[value="people-hierarchy"]').locator("..")
    ).toBeVisible();
  });

  test("hides both hierarchy options when no team or manager data", async ({
    page,
  }) => {
    const csvContent = "Name,Role\nAlice,Engineer\nBob,Designer";

    await page.locator("#csv-file-input").setInputFiles({
      name: "names-only.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Both hierarchy options should be hidden
    await expect(
      page.locator('input[value="team-hierarchy"]').locator("..")
    ).toBeHidden();
    await expect(
      page.locator('input[value="people-hierarchy"]').locator("..")
    ).toBeHidden();

    // Unassigned should be auto-selected
    await expect(page.locator('input[value="unassigned"]')).toBeChecked();
  });

  test("shows all mode options when team column has data", async ({
    page,
  }) => {
    const csvContent =
      "Name,Role,Team\nAlice,Lead,Alpha\nBob,Engineer,Alpha";

    await page.locator("#csv-file-input").setInputFiles({
      name: "with-teams.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Team hierarchy should be visible and auto-selected
    await expect(
      page.locator('input[value="team-hierarchy"]').locator("..")
    ).toBeVisible();
    await expect(page.locator('input[value="team-hierarchy"]')).toBeChecked();
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
          const req = indexedDB.deleteDatabase("orgboard");
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve();
        })
      );
      await page.goto("/");
      await page.locator('[data-landing-action="demo"]').click();
      await page.waitForSelector(".team");
      await page.waitForTimeout(350);
      await use(page);
    },
  });

  stdTest("import button is visible in toolbar", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
    await expect(page.locator("#import-csv-btn")).toBeVisible();
  });

  stdTest("import into existing shows mode step", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Click import button
    await page.locator("#import-csv-btn").click();
    await expect(page.locator("#csv-import-modal")).toBeVisible();

    const csvContent = "Name,Role,Reports To\nNewPerson,Tester,SomeManager\nSomeManager,Lead,";
    await page.locator("#csv-file-input").setInputFiles({
      name: "extra.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Mapping → Mode
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();

    // Both unassigned and people-hierarchy modes should be available
    await expect(page.locator('input[value="unassigned"]')).toBeVisible();
    await expect(page.locator('input[value="people-hierarchy"]')).toBeVisible();

    // Select unassigned and finish
    await page.locator('input[value="unassigned"]').check();
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
    const csvContent = "Name,Role\nAlpha Person,Dev";
    await page.locator("#csv-file-input").setInputFiles({
      name: "extra.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Mapping → Mode (only unassigned available since no team/manager columns)
    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mode-step")).toBeVisible();
    await page.locator('input[value="unassigned"]').check();

    // Mode → Import
    await page.locator("#csv-import-next").click();

    // Teams should be unchanged
    await expect(page.locator(".team")).toHaveCount(teamsBefore);

    // Person should be in unassigned
    await expect(page.locator(".roster-cards").getByText("Alpha Person")).toBeVisible();
  });
});

test.describe("Workday Hierarchy Import", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("orgboard");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      })
    );
    await page.goto("/");
    await page.waitForSelector(".landing-page");
    await page.locator('[data-landing-action="import"]').click();
    await page.waitForSelector("#csv-import-modal");
  });

  test("auto-maps Workday columns (Line Detail 1 → Role, Line Detail 3 → Location)", async ({ page }) => {
    const csv = [
      "Unique Identifier,Name,Reports To,Line Detail 1,Line Detail 2,Line Detail 3,Organization Name",
      '0_Alex,Alex Smith,,"VP Engineering",,"Arlington, Virginia",',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await page.locator("#csv-import-next").click();
    await expect(page.locator("#csv-mapping-step")).toBeVisible();

    // Line Detail 1 → role (column index 3)
    await expect(page.locator('select[data-col="3"]')).toHaveValue("role");
    // Line Detail 3 → location (column index 5)
    await expect(page.locator('select[data-col="5"]')).toHaveValue("location");
    // Reports To → manager (column index 2)
    await expect(page.locator('select[data-col="2"]')).toHaveValue("manager");
  });

  test("resolves ID-based manager references to names", async ({ page }) => {
    const csv = [
      "Unique Identifier,Name,Reports To,Line Detail 1,Line Detail 2,Line Detail 3,Organization Name",
      '0_Alex,Alex Smith,,"VP Engineering",,"Arlington, Virginia",',
      '1_Jordan,Jordan Johnson,0_Alex,"Director, Data Engineering",,"London, England",',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();

    // Select people-hierarchy mode
    await page.locator('input[value="people-hierarchy"]').click();
    await page.locator("#csv-import-next").click();

    // Modal should close
    await expect(page.locator("#csv-import-modal")).toHaveCount(0);

    // Should have created a team for Alex (Jordan reports to Alex via ID)
    await expect(page.locator(".team")).toHaveCount(1);
    const teamName = await page.locator(".team > .team-titlebar .team-name-text").textContent();
    expect(teamName).toBe("Alex Smith's Team");
  });

  test("infers timezones from locations when no timezone column", async ({ page }) => {
    const csv = [
      "Name,Line Detail 1,Line Detail 3",
      '"Alex Smith","VP Engineering","Arlington, Virginia"',
      '"Jordan Johnson","Director","London, England"',
      '"Robin Thomas","Manager","Pune, India"',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode → Import (unassigned)
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="unassigned"]').click();
    await page.locator("#csv-import-next").click();

    // Check timezones via DOM
    const cards = page.locator(".roster-cards .person-card");
    await expect(cards).toHaveCount(3);

    // Alex → Arlington, Virginia → EST
    const alexTz = cards.filter({ hasText: "Alex Smith" }).locator(".person-timezone");
    await expect(alexTz).toContainText("EST (UTC−5)");

    // Jordan → London → GMT
    const jordanTz = cards.filter({ hasText: "Jordan Johnson" }).locator(".person-timezone");
    await expect(jordanTz).toContainText("GMT (UTC+0)");

    // Robin → Pune → IST
    const robinTz = cards.filter({ hasText: "Robin Thomas" }).locator(".person-timezone");
    await expect(robinTz).toContainText("IST (UTC+5:30)");
  });

  test("detects unfilled positions and marks as requested", async ({ page }) => {
    const csv = [
      "Unique Identifier,Name,Reports To,Line Detail 1,Line Detail 2,Line Detail 3,Organization Name",
      '0_Alex,Alex Smith,,"VP Engineering",,"Arlington, Virginia",',
      '50_Eden,P-199582 Software Engineer I (Position Fill:05/...,0_Alex,,,,',
      '64_Shiloh,P-206565 Lead Technical Program Manager (Unfilled),0_Alex,,,,',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode → Import (unassigned)
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="unassigned"]').click();
    await page.locator("#csv-import-next").click();

    await expect(page.locator("#csv-import-modal")).toHaveCount(0);
    const cards = page.locator(".roster-cards .person-card");
    await expect(cards).toHaveCount(3);

    // Unfilled positions should have card-requested class
    const requestedCards = page.locator(".roster-cards .person-card.card-requested");
    await expect(requestedCards).toHaveCount(2);

    // Check names are cleaned
    await expect(requestedCards.filter({ hasText: "Open - Software Engineer I" })).toHaveCount(1);
    await expect(requestedCards.filter({ hasText: "Open - Lead Technical Program Manager" })).toHaveCount(1);
  });

  test("strips [C] from contingent worker names", async ({ page }) => {
    const csv = [
      "Name,Line Detail 1,Line Detail 3",
      '"Lane Mitchell [C]","Contingent Worker","Pune, India"',
      '"Nico Carter [C]","Senior Engineer","Arlington, Virginia"',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode → Import (unassigned)
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="unassigned"]').click();
    await page.locator("#csv-import-next").click();

    const cards = page.locator(".roster-cards .person-card");
    await expect(cards).toHaveCount(2);

    // Names should not contain [C]
    await expect(cards.filter({ hasText: "Lane Mitchell" })).toHaveCount(1);
    await expect(cards.filter({ hasText: "[C]" })).toHaveCount(0);

    // Nico's role is "Senior Engineer", not "Contingent Worker" — should have note
    await expect(cards.filter({ hasText: "Nico Carter" }).locator(".card-notes")).toContainText("Contingent Worker");
  });

  test("cleans name annotations: (On Leave) and duplicate names", async ({ page }) => {
    const csv = [
      "Name,Line Detail 1,Line Detail 3",
      '"Hayden Young (On Leave)","Manager","Arlington, Virginia"',
      '"Sydney Green (Sydney Green)","Manager","Pune, India"',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode → Import (unassigned)
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="unassigned"]').click();
    await page.locator("#csv-import-next").click();

    const cards = page.locator(".roster-cards .person-card");
    await expect(cards).toHaveCount(2);

    // Names should be cleaned
    const haydenCard = cards.filter({ hasText: "Hayden Young" });
    await expect(haydenCard.locator(".person-name")).toHaveText("Hayden Young");
    await expect(haydenCard.locator(".card-notes")).toContainText("On Leave");

    const sydneyCard = cards.filter({ hasText: "Sydney Green" });
    await expect(sydneyCard.locator(".person-name")).toHaveText("Sydney Green");
  });

  test("infers levels from job titles when no level column", async ({ page }) => {
    const csv = [
      "Name,Line Detail 1,Line Detail 3",
      '"Alex Smith","Vice President, Software Engineering","Arlington, Virginia"',
      '"Jordan Johnson","Director, Data Engineering","London, England"',
      '"Robin Thomas","Manager, Data Engineering","Pune, India"',
      '"Winter Edwards","Lead Software Engineer","Pune, India"',
      '"Addison Stewart","Senior Software Engineer","Pune, India"',
      '"Bailey Morris","Software Engineer I","Pune, India"',
      '"Corey Murphy","Software Engineer II","Pune, India"',
      '"Drew Martinez","Senior Technical Program Manager","Arlington, Virginia"',
    ].join("\n");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // File → Mapping → Mode → Import (unassigned)
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator('input[value="unassigned"]').click();
    await page.locator("#csv-import-next").click();

    const cards = page.locator(".roster-cards .person-card");
    await expect(cards).toHaveCount(8);

    // VP → L4
    await expect(cards.filter({ hasText: "Alex Smith" }).locator(".person-level")).toHaveText("L4");
    // Director → L5
    await expect(cards.filter({ hasText: "Jordan Johnson" }).locator(".person-level")).toHaveText("L5");
    // Manager → L6
    await expect(cards.filter({ hasText: "Robin Thomas" }).locator(".person-level")).toHaveText("L6");
    // Lead → L6
    await expect(cards.filter({ hasText: "Winter Edwards" }).locator(".person-level")).toHaveText("L6");
    // Senior → L7
    await expect(cards.filter({ hasText: "Addison Stewart" }).locator(".person-level")).toHaveText("L7");
    // Engineer I → L9
    await expect(cards.filter({ hasText: "Bailey Morris" }).locator(".person-level")).toHaveText("L9");
    // Engineer II → L8
    await expect(cards.filter({ hasText: "Corey Murphy" }).locator(".person-level")).toHaveText("L8");
    // Senior Technical Program Manager → L7 (Senior takes precedence)
    await expect(cards.filter({ hasText: "Drew Martinez" }).locator(".person-level")).toHaveText("L7");
  });

  test("full Workday realworld CSV import with people-hierarchy", async ({ page }) => {
    const fs = await import("fs");
    const path = await import("path");
    const csvPath = path.resolve("tests/data/workday-realworld.csv");
    const csvContent = fs.readFileSync(csvPath, "utf-8");

    await page.locator("#csv-file-input").setInputFiles({
      name: "workday-realworld.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // File → Mapping → Mode
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();

    // Select people-hierarchy
    await page.locator('input[value="people-hierarchy"]').click();
    await page.locator("#csv-import-next").click();

    await expect(page.locator("#csv-import-modal")).toHaveCount(0);
    await expect(page.locator(".landing-page")).toHaveCount(0);

    // Should have teams created from manager relationships
    const teams = page.locator(".team");
    const teamCount = await teams.count();
    expect(teamCount).toBeGreaterThan(0);

    // Alex Smith manages Jordan, Morgan — should have a team
    await expect(page.locator(".team > .team-titlebar .team-name-text").filter({ hasText: "Alex Smith's Team" })).toHaveCount(1);

    // Unfilled positions should be marked as requested
    const requestedCards = page.locator(".person-card.card-requested");
    await expect(requestedCards).toHaveCount(3); // 3 unfilled in test fixture

    // Contingent workers should have clean names (no [C])
    await expect(page.locator(".person-card").filter({ hasText: "[C]" })).toHaveCount(0);
    // But Lane Mitchell and Nico Carter should exist
    await expect(page.locator(".person-card .person-name").filter({ hasText: "Lane Mitchell" })).toHaveCount(1);

    // On Leave annotation should be cleaned
    const haydenCard = page.locator(".person-card").filter({ hasText: "Hayden Young" });
    await expect(haydenCard.locator(".person-name")).toHaveText("Hayden Young");

    // Duplicate name annotations should be cleaned
    const sydneyCard = page.locator(".person-card").filter({ hasText: "Sydney Green" });
    await expect(sydneyCard.locator(".person-name")).toHaveText("Sydney Green");
  });
});
