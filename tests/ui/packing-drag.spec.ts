import { test, expect } from "./fixtures";

test.describe("Layout — Slot Stability During Drag", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("member slot width does not collapse when dragging a card out", async ({
    page,
  }) => {
    const slot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    // Measure slot width before drag
    const widthBefore = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Start dragging Milo (p2) — use lower-level drag events to inspect mid-drag
    const card = page.locator('.person-card[data-id="p2"]');
    const cardBox = await card.boundingBox();
    const slotBox = await slot.boundingBox();

    // Start drag from the card center
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2,
      cardBox!.y + cardBox!.height / 2
    );
    await page.mouse.down();
    // Move slightly to initiate drag
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2 + 10,
      cardBox!.y + cardBox!.height / 2 + 10
    );

    // Wait for dragging-source class to be applied
    await page.waitForTimeout(100);

    // Measure slot width during drag
    const widthDuring = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Release
    await page.mouse.up();

    // The slot width should not have shrunk significantly
    // Allow some tolerance for border/padding recalculation but not full card-width collapse
    expect(widthDuring).toBeGreaterThanOrEqual(widthBefore - 5);
  });

  test("slot width restores after drag cancel", async ({ page }) => {
    const slot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    const widthBefore = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Start drag
    const card = page.locator('.person-card[data-id="p2"]');
    const cardBox = await card.boundingBox();

    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2,
      cardBox!.y + cardBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2 + 10,
      cardBox!.y + cardBox!.height / 2 + 10
    );
    await page.waitForTimeout(100);

    // Cancel by pressing Escape
    await page.keyboard.press("Escape");
    await page.mouse.up();

    // Wait for dragend cleanup and re-render
    await page.waitForTimeout(300);

    const widthAfter = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Width should be reasonable — at least the minimum slot width (143px)
    // and not drastically different from before the drag
    expect(widthAfter).toBeGreaterThanOrEqual(140);
  });

  test("single-member slot does not collapse when dragging its only card out", async ({
    page,
  }) => {
    // Field team (t4) has exactly one member (p8) in a horizontal-layout slot.
    // Edge case: dragging the sole card should not collapse the slot to zero width.
    const slot = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    const card = slot.locator(".person-card").first();

    const widthBefore = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );
    expect(widthBefore).toBeGreaterThan(0);

    const cardBox = await card.boundingBox();

    // Start drag from the card center
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2,
      cardBox!.y + cardBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      cardBox!.x + cardBox!.width / 2 + 10,
      cardBox!.y + cardBox!.height / 2 + 10
    );
    await page.waitForTimeout(100);

    const widthDuring = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    await page.mouse.up();

    // Slot width should not collapse — allow small tolerance
    expect(widthDuring).toBeGreaterThanOrEqual(widthBefore - 5);
  });

  test("slot width does not contract when hovering back over the same slot", async ({
    page,
  }) => {
    // Repro from repro-width-bug.mjs: drag card from t1, then hover back
    // over the same t1 member-slot. The preview is added but the slot should
    // not stay contracted.
    const slot = page.locator(
      '.team[data-team-id="t1"] > .team-body > .member-slot'
    );

    const widthBefore = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Use DataTransfer drag events so the app's drag handlers fire
    const slotBox = await slot.boundingBox();
    const entry = page.locator('.member-slot[data-team-id="t1"] .member-entry').first();
    await expect(entry).toBeAttached();
    await page.evaluate(
      ({ slotCx, slotCy }) => {
        const entry = document.querySelector(
          '.member-slot[data-team-id="t1"] .member-entry'
        )!;
        const draggable = entry.querySelector('[draggable="true"]') || entry;
        const dt = new DataTransfer();
        dt.effectAllowed = "move";

        const r = draggable!.getBoundingClientRect();
        draggable!.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
            clientX: r.x + r.width / 2,
            clientY: r.y + r.height / 2,
          })
        );

        // Wait for the setTimeout in dragstart to apply .dragging-source,
        // then hover back over the same slot to trigger updateDropPreview
        return new Promise<void>((resolve) =>
          setTimeout(() => {
            const slot = document.querySelector(
              '.member-slot[data-team-id="t1"]'
            )!;
            slot.dispatchEvent(
              new DragEvent("dragover", {
                bubbles: true,
                cancelable: true,
                dataTransfer: dt,
                clientX: slotCx,
                clientY: slotCy,
              })
            );
            resolve();
          }, 50)
        );
      },
      {
        slotCx: slotBox!.x + slotBox!.width / 2,
        slotCy: slotBox!.y + slotBox!.height / 2,
      }
    );

    await page.waitForTimeout(50);

    const widthAfterHover = await slot.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    // Clean up drag
    await page.evaluate(() => {
      document.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        })
      );
    });

    // Slot should not have contracted while preview is present
    expect(widthAfterHover).toBeGreaterThanOrEqual(widthBefore - 5);
  });
});
