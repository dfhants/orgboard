import { test, expect } from "./fixtures";

test.describe("Initial Render", () => {
  test("toolbar renders with logo, title, and add-person button", async ({
    page,
  }) => {
    await expect(page.locator(".app-toolbar")).toBeVisible();
    await expect(page.locator(".app-toolbar")).toContainText("OrgBoard");
    await expect(page.locator(".toolbar-logo")).toHaveAttribute(
      "src",
      /assets\/icons\/icon-192\.png$/
    );
    await expect(page.locator("#add-person-btn")).toBeVisible();
  });

  test("toolbar logo fills the header height without a shadow", async ({ page }) => {
    const styles = await page.evaluate(() => {
      const toolbar = document.querySelector(".app-toolbar");
      const logo = document.querySelector(".toolbar-logo");
      if (!toolbar || !logo) return null;
      const toolbarRect = toolbar.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const computed = getComputedStyle(logo);
      return {
        toolbarHeight: Math.round(toolbarRect.height),
        logoHeight: Math.round(logoRect.height),
        filter: computed.filter,
      };
    });

    expect(styles).not.toBeNull();
    expect(styles!.logoHeight).toBeGreaterThanOrEqual(styles!.toolbarHeight - 1);
    expect(styles!.filter).toBe("none");
  });

  test("head includes generated favicon assets", async ({ page }) => {
    const favicon32 = page.locator(
      'head link[rel="icon"][sizes="32x32"]'
    );
    const favicon16 = page.locator(
      'head link[rel="icon"][sizes="16x16"]'
    );
    const appleTouch = page.locator(
      'head link[rel="apple-touch-icon"][sizes="180x180"]'
    );

    await expect(favicon32).toHaveAttribute(
      "href",
      /assets\/icons\/favicon-32\.png$/
    );
    await expect(favicon16).toHaveAttribute(
      "href",
      /assets\/icons\/favicon-16\.png$/
    );
    await expect(appleTouch).toHaveAttribute(
      "href",
      /assets\/icons\/apple-touch-icon\.png$/
    );
  });

  test("two root teams render with correct names", async ({ page }) => {
    const teams = page.locator(".root-dropzone > .team");
    await expect(teams).toHaveCount(2);
    await expect(
      teams.nth(0).locator("> .team-titlebar .team-name-text")
    ).toHaveText("Product");
    await expect(
      teams.nth(1).locator("> .team-titlebar .team-name-text")
    ).toHaveText("Operations");
  });

  test("nested teams render inside parent teams", async ({ page }) => {
    // Research is nested inside Product
    const productTeam = page.locator('.team[data-team-id="t1"]');
    await expect(
      productTeam.locator('.team[data-team-id="t3"] .team-name-text').first()
    ).toHaveText("Research");

    // Field is nested inside Operations
    const opsTeam = page.locator('.team[data-team-id="t2"]');
    await expect(
      opsTeam.locator('.team[data-team-id="t4"] .team-name-text').first()
    ).toHaveText("Field");
  });

  test("assigned employees show correct person card details", async ({
    page,
  }) => {
    // Check Ava Richardson in Product manager slot
    const avaCard = page.locator(
      '.team[data-team-id="t1"] .manager-slot .person-card'
    );
    await expect(avaCard.locator(".person-name")).toHaveText("Ava Richardson");
    await expect(avaCard.locator(".person-role")).toContainText(
      "Product Director"
    );
    await expect(avaCard.locator(".person-location")).toHaveText(
      "San Francisco, CA"
    );
    await expect(avaCard.locator(".person-timezone")).toContainText("PST (UTC−8)");
  });

  test("manager slots are populated correctly", async ({ page }) => {
    // Product manager: Ava
    await expect(
      page.locator(
        '.team[data-team-id="t1"] > .team-body > .member-slot > .manager-slot .person-name'
      )
    ).toHaveText("Ava Richardson");

    // Operations manager: Noah
    await expect(
      page.locator(
        '.team[data-team-id="t2"] > .team-body > .member-slot > .manager-slot .person-name'
      )
    ).toHaveText("Noah Tremblay");

    // Research (t3) starts collapsed — manager shown as facepile dot, not full card
    // Verify research team exists and has a manager slot
    await expect(
      page.locator('.team[data-team-id="t3"] .manager-slot')
    ).toBeVisible();

    // Field has no manager — empty slot
    const fieldManagerSlot = page.locator(
      '.team[data-team-id="t4"] .manager-slot'
    );
    await expect(
      fieldManagerSlot.locator(".person-card")
    ).toHaveCount(0);
  });

  test("unassigned bar renders with 2 employees and correct count", async ({
    page,
  }) => {
    const drawer = page.locator("#unassigned-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".unassigned-count")).toHaveText("2");

    const rosterCards = drawer.locator(".roster-cards .person-card");
    await expect(rosterCards).toHaveCount(2);

    const names = await rosterCards.locator(".person-name").allTextContents();
    expect(names).toContain("Eli Vasquez");
    expect(names).toContain("Nia Ramaswamy");
  });

  test("team control buttons have correct interactive styling", async ({
    page,
  }) => {
    // From inspect-manager-slot.js: title-bar action buttons should have
    // pointer cursor and hover rules in the stylesheet.
    const btn = page.locator(".team-control-button").first();

    const cursor = await btn.evaluate(
      (el) => window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe("pointer");

    // Verify hover CSS rules exist in the stylesheet (Playwright headless
    // doesn't reliably apply :hover pseudo-class on evaluate)
    const hoverRuleExists = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes("team-control-button") &&
              rule.selectorText?.includes("hover")
            ) {
              return true;
            }
          }
        } catch (_) {
          /* cross-origin sheets */
        }
      }
      return false;
    });
    expect(hoverRuleExists).toBe(true);
  });

  test("all expanded team slots have non-zero dimensions", async ({
    page,
  }) => {
    // From inspect-slots.js: verify every expanded team's member-slot and
    // manager-slot are actually laid out (non-zero width/height).
    const dims = await page.evaluate(() => {
      const teams = document.querySelectorAll(".team");
      return [...teams].map((team) => {
        const name =
          team.querySelector(".team-name-text")?.textContent ?? "";
        const view = (team as HTMLElement).dataset.view || "expanded";
        const memSlot = team.querySelector(
          ":scope > .team-body > .member-slot"
        );
        const mgrSlot = team.querySelector(
          ":scope > .team-body > .member-slot > .manager-slot"
        );
        const memR = memSlot?.getBoundingClientRect();
        const mgrR = mgrSlot?.getBoundingClientRect();
        return {
          name,
          view,
          memW: memR ? Math.round(memR.width) : null,
          memH: memR ? Math.round(memR.height) : null,
          mgrW: mgrR ? Math.round(mgrR.width) : null,
          mgrH: mgrR ? Math.round(mgrR.height) : null,
        };
      });
    });

    for (const t of dims) {
      if (t.view !== "expanded") continue;
      // Every expanded team's member-slot should have non-zero size
      if (t.memW !== null) {
        expect(t.memW, `${t.name} member-slot width`).toBeGreaterThan(0);
        expect(t.memH, `${t.name} member-slot height`).toBeGreaterThan(0);
      }
      // Manager slots should be present and have width
      if (t.mgrW !== null) {
        expect(t.mgrW, `${t.name} manager-slot width`).toBeGreaterThan(0);
      }
    }
  });

  test("empty team member slot shows placeholder text", async ({ page }) => {
    // Add a new root team (it starts empty)
    await page.locator('[data-action="add-root-team"]').click();

    // Find the newest team (last in root-dropzone)
    const newTeam = page.locator(".root-dropzone > .team").last();
    const memberSlot = newTeam.locator("> .team-body > .member-slot");
    await expect(memberSlot.locator("> .empty-note")).toContainText(
      "Drop people here"
    );
  });

  test("person cards have timezone-based background colors", async ({
    page,
  }) => {
    // Ava (PST) and Milo (GMT) should have different background colors
    const avaColor = await page
      .locator('.person-card[data-id="p1"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const miloColor = await page
      .locator('.person-card[data-id="p2"]')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);

    // Both should have non-empty background colors
    expect(avaColor).toBeTruthy();
    expect(miloColor).toBeTruthy();
    // Different timezones should produce different colors
    expect(avaColor).not.toBe(miloColor);
  });
});

test.describe("Board Legend", () => {
  test("info button opens legend popover with all sections", async ({ page }) => {
    const infoButton = page.locator('[data-action="open-board-legend"]');
    await expect(infoButton).toBeVisible();
    await infoButton.click();

    const popover = page.locator(".board-legend-popover");
    await expect(popover).toBeVisible();

    // Board areas section
    await expect(popover).toContainText("Board areas");
    await expect(popover).toContainText("Manager slot");
    await expect(popover).toContainText("Team members");
    await expect(popover).toContainText("Sub-teams");

    // Visual cues section
    await expect(popover).toContainText("Visual cues");
    await expect(popover).toContainText("Dashed card = open position");
    await expect(popover).toContainText("Left ribbon = timezone gap");

    // Keyboard shortcuts section
    await expect(popover).toContainText("Keyboard shortcuts");
    await expect(popover).toContainText("Hold while dragging to copy");
  });

  test("legend popover closes on outside click", async ({ page }) => {
    await page.locator('[data-action="open-board-legend"]').click();
    const popover = page.locator(".board-legend-popover");
    await expect(popover).toBeVisible();

    // Click outside the popover
    await page.locator(".page-shell").click({ position: { x: 10, y: 10 } });
    await expect(popover).not.toBeVisible();
  });

  test("slot areas have distinct background colors", async ({ page }) => {
    const memberSlotBg = await page
      .locator(".member-slot")
      .first()
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const managerSlotBg = await page
      .locator(".manager-slot")
      .first()
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);

    // Both should have non-transparent backgrounds
    expect(memberSlotBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(managerSlotBg).not.toBe("rgba(0, 0, 0, 0)");
    // They should be different colors
    expect(memberSlotBg).not.toBe(managerSlotBg);
  });
});
