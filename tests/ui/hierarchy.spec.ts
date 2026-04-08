import { test, expect } from "./fixtures";

test.describe("Hierarchy Tree Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".team");
  });

  const openHierarchy = async (page: import("@playwright/test").Page) => {
    await page.locator('.action-bar [data-action="view-hierarchy"]').click();
    const modal = page.locator("#hierarchy-modal");
    await expect(modal).toBeVisible();
    return modal;
  };

  test("network icon button appears in action bar", async ({ page }) => {
    const btn = page.locator('.action-bar [data-action="view-hierarchy"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveCount(1);
  });

  test("clicking view-hierarchy opens global modal", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".modal-title")).toHaveText("Reporting Hierarchy");
  });

  test("tree shows all root teams", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".tree-container")).toContainText("Product");
    await expect(modal.locator(".tree-container")).toContainText("Operations");
  });

  test("tree shows managers as team root nodes", async ({ page }) => {
    const modal = await openHierarchy(page);
    const managerNodes = modal.locator(".tree-node-manager");
    const count = await managerNodes.count();
    expect(count).toBeGreaterThanOrEqual(2);
    await expect(modal.locator(".tree-container")).toContainText("Ava Richardson");
  });

  test("tree shows direct reports under their team manager", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".tree-container")).toContainText("Milo Hartwell");
    await expect(modal.locator(".tree-container")).toContainText("Zuri Okafor");
  });

  test("tree shows nested team subtree", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".tree-container")).toContainText("Research");
  });

  test("close button dismisses modal", async ({ page }) => {
    const modal = await openHierarchy(page);
    await modal.locator("#hierarchy-modal-close").click();
    await expect(modal).not.toBeVisible();
  });

  test("Escape key dismisses modal", async ({ page }) => {
    const modal = await openHierarchy(page);
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("overlay click dismisses modal", async ({ page }) => {
    const modal = await openHierarchy(page);
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeVisible();
  });

  test("edit mode toggle shows edit banner", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".hierarchy-edit-banner")).not.toBeVisible();
    await modal.locator(".hierarchy-edit-toggle").click();
    await expect(modal.locator(".hierarchy-edit-banner")).toBeVisible();
    await expect(modal.locator(".hierarchy-edit-banner")).toContainText("Click a person");
    await expect(modal.locator(".tree-node--editable").first()).toBeVisible();
  });

  test("edit mode: clicking node opens popover", async ({ page }) => {
    const modal = await openHierarchy(page);
    await modal.locator(".hierarchy-edit-toggle").click();
    const memberNode = modal.locator(".tree-node-member.tree-node--editable").first();
    await memberNode.click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
  });

  test("edit mode: assigning override updates tree", async ({ page }) => {
    const modal = await openHierarchy(page);
    const initialCount = await modal.locator(".tree-branch-override").count();

    await modal.locator(".hierarchy-edit-toggle").click();
    const memberNode = modal.locator(".tree-node-member.tree-node--editable").first();
    await memberNode.click();

    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    const items = popover.locator(".tree-popover-item");
    const count = await items.count();
    let picked = false;
    for (let i = 0; i < count; i++) {
      const hasTag = await items.nth(i).locator(".manager-pick-tag").count();
      if (hasTag === 0) {
        await items.nth(i).click();
        picked = true;
        break;
      }
    }
    if (!picked) return;

    await expect(popover).not.toBeVisible();
    const newOverrideCount = await modal.locator(".tree-branch-override").count();
    expect(newOverrideCount).toBeGreaterThan(initialCount);
  });

  test("no view-hierarchy button on individual team titlebars", async ({ page }) => {
    const teamButtons = page.locator('.team-title-actions [data-action="view-hierarchy"]');
    await expect(teamButtons).toHaveCount(0);
  });
});
