import { test, expect } from "./fixtures";

test.describe("Floating Action Bar", () => {
  test("action bar is visible and contains all buttons", async ({ page }) => {
    const bar = page.locator(".action-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-action="zoom-out"]')).toBeVisible();
    await expect(bar.locator('[data-action="zoom-reset"]')).toBeVisible();
    await expect(bar.locator('[data-action="zoom-in"]')).toBeVisible();
    await expect(bar.locator('[data-action="add-root-person"]')).toBeVisible();
    await expect(bar.locator('[data-action="add-root-team"]')).toBeVisible();
    await expect(bar.locator('#action-bar-import-csv')).toBeVisible();
    await expect(bar.locator('[data-action="view-hierarchy"]')).toBeVisible();
  });

  test("zoom controls adjust board scale and reset", async ({ page }) => {
    const shell = page.locator(".page-shell");
    const readZoom = async () => page.evaluate(() => {
      const shell = document.querySelector(".page-shell");
      const value = getComputedStyle(shell).getPropertyValue("--board-zoom").trim();
      return Number(value);
    });

    await expect(shell).toBeVisible();
    await expect(page.locator("#zoom-level-label")).toHaveText("100%");

    await page.locator('[data-action="zoom-in"]').click();
    const zoomedIn = await readZoom();
    expect(zoomedIn).toBeGreaterThan(1);

    await page.locator('[data-action="zoom-reset"]').click();
    await expect(page.locator("#zoom-level-label")).toHaveText("100%");
    const resetZoom = await readZoom();
    expect(resetZoom).toBe(1);
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
    // Reload to get clean layout state from persisted DB
    await page.reload();
    await page.waitForSelector(".team");
    const bar = page.locator(".action-bar");
    // Ensure drawer is fully expanded and layout settled before measuring
    await expect(page.locator("#unassigned-drawer")).not.toHaveClass(/is-collapsed/);
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
  test("root dropzone contains and vertically centers teams", async ({
    page,
  }) => {
    const data = await page.evaluate(() => {
      const dropzone = document.querySelector(".root-dropzone")!;
      const teams = dropzone.querySelectorAll(":scope > .team");
      if (teams.length === 0) return null;
      const dropzoneRect = dropzone.getBoundingClientRect();
      const minTop = Math.min(...Array.from(teams, (t) => t.getBoundingClientRect().top));
      const maxBottom = Math.max(...Array.from(teams, (t) => t.getBoundingClientRect().bottom));
      return {
        dropzoneTop: dropzoneRect.top,
        dropzoneBottom: dropzoneRect.bottom,
        dropzoneHeight: dropzoneRect.height,
        contentTop: minTop,
        contentBottom: maxBottom,
        contentHeight: maxBottom - minTop,
      };
    });
    expect(data).not.toBeNull();
    // Dropzone should fully contain all teams
    expect(data!.dropzoneTop).toBeLessThanOrEqual(data!.contentTop);
    expect(data!.dropzoneBottom).toBeGreaterThanOrEqual(data!.contentBottom);
    // Teams should be approximately vertically centered (top/bottom space within 10%)
    const topSpace = data!.contentTop - data!.dropzoneTop;
    const bottomSpace = data!.dropzoneBottom - data!.contentBottom;
    if (data!.dropzoneHeight > data!.contentHeight + 20) {
      expect(Math.abs(topSpace - bottomSpace)).toBeLessThan(data!.dropzoneHeight * 0.1);
    }
  });

  test("root dropzone fits its content width in horizontal mode", async ({
    page,
  }) => {
    const dims = await page.evaluate(() => {
      const dropzone = document.querySelector(".root-dropzone")!;
      const teams = dropzone.querySelectorAll(":scope > .team");
      const teamWidths = Array.from(teams, (t) => t.getBoundingClientRect().width);
      return {
        dropzoneWidth: dropzone.getBoundingClientRect().width,
        teamCount: teams.length,
        totalTeamWidth: teamWidths.reduce((a, b) => a + b, 0),
      };
    });
    // Dropzone should have positive width and contain all teams
    expect(dims.dropzoneWidth).toBeGreaterThan(0);
    expect(dims.teamCount).toBeGreaterThan(0);
    // Dropzone width should be at least the sum of team widths (plus gaps)
    expect(dims.dropzoneWidth).toBeGreaterThanOrEqual(dims.totalTeamWidth);
  });

  test("root dropzone expands beyond viewport when content overflows vertically", async ({
    page,
  }) => {
    // Switch to vertical layout so teams stack downward
    await page.locator('[data-action="toggle-root-layout"]').click();
    await page.waitForTimeout(200);

    // Add many teams to exceed viewport height
    for (let i = 0; i < 15; i++) {
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

test.describe("Team Alignment", () => {
  test("single empty team is left-aligned, not centered", async ({
    page,
  }) => {
    // Create a new blank scenario with one empty team
    await page.locator(".scenario-tab-add").click();
    await page.getByRole("button", { name: /Start blank/ }).click();
    await page.locator('[data-action="add-root-team"]').click();
    await page.waitForSelector(".team");

    const data = await page.evaluate(() => {
      const team = document.querySelector(".team")!;
      const shell = document.querySelector(".page-shell")!;
      const teamRect = team.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      return {
        shellLeft: shellRect.left,
        teamLeft: teamRect.left,
        shellWidth: shellRect.width,
        teamWidth: teamRect.width,
      };
    });
    // Team should be near the left edge of the shell (within padding)
    const offset = data.teamLeft - data.shellLeft;
    expect(offset).toBeLessThan(40);
    // And NOT centered — there should be significant space to the right
    expect(data.teamWidth).toBeLessThan(data.shellWidth / 2);
  });
});

test.describe("People Group Structure", () => {
  test("employee entries are direct children of member-slot", async ({
    page,
  }) => {
    // t1 has employees — they should be inside .member-slot as direct children
    const memberSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    await expect(memberSlot).toBeAttached();

    // Employee entries should be direct children of member-slot
    const employeeEntries = memberSlot.locator('.member-entry[data-member-type="employee"]');
    await expect(employeeEntries).toHaveCount(2); // p2 and p3
  });

  test("nested team entries are in subteam-slot", async ({ page }) => {
    // t1 has a nested team t3 — it should be in the subteam-slot
    const teamEntry = page.locator(
      '.team[data-team-id="t1"] > .team-body > .subteam-slot > .member-entry[data-member-type="team"]'
    );
    await expect(teamEntry).toHaveCount(1);
  });
});

test.describe("Horizontal Layout Flow", () => {
  test("all entries visible in horizontal layout with many people", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Import a CSV with many people in one team
    const names = Array.from({ length: 15 }, (_, i) => `Person${i + 1}`);
    const csvContent = [
      "Name,Role,Location,Timezone,Team",
      ...names.map(
        (n) => `${n},Engineer,Remote,EST (UTC−5),BigTeam`
      ),
    ].join("\n");

    await page.locator("#action-bar-import-csv").click();
    await page.locator("#csv-file-input").setInputFiles({
      name: "big.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });
    await page.locator("#csv-import-next").click();
    // Column mapping step — auto-detected, proceed
    await page.locator("#csv-import-next").click();
    // Load mode step — default "Team hierarchy", click Import
    await page.locator("#csv-import-next").click();
    await page.waitForTimeout(300);

    // Ensure horizontal layout is active (default)
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    // Find the BigTeam
    const bigTeam = page.locator(".team").filter({ hasText: "BigTeam" });
    await expect(bigTeam).toBeVisible();

    // Get all direct member entries in the BigTeam's member-slot
    const memberSlot = bigTeam.locator(
      ":scope > .team-body > .member-slot"
    );

    // Count visible entries (width > 0, not clipped by overflow)
    const { total, visible } = await memberSlot.evaluate((slot) => {
      const slotRect = slot.getBoundingClientRect();
      const entries = slot.querySelectorAll(":scope > .member-entry");
      let total = entries.length;
      let visible = 0;
      for (const e of entries) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom <= slotRect.bottom + 1) {
          visible++;
        }
      }
      return { total, visible };
    });

    // All 15 people should be visible (not clipped)
    expect(total).toBe(15);
    expect(visible).toBe(15);

    // Member-slot should use column wrap in horizontal layout
    await expect(memberSlot).toHaveCSS("flex-direction", "column");
    await expect(memberSlot).toHaveCSS("flex-wrap", "wrap");
  });

  test("horizontal packing stacks entries into columns", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Import a CSV with many people in one team
    const names = Array.from({ length: 10 }, (_, i) => `Person${i + 1}`);
    const csvContent = [
      "Name,Role,Location,Timezone,Team",
      ...names.map((n) => `${n},Engineer,Remote,EST (UTC−5),PackTeam`),
    ].join("\n");

    await page.locator("#action-bar-import-csv").click();
    await page.locator("#csv-file-input").setInputFiles({
      name: "pack.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.waitForTimeout(300);

    // Ensure horizontal layout
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const team = page.locator(".team").filter({ hasText: "PackTeam" });
    const memberSlot = team.locator(":scope > .team-body > .member-slot");

    // CSS column wrap should stack entries into columns.
    // Multiple entries should share the same x position (stacked vertically).
    const { uniqueXPositions, entryCount } = await memberSlot.evaluate(
      (slot) => {
        const entries = slot.querySelectorAll(":scope > .member-entry");
        const xSet = new Set<number>();
        for (const e of entries) {
          xSet.add(Math.round(e.getBoundingClientRect().left));
        }
        return { uniqueXPositions: xSet.size, entryCount: entries.length };
      }
    );

    // With 10 entries, there should be multiple columns but fewer than 10
    // (meaning some entries share a column)
    expect(uniqueXPositions).toBeGreaterThan(1);
    expect(uniqueXPositions).toBeLessThan(entryCount);
  });

  test("switching to vertical clears horizontal tighten sizes", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Import CSV with multiple people
    const names = Array.from({ length: 8 }, (_, i) => `Person${i + 1}`);
    const csvContent = [
      "Name,Role,Location,Timezone,Team",
      ...names.map((n) => `${n},Engineer,Remote,EST (UTC−5),WrapTeam`),
    ].join("\n");

    await page.locator("#action-bar-import-csv").click();
    await page.locator("#csv-file-input").setInputFiles({
      name: "wrap.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.waitForTimeout(300);

    // Start in horizontal mode — tightenLayout sets inline height
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const team = page.locator(".team").filter({ hasText: "WrapTeam" });
    const memberSlot = team.locator(":scope > .team-body > .member-slot");

    // In horizontal mode, slot should have an inline height set by tightenLayout
    const inlineHeight = await memberSlot.evaluate((el) => el.style.height);
    expect(inlineHeight).not.toBe("");

    // Switch to vertical layout
    await page.locator('[data-action="toggle-root-layout"]').click();
    await page.waitForTimeout(300);

    // Inline height should be cleared after switching to vertical
    const inlineHeightAfter = await memberSlot.evaluate((el) => el.style.height);
    expect(inlineHeightAfter).toBe("");

    // Entries should still exist as direct children
    const entries = await memberSlot.locator(":scope > .member-entry").count();
    expect(entries).toBe(8);
  });

  test("entries stack vertically in a column in horizontal mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Import CSV with 1 person so they share a column with the manager
    const csvContent = [
      "Name,Role,Location,Timezone,Team",
      "Alice,Engineer,Remote,EST (UTC−5),SmallTeam",
    ].join("\n");

    await page.locator("#action-bar-import-csv").click();
    await page.locator("#csv-file-input").setInputFiles({
      name: "small.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.locator("#csv-import-next").click();
    await page.waitForTimeout(300);

    // Ensure horizontal layout
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const team = page.locator(".team").filter({ hasText: "SmallTeam" });
    const memberSlot = team.locator(":scope > .team-body > .member-slot");

    // Both the manager-slot and member-entry should be in the same column (stacked vertically)
    const positions = await memberSlot.evaluate((slot) => {
      const managerSlot = slot.querySelector(":scope > .manager-slot");
      const entry = slot.querySelector(":scope > .member-entry");
      const slotRect = slot.getBoundingClientRect();
      const mRect = managerSlot!.getBoundingClientRect();
      const eRect = entry!.getBoundingClientRect();
      return {
        managerX: Math.round(mRect.left - slotRect.left),
        entryX: Math.round(eRect.left - slotRect.left),
        managerY: Math.round(mRect.top - slotRect.top),
        entryY: Math.round(eRect.top - slotRect.top),
      };
    });

    // Manager and entry should be in the same column (similar x)
    expect(Math.abs(positions.managerX - positions.entryX)).toBeLessThan(15);
    // Entry should be below manager
    expect(positions.entryY).toBeGreaterThan(positions.managerY);
  });
});

test.describe("Tighten Layout — Horizontal", () => {
  test("member-slots are tight to content height", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Ensure horizontal layout
    const layout = await page.locator(".root-dropzone").getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const data = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.member-slot.layout-horizontal'), (slot) => {
        const team = slot.closest('.team');
        if (team?.getAttribute('data-view') === 'collapsed') return null;
        const children = slot.querySelectorAll(':scope > .manager-slot, :scope > .member-entry');
        if (children.length === 0) return null;
        const slotRect = slot.getBoundingClientRect();
        const maxBottom = Math.max(...Array.from(children, (c) => c.getBoundingClientRect().bottom));
        const cs = getComputedStyle(slot);
        const expectedBottom = maxBottom + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
        return {
          slotBottom: Math.round(slotRect.bottom),
          expectedBottom: Math.round(expectedBottom),
        };
      }).filter(Boolean)
    );
    expect(data.length).toBeGreaterThan(0);
    for (const { slotBottom, expectedBottom } of data as any[]) {
      expect(Math.abs(slotBottom - expectedBottom)).toBeLessThan(2);
    }
  });

  test("teams are tight to tallest child height", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    const layout = await page.locator(".root-dropzone").getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const data = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.team'), (team) => {
        if (team.getAttribute('data-view') === 'collapsed') return null;
        const body = team.querySelector(':scope > .team-body');
        if (!body) return null;
        const children = body.querySelectorAll(':scope > .member-slot, :scope > .subteam-slot');
        if (children.length === 0) return null;
        const teamRect = team.getBoundingClientRect();
        const maxBottom = Math.max(...Array.from(children, (c) => c.getBoundingClientRect().bottom));
        const cs = getComputedStyle(team);
        const expectedBottom = maxBottom + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
        return {
          teamBottom: Math.round(teamRect.bottom),
          expectedBottom: Math.round(expectedBottom),
        };
      }).filter(Boolean)
    );
    expect(data.length).toBeGreaterThan(0);
    for (const { teamBottom, expectedBottom } of data as any[]) {
      expect(Math.abs(teamBottom - expectedBottom)).toBeLessThan(2);
    }
  });

  test("root-dropzone contains all teams in horizontal mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    const layout = await page.locator(".root-dropzone").getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const data = await page.evaluate(() => {
      const gp = document.querySelector('.root-dropzone');
      if (!gp) return null;
      const children = gp.querySelectorAll(':scope > .team');
      if (children.length === 0) return null;
      const gpRect = gp.getBoundingClientRect();
      const minTop = Math.min(...Array.from(children, (c) => c.getBoundingClientRect().top));
      const maxBottom = Math.max(...Array.from(children, (c) => c.getBoundingClientRect().bottom));
      return {
        gpTop: gpRect.top,
        gpBottom: gpRect.bottom,
        contentTop: minTop,
        contentBottom: maxBottom,
      };
    });
    expect(data).not.toBeNull();
    // Root-dropzone should fully contain all teams
    expect(data!.gpTop).toBeLessThanOrEqual(data!.contentTop);
    expect(data!.gpBottom).toBeGreaterThanOrEqual(data!.contentBottom);
  });
});

test.describe("Tighten Layout — Vertical", () => {
  test("member-slots are tight to content width", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Switch to vertical layout
    const layout = await page.locator(".root-dropzone").getAttribute("data-layout");
    if (layout !== "vertical") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const data = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.member-slot.layout-vertical'), (slot) => {
        const team = slot.closest('.team');
        if (team?.getAttribute('data-view') === 'collapsed') return null;
        const children = slot.querySelectorAll(':scope > .manager-slot, :scope > .member-entry');
        if (children.length === 0) return null;
        const slotRect = slot.getBoundingClientRect();
        const maxRight = Math.max(...Array.from(children, (c) => c.getBoundingClientRect().right));
        const cs = getComputedStyle(slot);
        const expectedRight = maxRight + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
        return {
          slotRight: Math.round(slotRect.right),
          expectedRight: Math.round(expectedRight),
        };
      }).filter(Boolean)
    );
    expect(data.length).toBeGreaterThan(0);
    for (const { slotRight, expectedRight } of data as any[]) {
      expect(Math.abs(slotRight - expectedRight)).toBeLessThan(2);
    }
  });

  test("teams are tight to widest child width", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    const layout = await page.locator(".root-dropzone").getAttribute("data-layout");
    if (layout !== "vertical") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const data = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.team'), (team) => {
        if (team.getAttribute('data-view') === 'collapsed') return null;
        const body = team.querySelector(':scope > .team-body');
        if (!body) return null;
        const children = body.querySelectorAll(':scope > .member-slot, :scope > .subteam-slot');
        if (children.length === 0) return null;
        const teamRect = team.getBoundingClientRect();
        const maxRight = Math.max(...Array.from(children, (c) => c.getBoundingClientRect().right));
        const cs = getComputedStyle(team);
        const expectedRight = maxRight + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
        return {
          teamRight: Math.round(teamRect.right),
          expectedRight: Math.round(expectedRight),
        };
      }).filter(Boolean)
    );
    expect(data.length).toBeGreaterThan(0);
    for (const { teamRight, expectedRight } of data as any[]) {
      expect(Math.abs(teamRight - expectedRight)).toBeLessThan(2);
    }
  });
});

test.describe("Mouse Wheel Scrolling", () => {
  test("Shift+wheel scrolls horizontally in horizontal layout", async ({
    page,
  }) => {
    // Add several teams so content overflows horizontally
    for (let i = 0; i < 10; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    // Ensure horizontal layout
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    const shell = page.locator(".page-shell");
    await shell.evaluate((el) => (el.scrollLeft = 0));
    const scrollBefore = await shell.evaluate((el) => el.scrollLeft);

    // Dispatch a Shift+vertical wheel event over the page shell
    await shell.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 200,
          deltaX: 0,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await page.waitForTimeout(100);

    const scrollAfter = await shell.evaluate((el) => el.scrollLeft);
    expect(scrollAfter).toBeGreaterThan(scrollBefore);
  });

  test("plain wheel in horizontal layout shows scroll hint", async ({
    page,
  }) => {
    // Ensure horizontal layout
    const layout = await page
      .locator(".root-dropzone")
      .getAttribute("data-layout");
    if (layout !== "horizontal") {
      await page.locator('[data-action="toggle-root-layout"]').click();
      await page.waitForTimeout(300);
    }

    // No hint should exist yet
    await expect(page.locator(".scroll-hint")).toHaveCount(0);

    // Dispatch a plain vertical wheel event (no Shift)
    const shell = page.locator(".page-shell");
    await shell.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 100,
          deltaX: 0,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await page.waitForTimeout(100);

    // Hint toast should appear
    const hint = page.locator(".scroll-hint");
    await expect(hint).toHaveCount(1);
    await expect(hint).toHaveClass(/is-visible/);
    await expect(hint).toContainText("Shift");
  });

  test("plain wheel does NOT scroll horizontally without Shift", async ({
    page,
  }) => {
    // Add teams for overflow
    for (let i = 0; i < 10; i++) {
      await page.locator('[data-action="add-root-team"]').click();
    }
    await page.waitForTimeout(300);

    const shell = page.locator(".page-shell");
    await shell.evaluate((el) => (el.scrollLeft = 0));

    // Dispatch plain wheel event (no Shift)
    await shell.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 200,
          deltaX: 0,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await page.waitForTimeout(100);

    const scrollAfter = await shell.evaluate((el) => el.scrollLeft);
    expect(scrollAfter).toBe(0);
  });

  test("vertical wheel does NOT show hint in vertical layout", async ({
    page,
  }) => {
    // Switch to vertical layout
    await page.locator('[data-action="toggle-root-layout"]').click();
    await page.waitForTimeout(200);

    const shell = page.locator(".page-shell");
    await shell.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 200,
          deltaX: 0,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    await page.waitForTimeout(100);

    // No hint in vertical layout
    await expect(page.locator(".scroll-hint.is-visible")).toHaveCount(0);
  });

  test("page-shell allows overflow scroll when zoomed in", async ({
    page,
  }) => {
    // Zoom in several times
    for (let i = 0; i < 8; i++) {
      await page.locator('[data-action="zoom-in"]').click();
    }
    await page.waitForTimeout(300);

    const shell = page.locator(".page-shell");

    // Both overflow directions should be scrollable (overflow: auto)
    const overflowX = await shell.evaluate((el) =>
      getComputedStyle(el).overflowX
    );
    const overflowY = await shell.evaluate((el) =>
      getComputedStyle(el).overflowY
    );
    expect(overflowX).toBe("auto");
    expect(overflowY).toBe("auto");

    // Content should actually overflow — scrollHeight or scrollWidth > clientHeight/Width
    const { scrollsX, scrollsY } = await shell.evaluate((el) => ({
      scrollsX: el.scrollWidth > el.clientWidth,
      scrollsY: el.scrollHeight > el.clientHeight,
    }));
    // At 180% zoom with demo data, at least one axis should overflow
    expect(scrollsX || scrollsY).toBe(true);
  });
});
