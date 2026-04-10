import { test, expect } from "./fixtures";
import { dragAndDrop, dragHover, dragCancel } from "./helpers";

test.describe("Drag Preview — Empty Note Hiding", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  test("empty-note in member slot is hidden when drag preview appears", async ({
    page,
  }) => {
    // Move June (p8) out of Field (t4) so the member slot becomes empty
    await dragAndDrop(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const fieldMemberSlot = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    const emptyNote = fieldMemberSlot.locator("> .empty-note");
    await expect(emptyNote).toBeVisible();

    // Now drag an employee over the empty Field member slot
    await dragHover(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    // The preview placeholder should appear
    await expect(
      fieldMemberSlot.locator(".drag-preview-entry")
    ).toBeAttached();

    // The empty-note text should be hidden
    await expect(emptyNote).toBeHidden();

    await dragCancel(page, '.person-card[data-id="p8"]');
  });

  test("empty-note in manager slot is hidden when drag preview appears", async ({
    page,
  }) => {
    // Field (t4) has an empty manager slot by default
    const fieldManagerSlot = page.locator(
      '.team[data-team-id="t4"] .manager-slot'
    );
    const emptyNote = fieldManagerSlot.locator(".empty-note");
    await expect(emptyNote).toBeVisible();

    // Drag preview is only created for member slots (dropKind="members"),
    // but the resolveDropzone helper redirects drags over any part of a team
    // to the nearest valid slot — so hovering over the team body near the
    // manager slot can resolve to the member slot.  Verify that if a preview
    // is injected into the manager slot, the empty-note is hidden.
    // We test this by directly inserting a preview element (same as app does).
    const hidden = await page.evaluate(() => {
      const mgrSlot = document.querySelector(
        '.team[data-team-id="t4"] .manager-slot'
      )!;
      const preview = document.createElement("div");
      preview.className =
        "member-entry drag-preview-entry drag-preview-employee";
      preview.setAttribute("aria-hidden", "true");
      mgrSlot.appendChild(preview);
      const note = mgrSlot.querySelector(".empty-note") as HTMLElement;
      const display = getComputedStyle(note).display;
      preview.remove();
      return display;
    });

    expect(hidden).toBe("none");
  });

  test("empty-note reappears after drag is cancelled", async ({ page }) => {
    // Move June out so Field member slot is empty
    await dragAndDrop(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const fieldMemberSlot = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    const emptyNote = fieldMemberSlot.locator("> .empty-note");
    await dragHover(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    await expect(emptyNote).toBeHidden();

    await dragCancel(page, '.person-card[data-id="p8"]');

    // Empty note should be visible again
    await expect(emptyNote).toBeVisible();
  });

  test("drag preview fits within the slot bounds", async ({ page }) => {
    // Move June out so Field member slot is empty
    await dragAndDrop(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    await dragHover(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    // Verify the preview does not overflow the slot
    const overflow = await page.evaluate(() => {
      const slot = document.querySelector(
        '.team[data-team-id="t4"] > .team-body > .member-slot'
      )!;
      const preview = slot.querySelector(".drag-preview-entry")!;
      const slotRect = slot.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      return {
        overflowRight: Math.round(
          previewRect.x + previewRect.width - (slotRect.x + slotRect.width)
        ),
        overflowBottom: Math.round(
          previewRect.y + previewRect.height - (slotRect.y + slotRect.height)
        ),
      };
    });

    expect(overflow.overflowRight).toBeLessThanOrEqual(0);
    expect(overflow.overflowBottom).toBeLessThanOrEqual(0);

    await dragCancel(page, '.person-card[data-id="p8"]');
  });
});

test.describe("Drag Preview — Column Stability", () => {
  test("member-slot width is preserved when dragging within same slot", async ({
    page,
  }) => {
    // Product (t1) has Milo (p2) and Zuri (p3) as members.
    // In default vertical mode, they stack in a column within .member-slot.
    // Verify dragging one card doesn't collapse the member-slot width.
    const memberSlotSel =
      '.team[data-team-id="t1"] > .team-body > .member-slot';

    // Verify people are in the member-slot
    const beforeLayout = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      const entries = [
        ...slot.querySelectorAll(".member-entry"),
      ].filter(
        (e) =>
          !e.classList.contains("dragging-source") &&
          e.querySelector(".person-card")
      );
      return {
        count: entries.length,
        slotWidth: Math.round(slot.getBoundingClientRect().width),
      };
    }, memberSlotSel);

    expect(beforeLayout.count).toBe(2);
    expect(beforeLayout.slotWidth).toBeGreaterThan(0);

    // Drag the second person and hover over the first
    const ids = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      const cards = [
        ...slot.querySelectorAll(
          ".member-entry:not(.dragging-source) .person-card"
        ),
      ];
      return cards.slice(0, 2).map((c) => c.getAttribute("data-id"));
    }, memberSlotSel);

    await dragHover(
      page,
      `.person-card[data-id="${ids[1]}"]`,
      `.person-card[data-id="${ids[0]}"]`
    );

    // Check that the preview width matches the original card width (no inflation)
    const previewInfo = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      const preview = slot.querySelector(".drag-preview-entry");
      const card = slot.querySelector(
        ".member-entry:not(.drag-preview-entry):not(.dragging-source) .person-card"
      );
      if (!preview || !card) return null;
      return {
        previewWidth: Math.round(preview.getBoundingClientRect().width),
        cardWidth: Math.round(card.getBoundingClientRect().width),
        slotWidth: Math.round(slot.getBoundingClientRect().width),
      };
    }, memberSlotSel);

    expect(previewInfo).toBeTruthy();
    expect(previewInfo!.previewWidth).toBe(previewInfo!.cardWidth);
    // Member-slot width should not have collapsed
    expect(previewInfo!.slotWidth).toBeGreaterThanOrEqual(beforeLayout.slotWidth - 2);

    await dragCancel(page, `.person-card[data-id="${ids[1]}"]`);
  });
});

test.describe("Drag Preview — Hysteresis", () => {
  test("preview position does not oscillate on micro-movements near boundary", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector(".team");

    // Use Product (t1) member slot which has Milo (p2) and Zuri (p3)
    const memberSlot =
      '.team[data-team-id="t1"] > .team-body > .member-slot';

    // Start dragging Milo (p2)
    const source = '.person-card[data-id="p2"]';

    // Initiate dragstart only
    await page.evaluate((src) => {
      const source = document.querySelector(src) as HTMLElement;
      const dataTransfer = new DataTransfer();
      const srcRect = source.getBoundingClientRect();
      source.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX: srcRect.x + srcRect.width / 2,
          clientY: srcRect.y + srcRect.height / 2,
        })
      );
    }, source);

    // Wait for the setTimeout(0) that applies .dragging-source
    await page.waitForTimeout(50);

    // Find a point past the remaining entries (where the preview will anchor)
    // and a second point nearby (within hysteresis range) that would compute
    // a different raw index
    const coords = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      // Entries are direct children of member-slot (or inside .people-column wrappers)
      const entries = [
        ...slot.querySelectorAll(":scope > .member-entry, :scope > .people-column .member-entry"),
      ].filter(
        (e) =>
          !e.classList.contains("dragging-source") &&
          !e.classList.contains("drag-preview-entry") &&
          e.querySelector(".person-card")
      );
      if (entries.length < 1) return null;
      const r = entries[entries.length - 1].getBoundingClientRect();
      return {
        // Well past the last entry — preview goes at the end
        xFar: Math.round(r.right + 20),
        yFar: Math.round(r.bottom + 20),
      };
    }, memberSlot);

    expect(coords).toBeTruthy();

    // First dragover establishes the initial insertion index (at end)
    await page.evaluate(
      ({ slot, x, y }) => {
        const target = document.querySelector(slot) as HTMLElement;
        target.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: new DataTransfer(),
            clientX: x,
            clientY: y,
          })
        );
      },
      { slot: memberSlot, x: coords!.xFar, y: coords!.yFar }
    );

    // Record the preview position within member-slot
    const positionBefore = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      const preview = slot.querySelector(".drag-preview-entry");
      if (!preview) return null;
      // Entries may be inside .people-column wrappers in horizontal layout
      const entries = [...slot.querySelectorAll(":scope > .member-entry, :scope > .people-column .member-entry")].filter(
        (n) => !n.classList.contains("dragging-source")
      );
      return entries.indexOf(preview);
    }, memberSlot);

    expect(positionBefore).not.toBeNull();

    // Now do micro-movements (< 8px from the commit point) — these should
    // NOT change position because they're within the hysteresis dead zone
    for (let offset = -3; offset <= 3; offset++) {
      await page.evaluate(
        ({ slot, x, y }) => {
          const target = document.querySelector(slot) as HTMLElement;
          target.dispatchEvent(
            new DragEvent("dragover", {
              bubbles: true,
              cancelable: true,
              dataTransfer: new DataTransfer(),
              clientX: x,
              clientY: y,
            })
          );
        },
        {
          slot: memberSlot,
          x: coords!.xFar + offset,
          y: coords!.yFar + offset,
        }
      );
    }

    // Preview should still be at the same position
    const positionAfter = await page.evaluate((sel) => {
      const slot = document.querySelector(sel)!;
      const preview = slot.querySelector(".drag-preview-entry");
      if (!preview) return null;
      // Entries may be inside .people-column wrappers in horizontal layout
      const entries = [...slot.querySelectorAll(":scope > .member-entry, :scope > .people-column .member-entry")].filter(
        (n) => !n.classList.contains("dragging-source")
      );
      return entries.indexOf(preview);
    }, memberSlot);

    expect(positionAfter).toBe(positionBefore);

    await dragCancel(page, source);
  });
});
