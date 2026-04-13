import { test, expect } from "./fixtures";
import { dragAndDrop } from "./helpers";

test.describe("Empty Note Visibility", () => {
  test("empty-note appears in member slot when all members removed", async ({
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
  });

  test("empty-note disappears when employee is dropped into empty slot", async ({
    page,
  }) => {
    // Make Field (t4) member slot empty
    await dragAndDrop(
      page,
      '.person-card[data-id="p8"]',
      '.team[data-team-id="t2"] > .team-body > .member-slot'
    );

    const fieldMemberSlot = page.locator(
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );
    await expect(fieldMemberSlot.locator("> .empty-note")).toBeVisible();

    // Drop someone into it
    await dragAndDrop(
      page,
      '.person-card[data-id="p9"]',
      '.team[data-team-id="t4"] > .team-body > .member-slot'
    );

    // Empty note should be gone, employee should be there
    await expect(fieldMemberSlot.locator("> .empty-note")).toHaveCount(0);
    await expect(
      fieldMemberSlot.locator('.person-card[data-id="p9"]')
    ).toBeVisible();
  });

  test("empty manager slot shows empty-note", async ({ page }) => {
    // Field (t4) has an empty manager slot by default
    const fieldManagerSlot = page.locator(
      '.team[data-team-id="t4"] .manager-slot'
    );
    await expect(fieldManagerSlot.locator(".empty-note")).toBeVisible();
  });
});
