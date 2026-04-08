import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Unassigned Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("collapse unassigned bar", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    await expect(drawer).not.toHaveClass(/is-collapsed/);

    // Click header to collapse
    await drawer.locator(".unassigned-bar-header").click();
    await expect(drawer).toHaveClass(/is-collapsed/);
  });

  test("expand collapsed unassigned bar", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");

    // Collapse first
    await drawer.locator(".unassigned-bar-header").click();
    await expect(drawer).toHaveClass(/is-collapsed/);

    // Expand
    await drawer.locator(".unassigned-bar-header").click();
    await expect(drawer).not.toHaveClass(/is-collapsed/);
    await expect(drawer.locator(".roster-cards")).toBeVisible();
  });

  test("count badge updates when employee is added", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(
      await drawer.locator(".unassigned-count").textContent()
    );

    // Add a new person (goes to unassigned)
    await page.locator("#add-person-btn").click();
    await page.locator("#ap-name").fill("Badge Tester");
    await page.locator("#add-person-submit").click();

    const countAfter = Number(
      await drawer.locator(".unassigned-count").textContent()
    );
    expect(countAfter).toBe(countBefore + 1);
  });

  test("count badge updates when employee is removed from unassigned", async ({
    page,
  }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(
      await drawer.locator(".unassigned-count").textContent()
    );

    // Delete an unassigned employee (Eli, p9)
    const card = drawer.locator('.person-card[data-id="p9"]');
    await card.hover();
    await card.locator(".card-delete-button").click();

    const countAfter = Number(
      await drawer.locator(".unassigned-count").textContent()
    );
    expect(countAfter).toBe(countBefore - 1);
  });

  test("horizontal scroll with many people", async ({ page }) => {
    // Add 50 people to unassigned bar
    for (let i = 0; i < 50; i++) {
      await page.locator("#add-person-btn").click();
      await page.locator("#ap-name").fill(`Person ${i}`);
      await page.locator("#add-person-submit").click();
    }

    const roster = page.locator("#unassigned-drawer .roster-cards");
    await expect(roster).toBeVisible();

    // Verify the roster is horizontally scrollable
    const isScrollable = await roster.evaluate(
      (el) => el.scrollWidth > el.clientWidth
    );
    expect(isScrollable).toBe(true);

    // Verify cards are in a single row (nowrap)
    const style = await roster.evaluate((el) => getComputedStyle(el).flexWrap);
    expect(style).toBe("nowrap");
  });

  test("fade indicators appear based on scroll position", async ({ page }) => {
    // Add enough people to overflow
    for (let i = 0; i < 20; i++) {
      await page.locator("#add-person-btn").click();
      await page.locator("#ap-name").fill(`Scroller ${i}`);
      await page.locator("#add-person-submit").click();
    }

    const wrapper = page.locator("#unassigned-drawer .roster-cards-wrapper");
    const roster = page.locator("#unassigned-drawer .roster-cards");
    await expect(roster).toBeVisible();

    // At scroll=0, should have can-scroll-right but NOT can-scroll-left
    await expect(wrapper).not.toHaveClass(/can-scroll-left/);
    await expect(wrapper).toHaveClass(/can-scroll-right/);

    // Scroll to the middle
    await roster.evaluate((el) => {
      el.scrollLeft = el.scrollWidth / 2;
    });
    // Wait for scroll event to fire
    await page.waitForTimeout(100);
    await expect(wrapper).toHaveClass(/can-scroll-left/);
    await expect(wrapper).toHaveClass(/can-scroll-right/);

    // Scroll to the end
    await roster.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(100);
    await expect(wrapper).toHaveClass(/can-scroll-left/);
    await expect(wrapper).not.toHaveClass(/can-scroll-right/);
  });

  test("drag-and-drop still works with scrolled unassigned bar", async ({
    page,
  }) => {
    // Add people to make it scrollable
    for (let i = 0; i < 15; i++) {
      await page.locator("#add-person-btn").click();
      await page.locator("#ap-name").fill(`Dragger ${i}`);
      await page.locator("#add-person-submit").click();
    }

    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(
      await drawer.locator(".unassigned-count").textContent()
    );

    // Drag an unassigned person into a team's member slot
    await dragAndDrop(
      page,
      '#unassigned-drawer .person-card[data-id="p9"]',
      ".member-slot.dropzone"
    );

    const countAfter = Number(
      await drawer.locator(".unassigned-count").textContent()
    );
    expect(countAfter).toBe(countBefore - 1);
  });

  test("auto-expands when dragging employee over collapsed bar", async ({
    page,
  }) => {
    const drawer = page.locator("#unassigned-drawer");

    // Collapse the bar
    await drawer.locator(".unassigned-bar-header").click();
    await expect(drawer).toHaveClass(/is-collapsed/);

    // Use low-level drag events to simulate dragging over the collapsed bar
    // This triggers the auto-expand on dragover
    const card = page.locator('.person-card[data-id="p2"]');
    const cardBox = await card.boundingBox();
    const barBox = await drawer.boundingBox();

    // Start drag on the card
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2,
      cardBox!.y + cardBox!.height / 2
    );
    await page.mouse.down();

    // Dispatch dragstart
    await card.dispatchEvent("dragstart", {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    });

    // Move over the unassigned bar to trigger auto-expand
    await page.mouse.move(
      barBox!.x + barBox!.width / 2,
      barBox!.y + barBox!.height / 2
    );

    // Dispatch dragover on the bar
    await page.evaluate(
      ([bx, by]) => {
        const bar = document.querySelector(".unassigned-bar");
        if (bar) {
          bar.dispatchEvent(
            new DragEvent("dragover", {
              bubbles: true,
              clientX: bx,
              clientY: by,
              dataTransfer: new DataTransfer(),
            })
          );
        }
      },
      [barBox!.x + barBox!.width / 2, barBox!.y + barBox!.height / 2]
    );

    // Bar should auto-expand
    await expect(drawer).not.toHaveClass(/is-collapsed/);

    // Clean up
    await page.mouse.up();
  });
});
