import { test, expect } from "./fixtures";

test.describe("Floating Action Bar", () => {
  test("action bar is visible and contains all buttons", async ({ page }) => {
    const bar = page.locator(".action-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-action="zoom-fit"]')).toBeVisible();
    await expect(bar.locator('[data-action="toggle-root-layout"]')).toHaveCount(0);
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

/** Add `count` empty root teams straight into app state. */
async function addRootTeams(page, count: number) {
  await page.evaluate((count) => {
    const t = (window as any).__test;
    const state = t.getState();
    for (let i = 0; i < count; i++) {
      const id = `tx${i}`;
      state.teams[id] = {
        id, name: `Team ${i}`, ownLayout: "expanded", manager: null,
        members: [], subTeams: [], color: "#93c5fd",
      };
      state.rootTeams.push(id);
    }
    t.render();
  }, count);
}

/** Put `count` extra people into a team's member list. */
async function addMembers(page, teamId: string, count: number) {
  await page.evaluate(({ teamId, count }) => {
    const t = (window as any).__test;
    const state = t.getState();
    for (let i = 0; i < count; i++) {
      const id = `px${teamId}${i}`;
      state.employees[id] = {
        id, name: `Person ${i}`, role: "Engineer", location: "Remote",
        timezone: "EST (UTC−5)", notes: "", requested: false, level: 5, currentManager: "",
      };
      state.teams[teamId].members.push({ id });
    }
    t.render();
  }, { teamId, count });
}

/** Group elements into visual columns by their left edge; returns the column sizes. */
async function columnSizes(page, selector: string): Promise<number[]> {
  return page.evaluate((selector) => {
    const cols = new Map<number, number>();
    for (const el of document.querySelectorAll(selector)) {
      const left = Math.round(el.getBoundingClientRect().left);
      cols.set(left, (cols.get(left) ?? 0) + 1);
    }
    return [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  }, selector);
}

/** Group elements into visual rows by their top edge; returns the row sizes. */
async function rowSizes(page, selector: string): Promise<number[]> {
  return page.evaluate((selector) => {
    const rows = new Map<number, number>();
    for (const el of document.querySelectorAll(selector)) {
      const top = Math.round(el.getBoundingClientRect().top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  }, selector);
}

test.describe("Board Flow", () => {
  test("root dropzone contains all root teams", async ({ page }) => {
    const data = await page.evaluate(() => {
      const dropzone = document.querySelector(".root-dropzone")!;
      const teams = [...dropzone.querySelectorAll(":scope > .team")];
      const dz = dropzone.getBoundingClientRect();
      const rects = teams.map((t) => t.getBoundingClientRect());
      return {
        count: teams.length,
        contained: rects.every((r) =>
          r.left >= dz.left && r.right <= dz.right && r.top >= dz.top && r.bottom <= dz.bottom),
      };
    });
    expect(data.count).toBe(2);
    expect(data.contained).toBe(true);
  });

  test("root teams are columns in a single row", async ({ page }) => {
    expect(await rowSizes(page, ".root-dropzone > .team")).toEqual([2]);
  });

  test("root teams stay in one row and the board scrolls sideways", async ({ page }) => {
    await addRootTeams(page, 15);

    expect(await rowSizes(page, ".root-dropzone > .team")).toEqual([17]);

    const overflow = await page.locator(".page-shell").evaluate((el) => ({
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  });

  test("layout does not change when the window is resized", async ({ page }) => {
    await addMembers(page, "t1", 8);
    const measure = () => page.evaluate(() => {
      const origin = document.querySelector(".root-dropzone")!.getBoundingClientRect();
      return [...document.querySelectorAll(".team")].map((t) => {
        const r = t.getBoundingClientRect();
        return [Math.round(r.left - origin.left), Math.round(r.top - origin.top), Math.round(r.width), Math.round(r.height)];
      });
    });
    const wide = await measure();
    await page.setViewportSize({ width: 700, height: 500 });
    expect(await measure()).toEqual(wide);
  });

  test("people stay in a single column however many there are", async ({ page }) => {
    // t1 has a manager and 2 members; add 12 more → 15 cards
    await addMembers(page, "t1", 12);
    const cards = '.team[data-team-id="t1"] > .team-body > .member-slot .person-card';
    expect(await columnSizes(page, cards)).toEqual([15]);
    // The manager heads the column
    const first = await page.evaluate((cards) => {
      const all = [...document.querySelectorAll(cards)];
      const top = Math.min(...all.map((c) => c.getBoundingClientRect().top));
      return all.find((c) => c.getBoundingClientRect().top === top)!.getAttribute("data-id");
    }, cards);
    expect(first).toBe("p1");
  });

  test("the people column is one card wide", async ({ page }) => {
    const width = await page
      .locator('.team[data-team-id="t1"] > .team-body > .member-slot')
      .evaluate((el) => el.getBoundingClientRect().width);
    // card (140) plus the slot's padding and hairline border
    expect(width).toBeGreaterThanOrEqual(148);
    expect(width).toBeLessThanOrEqual(152);
  });

  test("sub-teams sit to the right of their parent's people, top-aligned", async ({ page }) => {
    const pos = await page.evaluate(() => {
      const body = document.querySelector('.team[data-team-id="t2"] > .team-body')!;
      const members = body.querySelector(":scope > .member-slot")!.getBoundingClientRect();
      const sub = body.querySelector(":scope > .subteam-slot .team")!.getBoundingClientRect();
      return { membersRight: members.right, membersTop: members.top, subLeft: sub.left, subTop: sub.top };
    });
    expect(pos.subLeft).toBeGreaterThanOrEqual(pos.membersRight - 5);
    expect(Math.abs(pos.subTop - pos.membersTop)).toBeLessThanOrEqual(6);
  });

  test("sub-teams sit side by side inside their parent", async ({ page }) => {
    // Give Operations (t2) three more sub-teams
    await page.evaluate(() => {
      const t = (window as any).__test;
      const state = t.getState();
      for (let i = 0; i < 3; i++) {
        const id = `ts${i}`;
        state.teams[id] = {
          id, name: `Sub ${i}`, ownLayout: "expanded", manager: null,
          members: [], subTeams: [], color: "#93c5fd",
        };
        state.teams.t2.subTeams.push({ id });
      }
      t.render();
    });

    const entries = '.team[data-team-id="t2"] > .team-body > .subteam-slot > .member-entry';
    expect(await rowSizes(page, entries)).toEqual([4]);
  });

  test("a team is exactly as wide as its people plus its sub-teams", async ({ page }) => {
    const data = await page.evaluate(() => {
      const team = document.querySelector('.team[data-team-id="t2"]')!;
      const cs = getComputedStyle(team);
      const innerRight = team.getBoundingClientRect().right
        - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const lastSub = [...team.querySelectorAll(":scope > .team-body > .subteam-slot > .member-entry")].at(-1)!;
      return { innerRight: Math.round(innerRight), subRight: Math.round(lastSub.getBoundingClientRect().right) };
    });
    expect(Math.abs(data.innerRight - data.subRight)).toBeLessThanOrEqual(3);
  });

  test("people in a nested team are a single column too", async ({ page }) => {
    await addMembers(page, "t4", 7); // Field: empty manager slot + June + 7 → 9
    expect(await columnSizes(
      page,
      '.team[data-team-id="t4"] > .team-body > .member-slot > *'
    )).toEqual([9]);
  });
});

test.describe("Root and Nested Teams Match", () => {
  test("root and nested teams share the same panel shape", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const pick = (sel: string) => {
        const cs = getComputedStyle(document.querySelector(sel)!);
        return {
          border: cs.border,
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          display: cs.display,
          flexDirection: cs.flexDirection,
        };
      };
      return {
        root: pick('.root-dropzone > .team[data-team-id="t2"]'),
        nested: pick('.team[data-team-id="t4"]'),
      };
    });
    expect(styles.nested).toEqual(styles.root);
  });

  test("each nested team contrasts with the team that contains it", async ({ page }) => {
    // Build a chain four levels deep under Operations: t2 > t4 > d1 > d2
    await page.evaluate(() => {
      const t = (window as any).__test;
      const state = t.getState();
      const mk = (id: string) => { state.teams[id] = { id, name: id, ownLayout: "expanded", manager: null, members: [], subTeams: [], color: "#93c5fd" }; };
      mk("d1"); mk("d2");
      state.teams.t4.subTeams.push({ id: "d1" });
      state.teams.d1.subTeams.push({ id: "d2" });
      t.render();
    });
    const bgs = await page.evaluate(() =>
      ["t2", "t4", "d1", "d2"].map((id) =>
        getComputedStyle(document.querySelector(`.team[data-team-id="${id}"]`)!).backgroundColor));
    expect(bgs[0]).toBe("rgb(255, 255, 255)");
    expect(bgs[1]).not.toBe(bgs[0]);
    expect(bgs[2]).toBe(bgs[0]);
    expect(bgs[3]).toBe(bgs[1]);
  });

  test("the board lays out root teams the way a team lays out sub-teams", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const pick = (sel: string) => {
        const cs = getComputedStyle(document.querySelector(sel)!);
        return { display: cs.display, flexDirection: cs.flexDirection, flexWrap: cs.flexWrap, alignItems: cs.alignItems, gap: cs.gap };
      };
      return {
        board: pick(".root-dropzone"),
        subteams: pick('.team[data-team-id="t2"] > .team-body > .subteam-slot'),
      };
    });
    expect(styles.board).toEqual(styles.subteams);
    expect(styles.board).toEqual({ display: "flex", flexDirection: "row", flexWrap: "nowrap", alignItems: "flex-start", gap: "12px" });
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

test.describe("Zoom and Fit", () => {
  const readZoom = (page) => page.evaluate(() =>
    Number(getComputedStyle(document.querySelector(".page-shell")!).getPropertyValue("--board-zoom")));

  test("fit to screen leaves zoom at 100% when the board already fits", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('[data-action="zoom-fit"]').click();
    expect(await readZoom(page)).toBe(1);
    await expect(page.locator("#zoom-level-label")).toHaveText("100%");
  });

  test("fit to screen zooms out until the whole board is visible", async ({ page }) => {
    await addRootTeams(page, 4);
    const shell = page.locator(".page-shell");
    const overflowsBefore = await shell.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflowsBefore).toBe(true);

    await page.locator('[data-action="zoom-fit"]').click();

    const zoom = await readZoom(page);
    expect(zoom).toBeLessThan(1);
    await expect(page.locator("#zoom-level-label")).toHaveText(`${Math.round(zoom * 100)}%`);

    const fits = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!.getBoundingClientRect();
      const teams = [...document.querySelectorAll(".root-dropzone > .team")];
      return teams.every((t) => {
        const r = t.getBoundingClientRect();
        return r.bottom <= shell.bottom + 1 && r.right <= shell.right + 1;
      });
    });
    expect(fits).toBe(true);
  });

  test("fit to screen also fits a board that is too tall", async ({ page }) => {
    await addMembers(page, "t1", 8);
    const shell = page.locator(".page-shell");
    expect(await shell.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await page.locator('[data-action="zoom-fit"]').click();
    expect(await readZoom(page)).toBeLessThan(1);
    expect(await shell.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });

  test("fit to screen zooms back in after the board shrinks", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await addRootTeams(page, 4);
    await page.locator('[data-action="zoom-fit"]').click();
    expect(await readZoom(page)).toBeLessThan(1);

    await page.evaluate(() => {
      const t = (window as any).__test;
      const state = t.getState();
      state.rootTeams = state.rootTeams.filter((id: string) => !id.startsWith("tx"));
      t.render();
    });
    await page.locator('[data-action="zoom-fit"]').click();
    expect(await readZoom(page)).toBe(1);
  });

  test("cannot zoom out past the zoom that fits the whole board", async ({ page }) => {
    await addRootTeams(page, 4);
    await page.locator('[data-action="zoom-fit"]').click();
    const fit = await readZoom(page);
    expect(fit).toBeLessThan(1);

    await page.locator('[data-action="zoom-out"]').click();
    expect(await readZoom(page)).toBe(fit);
  });

  test("zooming out from 100% stops exactly at the fit zoom", async ({ page }) => {
    await addRootTeams(page, 4);
    for (let i = 0; i < 12; i++) await page.locator('[data-action="zoom-out"]').click();
    const stopped = await readZoom(page);
    await page.locator('[data-action="zoom-fit"]').click();
    expect(await readZoom(page)).toBe(stopped);
  });

  test("zoom-out does nothing when the whole board already fits at 100%", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('[data-action="zoom-out"]').click();
    expect(await readZoom(page)).toBe(1);
  });

  test("stepping in from a fit zoom lands on a round level", async ({ page }) => {
    await addRootTeams(page, 12);
    await page.locator('[data-action="zoom-fit"]').click();
    const fit = Math.round((await readZoom(page)) * 100);
    expect(fit % 10).not.toBe(0); // an in-between level, e.g. 23%

    await page.locator('[data-action="zoom-in"]').click();
    const next = Math.round((await readZoom(page)) * 100);
    expect(next).toBe((Math.floor(fit / 10) + 1) * 10);
    await expect(page.locator("#zoom-level-label")).toHaveText(`${next}%`);
  });

  test("a very large board still fits completely, below 25%", async ({ page }) => {
    await addRootTeams(page, 40);
    await addMembers(page, "t1", 30);
    await page.locator('[data-action="zoom-fit"]').click();
    const zoom = await readZoom(page);
    expect(zoom).toBeLessThan(0.25);

    const fits = await page.evaluate(() => {
      const shell = document.querySelector(".page-shell")!;
      const box = shell.getBoundingClientRect();
      const teams = [...document.querySelectorAll(".root-dropzone > .team")];
      return {
        allInView: teams.every((t) => { const r = t.getBoundingClientRect(); return r.right <= box.right && r.bottom <= box.bottom; }),
        scrolls: shell.scrollWidth > shell.clientWidth + 1 || shell.scrollHeight > shell.clientHeight + 1,
      };
    });
    expect(fits.allInView).toBe(true);
    expect(fits.scrolls).toBe(false);
  });

  test("zoom scales cards geometrically, with no minimum text size", async ({ page }) => {
    const height = () => page.locator('.person-card[data-id="p1"]').evaluate((el) => el.getBoundingClientRect().height);
    const at100 = await height();
    await addRootTeams(page, 40);
    await page.locator('[data-action="zoom-fit"]').click();
    const zoom = await readZoom(page);
    expect(Math.abs((await height()) - at100 * zoom)).toBeLessThan(0.5);
  });

  test("plain wheel scrolling shows no hint toast", async ({ page }) => {
    await page.locator(".page-shell").hover();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(100);
    await expect(page.locator(".scroll-hint")).toHaveCount(0);
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

test.describe("Board Scroll Fades", () => {
  const edges = (page) => page.locator(".board-scroll-fades").evaluate((el) =>
    ["left", "right", "up", "down"].filter((e) => el.classList.contains(`can-scroll-${e}`)));

  test("no fades when the whole board is in view", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect.poll(() => edges(page)).toEqual([]);
  });

  test("right fade shows when the board runs off to the right, left fade once scrolled", async ({ page }) => {
    await addRootTeams(page, 12);
    await expect.poll(() => edges(page)).toEqual(["right"]);

    await page.locator(".page-shell").evaluate((el) => { el.scrollLeft = 300; });
    await expect.poll(() => edges(page)).toEqual(["left", "right"]);

    await page.locator(".page-shell").evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect.poll(() => edges(page)).toEqual(["left"]);
  });

  test("bottom fade shows when the board runs off the bottom", async ({ page }) => {
    await addMembers(page, "t1", 12);
    await expect.poll(() => edges(page)).toContain("down");
    await page.locator(".page-shell").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => edges(page)).toEqual(["up"]);
  });

  test("fades update when zoom changes what fits", async ({ page }) => {
    await addRootTeams(page, 3);
    await expect.poll(() => edges(page)).toContain("right");
    await page.locator('[data-action="zoom-fit"]').click();
    await expect.poll(() => edges(page)).toEqual([]);
  });

  test("fades never block clicks on the board", async ({ page }) => {
    const pe = await page.locator(".board-scroll-fades").evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pe).toBe("none");
  });
});
