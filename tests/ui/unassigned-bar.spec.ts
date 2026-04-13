import { test, expect, addUnassignedPeople } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Unassigned Bar", () => {
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
    // Bulk-add 50 people via test hook (much faster than UI loop)
    await addUnassignedPeople(page, 50);

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
    // Bulk-add people to overflow the roster
    await addUnassignedPeople(page, 20, "Scroller");

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
    // Bulk-add people to make it scrollable
    await addUnassignedPeople(page, 15, "Dragger");

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

  test("delete-all button visible only when unassigned employees exist", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const deleteBtn = drawer.locator(".delete-all-unassigned");

    // With unassigned employees, button should exist
    await expect(deleteBtn).toBeAttached();

    // Delete all unassigned employees individually to empty the list
    const count = Number(await drawer.locator(".unassigned-count").textContent());
    for (let i = 0; i < count; i++) {
      const card = drawer.locator(".person-card").first();
      await card.hover();
      await card.locator(".card-delete-button").click();
    }

    // Now button should not exist
    await expect(drawer.locator(".delete-all-unassigned")).not.toBeAttached();
  });

  test("delete-all button opens confirmation modal", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    await drawer.locator(".delete-all-unassigned").click();

    const modal = page.locator("#delete-all-unassigned-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-title")).toHaveText("Delete unassigned employees");
    await expect(modal.locator("#delete-all-unassigned-confirm")).toBeVisible();
    await expect(modal.locator("#delete-all-unassigned-cancel")).toBeVisible();
  });

  test("cancel confirmation modal does not delete", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(await drawer.locator(".unassigned-count").textContent());

    await drawer.locator(".delete-all-unassigned").click();
    await page.locator("#delete-all-unassigned-cancel").click();

    // Modal dismissed
    await expect(page.locator("#delete-all-unassigned-modal")).not.toBeAttached();
    // Count unchanged
    const countAfter = Number(await drawer.locator(".unassigned-count").textContent());
    expect(countAfter).toBe(countBefore);
  });

  test("Escape dismisses confirmation modal", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    await drawer.locator(".delete-all-unassigned").click();
    await expect(page.locator("#delete-all-unassigned-modal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#delete-all-unassigned-modal")).not.toBeAttached();

    // Employees still there
    const count = Number(await drawer.locator(".unassigned-count").textContent());
    expect(count).toBeGreaterThan(0);
  });

  test("clicking overlay dismisses confirmation modal", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    await drawer.locator(".delete-all-unassigned").click();
    const modal = page.locator("#delete-all-unassigned-modal");
    await expect(modal).toBeVisible();

    // Click the overlay (not the panel)
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeAttached();
  });

  test("confirm deletes all unassigned employees", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");
    const countBefore = Number(await drawer.locator(".unassigned-count").textContent());
    expect(countBefore).toBeGreaterThan(0);

    await drawer.locator(".delete-all-unassigned").click();
    await page.locator("#delete-all-unassigned-confirm").click();

    // Modal dismissed
    await expect(page.locator("#delete-all-unassigned-modal")).not.toBeAttached();
    // All unassigned removed
    const countAfter = Number(await drawer.locator(".unassigned-count").textContent());
    expect(countAfter).toBe(0);
    // No person cards in unassigned
    await expect(drawer.locator(".person-card")).toHaveCount(0);
  });

  test("drawer has consistent height when empty vs populated", async ({ page }) => {
    const drawer = page.locator("#unassigned-drawer");

    // Measure height with employees
    const populatedBox = await drawer.boundingBox();
    expect(populatedBox).toBeTruthy();
    const populatedHeight = populatedBox!.height;

    // Delete all unassigned employees
    const count = Number(await drawer.locator(".unassigned-count").textContent());
    expect(count).toBeGreaterThan(0);
    await drawer.locator(".delete-all-unassigned").click();
    await page.locator("#delete-all-unassigned-confirm").click();
    await expect(drawer.locator(".person-card")).toHaveCount(0);

    // Measure height when empty
    const emptyBox = await drawer.boundingBox();
    expect(emptyBox).toBeTruthy();
    const emptyHeight = emptyBox!.height;

    // Heights should match (fixed 200px)
    expect(emptyHeight).toBe(populatedHeight);
  });
});
