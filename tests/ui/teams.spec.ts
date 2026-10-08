import { test, expect } from "./fixtures";

test.describe("Team Expand / Collapse", () => {
  test("collapse a team by clicking its titlebar", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    await expect(team).toHaveAttribute("data-view", "expanded");

    // Click the chevron button to collapse
    await team
      .locator('> .team-titlebar [data-action="toggle-collapse"]')
      .click();

    await expect(team).toHaveAttribute("data-view", "collapsed");
    // Body content should be hidden (facepile replaces cards)
    await expect(
      team.locator("> .team-body .person-card").first()
    ).not.toBeVisible();
  });

  test("expand a collapsed team by clicking again", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    const chevron = team.locator(
      '> .team-titlebar [data-action="toggle-collapse"]'
    );

    // Collapse first
    await chevron.click();
    await expect(team).toHaveAttribute("data-view", "collapsed");

    // Expand
    await chevron.click();
    await expect(team).toHaveAttribute("data-view", "expanded");
    await expect(
      team.locator("> .team-body .member-slot .person-card").first()
    ).toBeVisible();
  });

  test("nested team collapse is independent of parent", async ({ page }) => {
    const parentTeam = page.locator('.team[data-team-id="t1"]');
    const nestedTeam = page.locator('.team[data-team-id="t3"]');

    // Parent starts expanded, nested (t3 Research) starts collapsed
    await expect(parentTeam).toHaveAttribute("data-view", "expanded");
    await expect(nestedTeam).toHaveAttribute("data-view", "collapsed");

    // Expand nested team
    await nestedTeam
      .locator('> .team-titlebar [data-action="toggle-collapse"]')
      .click();

    // Nested is now expanded, parent unchanged
    await expect(nestedTeam).toHaveAttribute("data-view", "expanded");
    await expect(parentTeam).toHaveAttribute("data-view", "expanded");

    // Collapse parent
    await parentTeam
      .locator('> .team-titlebar [data-action="toggle-collapse"]')
      .click();

    // Parent collapsed but nested keeps its own state
    await expect(parentTeam).toHaveAttribute("data-view", "collapsed");
  });

  test("rename team by clicking name, typing, and blurring", async ({
    page,
  }) => {
    const nameText = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
    );
    await expect(nameText).toHaveText("Product");

    // Click the name to start editing
    await nameText.click();

    // An input should replace the text
    const input = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-input'
    );
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Product");

    // Type a new name and blur to commit
    await input.fill("Product Engineering");
    await input.blur();

    // Name should be updated
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
      )
    ).toHaveText("Product Engineering");
  });

  test("rename team — Escape reverts to original name", async ({ page }) => {
    const nameText = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
    );
    await nameText.click();

    const input = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-input'
    );
    await input.fill("Discarded Name");
    await input.press("Escape");

    // Name should revert to original
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
      )
    ).toHaveText("Product");
  });

  test("rename team — Enter commits the name", async ({ page }) => {
    const nameText = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
    );
    await nameText.click();

    const input = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-input'
    );
    await input.fill("New Name");
    await input.press("Enter");

    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
      )
    ).toHaveText("New Name");
  });

  test("rename team — empty name reverts to original", async ({ page }) => {
    const nameText = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
    );
    await nameText.click();

    const input = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar .team-name-input'
    );
    await input.fill("");
    await input.blur();

    // Should keep original name since empty is not allowed
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-titlebar .team-name-text'
      )
    ).toHaveText("Product");
  });

  test("add root team creates a new team on the board", async ({ page }) => {
    const rootTeamsBefore = await page
      .locator(".root-dropzone > .team")
      .count();

    await page.locator('[data-action="add-root-team"]').click();

    const rootTeamsAfter = await page
      .locator(".root-dropzone > .team")
      .count();
    expect(rootTeamsAfter).toBe(rootTeamsBefore + 1);
  });

  test("new teams get sequential default names", async ({ page }) => {
    await page.locator('[data-action="add-root-team"]').click();
    const first = page.locator(".root-dropzone > .team").last();
    await expect(first.locator(".team-name-text")).toHaveText("New team 1");

    await page.locator('[data-action="add-root-team"]').click();
    const second = page.locator(".root-dropzone > .team").last();
    await expect(second.locator(".team-name-text")).toHaveText("New team 2");
  });

  test("add child team creates nested team inside parent", async ({
    page,
  }) => {
    const t1 = page.locator('.team[data-team-id="t1"]');
    const nestedBefore = await t1
      .locator("> .team-body > .subteam-slot .team")
      .count();

    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="add-child-team"]')
      .click();

    const nestedAfter = await t1
      .locator("> .team-body > .subteam-slot .team")
      .count();
    expect(nestedAfter).toBe(nestedBefore + 1);
  });

  test("collapsed team shows facepile with member dots", async ({ page }) => {
    // t3 (Research) starts collapsed
    const team = page.locator('.team[data-team-id="t3"]');
    await expect(team).toHaveAttribute("data-view", "collapsed");

    // Should have a facepile with dots inside the member slot
    const memberSlot = team.locator("> .team-body > .member-slot");
    const facepile = memberSlot.locator("> .member-facepile");
    await expect(facepile).toBeVisible();
    const dots = facepile.locator(".facepile-dot");
    const dotCount = await dots.count();
    expect(dotCount).toBeGreaterThan(0);
  });

  test("keyboard Enter toggles team collapse", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    await expect(team).toHaveAttribute("data-view", "expanded");

    // Focus the chevron button inside titlebar and press Enter
    const chevron = team.locator(
      '> .team-titlebar [data-action="toggle-collapse"]'
    );
    await chevron.focus();
    await page.keyboard.press("Enter");

    await expect(team).toHaveAttribute("data-view", "collapsed");
  });

  test("keyboard Space toggles team collapse", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    await expect(team).toHaveAttribute("data-view", "expanded");

    const chevron = team.locator(
      '> .team-titlebar [data-action="toggle-collapse"]'
    );
    await chevron.focus();
    await page.keyboard.press("Space");

    await expect(team).toHaveAttribute("data-view", "collapsed");
  });

  test("team add-person button opens add-person modal for that team", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="add-team-employee"]')
      .click();
    await expect(page.locator("#add-person-modal")).toBeVisible();
    await page.fill("#ap-name", "Direct Add");
    await page.fill("#ap-role", "Engineer");
    await page.locator("#add-person-submit").click();
    await expect(
      page.locator('.team[data-team-id="t1"] > .team-body > .member-slot .person-name', { hasText: "Direct Add" })
    ).toHaveCount(1);
  });

  test("card options hang over the card's top edge, clear of the name", async ({ page }) => {
    await page.locator('.person-card[data-id="p2"]').hover();
    const pos = await page.evaluate(() => {
      const card = document.querySelector('.person-card[data-id="p2"]')!;
      const bar = card.querySelector(".card-top-actions")!.getBoundingClientRect();
      const name = card.querySelector(".person-name")!.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      return { barTop: bar.top, barBottom: bar.bottom, barRight: bar.right, cardTop: box.top, cardRight: box.right, nameTop: name.top };
    });
    expect(pos.barTop).toBeLessThan(pos.cardTop);
    expect(pos.barBottom).toBeGreaterThan(pos.cardTop);
    expect(pos.barBottom).toBeLessThanOrEqual(pos.nameTop + 1);
    expect(pos.barRight).toBeLessThanOrEqual(pos.cardRight);
  });

  test("team options sit above the team's top edge, clear of the name and cards", async ({ page }) => {
    await hoverTeamBackground(page, "t1");
    const pos = await page.evaluate(() => {
      const team = document.querySelector('.team[data-team-id="t1"]')!;
      const bar = team.querySelector(":scope > .team-titlebar > .team-toolbar")!.getBoundingClientRect();
      const name = team.querySelector(":scope > .team-titlebar .team-name-text")!.getBoundingClientRect();
      const card = team.querySelector(".person-card")!.getBoundingClientRect();
      const box = team.getBoundingClientRect();
      return { barTop: bar.top, barBottom: bar.bottom, barRight: bar.right, teamTop: box.top, teamRight: box.right, nameTop: name.top, cardTop: card.top };
    });
    expect(pos.barTop).toBeLessThan(pos.teamTop);
    expect(pos.barBottom).toBeGreaterThan(pos.teamTop);
    expect(pos.barBottom).toBeLessThanOrEqual(pos.nameTop + 1);
    expect(pos.barBottom).toBeLessThan(pos.cardTop);
    expect(pos.barRight).toBeLessThanOrEqual(pos.teamRight);
  });

  /** Hover a team's own background: its bottom-right corner, inside the padding. */
  async function hoverTeamBackground(page, id: string) {
    const box = await page.locator(`.team[data-team-id="${id}"]`).boundingBox();
    await page.mouse.move(box!.x + box!.width - 5, box!.y + box!.height - 5);
    await page.waitForTimeout(250);
  }
  const teamOptions = (page, id: string) => page
    .locator(`.team[data-team-id="${id}"] > .team-titlebar > .team-toolbar`)
    .evaluate((el) => getComputedStyle(el).opacity);
  const cardOptions = (page, id: string) => page
    .locator(`.person-card[data-id="${id}"] .card-top-actions`)
    .evaluate((el) => getComputedStyle(el).opacity);

  test("team options show on the team's own background, innermost team only", async ({ page }) => {
    await page.mouse.move(5, 300);
    await page.waitForTimeout(250);
    expect(await teamOptions(page, "t2")).toBe("0");
    expect(await teamOptions(page, "t4")).toBe("0");

    await hoverTeamBackground(page, "t4");
    expect(await teamOptions(page, "t4")).toBe("1");
    expect(await teamOptions(page, "t2")).toBe("0");

    await hoverTeamBackground(page, "t2");
    expect(await teamOptions(page, "t2")).toBe("1");
    expect(await teamOptions(page, "t4")).toBe("0");
  });

  test("hovering a person shows only that card's options, not the team's", async ({ page }) => {
    await page.locator('.person-card[data-id="p2"]').hover();
    await page.waitForTimeout(250);
    expect(await cardOptions(page, "p2")).toBe("1");
    expect(await teamOptions(page, "t1")).toBe("0");

    // And a person in a nested team shows neither team's options
    await page.locator('.person-card[data-id="p8"]').hover();
    await page.waitForTimeout(250);
    expect(await cardOptions(page, "p8")).toBe("1");
    expect(await teamOptions(page, "t4")).toBe("0");
    expect(await teamOptions(page, "t2")).toBe("0");
  });

  test("hovering the team name or drag handle does not show the options", async ({ page }) => {
    await hoverTeamBackground(page, "t1");
    expect(await teamOptions(page, "t1")).toBe("1");

    const name = await page.locator('.team[data-team-id="t1"] > .team-titlebar .team-name-text').boundingBox();
    await page.mouse.move(name!.x + 10, name!.y + name!.height - 3);
    await page.waitForTimeout(250);
    expect(await teamOptions(page, "t1")).toBe("0");

    const handle = await page.locator('.team[data-team-id="t1"] > .team-titlebar > .team-handle').boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.waitForTimeout(250);
    expect(await teamOptions(page, "t1")).toBe("0");
  });

  test("options stay open while the pointer is on them", async ({ page }) => {
    await hoverTeamBackground(page, "t1");
    await page.locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]').hover();
    await page.waitForTimeout(250);
    expect(await teamOptions(page, "t1")).toBe("1");
  });

  test("options close after collapsing a team and moving the pointer away", async ({ page }) => {
    const toolbar = page.locator('.team[data-team-id="t1"] > .team-titlebar > .team-toolbar');
    await hoverTeamBackground(page, "t1");
    await toolbar.locator('[data-action="toggle-collapse"]').click();
    await expect(page.locator('.team[data-team-id="t1"]')).toHaveAttribute("data-view", "collapsed");

    await page.mouse.move(900, 500);
    await page.waitForTimeout(250);
    expect(await toolbar.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  });

  test("options show for keyboard focus", async ({ page }) => {
    const toolbar = page.locator('.team[data-team-id="t1"] > .team-titlebar > .team-toolbar');
    await page.mouse.move(900, 500);
    await toolbar.locator('[data-action="toggle-collapse"]').focus();
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(250);
    expect(await toolbar.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("collapse button shows the icon for the action on offer", async ({ page }) => {
    const shown = (id: string) => page.evaluate((id) => {
      const btn = document.querySelector(`.team[data-team-id="${id}"] > .team-titlebar [data-action="toggle-collapse"]`)!;
      return [...btn.querySelectorAll("svg")]
        .filter((svg) => getComputedStyle(svg).display !== "none")
        .map((svg) => svg.getAttribute("data-lucide"));
    }, id);
    expect(await shown("t1")).toEqual(["minimize-2"]); // expanded → offers collapse
    expect(await shown("t3")).toEqual(["maximize-2"]); // collapsed → offers expand
  });

  test("team toolbar has add person, add sub-team, stats, collapse and delete", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    const toolbar = team.locator("> .team-titlebar > .team-toolbar");
    const toolbarLeft = toolbar.locator("> .team-toolbar-left");
    // The drag handle leads the title bar, before the team name
    await expect(team.locator("> .team-titlebar > .team-handle")).toBeVisible();
    await expect(toolbarLeft.locator("button")).toHaveCount(5);
    await expect(toolbarLeft.locator('[data-action="add-team-employee"]')).toBeVisible();
    await expect(toolbarLeft.locator('[data-action="add-child-team"]')).toBeVisible();
    await expect(toolbarLeft.locator('[data-action="view-hierarchy"]')).toHaveCount(0);
    await expect(toolbarLeft.locator('[data-action="open-team-menu"]')).toHaveCount(0);
    await expect(toolbarLeft.locator('[data-action="delete-team"]')).toBeVisible();
    await expect(
      toolbarLeft.locator('[data-action="open-team-stats"]')
    ).toBeVisible();
    await expect(
      toolbarLeft.locator('[data-action="toggle-collapse"]')
    ).toBeVisible();
  });

  test("team name is on its own row above the toolbar", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    const titlebar = team.locator("> .team-titlebar");
    // Name should be a direct child of titlebar, not inside toolbar
    await expect(titlebar.locator("> .team-name")).toBeVisible();
    await expect(titlebar.locator("> .team-toolbar")).toBeVisible();
  });

  test("stats button tooltip shows people and team count", async ({ page }) => {
    const statsBtn = page.locator(
      '.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]'
    );
    const title = await statsBtn.getAttribute("title");
    expect(title).toMatch(/\d+ people/);
  });

  test("stats button opens team stats modal", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]')
      .click();
    const modal = page.locator("#team-stats-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toContainText("Product");
    // Should show roles and timezones sections
    const sectionCount = await modal.locator(".team-stats-section-title").count();
    expect(sectionCount).toBeGreaterThanOrEqual(2);
  });

  test("stats modal closes on close button", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]')
      .click();
    await expect(page.locator("#team-stats-modal")).toBeVisible();
    await page.locator("#team-stats-close").click();
    await expect(page.locator("#team-stats-modal")).not.toBeAttached();
  });

  test("stats modal closes on Escape", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]')
      .click();
    await expect(page.locator("#team-stats-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#team-stats-modal")).not.toBeAttached();
  });

  test("stats modal closes on overlay click", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]')
      .click();
    const modal = page.locator("#team-stats-modal");
    await expect(modal).toBeVisible();
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeAttached();
  });

  test("stats modal uses multi-column layout for roles and nested teams", async ({ page }) => {
    await page
      .locator('.team[data-team-id="t1"] > .team-titlebar [data-action="open-team-stats"]')
      .click();
    const modal = page.locator("#team-stats-modal");
    await expect(modal).toBeVisible();

    // Roles section should use multi-column container
    const rolesColumns = modal.locator(".team-stats-section").filter({ hasText: "Roles" }).locator(".team-stats-columns");
    await expect(rolesColumns).toBeVisible();
    await expect(rolesColumns.locator(".stats-row").first()).toBeVisible();
  });
});
