import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { dragAndDrop, dragHover, dragCancel } from "./helpers";

/**
 * Mid-drag state assertions for every drag-drop combination.
 *
 * For each scenario we verify:
 *  - Source element: semi-transparent (move) or fully visible (copy)
 *  - Target dropzone: has `.is-over` highlight
 *  - Cleanup: everything reverts after drag cancel
 *
 * Initial state (from app.js):
 *   t1 Product  (expanded, horizontal) — manager: p1 (Ava), members: p2 (Milo), p3 (Zuri), t3
 *   t2 Operations (expanded, vertical) — manager: p4 (Noah), members: p5 (Lena), t4
 *   t3 Research (collapsed)            — manager: p6 (Iris), members: p7 (Theo)
 *   t4 Field    (expanded, horizontal) — manager: null, members: p8 (June)
 *   Unassigned: p9 (Eli), p10 (Nia)
 */

/* ─── Helpers ─── */

/** Check that the source element is semi-transparent (move) or fully visible (copy) */
async function assertSourceState(
  page: Page,
  sourceSelector: string,
  expectDimmed: boolean
) {
  const state = await page.evaluate(
    ({ sel }) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const entry = el.closest(".member-entry") || el;
      return {
        found: true,
        hasDraggingSource: entry.classList.contains("dragging-source"),
        opacity: getComputedStyle(entry).opacity,
      };
    },
    { sel: sourceSelector }
  );

  if (expectDimmed) {
    expect(state.hasDraggingSource, "source should have dragging-source class").toBe(true);
    expect(Number(state.opacity), "source should be semi-transparent").toBeLessThan(1);
  } else {
    expect(
      state.hasDraggingSource,
      "source should NOT have dragging-source class"
    ).toBe(false);
  }
}

/** No drag artifacts remain anywhere */
async function assertCleanState(page: Page) {
  // Wait for the setTimeout(0) in dragstart that adds .dragging-source
  await page.waitForTimeout(50);
  const state = await page.evaluate(() => {
    return {
      draggingSources: document.querySelectorAll(".dragging-source").length,
      isOverZones: document.querySelectorAll(".is-over").length,
    };
  });
  expect(state.draggingSources, "no dragging sources").toBe(0);
  expect(state.isOverZones, "no is-over highlights").toBe(0);
}

/** Check that a dropzone has the is-over highlight */
async function assertIsOver(page: Page, slotSelector: string) {
  const isOver = await page.evaluate(
    (sel) => document.querySelector(sel)!.classList.contains("is-over"),
    slotSelector
  );
  expect(isOver, `${slotSelector} should have is-over`).toBe(true);
}

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → MEMBER SLOT (expanded)
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Expanded Member Slot", () => {
  test("employee from member slot to another team's member slot", async ({
    page,
  }) => {
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', true);
    await assertIsOver(page, '.team[data-team-id="t2"] > .team-body > .member-slot');

    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });

  test("employee from roster to team member slot", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);
    await assertIsOver(page, '.team[data-team-id="t1"] > .team-body > .member-slot');

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });

  test("employee from manager slot to team member slot", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p1"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p1"]', true);
    await assertIsOver(page, '.team[data-team-id="t2"] > .team-body > .member-slot');

    await dragCancel(page, '.person-card[data-id="p1"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → MANAGER SLOT
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Manager Slot", () => {
  test("employee to empty manager slot — is-over highlight", async ({
    page,
  }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);
    await assertIsOver(page, '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot');

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → ROSTER (unassigned bar)
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Roster", () => {
  test("employee from team to roster — is-over highlight", async ({
    page,
  }) => {
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      ".roster-cards"
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', true);
    await assertIsOver(page, ".roster-cards");

    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → COLLAPSED TEAM
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Collapsed Team Member Slot", () => {
  test("highlights the collapsed team border", async ({
    page,
  }) => {
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveAttribute("data-view", "collapsed");

    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t3"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveClass(/is-over/);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   TEAM → SUB-TEAM SLOT (nesting)
   ═══════════════════════════════════════════════════════ */

test.describe("Team → Sub-team Slot (Nesting)", () => {
  test("team dragged into another team's subteam slot highlights it", async ({
    page,
  }) => {
    const t3 = page.locator('.team[data-team-id="t3"]');
    if ((await t3.getAttribute("data-view")) === "collapsed") {
      await t3
        .locator('> .team-titlebar [data-action="toggle-collapse"]')
        .click();
      await expect(t3).toHaveAttribute("data-view", "expanded");
    }

    await dragHover(
      page,
      '.team[data-team-id="t3"] > .team-titlebar .team-handle',
      '.team[data-team-id="t2"] > .team-body > .subteam-slot'
    );

    await assertIsOver(page, '.team[data-team-id="t2"] > .team-body > .subteam-slot');

    await dragCancel(
      page,
      '.team[data-team-id="t3"] > .team-titlebar .team-handle'
    );
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   TEAM → ROOT DROPZONE
   ═══════════════════════════════════════════════════════ */

test.describe("Team → Root Dropzone", () => {
  test("team to root — is-over highlight", async ({
    page,
  }) => {
    await dragHover(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle',
      ".root-dropzone"
    );

    await assertIsOver(page, ".root-dropzone");

    await dragCancel(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle'
    );
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   COPY MODE — source remains fully visible
   ═══════════════════════════════════════════════════════ */

test.describe("Copy Mode — Source Visibility", () => {
  test("source stays fully visible in copy mode", async ({ page }) => {
    await page.keyboard.down("c");

    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', false);
    await assertIsOver(page, '.team[data-team-id="t2"] > .team-body > .member-slot');

    await dragCancel(page, '.person-card[data-id="p2"]');
    await page.keyboard.up("c");
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   ONLY ONE HIGHLIGHT at a time
   ═══════════════════════════════════════════════════════ */

test.describe("Highlight Exclusivity", () => {
  test("only one dropzone has is-over at a time", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    let isOverCount = await page.evaluate(
      () => document.querySelectorAll(".is-over").length
    );
    expect(isOverCount).toBe(1);

    // Move cursor to Operations slot
    await page.evaluate(() => {
      const slot = document.querySelector(
        '.team[data-team-id="t2"] > .team-body > .member-slot'
      )!;
      const r = slot.getBoundingClientRect();
      slot.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        })
      );
    });

    isOverCount = await page.evaluate(
      () => document.querySelectorAll(".is-over").length
    );
    expect(isOverCount).toBe(1);

    const isOverOnOps = await page.evaluate(() =>
      document
        .querySelector(
          '.team[data-team-id="t2"] > .team-body > .member-slot'
        )!
        .classList.contains("is-over")
    );
    expect(isOverOnOps).toBe(true);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   DRAG CLEANUP — all states revert
   ═══════════════════════════════════════════════════════ */

test.describe("Drag Cleanup", () => {
  test("everything reverts after successful drop", async ({ page }) => {
    await dragAndDrop(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );
    await assertCleanState(page);
  });

  test("everything reverts after drag cancel (no drop)", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );
    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   TEAM → COLLAPSED TEAM
   ═══════════════════════════════════════════════════════ */

test.describe("Team → Collapsed Team", () => {
  test("nesting team into collapsed team highlights the team border", async ({
    page,
  }) => {
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveAttribute("data-view", "collapsed");

    await dragHover(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle',
      '.team[data-team-id="t3"] > .team-body'
    );

    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveClass(/is-over/);

    await dragCancel(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle'
    );
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   UNASSIGNED BAR auto-expand on drag
   ═══════════════════════════════════════════════════════ */

test.describe("Unassigned Bar Auto-Expand", () => {
  test("collapsed bar expands when employee dragged over it", async ({
    page,
  }) => {
    await page.click(
      '#unassigned-drawer .unassigned-bar-header'
    );
    await expect(page.locator("#unassigned-drawer")).toHaveClass(
      /is-collapsed/
    );

    await dragHover(page, '.person-card[data-id="p2"]', ".unassigned-bar");

    await expect(page.locator("#unassigned-drawer")).not.toHaveClass(
      /is-collapsed/
    );

    await dragCancel(page, '.person-card[data-id="p2"]');
  });
});
