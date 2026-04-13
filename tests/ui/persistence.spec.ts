import { test, expect, addUnassignedPeople } from "./fixtures";

test.describe("Persistence (SQLite)", () => {
  test("state survives page reload — teams and members preserved", async ({ page }) => {
    // Verify initial state has 2 root teams
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(2);

    // Rename a team to something unique
    const teamName = page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text');
    await teamName.click();
    const input = page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-input');
    await input.fill("Persistence Test Team");
    await input.press("Enter");

    // Wait for debounced save to flush
    await page.waitForTimeout(350);

    // Reload the page
    await page.reload();
    await page.waitForSelector(".team");

    // Verify the renamed team is still there
    await expect(
      page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text')
    ).toHaveText("Persistence Test Team");

    // Verify still 2 root teams
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(2);
  });

  test("notes survive page reload", async ({ page }) => {
    // Open notes panel
    await page.locator('[data-action="toggle-notes-panel"]').first().click();

    // Type some notes
    const textarea = page.locator("#notes-textarea");
    await textarea.fill("These are my persistent notes");

    // Wait for debounced save
    await page.waitForTimeout(350);

    // Reload
    await page.reload();
    await page.waitForSelector(".team");

    // Notes panel should still be open (state was saved with notesPanelOpen=true)
    // Verify notes are preserved
    await expect(page.locator("#notes-textarea")).toHaveValue("These are my persistent notes");
  });

  test("employee additions survive page reload", async ({ page }) => {
    // Count initial unassigned
    const initialCount = await page.locator(".roster-cards .person-card").count();

    // Add a new person
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Persistence Person");
    await page.locator("#ap-role").fill("Tester");
    await page.locator("#add-person-submit").click();

    // Wait for save
    await page.waitForTimeout(350);

    // Reload
    await page.reload();
    await page.waitForSelector(".team");

    // The new person should be in the unassigned bar
    await expect(page.locator(".roster-cards .person-card")).toHaveCount(initialCount + 1);
    await expect(page.locator(".roster-cards").getByText("Persistence Person")).toBeVisible();
  });

  test("export button triggers file download", async ({ page }) => {
    // Click export and intercept the download
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-db-btn").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("orgboard.db");
  });

  test("recovers from corrupt IndexedDB by resetting to fresh DB", async ({ page }) => {
    // Write garbage bytes into the IndexedDB slot where the SQLite binary lives
    await page.evaluate(async () => {
      const garbage = new Uint8Array([0, 1, 2, 3, 4, 5]);
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("orgboard", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("database");
        req.onsuccess = () => {
          const tx = req.result.transaction("database", "readwrite");
          tx.objectStore("database").put(garbage, "main");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // Collect console warnings during reload
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    // Reload — app should recover instead of crashing
    await page.reload();
    // Corrupt DB triggers first-run — landing page appears
    await page.waitForSelector(".landing-page");
    await page.locator('[data-landing-action="demo"]').click();
    await page.waitForSelector(".team");

    // Should have logged a warning about the corrupt DB
    expect(warnings.some((w) => w.includes("corrupt"))).toBeTruthy();

    // App should be fully functional with fresh state
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Recovery Person");
    await page.locator("#add-person-submit").click();
    await expect(page.locator(".roster-cards").getByText("Recovery Person")).toBeVisible();
  });

  test("rapid mutations do not cause errors", async ({ page }) => {
    // Perform several rapid state mutations that each trigger a render + DB save
    for (let i = 0; i < 5; i++) {
      await addUnassignedPeople(page, 1, `Rapid ${i}`);
    }

    // Wait for saves to flush
    await page.waitForTimeout(350);

    // No errors — page still functional
    await expect(page.locator(".roster-cards .person-card")).toHaveCount(7); // 2 initial + 5 new

    // Reload - state should be intact
    await page.reload();
    await page.waitForSelector(".team");
    await expect(page.locator(".roster-cards .person-card")).toHaveCount(7);
  });
});
