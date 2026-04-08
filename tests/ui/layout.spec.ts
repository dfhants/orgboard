import { test, expect } from "./fixtures";

test.describe("Layout Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("toggle team child layout from horizontal to vertical", async ({
    page,
  }) => {
    const memberSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    await expect(memberSlot).toHaveClass(/layout-horizontal/);

    // Click the layout toggle button
    await page
      .locator(
        '[data-action="toggle-child-layout"][data-team-id="t1"]'
      )
      .click();

    await expect(memberSlot).toHaveClass(/layout-vertical/);
    await expect(memberSlot).not.toHaveClass(/layout-horizontal/);
  });

  test("toggle layout back to original", async ({ page }) => {
    const memberSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    // Toggle to vertical
    const toggleBtn = page.locator(
      '[data-action="toggle-child-layout"][data-team-id="t1"]'
    );
    await toggleBtn.click();
    await expect(memberSlot).toHaveClass(/layout-vertical/);

    // Toggle back to horizontal
    await toggleBtn.click();
    await expect(memberSlot).toHaveClass(/layout-horizontal/);
  });

  test("toggle root layout from horizontal to vertical", async ({ page }) => {
    const rootDropzone = page.locator(".root-dropzone");
    await expect(rootDropzone).toHaveAttribute("data-layout", "horizontal");

    await page.locator('[data-action="toggle-root-layout"]').click();

    await expect(rootDropzone).toHaveAttribute("data-layout", "vertical");
  });

  test("toggle root layout back to horizontal", async ({ page }) => {
    const rootDropzone = page.locator(".root-dropzone");
    const toggleBtn = page.locator('[data-action="toggle-root-layout"]');

    await toggleBtn.click();
    await expect(rootDropzone).toHaveAttribute("data-layout", "vertical");

    await toggleBtn.click();
    await expect(rootDropzone).toHaveAttribute("data-layout", "horizontal");
  });
});

test.describe("Floating Action Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("action bar is visible and contains all buttons", async ({ page }) => {
    const bar = page.locator(".action-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-action="toggle-root-layout"]')).toBeVisible();
    await expect(bar.locator('[data-action="add-root-person"]')).toBeVisible();
    await expect(bar.locator('[data-action="add-root-team"]')).toBeVisible();
    await expect(bar.locator('[data-action="view-hierarchy"]')).toBeVisible();
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

test.describe("Horizontal Layout Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("teams flow in a single row in horizontal layout", async ({ page }) => {
    const rootDropzone = page.locator(".root-dropzone");
    await expect(rootDropzone).toHaveAttribute("data-layout", "horizontal");

    // Add extra teams so total width exceeds viewport
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    // All teams should sit on the same row (same top offset)
    const result = await rootDropzone.evaluate((el) => {
      const teams = el.querySelectorAll(":scope > .team");
      const tops = new Set(
        [...teams].map((t) => Math.round(t.getBoundingClientRect().top))
      );
      return { rowCount: tops.size };
    });
    expect(result.rowCount).toBe(1);
  });

  test("page-shell scrolls horizontally when teams overflow", async ({
    page,
  }) => {
    // Add extra teams to exceed viewport width
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    const pageShell = page.locator(".page-shell");
    const overflow = await pageShell.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // Content should overflow — scrollbar available
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
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

  test("root dropzone expands beyond viewport when content overflows", async ({
    page,
  }) => {
    // Switch to vertical layout so teams stack and grow height
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
    // With many teams stacked vertically, dropzone should exceed visible area
    expect(dims.dropzoneHeight).toBeGreaterThan(dims.shellClientHeight);
  });

  test("root dropzone expands horizontally to cover all teams", async ({
    page,
  }) => {
    // Default layout is horizontal — add teams to force overflow
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    const dims = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!;
      const dropzone = document.querySelector(".root-dropzone")!;
      const teams = dropzone.querySelectorAll(":scope > .team");
      const lastTeam = teams[teams.length - 1];
      const dzRect = dropzone.getBoundingClientRect();
      const lastRect = lastTeam.getBoundingClientRect();
      return {
        shellScrollsHorizontally: shell.scrollWidth > shell.clientWidth,
        dropzoneWidth: dzRect.width,
        lastTeamRight: lastRect.right,
        dropzoneRight: dzRect.right,
      };
    });
    // Page should scroll horizontally
    expect(dims.shellScrollsHorizontally).toBe(true);
    // Dropzone must extend at least to the last team's right edge
    expect(dims.dropzoneRight).toBeGreaterThanOrEqual(dims.lastTeamRight - 1);
  });
});
