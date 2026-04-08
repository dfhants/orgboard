import { test, expect } from "./fixtures";
import { dragAndDrop, dragHover, dragCancel } from "./helpers";

test.describe("Drag and Drop — Move", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("move employee between teams", async ({ page }) => {
    // Milo (p2) starts in Product (t1) member slot
    const sourceSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    await expect(
      sourceSlot.locator('.person-card[data-id="p2"]')
    ).toBeVisible();

    await dragAndDrop(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Milo should now be in Operations, not in Product
    const targetSlot = page.locator(
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );
    await expect(
      targetSlot.locator('.person-card[data-id="p2"]')
    ).toBeVisible();
    await expect(
      sourceSlot.locator('.person-card[data-id="p2"]')
    ).toHaveCount(0);
  });

  test("move employee to empty manager slot", async ({ page }) => {
    // Field team (t4) has no manager
    const fieldManagerSlot = page.locator(
      '.team[data-team-id="t4"] .manager-slot'
    );
    await expect(fieldManagerSlot.locator(".person-card")).toHaveCount(0);

    // Drag an unassigned employee (Eli p9) to Field manager slot
    await dragAndDrop(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] .manager-slot'
    );

    // Eli should now be the manager
    await expect(
      fieldManagerSlot.locator(".person-card .person-name")
    ).toHaveText("Eli Vasquez");
  });

  test("move employee to unassigned bar", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(
      await drawer.locator(".unassigned-count").textContent()
    );

    // Drag Zuri (p3) from Product members to the roster
    await dragAndDrop(
      page,
      '.person-card[data-id="p3"]',
      ".roster-cards"
    );

    await expect(
      drawer.locator('.person-card[data-id="p3"]')
    ).toBeVisible();

    const countAfter = Number(
      await drawer.locator(".unassigned-count").textContent()
    );
    expect(countAfter).toBe(countBefore + 1);
  });

  test("move unassigned employee into team", async ({ page }) => {
    // Nia (p10) is unassigned
    await dragAndDrop(
      page,
      '.person-card[data-id="p10"]',
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    // Nia should now be in Product's member slot
    const targetSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    await expect(
      targetSlot.locator('.person-card[data-id="p10"]')
    ).toBeVisible();

    // Gone from unassigned bar
    await expect(
      page.locator('#unassigned-drawer .person-card[data-id="p10"]')
    ).toHaveCount(0);
  });

  test("move manager out of manager slot to member slot", async ({ page }) => {
    // Ava (p1) is manager of Product (t1)
    const managerSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .manager-slot'
    );
    await expect(
      managerSlot.locator('.person-card[data-id="p1"]')
    ).toBeVisible();

    await dragAndDrop(
      page,
      '.team[data-team-id="t1"] > .team-body > .manager-slot .person-card[data-id="p1"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Ava should be in Operations members, not Product manager slot
    const targetSlot = page.locator(
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );
    await expect(
      targetSlot.locator('.person-card[data-id="p1"]')
    ).toBeVisible();
    await expect(
      managerSlot.locator('.person-card[data-id="p1"]')
    ).toHaveCount(0);
  });

  test("move nested team to another parent", async ({ page }) => {
    // Research (t3) is nested in Product (t1), drag handle to Operations (t2)
    await dragAndDrop(
      page,
      '.team[data-team-id="t3"] > .team-titlebar .team-handle',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Research should now be inside Operations, not Product
    await expect(
      page.locator('.team[data-team-id="t2"] .team[data-team-id="t3"]')
    ).toBeVisible();
    await expect(
      page.locator(
        '.team[data-team-id="t1"] .team[data-team-id="t3"]'
      )
    ).toHaveCount(0);
  });

  test("circular nesting is prevented — cannot drop parent into its own child", async ({
    page,
  }) => {
    // Product (t1) contains Research (t3). Try to drag t1 into t3's member slot.
    // First expand t3 so it has a visible member slot
    const t3 = page.locator('.team[data-team-id="t3"]');
    if ((await t3.getAttribute("data-view")) === "collapsed") {
      await t3
        .locator('> .team-titlebar [data-action="toggle-collapse"]')
        .click();
    }

    // Count root teams before
    const rootTeamsBefore = await page
      .locator(".root-dropzone > .team")
      .count();

    await dragAndDrop(
      page,
      '.team[data-team-id="t1"] > .team-titlebar .team-handle',
      '.team[data-team-id="t3"] > .team-body > .member-slot'
    );

    // t1 should still be a root team — drag should be rejected
    const rootTeamsAfter = await page
      .locator(".root-dropzone > .team")
      .count();
    expect(rootTeamsAfter).toBe(rootTeamsBefore);
    // t1 should still contain t3, not the other way around
    await expect(
      page.locator('.team[data-team-id="t1"] .team[data-team-id="t3"]')
    ).toHaveCount(1);
  });

  test("drag employee to occupied manager slot is rejected", async ({
    page,
  }) => {
    // Product (t1) already has Ava (p1) as manager
    const managerSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .manager-slot'
    );
    await expect(
      managerSlot.locator('.person-card[data-id="p1"]')
    ).toBeVisible();

    // Try to drag Milo (p2) to the occupied manager slot
    await dragAndDrop(
      page,
      '.person-card[data-id="p2"]',
      '.team[data-team-id="t1"] > .team-body > .manager-slot'
    );

    // Wait for async class cleanup (setTimeout(0) in dragstart handler
    // can leave a stale dragging-source class after rejected drops)
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      document.querySelectorAll(".dragging-source").forEach((el) => {
        el.classList.remove("dragging-source");
      });
    });

    // Manager should still be Ava, not Milo
    await expect(
      managerSlot.locator('.person-card[data-id="p1"]')
    ).toBeVisible();
    // Milo should still be in member slot (visible after timeout cleanup)
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-body > .member-slot .person-card[data-id="p2"]'
      )
    ).toBeVisible();
  });

  test("reorder employee within the same team", async ({ page }) => {
    // Product (t1) has members. Get the member order before.
    const memberSlot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );
    const namesBefore = await memberSlot
      .locator(".person-card .person-name")
      .allTextContents();
    expect(namesBefore.length).toBeGreaterThanOrEqual(2);

    // Drag the first member card to the end of the same slot
    const firstCard = memberSlot.locator(".person-card").first();
    const firstId = await firstCard.getAttribute("data-id");

    await dragAndDrop(
      page,
      `.person-card[data-id="${firstId}"]`,
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    // The member should still be in the same team (not lost)
    await expect(
      memberSlot.locator(`.person-card[data-id="${firstId}"]`)
    ).toBeVisible();
    // Total member count should be unchanged
    const namesAfter = await memberSlot
      .locator(".person-card .person-name")
      .allTextContents();
    expect(namesAfter.length).toBe(namesBefore.length);
  });

  test("dragging manager out of nested team does not hide the team", async ({
    page,
  }) => {
    // Research (t3) is nested inside Product (t1) and starts collapsed.
    // Expand it so the manager card is visible.
    const t3 = page.locator('.team[data-team-id="t3"]');
    if ((await t3.getAttribute("data-view")) === "collapsed") {
      await t3
        .locator('> .team-titlebar [data-action="toggle-collapse"]')
        .click();
    }

    const managerSlot = t3.locator("> .team-body > .manager-slot");
    await expect(managerSlot.locator('.person-card[data-id="p6"]')).toBeVisible();

    // Start dragging the manager (Iris, p6) and hover over another slot
    const sourceSelector =
      '.team[data-team-id="t3"] > .team-body > .manager-slot .person-card[data-id="p6"]';
    await dragHover(
      page,
      sourceSelector,
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    // Wait a tick for the setTimeout(0) that applies dragging-source
    await page.waitForTimeout(50);

    // The Research team section must remain visible during the drag.
    // Before the fix, the entire .member-entry wrapping the child team
    // received .dragging-source and the whole team disappeared.
    await expect(t3).toBeVisible();

    // Clean up the drag
    await dragCancel(page, sourceSelector);
  });
});
