import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { dragAndDrop, dragHover, dragCancel } from "./helpers";

/**
 * Mid-drag state assertions for every drag-drop combination.
 *
 * For each scenario we verify:
 *  - Source element: hidden (move) or visible (copy)
 *  - Target dropzone: has `.is-over` highlight
 *  - Preview: correct type present in the right place (or absent)
 *  - Preview fits within target bounds (no overflow)
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

/** Check mid-drag state of target slot */
async function assertSlotDragState(
  page: Page,
  slotSelector: string,
  opts: {
    isOver: boolean;
    hasPreviewEntry?: boolean;
    hasPreviewDot?: boolean;
    previewFitsInSlot?: boolean;
  }
) {
  return page.evaluate(
    ({ sel, opts }) => {
      const slot = document.querySelector(sel);
      if (!slot) throw new Error(`Slot not found: ${sel}`);
      const cs = getComputedStyle(slot);

      const result: Record<string, unknown> = {
        isOver: slot.classList.contains("is-over"),
        hasPreviewEntry: !!slot.querySelector(".drag-preview-entry"),
        hasPreviewDot: !!(
          slot.querySelector(".drag-preview-dot") ||
          slot
            .closest(".team")
            ?.querySelector(".member-facepile .drag-preview-dot")
        ),
      };

      // Check preview overflow
      const preview = slot.querySelector(
        ".drag-preview-entry"
      ) as HTMLElement | null;
      if (preview && opts.previewFitsInSlot) {
        const sr = slot.getBoundingClientRect();
        const pr = preview.getBoundingClientRect();
        result.overflowRight = Math.round(pr.right - sr.right);
        result.overflowBottom = Math.round(pr.bottom - sr.bottom);
      }

      return result;
    },
    { sel: slotSelector, opts }
  );
}

/** Check that the source element is hidden or visible */
async function assertSourceState(
  page: Page,
  sourceSelector: string,
  expectHidden: boolean
) {
  const state = await page.evaluate(
    ({ sel }) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      const entry = el.closest(".member-entry") || el;
      return {
        found: true,
        hasDraggingSource: entry.classList.contains("dragging-source"),
        display: getComputedStyle(entry).display,
      };
    },
    { sel: sourceSelector }
  );

  if (expectHidden) {
    // In move mode the source's .member-entry wrapper gets display:none
    expect(state.hasDraggingSource, "source should have dragging-source class").toBe(true);
    expect(state.display, "source should be hidden").toBe("none");
  } else {
    expect(
      state.hasDraggingSource,
      "source should NOT have dragging-source class"
    ).toBe(false);
  }
}

/** No previews or highlights remain anywhere */
async function assertCleanState(page: Page) {
  const state = await page.evaluate(() => {
    return {
      draggingSources: document.querySelectorAll(".dragging-source").length,
      isOverZones: document.querySelectorAll(".is-over").length,
      previewEntries: document.querySelectorAll(".drag-preview-entry").length,
      previewDots: document.querySelectorAll(".drag-preview-dot").length,
    };
  });
  expect(state.draggingSources, "no dragging sources").toBe(0);
  expect(state.isOverZones, "no is-over highlights").toBe(0);
  expect(state.previewEntries, "no preview entries").toBe(0);
  expect(state.previewDots, "no preview dots").toBe(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".team");
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → MEMBER SLOT (expanded)
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Expanded Member Slot", () => {
  test("employee from member slot to another team's member slot", async ({
    page,
  }) => {
    // Drag Milo (p2, in Product t1) over Operations (t2) member slot
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', true);

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t2"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true, previewFitsInSlot: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);
    expect(slotState.overflowRight).toBeLessThanOrEqual(0);
    expect(slotState.overflowBottom).toBeLessThanOrEqual(0);

    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });

  test("employee from roster to team member slot", async ({ page }) => {
    // Drag Eli (p9, unassigned) over Product (t1) member slot
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t1"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true, previewFitsInSlot: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);
    expect(slotState.overflowRight).toBeLessThanOrEqual(0);
    expect(slotState.overflowBottom).toBeLessThanOrEqual(0);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });

  test("employee from manager slot to team member slot", async ({ page }) => {
    // Drag Ava (p1, manager of Product t1) over Operations (t2) member slot
    await dragHover(
      page,
      '.person-card[data-id="p1"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p1"]', true);

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t2"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);

    await dragCancel(page, '.person-card[data-id="p1"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → MANAGER SLOT
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Manager Slot", () => {
  test("employee to empty manager slot — no preview, is-over highlight", async ({
    page,
  }) => {
    // Field (t4) has no manager — drag Eli (p9) over it
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);

    // Manager slot does NOT get a preview (dropKind="manager")
    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot',
      { isOver: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(false);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → ROSTER (unassigned bar)
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Roster", () => {
  test("employee from team to roster — is-over, no preview", async ({
    page,
  }) => {
    // Drag Milo (p2) from Product over unassigned roster
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      ".roster-cards"
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', true);

    const rosterState = await assertSlotDragState(page, ".roster-cards", {
      isOver: true,
    });
    expect(rosterState.isOver).toBe(true);
    // Roster does NOT get a preview entry (dropKind="roster")
    expect(rosterState.hasPreviewEntry).toBe(false);

    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPLOYEE → COLLAPSED TEAM (team border highlight, no preview dot)
   ═══════════════════════════════════════════════════════ */

test.describe("Employee → Collapsed Team Member Slot", () => {
  test("highlights the collapsed team border, not a card or dot preview", async ({
    page,
  }) => {
    // Research (t3) is collapsed by default
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveAttribute("data-view", "collapsed");

    // Drag Eli (p9, unassigned) over Research member slot
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t3"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p9"]', true);

    // The collapsed team itself should have the is-over highlight
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveClass(/is-over/);

    // No preview dot or card preview should be inserted
    const previewCount = await page.evaluate(() => {
      const team = document.querySelector('.team[data-team-id="t3"]');
      const dots = team?.querySelectorAll(".drag-preview-dot").length ?? 0;
      const entries = team?.querySelectorAll(".drag-preview-entry").length ?? 0;
      return dots + entries;
    });
    expect(previewCount).toBe(0);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   TEAM → SUB-TEAM SLOT (nesting)
   ═══════════════════════════════════════════════════════ */

test.describe("Team → Sub-team Slot (Nesting)", () => {
  test("team dragged into another team's subteam slot shows preview", async ({
    page,
  }) => {
    // Expand Research (t3) first so its handle is accessible
    const t3 = page.locator('.team[data-team-id="t3"]');
    if ((await t3.getAttribute("data-view")) === "collapsed") {
      await t3
        .locator('> .team-titlebar [data-action="toggle-collapse"]')
        .click();
      await expect(t3).toHaveAttribute("data-view", "expanded");
    }

    // Drag Research (t3) handle over Operations (t2) subteam slot
    await dragHover(
      page,
      '.team[data-team-id="t3"] > .team-titlebar .team-handle',
      '.team[data-team-id="t2"] > .team-body > .subteam-slot'
    );

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t2"] > .team-body > .subteam-slot',
      { isOver: true, hasPreviewEntry: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);

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
  test("team from member slot to root — is-over, no card preview", async ({
    page,
  }) => {
    // Drag Field (t4) handle over the root dropzone
    await dragHover(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle',
      ".root-dropzone"
    );

    const rootState = await assertSlotDragState(page, ".root-dropzone", {
      isOver: true,
    });
    expect(rootState.isOver).toBe(true);
    // Root dropzone with dropKind="root" should not get member preview
    expect(rootState.hasPreviewEntry).toBe(false);

    await dragCancel(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle'
    );
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   COPY MODE — source remains visible
   ═══════════════════════════════════════════════════════ */

test.describe("Copy Mode — Source Visibility", () => {
  test("source stays visible in copy mode", async ({ page }) => {
    // Hold C then start drag
    await page.keyboard.down("c");

    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Source should NOT be hidden in copy mode
    await assertSourceState(page, '.person-card[data-id="p2"]', false);

    // Target should still have preview and highlight
    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t2"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);

    await dragCancel(page, '.person-card[data-id="p2"]');
    await page.keyboard.up("c");
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   cross-slot preview: same team, member → member slot
   ═══════════════════════════════════════════════════════ */

test.describe("Same-Team Reorder", () => {
  test("dragging within same member slot shows preview at new position", async ({
    page,
  }) => {
    // Drag Milo (p2) over Product (t1) member slot (same team, reordering)
    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    await assertSourceState(page, '.person-card[data-id="p2"]', true);

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t1"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true, previewFitsInSlot: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);
    expect(slotState.overflowRight).toBeLessThanOrEqual(0);
    expect(slotState.overflowBottom).toBeLessThanOrEqual(0);

    await dragCancel(page, '.person-card[data-id="p2"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   EMPTY SLOT: preview in empty member slot
   ═══════════════════════════════════════════════════════ */

test.describe("Empty Slot Preview", () => {
  test("preview in fully empty member slot fits and hides empty-note", async ({
    page,
  }) => {
    // Move June out to make Field (t4) member slot empty
    await dragAndDrop(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const emptyNote = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot > .empty-note'
    );
    await expect(emptyNote).toBeVisible();

    // Drag Eli over the now-empty slot
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    // Empty note hidden
    await expect(emptyNote).toBeHidden();

    // Preview fits
    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t4"] > .team-body > .member-slot',
      { isOver: true, hasPreviewEntry: true, previewFitsInSlot: true }
    );
    expect(slotState.isOver).toBe(true);
    expect(slotState.hasPreviewEntry).toBe(true);
    expect(slotState.overflowRight).toBeLessThanOrEqual(0);
    expect(slotState.overflowBottom).toBeLessThanOrEqual(0);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });

  test("preview in empty manager slot — is-over only", async ({ page }) => {
    // Field (t4) already has empty manager slot
    const mgrSlot = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot'
    );
    const emptyNote = mgrSlot.locator(".empty-note");
    await expect(emptyNote).toBeVisible();

    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot'
    );

    const slotState = await assertSlotDragState(
      page,
      '.team[data-team-id="t4"] > .team-body > .member-slot > .manager-slot',
      { isOver: true }
    );
    expect(slotState.isOver).toBe(true);
    // No card preview in manager slot
    expect(slotState.hasPreviewEntry).toBe(false);

    await dragCancel(page, '.person-card[data-id="p9"]');
    await assertCleanState(page);
  });
});

/* ═══════════════════════════════════════════════════════
   PREVIEW SIZE matches source card
   ═══════════════════════════════════════════════════════ */

test.describe("Preview Dimensions", () => {
  test("preview matches source card dimensions", async ({ page }) => {
    // Get Milo's card size before drag
    const cardSize = await page.evaluate(() => {
      const card = document.querySelector('.person-card[data-id="p2"]')!;
      const r = card.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });

    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const previewSize = await page.evaluate(() => {
      const preview = document.querySelector(".drag-preview-entry")!;
      const r = preview.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });

    expect(previewSize.width).toBe(cardSize.width);
    expect(previewSize.height).toBe(cardSize.height);

    await dragCancel(page, '.person-card[data-id="p2"]');
  });
});

/* ═══════════════════════════════════════════════════════
   SLOT WIDTH STABILITY during drag
   ═══════════════════════════════════════════════════════ */

test.describe("Slot Stability During Drag", () => {
  test("source slot does not collapse when card is hidden", async ({
    page,
  }) => {
    const slotSel =
      '.team[data-team-id="t1"] > .team-body > .member-slot';
    const widthBefore = await page.evaluate((sel) => {
      return document.querySelector(sel)!.getBoundingClientRect().width;
    }, slotSel);

    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const widthDuring = await page.evaluate((sel) => {
      return document.querySelector(sel)!.getBoundingClientRect().width;
    }, slotSel);

    // With display:none the source card is removed from flow, so the
    // source slot may shrink.  CSS min-width + tightenLayout preserves
    // its width during drag — verify it hasn't collapsed significantly (> 25%).
    expect(widthDuring).toBeGreaterThanOrEqual(widthBefore * 0.75);

    await dragCancel(page, '.person-card[data-id="p2"]');
  });

  test("source slot restores after drag cancel", async ({ page }) => {
    const slotSel =
      '.team[data-team-id="t1"] > .team-body > .member-slot';
    const widthBefore = await page.evaluate((sel) => {
      return document.querySelector(sel)!.getBoundingClientRect().width;
    }, slotSel);

    await dragHover(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );
    await dragCancel(page, '.person-card[data-id="p2"]');

    const widthAfter = await page.evaluate((sel) => {
      return document.querySelector(sel)!.getBoundingClientRect().width;
    }, slotSel);

    expect(widthAfter).toBeCloseTo(widthBefore, 0);
  });
});

/* ═══════════════════════════════════════════════════════
   ONLY ONE HIGHLIGHT at a time
   ═══════════════════════════════════════════════════════ */

test.describe("Highlight Exclusivity", () => {
  test("only one dropzone has is-over at a time", async ({ page }) => {
    // Drag Eli first over Product, then over Operations
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    let isOverCount = await page.evaluate(
      () => document.querySelectorAll(".is-over").length
    );
    expect(isOverCount).toBe(1);

    // Now fire dragover on Operations slot (simulates moving cursor)
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

    // And that it's on Operations, not Product
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
   ONLY ONE PREVIEW at a time
   ═══════════════════════════════════════════════════════ */

test.describe("Preview Exclusivity", () => {
  test("only one preview element exists during drag", async ({ page }) => {
    // Drag Eli over Product member slot
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    let previewCount = await page.evaluate(
      () =>
        document.querySelectorAll(
          ".drag-preview-entry, .drag-preview-dot"
        ).length
    );
    expect(previewCount).toBe(1);

    // Move to Operations
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

    previewCount = await page.evaluate(
      () =>
        document.querySelectorAll(
          ".drag-preview-entry, .drag-preview-dot"
        ).length
    );
    expect(previewCount).toBe(1);

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
   TEAM → COLLAPSED TEAM (team border highlight, no preview dot)
   ═══════════════════════════════════════════════════════ */

test.describe("Team → Collapsed Team", () => {
  test("nesting team into collapsed team highlights the team border", async ({
    page,
  }) => {
    // Research (t3) is collapsed; drag Field (t4) over it.
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveAttribute("data-view", "collapsed");

    await dragHover(
      page,
      '.team[data-team-id="t4"] > .team-titlebar .team-handle',
      '.team[data-team-id="t3"] > .team-body'
    );

    // The collapsed team itself should have the is-over highlight
    await expect(
      page.locator('.team[data-team-id="t3"]')
    ).toHaveClass(/is-over/);

    // No preview dot or card preview should be inserted
    const previewCount = await page.evaluate(() => {
      const team = document.querySelector('.team[data-team-id="t3"]');
      const dots = team?.querySelectorAll(".drag-preview-dot").length ?? 0;
      const entries = team?.querySelectorAll(".drag-preview-entry").length ?? 0;
      return dots + entries;
    });
    expect(previewCount).toBe(0);

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
    // Collapse the unassigned bar
    await page.click(
      '#unassigned-drawer .unassigned-bar-header'
    );
    await expect(page.locator("#unassigned-drawer")).toHaveClass(
      /is-collapsed/
    );

    // Start dragging Milo over the bar
    await dragHover(page, '.person-card[data-id="p2"]', ".unassigned-bar");

    // Bar should auto-expand
    await expect(page.locator("#unassigned-drawer")).not.toHaveClass(
      /is-collapsed/
    );

    await dragCancel(page, '.person-card[data-id="p2"]');
  });
});
