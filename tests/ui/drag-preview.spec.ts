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
    const emptyNote = fieldMemberSlot.locator(".empty-note");
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
    const emptyNote = fieldMemberSlot.locator(".empty-note");

    // Hover then cancel
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
