import { test, expect } from "./fixtures";
import { dragHover, dragCancel } from "./helpers";

/**
 * CSS regression tests — computed-style assertions that catch silent
 * breakage when styles are refactored or reordered.
 *
 * Grouped by CSS section (mirrors src/css/ structure).
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".team");
});

/* ── Design tokens ── */

test.describe("Design Tokens", () => {
  test("root custom properties are defined", async ({ page }) => {
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        bg: s.getPropertyValue("--bg").trim(),
        panel: s.getPropertyValue("--panel").trim(),
        accent: s.getPropertyValue("--accent").trim(),
        radiusLg: s.getPropertyValue("--radius-lg").trim(),
        radiusXl: s.getPropertyValue("--radius-xl").trim(),
      };
    });
    expect(tokens.bg).toBe("#f1f3f6");
    expect(tokens.panel).toBe("#fff");
    expect(tokens.accent).toBe("#4f6ef7");
    expect(tokens.radiusLg).toBe("14px");
    expect(tokens.radiusXl).toBe("20px");
  });
});

/* ── Person card ── */

test.describe("Person Card", () => {
  test("card dimensions and cursor", async ({ page }) => {
    const card = page.locator('.person-card[data-id="p1"]');
    const styles = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        width: cs.width,
        height: cs.height,
        cursor: cs.cursor,
        overflow: cs.overflow,
        display: cs.display,
        flexDirection: cs.flexDirection,
        borderRadius: cs.borderRadius,
      };
    });
    expect(styles.width).toBe("120px");
    expect(styles.height).toBe("120px");
    expect(styles.cursor).toBe("grab");
    expect(styles.overflow).toBe("hidden");
    expect(styles.display).toBe("flex");
    expect(styles.flexDirection).toBe("column");
    expect(styles.borderRadius).toBe("14px");
  });

  test("card text fields use ellipsis overflow", async ({ page }) => {
    const checks = await page.evaluate(() => {
      const selectors = [
        ".person-name",
        ".person-role",
        ".person-location",
        ".person-timezone",
      ];
      return selectors.map((sel) => {
        const el = document.querySelector(sel)!;
        const cs = getComputedStyle(el);
        return {
          sel,
          whiteSpace: cs.whiteSpace,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
        };
      });
    });
    for (const field of checks) {
      expect(field.whiteSpace, `${field.sel} whiteSpace`).toBe("nowrap");
      expect(field.overflow, `${field.sel} overflow`).toBe("hidden");
      expect(field.textOverflow, `${field.sel} textOverflow`).toBe("ellipsis");
    }
  });

  test("level badge renders inside timezone row", async ({ page }) => {
    // Add a person with a level so the badge appears
    await page.click('[data-action="open-team-menu"][data-team-id="t1"]');
    await page.click('.team-menu-item[data-menu-action="add-person"]');
    await page.fill("#ap-name", "Test Person");
    await page.fill("#ap-role", "Engineer");
    await page.fill("#ap-level", "5");
    await page.fill("#ap-location", "NYC");
    await page.click("#add-person-submit");
    await page.waitForSelector(".person-level");

    const parentClass = await page.evaluate(() => {
      const level = document.querySelector(".person-level")!;
      return level.parentElement!.className;
    });
    expect(parentClass).toContain("person-timezone");
  });

  test("card notes use two-line clamp", async ({ page }) => {
    // Add a person with notes
    await page.click('[data-action="open-team-menu"][data-team-id="t1"]');
    await page.click('.team-menu-item[data-menu-action="add-person"]');
    await page.fill("#ap-name", "Notes Person");
    await page.fill("#ap-role", "Analyst");
    await page.fill("#ap-location", "London");
    await page.fill("#ap-notes", "Some long note text");
    await page.click("#add-person-submit");
    await page.waitForSelector(".card-notes");

    const styles = await page.evaluate(() => {
      const el = document.querySelector(".card-notes")!;
      const cs = getComputedStyle(el);
      return {
        webkitLineClamp: cs.getPropertyValue("-webkit-line-clamp"),
        overflow: cs.overflow,
        // Chromium resolves -webkit-box to flow-root in getComputedStyle,
        // so check the specified value from the stylesheet instead.
        specifiedDisplay: el.style.display || cs.display,
      };
    });
    expect(styles.webkitLineClamp).toBe("2");
    expect(styles.overflow).toBe("hidden");
  });

  test("action buttons have z-index and backdrop for clickability", async ({
    page,
  }) => {
    const styles = await page.evaluate(() => {
      const actions = document.querySelector(".card-top-actions")!;
      const btn = document.querySelector(".card-action-button")!;
      const actionsCs = getComputedStyle(actions);
      const btnCs = getComputedStyle(btn);
      return {
        zIndex: actionsCs.zIndex,
        btnBackground: btnCs.backgroundColor,
      };
    });
    expect(Number(styles.zIndex)).toBeGreaterThanOrEqual(1);
    // Buttons should have a semi-transparent white backdrop
    expect(styles.btnBackground).toContain("rgba(255, 255, 255");
  });

  test("current manager label is not rendered on cards", async ({ page }) => {
    const count = await page.locator(".person-current-manager").count();
    expect(count).toBe(0);
  });
});

/* ── Team panel ── */

test.describe("Team Panel", () => {
  test("team panel base styles", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    const styles = await team.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflow: cs.overflow,
        display: cs.display,
        flexDirection: cs.flexDirection,
        borderRadius: cs.borderRadius,
      };
    });
    expect(styles.overflow).toBe("hidden");
    expect(styles.display).toBe("flex");
    expect(styles.flexDirection).toBe("column");
    expect(styles.borderRadius).toBe("20px");
  });

  test("team accent stripe is present", async ({ page }) => {
    const stripe = await page.evaluate(() => {
      const team = document.querySelector('.team[data-team-id="t1"]')!;
      const before = getComputedStyle(team, "::before");
      return {
        width: before.width,
        position: before.position,
      };
    });
    expect(stripe.width).toBe("3px");
    expect(stripe.position).toBe("absolute");
  });

  test("team handle has grab cursor", async ({ page }) => {
    const cursor = await page
      .locator('.team[data-team-id="t1"] > .team-titlebar .team-handle')
      .evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe("grab");
  });

  test("collapsed team has auto min-width", async ({ page }) => {
    // Research (t3) is collapsed by default
    const team = page.locator('.team[data-team-id="t3"]');
    await expect(team).toHaveAttribute("data-view", "collapsed");
    const minWidth = await team.evaluate(
      (el) => getComputedStyle(el).minWidth
    );
    expect(minWidth).toBe("0px");
  });

  test("collapsed team slots shrink min dimensions to zero", async ({
    page,
  }) => {
    const styles = await page.evaluate(() => {
      const team = document.querySelector(
        '.team[data-team-id="t3"]'
      )!;
      const mgrSlot = team.querySelector(".manager-slot");
      const memSlot = team.querySelector(".member-slot");
      const get = (el: Element) => {
        const cs = getComputedStyle(el);
        return { minWidth: cs.minWidth, minHeight: cs.minHeight };
      };
      return {
        manager: mgrSlot ? get(mgrSlot) : null,
        member: memSlot ? get(memSlot) : null,
      };
    });
    // Collapsed slots should have min-width/min-height of 0
    if (styles.manager) {
      expect(styles.manager.minWidth).toBe("0px");
      expect(styles.manager.minHeight).toBe("0px");
    }
    if (styles.member) {
      expect(styles.member.minWidth).toBe("0px");
      expect(styles.member.minHeight).toBe("0px");
    }
  });
});

/* ── Slots & dropzones ── */

test.describe("Slots and Dropzones", () => {
  test("manager and member slots have 143px minimum", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const team = document.querySelector(
        '.team[data-team-id="t1"]'
      )!;
      const body = team.querySelector(".team-body")!;
      const mgrSlot = body.querySelector(":scope > .manager-slot")!;
      const memSlot = body.querySelector(":scope > .member-slot")!;
      const get = (el: Element) => {
        const cs = getComputedStyle(el);
        return { minWidth: cs.minWidth, minHeight: cs.minHeight };
      };
      return { manager: get(mgrSlot), member: get(memSlot) };
    });
    expect(styles.manager.minWidth).toBe("143px");
    expect(styles.manager.minHeight).toBe("143px");
    expect(styles.member.minWidth).toBe("143px");
    expect(styles.member.minHeight).toBe("143px");
  });

  test("member slot flex layout", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const slot = document.querySelector(
        '.team[data-team-id="t1"] .member-slot'
      )!;
      const cs = getComputedStyle(slot);
      return {
        display: cs.display,
        gap: cs.gap,
      };
    });
    expect(styles.display).toBe("flex");
    expect(styles.gap).toBe("10px");
  });
});

/* ── Drop zone highlighting ── */

test.describe("Dropzone Highlight State", () => {
  test("is-over class applies accent border and background", async ({
    page,
  }) => {
    // Drag a card over an empty slot to trigger is-over
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    // Wait for CSS transition to complete (slots have transition: all 160ms)
    await page.waitForTimeout(200);

    const styles = await page.evaluate(() => {
      const slot = document.querySelector(
        '.team[data-team-id="t4"] > .team-body > .member-slot'
      )!;
      const cs = getComputedStyle(slot);
      return {
        borderColor: cs.borderColor,
        backgroundColor: cs.backgroundColor,
        hasIsOver: slot.classList.contains("is-over"),
      };
    });

    expect(styles.hasIsOver).toBe(true);
    // Accent color rgb(79, 110, 247)
    expect(styles.borderColor).toBe("rgb(79, 110, 247)");
    expect(styles.backgroundColor).toBe("rgba(79, 110, 247, 0.08)");

    await dragCancel(page, '.person-card[data-id="p9"]');
  });

  test("is-over class is removed after drag cancel", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    await dragCancel(page, '.person-card[data-id="p9"]');

    const hasIsOver = await page.evaluate(() => {
      const slot = document.querySelector(
        '.team[data-team-id="t4"] > .team-body > .member-slot'
      )!;
      return slot.classList.contains("is-over");
    });
    expect(hasIsOver).toBe(false);
  });
});

/* ── Drag previews ── */

test.describe("Drag Preview Styling", () => {
  test("preview has dashed accent border and soft background", async ({
    page,
  }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    const styles = await page.evaluate(() => {
      const preview = document.querySelector(".drag-preview-entry")!;
      const cs = getComputedStyle(preview);
      return {
        borderStyle: cs.borderStyle,
        borderColor: cs.borderColor,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        position: cs.position,
      };
    });

    expect(styles.borderStyle).toBe("dashed");
    expect(styles.borderColor).toBe("rgb(79, 110, 247)");
    expect(styles.backgroundColor).toBe("rgba(79, 110, 247, 0.08)");
    expect(styles.borderRadius).toBe("14px");
    expect(styles.position).toBe("relative");

    await dragCancel(page, '.person-card[data-id="p9"]');
  });

  test("dragging-source is hidden", async ({ page }) => {
    await dragHover(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    const display = await page.evaluate(() => {
      const source = document.querySelector(".dragging-source");
      return source ? getComputedStyle(source).display : "not-found";
    });
    expect(display).toBe("none");

    await dragCancel(page, '.person-card[data-id="p9"]');
  });
});

/* ── Facepile (collapsed team) ── */

test.describe("Facepile Dots", () => {
  test("facepile dots are round and sized correctly", async ({ page }) => {
    // Research (t3) is collapsed — shows facepile
    const styles = await page.evaluate(() => {
      const dot = document.querySelector(
        '.team[data-team-id="t3"] .facepile-dot'
      );
      if (!dot) return null;
      const cs = getComputedStyle(dot);
      return {
        width: cs.width,
        height: cs.height,
        borderRadius: cs.borderRadius,
      };
    });
    expect(styles).not.toBeNull();
    expect(styles!.width).toBe("14px");
    expect(styles!.height).toBe("14px");
    expect(styles!.borderRadius).toBe("50%");
  });
});

/* ── Stats panel ── */

test.describe("Stats Panel", () => {
  test("collapsed panel is 40px wide", async ({ page }) => {
    const panel = page.locator(".stats-panel");
    await expect(panel).not.toHaveClass(/is-open/);
    const width = await panel.evaluate((el) => getComputedStyle(el).width);
    expect(width).toBe("40px");
  });

  test("expanded panel is 320px wide", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const panel = page.locator(".stats-panel");
    await expect(panel).toHaveClass(/is-open/);
    // Wait for CSS transition (width 300ms)
    await page.waitForTimeout(350);
    const width = await panel.evaluate((el) => getComputedStyle(el).width);
    expect(width).toBe("320px");
  });

  test("panel is fixed positioned at right edge", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const panel = document.querySelector(".stats-panel")!;
      const cs = getComputedStyle(panel);
      return {
        position: cs.position,
        right: cs.right,
        zIndex: cs.zIndex,
      };
    });
    expect(styles.position).toBe("fixed");
    expect(styles.right).toBe("0px");
    expect(styles.zIndex).toBe("95");
  });

  test("strip hidden and content visible when open", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(page.locator(".stats-panel")).toHaveClass(/is-open/);
    // Wait for CSS transition
    await page.waitForTimeout(350);
    const styles = await page.evaluate(() => {
      const panel = document.querySelector(".stats-panel")!;
      // When open, strip is replaced by header + body (no strip in DOM)
      const strip = panel.querySelector(".stats-panel-strip");
      const header = panel.querySelector(".stats-panel-header");
      const body = panel.querySelector(".stats-panel-body");
      return {
        stripPresent: !!strip,
        headerDisplay: header
          ? getComputedStyle(header).display
          : "not-found",
        bodyDisplay: body ? getComputedStyle(body).display : "not-found",
      };
    });
    // Strip is removed from DOM when open, header and body are rendered
    expect(styles.stripPresent).toBe(false);
    expect(styles.headerDisplay).toBe("flex");
  });

  test("nested stats sections are indented", async ({ page }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    const paddingLeft = await page.evaluate(() => {
      const nested = document.querySelector(".stats-nested");
      return nested ? getComputedStyle(nested).paddingLeft : null;
    });
    expect(paddingLeft).toBe("16px");
  });

  test("minimised strips stack consecutively without large gaps", async ({
    page,
  }) => {
    const panel = page.locator(".stats-panel");
    await expect(panel).not.toHaveClass(/is-open/);

    const gaps = await page.evaluate(() => {
      const strips = document.querySelectorAll(".stats-panel-strip");
      const rects = Array.from(strips).map((s) => s.getBoundingClientRect());
      const results: number[] = [];
      for (let i = 1; i < rects.length; i++) {
        results.push(rects[i].top - rects[i - 1].bottom);
      }
      return results;
    });

    // All three strips should be present
    expect(gaps.length).toBe(2);
    // Gaps between strips should be negligible (≤1px for border)
    for (const gap of gaps) {
      expect(gap).toBeLessThanOrEqual(1);
    }
  });

  test("manager change detail does not overflow container", async ({
    page,
  }) => {
    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await expect(page.locator(".stats-panel")).toHaveClass(/is-open/);

    // Expand manager changes details if collapsed
    const toggle = page.locator(".stats-collapsible-toggle");
    if (await toggle.count() > 0) {
      await toggle.click();
    }

    const overflow = await page.evaluate(() => {
      const detail = document.querySelector(
        ".manager-change-detail"
      ) as HTMLElement | null;
      if (!detail) return { found: false };
      const row = detail.closest(".manager-change-row") as HTMLElement;
      return {
        found: true,
        detailRight: Math.round(detail.getBoundingClientRect().right),
        rowRight: Math.round(row.getBoundingClientRect().right),
        truncated: detail.scrollWidth > detail.clientWidth,
      };
    });
    if (overflow.found) {
      // Detail should not extend past the row boundary
      expect(overflow.detailRight).toBeLessThanOrEqual(overflow.rowRight! + 1);
    }
  });
});

test.describe("Layout Adjustments — Stats Panel Open", () => {
  test("unassigned bar shifts right when panel opens", async ({ page }) => {
    const barBefore = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".unassigned-bar")!).right
    );
    expect(barBefore).toBe("40px");

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    // Wait for transition
    await page.waitForTimeout(350);

    const barAfter = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".unassigned-bar")!).right
    );
    expect(barAfter).toBe("320px");
  });

  test("page-shell gets margin-right when panel opens", async ({ page }) => {
    const before = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".page-shell")!).marginRight
    );
    expect(before).toBe("40px");

    await page.click(".stats-panel-strip:not(.checks-strip):not(.notes-strip)");
    await page.waitForTimeout(350);

    const after = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".page-shell")!).marginRight
    );
    expect(after).toBe("320px");
  });
});

/* ── Empty note visibility ── */

test.describe("Empty Note Visibility", () => {
  test("empty notes show in empty slots without drag", async ({ page }) => {
    // Field (t4) has empty manager slot
    const mgrNote = page.locator(
      '.team[data-team-id="t4"] .manager-slot .empty-note'
    );
    await expect(mgrNote).toBeVisible();
    await expect(mgrNote).toHaveCSS("font-style", "italic");
  });

  test("empty note in slot is absolutely positioned and centered", async ({
    page,
  }) => {
    const mgrNote = page.locator(
      '.team[data-team-id="t4"] .manager-slot .empty-note'
    );
    await expect(mgrNote).toHaveCSS("position", "absolute");
    await expect(mgrNote).toHaveCSS("display", "grid");
    await expect(mgrNote).toHaveCSS("place-items", "center");
    // inset: 0 means the note fills the entire slot
    await expect(mgrNote).toHaveCSS("inset", "0px");
  });

  test("empty note in slot has no overflow hidden", async ({ page }) => {
    const mgrNote = page.locator(
      '.team[data-team-id="t4"] .manager-slot .empty-note'
    );
    const overflow = await mgrNote.evaluate(
      (el) => getComputedStyle(el).overflow
    );
    expect(overflow).toBe("visible");
  });
});
