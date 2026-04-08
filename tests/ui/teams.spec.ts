import { test, expect } from "./fixtures";

test.describe("Team Expand / Collapse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

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

  test("add child team creates nested team inside parent", async ({
    page,
  }) => {
    const t1 = page.locator('.team[data-team-id="t1"]');
    const nestedBefore = await t1
      .locator("> .team-body > .member-slot .team")
      .count();

    await page
      .locator('[data-action="add-child-team"][data-team-id="t1"]')
      .click();

    const nestedAfter = await t1
      .locator("> .team-body > .member-slot .team")
      .count();
    expect(nestedAfter).toBe(nestedBefore + 1);
  });

  test("collapsed team shows facepile with member dots", async ({ page }) => {
    // t3 (Research) starts collapsed
    const team = page.locator('.team[data-team-id="t3"]');
    await expect(team).toHaveAttribute("data-view", "collapsed");

    // Should have a facepile with dots inside the member slot
    const memberSlot = team.locator("> .team-body > .member-slot");
    const facepile = memberSlot.locator(".member-facepile");
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
});
