import { test, expect } from "./fixtures";

test.describe("Floating Action Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("action bar is visible and contains all buttons", async ({ page }) => {
    const bar = page.locator(".action-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-action="add-root-person"]')).toBeVisible();
    await expect(bar.locator('[data-action="add-root-team"]')).toBeVisible();
    await expect(bar.locator('#action-bar-import-csv')).toBeVisible();
    await expect(bar.locator('[data-action="view-hierarchy"]')).toBeVisible();
  });

  test("action bar import CSV button opens import modal", async ({ page }) => {
    await page.locator("#action-bar-import-csv").click();
    await expect(page.locator("#csv-import-modal")).toBeVisible();
    await expect(page.locator(".csv-import-panel .modal-title")).toHaveText(
      "Import from CSV"
    );
  });

  test("action bar is positioned above unassigned drawer", async ({ page }) => {
    const barBox = await page.locator(".action-bar").boundingBox();
    const drawerBox = await page.locator("#unassigned-drawer").boundingBox();
    expect(barBox).toBeTruthy();
    expect(drawerBox).toBeTruthy();
    // Action bar bottom should be above the drawer top
    expect(barBox!.y + barBox!.height).toBeLessThan(drawerBox!.y);
  });

  test("action bar repositions when drawer collapses", async ({ page }) => {
    const bar = page.locator(".action-bar");
    const barBefore = await bar.boundingBox();

    // Collapse the drawer
    await page.locator("#unassigned-drawer .drawer-chevron").click();
    await expect(page.locator("#unassigned-drawer")).toHaveClass(/is-collapsed/);

    // Wait for CSS transition
    await page.waitForTimeout(350);
    const barAfter = await bar.boundingBox();

    // Action bar should have moved down (closer to bottom)
    expect(barAfter!.y).toBeGreaterThan(barBefore!.y);
  });

  test("action bar has no board wrapper around teams", async ({ page }) => {
    // The .board section should no longer exist
    await expect(page.locator("section.board")).toHaveCount(0);
    // Teams should be direct children of root-dropzone
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(2);
  });
});

test.describe("Root Dropzone Fills Viewport", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("root dropzone height fills the visible page-shell area", async ({
    page,
  }) => {
    const dims = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!;
      const dropzone = document.querySelector(".root-dropzone")!;
      return {
        shellHeight: shell.clientHeight,
        dropzoneHeight: dropzone.getBoundingClientRect().height,
        shellPaddingTop: parseFloat(getComputedStyle(shell).paddingTop),
        shellPaddingBottom: parseFloat(getComputedStyle(shell).paddingBottom),
      };
    });
    const availableHeight =
      dims.shellHeight - dims.shellPaddingTop - dims.shellPaddingBottom;
    // Dropzone should fill at least the visible area (minus padding & gap)
    expect(dims.dropzoneHeight).toBeGreaterThanOrEqual(availableHeight - 30);
  });

  test("root dropzone stretches to full width of page-shell", async ({
    page,
  }) => {
    const dims = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!;
      const dropzone = document.querySelector(".root-dropzone")!;
      return {
        shellClientWidth: shell.clientWidth,
        dropzoneWidth: dropzone.getBoundingClientRect().width,
        shellPaddingLeft: parseFloat(getComputedStyle(shell).paddingLeft),
        shellPaddingRight: parseFloat(getComputedStyle(shell).paddingRight),
      };
    });
    const availableWidth =
      dims.shellClientWidth - dims.shellPaddingLeft - dims.shellPaddingRight;
    // Dropzone width should match available content width
    expect(dims.dropzoneWidth).toBeGreaterThanOrEqual(availableWidth - 2);
  });

  test("root dropzone expands beyond viewport when content overflows vertically", async ({
    page,
  }) => {
    // Switch to vertical layout so teams stack downward
    await page.locator('[data-action="toggle-root-layout"]').click();
    await page.waitForTimeout(200);

    // Add many teams to exceed viewport height
    for (let i = 0; i < 8; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    const dims = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!;
      const dropzone = document.querySelector(".root-dropzone")!;
      return {
        shellClientHeight: shell.clientHeight,
        dropzoneHeight: dropzone.getBoundingClientRect().height,
      };
    });
    // With many teams stacked, dropzone should exceed visible area
    expect(dims.dropzoneHeight).toBeGreaterThan(dims.shellClientHeight);
  });
});

test.describe("People Group Structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("employee entries are wrapped in a people-group container", async ({
    page,
  }) => {
    // t1 has employees — they should be inside .people-group
    const peopleGroup = page.locator(
      '.team[data-team-id="t1"] .member-slot .people-group'
    );
    await expect(peopleGroup).toBeAttached();

    // Employee entries should be inside people-group
    const employeeEntries = peopleGroup.locator('.member-entry[data-member-type="employee"]');
    await expect(employeeEntries).toHaveCount(2); // p2 and p3
  });

  test("nested team entries are outside people-group", async ({ page }) => {
    // t1 has a nested team t3 — it should be a direct child of member-slot, not inside people-group
    const teamEntry = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot > .member-entry[data-member-type="team"]'
    );
    await expect(teamEntry).toHaveCount(1);
  });
});
