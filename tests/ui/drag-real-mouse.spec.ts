import { test, expect } from "./fixtures";
import type { Page, Locator } from "@playwright/test";

/**
 * Drag-and-drop driven by real mouse input (press, move, release) rather than
 * synthetic DragEvents, so hit-testing goes through the actual layout: what is
 * under the pointer is what receives the drop.
 *
 * Demo data:
 *   t1 Product     — manager p1 (Ava), members p2 (Milo), p3 (Zuri), sub-team t3
 *   t2 Operations  — manager p4 (Noah), member p5 (Lena), sub-team t4
 *   t3 Research    — collapsed; manager p6 (Iris), member p7 (Theo)
 *   t4 Field       — no manager; member p8 (June)
 *   Unassigned     — p9 (Eli), p10 (Nia)
 */

// Tall enough that every demo card is on screen and clear of the action bar
test.use({ viewport: { width: 1440, height: 1100 } });

type Point = { x: number; y: number };

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseDrag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // A few intermediate moves so the browser starts a native drag and fires dragover
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.move(to.x + 1, to.y + 1);
  await page.mouse.up();
}

const card = (page: Page, id: string) => page.locator(`.person-card[data-id="${id}"]`);
const team = (page: Page, id: string) => page.locator(`.team[data-team-id="${id}"]`);
const handle = (page: Page, id: string) => page.locator(`.team[data-team-id="${id}"] > .team-titlebar > .team-handle`);
const membersOf = (page: Page, id: string) => page.locator(`.team[data-team-id="${id}"] > .team-body > .member-slot`);
const managerOf = (page: Page, id: string) => page.locator(`.team[data-team-id="${id}"] > .team-body > .member-slot > .manager-slot`);
const subTeamsOf = (page: Page, id: string) => page.locator(`.team[data-team-id="${id}"] > .team-body > .subteam-slot`);

test.describe("Real mouse drag — person onto team", () => {
  test("member dropped on another team's people area joins that team", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(card(page, "p5")));
    await expect(membersOf(page, "t2").locator('.person-card[data-id="p2"]')).toHaveCount(1);
    await expect(team(page, "t1").locator('.person-card[data-id="p2"]')).toHaveCount(0);
  });

  test("person dropped on a team's title bar joins that team", async ({ page }) => {
    const title = team(page, "t2").locator("> .team-titlebar > .team-name");
    await mouseDrag(page, await centerOf(card(page, "p3")), await centerOf(title));
    await expect(membersOf(page, "t2").locator('.person-card[data-id="p3"]')).toHaveCount(1);
  });

  test("person dropped on an empty manager slot becomes the manager", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p5")), await centerOf(managerOf(page, "t4")));
    await expect(managerOf(page, "t4").locator('.person-card[data-id="p5"]')).toHaveCount(1);
    await expect(managerOf(page, "t4").locator(".empty-note")).toHaveCount(0);
  });

  test("person dropped on an occupied manager slot joins the members instead", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(card(page, "p4")));
    await expect(managerOf(page, "t2").locator('.person-card[data-id="p4"]')).toHaveCount(1);
    await expect(membersOf(page, "t2").locator('> .member-entry .person-card[data-id="p2"]')).toHaveCount(1);
  });

  test("person dropped on a collapsed team joins it", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(team(page, "t3")));
    await expect(team(page, "t1").locator('> .team-body > .member-slot .person-card[data-id="p2"]')).toHaveCount(0);
    // Expand Research to confirm p2 landed there
    await team(page, "t3").locator('[data-action="toggle-collapse"]').click();
    await expect(membersOf(page, "t3").locator('.person-card[data-id="p2"]')).toHaveCount(1);
  });

  test("person dropped into a nested team lands in the nested team, not its parent", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(card(page, "p8")));
    await expect(membersOf(page, "t4").locator('.person-card[data-id="p2"]')).toHaveCount(1);
    await expect(membersOf(page, "t2").locator('> .member-entry .person-card[data-id="p2"]')).toHaveCount(0);
  });

  test("unassigned person dropped on a team joins it", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p9")), await centerOf(card(page, "p3")));
    await expect(membersOf(page, "t1").locator('.person-card[data-id="p9"]')).toHaveCount(1);
    await expect(page.locator('.roster-cards .person-card[data-id="p9"]')).toHaveCount(0);
    await expect(page.locator(".unassigned-count")).toHaveText("1");
  });

  test("manager dropped on another team becomes a member there and leaves the slot empty", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p1")), await centerOf(card(page, "p5")));
    await expect(membersOf(page, "t2").locator('> .member-entry .person-card[data-id="p1"]')).toHaveCount(1);
    await expect(managerOf(page, "t1").locator(".empty-note")).toHaveCount(1);
  });
});

test.describe("Real mouse drag — person out of team", () => {
  test("member dropped on the unassigned drawer leaves the team", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(page.locator(".roster-cards")));
    await expect(page.locator('.roster-cards .person-card[data-id="p2"]')).toHaveCount(1);
    await expect(team(page, "t1").locator('.person-card[data-id="p2"]')).toHaveCount(0);
    await expect(page.locator(".unassigned-count")).toHaveText("3");
  });

  test("manager dropped on the unassigned drawer empties the manager slot", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p4")), await centerOf(page.locator(".roster-cards")));
    await expect(page.locator('.roster-cards .person-card[data-id="p4"]')).toHaveCount(1);
    await expect(managerOf(page, "t2").locator(".empty-note")).toHaveCount(1);
  });

  test("person from a nested team dropped on the drawer leaves the nested team", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p8")), await centerOf(page.locator(".roster-cards")));
    await expect(page.locator('.roster-cards .person-card[data-id="p8"]')).toHaveCount(1);
    await expect(membersOf(page, "t4").locator("> .empty-note")).toHaveCount(1);
  });

  test("person dropped on empty board space stays where they were", async ({ page }) => {
    const shell = await page.locator(".page-shell").boundingBox();
    await mouseDrag(page, await centerOf(card(page, "p2")), { x: shell!.x + shell!.width - 80, y: shell!.y + shell!.height - 120 });
    await expect(membersOf(page, "t1").locator('.person-card[data-id="p2"]')).toHaveCount(1);
  });

  test("dragging the last member out leaves a drop placeholder", async ({ page }) => {
    await mouseDrag(page, await centerOf(card(page, "p5")), await centerOf(page.locator(".roster-cards")));
    await expect(membersOf(page, "t2").locator("> .empty-note")).toHaveText("Drop people here");
  });
});

test.describe("Real mouse drag — team onto team", () => {
  test("root team dropped on another root team becomes its sub-team", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t2")), await centerOf(card(page, "p2")));
    await expect(subTeamsOf(page, "t1").locator('> .member-entry > .child-team > .team[data-team-id="t2"]')).toHaveCount(1);
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(1);
    // Its own sub-team travels with it
    await expect(team(page, "t2").locator('.team[data-team-id="t4"]')).toHaveCount(1);
  });

  test("team dropped on a team's title bar nests into it", async ({ page }) => {
    const title = team(page, "t1").locator("> .team-titlebar > .team-name");
    await mouseDrag(page, await centerOf(handle(page, "t2")), await centerOf(title));
    await expect(subTeamsOf(page, "t1").locator('.team[data-team-id="t2"]')).toHaveCount(1);
  });

  test("nested team dropped on a different parent moves there", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t4")), await centerOf(card(page, "p3")));
    await expect(subTeamsOf(page, "t1").locator('> .member-entry > .child-team > .team[data-team-id="t4"]')).toHaveCount(1);
    await expect(subTeamsOf(page, "t2").locator('.team[data-team-id="t4"]')).toHaveCount(0);
  });

  test("team dropped on a team with no sub-teams creates the first sub-team", async ({ page }) => {
    // Field (t4) has no sub-teams, so its sub-team area is hidden until a team hovers
    await expect(subTeamsOf(page, "t4")).toBeHidden();
    await mouseDrag(page, await centerOf(handle(page, "t1")), await centerOf(card(page, "p8")));
    await expect(subTeamsOf(page, "t4").locator('> .member-entry > .child-team > .team[data-team-id="t1"]')).toHaveCount(1);
  });

  test("team dropped on a collapsed team nests into it", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t4")), await centerOf(team(page, "t3")));
    await expect(subTeamsOf(page, "t2").locator('.team[data-team-id="t4"]')).toHaveCount(0);
    await team(page, "t3").locator('[data-action="toggle-collapse"]').click();
    await expect(subTeamsOf(page, "t3").locator('.team[data-team-id="t4"]')).toHaveCount(1);
  });

  test("team cannot be dropped into its own sub-team", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t2")), await centerOf(card(page, "p8")));
    await expect(page.locator('.root-dropzone > .team[data-team-id="t2"]')).toHaveCount(1);
    await expect(subTeamsOf(page, "t2").locator('.team[data-team-id="t4"]')).toHaveCount(1);
  });

  test("team dropped on itself is a no-op", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t1")), await centerOf(card(page, "p2")));
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(2);
  });
});

test.describe("Real mouse drag — team out of team", () => {
  test("nested team dropped on empty board space becomes a root team", async ({ page }) => {
    const shell = await page.locator(".page-shell").boundingBox();
    await mouseDrag(page, await centerOf(handle(page, "t4")), { x: shell!.x + shell!.width - 80, y: shell!.y + shell!.height - 120 });
    await expect(page.locator('.root-dropzone > .team[data-team-id="t4"]')).toHaveCount(1);
    await expect(page.locator(".root-dropzone > .team")).toHaveCount(3);
    // Operations no longer shows a sub-team area
    await expect(subTeamsOf(page, "t2")).toBeHidden();
  });

  test("collapsed nested team dropped on empty board space becomes a root team", async ({ page }) => {
    const shell = await page.locator(".page-shell").boundingBox();
    await mouseDrag(page, await centerOf(handle(page, "t3")), { x: shell!.x + shell!.width - 80, y: shell!.y + shell!.height - 120 });
    await expect(page.locator('.root-dropzone > .team[data-team-id="t3"]')).toHaveCount(1);
    await expect(team(page, "t3")).toHaveAttribute("data-view", "collapsed");
  });

  test("team dropped on the unassigned drawer stays where it was", async ({ page }) => {
    await mouseDrag(page, await centerOf(handle(page, "t4")), await centerOf(page.locator(".roster-cards")));
    await expect(subTeamsOf(page, "t2").locator('.team[data-team-id="t4"]')).toHaveCount(1);
  });
});

test.describe("Real mouse drag — still works when zoomed and scrolled", () => {
  test("person onto team when zoomed out to fit a wider board", async ({ page }) => {
    // Widen the board so there is something to zoom out for
    await page.evaluate(() => {
      const t = (window as any).__test;
      const state = t.getState();
      for (let i = 0; i < 8; i++) {
        const id = `tz${i}`;
        state.teams[id] = { id, name: `Team ${i}`, ownLayout: "expanded", manager: null, members: [], subTeams: [], color: "#93c5fd" };
        state.rootTeams.push(id);
      }
      t.render();
    });
    await page.locator('[data-action="zoom-fit"]').click();
    const zoom = await page.evaluate(() => Number(getComputedStyle(document.querySelector(".page-shell")!).getPropertyValue("--board-zoom")));
    expect(zoom).toBeLessThan(1);
    await mouseDrag(page, await centerOf(card(page, "p2")), await centerOf(card(page, "p5")));
    await expect(membersOf(page, "t2").locator('.person-card[data-id="p2"]')).toHaveCount(1);
  });

  test("team out to root at 120% zoom", async ({ page }) => {
    for (let i = 0; i < 2; i++) await page.locator('[data-action="zoom-in"]').click();
    // Drop on the empty board space just below the tallest column
    const lowest = await page.evaluate(() =>
      Math.max(...[...document.querySelectorAll(".root-dropzone > .team")].map((t) => t.getBoundingClientRect().bottom)));
    const shell = await page.locator(".page-shell").boundingBox();
    await mouseDrag(page, await centerOf(handle(page, "t4")), { x: shell!.x + 80, y: lowest + 24 });
    await expect(page.locator('.root-dropzone > .team[data-team-id="t4"]')).toHaveCount(1);
  });
});
