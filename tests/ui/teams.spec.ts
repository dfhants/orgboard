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
      .locator('[data-action="open-team-menu"][data-team-id="t1"]')
      .click();
    await page
      .locator('.team-menu-item[data-menu-action="add-team"]')
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

  test("team menu opens popover with all actions", async ({
    page,
  }) => {
    await page
      .locator('[data-action="open-team-menu"][data-team-id="t1"]')
      .click();
    const popover = page.locator(".team-menu-popover");
    await expect(popover).toBeVisible();
    await expect(
      popover.locator('[data-menu-action="add-person"]')
    ).toBeVisible();
    await expect(
      popover.locator('[data-menu-action="add-team"]')
    ).toBeVisible();
    await expect(
      popover.locator('[data-menu-action="view-hierarchy"]')
    ).toBeVisible();
    await expect(
      popover.locator('[data-menu-action="delete"]')
    ).toBeVisible();
  });

  test("team menu uses clamped anchor positioning", async ({ page }) => {
    const trigger = page.locator('[data-action="open-team-menu"][data-team-id="t1"]');
    await trigger.click();

    const placement = await page.evaluate(() => {
      const button = document.querySelector('[data-action="open-team-menu"][data-team-id="t1"]');
      const popover = document.querySelector('.team-menu-popover');
      if (!button || !popover) return null;
      const buttonRect = button.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const centeredLeft = buttonRect.left + (buttonRect.width - popRect.width) / 2;
      const expectedLeft = Math.min(Math.max(centeredLeft, 8), window.innerWidth - popRect.width - 8);
      return {
        leftDelta: Math.abs(popRect.left - expectedLeft),
        belowTrigger: popRect.top >= buttonRect.bottom,
      };
    });

    expect(placement).not.toBeNull();
    expect(placement!.leftDelta).toBeLessThanOrEqual(4);
    expect(placement!.belowTrigger).toBe(true);
  });

  test("team menu stays inside the viewport near the right edge", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 });

    const trigger = page.locator('[data-action="open-team-menu"][data-team-id="t2"]');
    await trigger.click();

    const placement = await page.evaluate(() => {
      const button = document.querySelector('[data-action="open-team-menu"][data-team-id="t2"]');
      const popover = document.querySelector('.team-menu-popover');
      if (!button || !popover) return null;
      const buttonRect = button.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      return {
        left: popRect.left,
        right: popRect.right,
        top: popRect.top,
        bottom: popRect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        overlapsTriggerVertically: popRect.top < buttonRect.bottom,
      };
    });

    expect(placement).not.toBeNull();
    expect(placement!.left).toBeGreaterThanOrEqual(8);
    expect(placement!.right).toBeLessThanOrEqual(placement!.viewportWidth - 8);
    expect(placement!.top).toBeGreaterThanOrEqual(8);
    expect(placement!.bottom).toBeLessThanOrEqual(placement!.viewportHeight - 8);
    expect(placement!.overlapsTriggerVertically).toBe(false);
  });

  test("team menu add-person option opens add-person modal", async ({ page }) => {
    await page
      .locator('[data-action="open-team-menu"][data-team-id="t1"]')
      .click();
    await page
      .locator('.team-menu-item[data-menu-action="add-person"]')
      .click();
    await expect(page.locator("#add-person-modal")).toBeVisible();
  });

  test("team menu closes on outside click", async ({ page }) => {
    await page
      .locator('[data-action="open-team-menu"][data-team-id="t1"]')
      .click();
    await expect(page.locator(".team-menu-popover")).toBeVisible();

    // Click outside the popover
    await page.locator(".root-dropzone").click({ position: { x: 5, y: 5 } });
    await expect(page.locator(".team-menu-popover")).not.toBeVisible();
  });

  test("team toolbar has handle, menu trigger, stats, and chevron", async ({ page }) => {
    const team = page.locator('.team[data-team-id="t1"]');
    const toolbar = team.locator("> .team-titlebar > .team-toolbar");
    const toolbarLeft = toolbar.locator("> .team-toolbar-left");
    await expect(toolbarLeft.locator(".team-handle")).toBeVisible();
    await expect(
      toolbarLeft.locator('[data-action="open-team-menu"]')
    ).toBeVisible();
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
