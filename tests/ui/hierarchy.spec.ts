import { test, expect } from "./fixtures";

test.describe("Hierarchy Tree Modal", () => {
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

  test("edit mode shows Save and Cancel buttons instead of toggle", async ({ page }) => {
    const modal = await openHierarchy(page);
    // Before edit mode: toggle button visible, Save/Cancel not
    await expect(modal.locator(".hierarchy-edit-toggle")).toBeVisible();
    await expect(modal.locator("[data-action='save-tree-edit']")).not.toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).not.toBeVisible();
    // Enter edit mode
    await modal.locator(".hierarchy-edit-toggle").click();
    await expect(modal.locator("[data-action='save-tree-edit']")).toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).toBeVisible();
    await expect(modal.locator(".hierarchy-edit-toggle")).not.toBeVisible();
  });

  test("Save exits edit mode and keeps changes", async ({ page }) => {
    const modal = await openHierarchy(page);
    await modal.locator(".hierarchy-edit-toggle").click();
    // In edit mode, assign an override
    const memberNode = modal.locator(".tree-leaf-row.tree-node--editable").first();
    await memberNode.click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    const items = popover.locator(".tree-popover-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const hasTag = await items.nth(i).locator(".manager-pick-tag").count();
      if (hasTag === 0) { await items.nth(i).click(); break; }
    }
    await expect(popover).not.toBeVisible();
    // Save
    await modal.locator("[data-action='save-tree-edit']").click();
    // Should be back in view mode
    await expect(modal.locator(".hierarchy-edit-toggle")).toBeVisible();
    await expect(modal.locator("[data-action='save-tree-edit']")).not.toBeVisible();
    // Override should persist (dashed line or override marker visible)
    const overrides = await modal.locator(".tree-leaf-override, .tree-node-override, .tree-line-override").count();
    expect(overrides).toBeGreaterThan(0);
  });

  test("Cancel exits edit mode and reverts changes", async ({ page }) => {
    const modal = await openHierarchy(page);
    const initialOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    await modal.locator(".hierarchy-edit-toggle").click();
    // Assign an override
    const memberNode = modal.locator(".tree-leaf-row.tree-node--editable").first();
    await memberNode.click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    const items = popover.locator(".tree-popover-item");
    const count = await items.count();
    let assigned = false;
    for (let i = 0; i < count; i++) {
      const hasTag = await items.nth(i).locator(".manager-pick-tag").count();
      if (hasTag === 0) { await items.nth(i).click(); assigned = true; break; }
    }
    if (!assigned) return;
    await expect(popover).not.toBeVisible();
    // Cancel
    await modal.locator("[data-action='cancel-tree-edit']").click();
    // Should be back in view mode
    await expect(modal.locator(".hierarchy-edit-toggle")).toBeVisible();
    // Override should be reverted
    const afterOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    expect(afterOverrides).toBe(initialOverrides);
  });

  test("edit mode: clicking node opens popover", async ({ page }) => {
    const modal = await openHierarchy(page);
    await modal.locator(".hierarchy-edit-toggle").click();
    // Leaf members are rendered as .tree-leaf-row in the compact layout
    const memberNode = modal.locator(".tree-leaf-row.tree-node--editable").first();
    await memberNode.click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
  });

  test("edit mode: assigning override updates tree and shows moved indicator", async ({ page }) => {
    const modal = await openHierarchy(page);
    // In compact layout, overrides show as .tree-leaf-override or .tree-line-override SVG paths
    const initialOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();

    await modal.locator(".hierarchy-edit-toggle").click();
    const memberNode = modal.locator(".tree-leaf-row.tree-node--editable").first();
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
    const newOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    expect(newOverrides).toBeGreaterThan(initialOverrides);
    // Moved indicator should appear on the reassigned node
    const movedIndicators = await modal.locator(".tree-node--moved, .tree-leaf-row--moved").count();
    expect(movedIndicators).toBeGreaterThan(0);
  });

  test("edit mode: reassigning a manager moves their subtree in the hierarchy tree", async ({ page }) => {
    await page.evaluate(() => {
      const t = window.__test;
      const state = t.getState();
      let seq = t.getEmployeeSequence();
      const managerId = `p${++seq}`;
      const reportId = `p${++seq}`;
      state.employees[managerId] = {
        id: managerId,
        name: "Casey Example Manager",
        role: "Staff Engineer",
        location: "Remote",
        timezone: "EST (UTC−5)",
        notes: "",
        requested: false,
        level: 6,
        currentManager: "Ava Richardson",
      };
      state.employees[reportId] = {
        id: reportId,
        name: "Jordan Example Report",
        role: "Engineer",
        location: "Remote",
        timezone: "EST (UTC−5)",
        notes: "",
        requested: false,
        level: 5,
        currentManager: "Casey Example Manager",
      };
      state.teams.t1.members.push({ id: managerId });
      state.teams.t1.members.push({ id: reportId, managerOverride: managerId });
      t.setEmployeeSequence(seq);
      t.render();
    });

    const modal = await openHierarchy(page);
    await modal.locator(".hierarchy-edit-toggle").click();
    await modal.locator('.tree-node-member:has-text("Casey Example Manager")').click();

    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    await popover.locator('.tree-popover-item:has-text("Milo Hartwell")').click();
    await expect(popover).not.toBeVisible();

    const positions = await page.evaluate(() => {
      const modal = document.querySelector("#hierarchy-modal");
      const milo = [...modal.querySelectorAll(".tree-node-name")].find((el) => el.textContent?.includes("Milo Hartwell"))?.closest(".tree-node");
      const casey = [...modal.querySelectorAll(".tree-node-name")].find((el) => el.textContent?.includes("Casey Example Manager"))?.closest(".tree-node");
      const jordan = [...modal.querySelectorAll(".tree-leaf-name")].find((el) => el.textContent?.includes("Jordan Example Report"))?.closest(".tree-leaf-row");
      if (!milo || !casey || !jordan) return null;
      const miloRect = milo.getBoundingClientRect();
      const caseyRect = casey.getBoundingClientRect();
      const jordanRect = jordan.getBoundingClientRect();
      return {
        caseyBelowMilo: caseyRect.top > miloRect.top,
        jordanBelowCasey: jordanRect.top > caseyRect.top,
      };
    });

    expect(positions).not.toBeNull();
    expect(positions!.caseyBelowMilo).toBe(true);
    expect(positions!.jordanBelowCasey).toBe(true);
  });

  test("no view-hierarchy button directly on team titlebars", async ({ page }) => {
    // view-hierarchy is only accessible via the team menu popover, not as a direct button
    const teamButtons = page.locator('.team-titlebar [data-action="view-hierarchy"]');
    await expect(teamButtons).toHaveCount(0);
  });

  test("modal uses full-screen sizing", async ({ page }) => {
    const modal = await openHierarchy(page);
    const panel = modal.locator(".hierarchy-modal-panel");
    const box = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    // Panel should fill most of the viewport (40px margin + padding/border)
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 100);
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 100);
  });

  test("tree container scrolls horizontally without LHS cutoff", async ({ page }) => {
    const modal = await openHierarchy(page);
    const result = await page.evaluate(() => {
      const tree = document.querySelector(".tree-container")!;
      const nodes = tree.querySelectorAll(".tree-node");
      const containerLeft = tree.getBoundingClientRect().left;
      let leftmostNodeLeft = Infinity;
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        if (r.left < leftmostNodeLeft) leftmostNodeLeft = r.left;
      }
      return {
        scrollWidth: tree.scrollWidth,
        clientWidth: tree.clientWidth,
        leftmostNodeLeft,
        containerLeft,
      };
    });
    // Leftmost node should not be cut off (its left >= container left)
    expect(result.leftmostNodeLeft).toBeGreaterThanOrEqual(result.containerLeft);
    // Tree should be scrollable or equal-width at this viewport boundary
    expect(result.scrollWidth).toBeGreaterThanOrEqual(result.clientWidth);
  });

  test("tree container is scrollable to reach rightmost content", async ({ page }) => {
    const modal = await openHierarchy(page);
    const result = await page.evaluate(() => {
      const tree = document.querySelector(".tree-container") as HTMLElement;
      // Scroll fully right
      tree.scrollLeft = tree.scrollWidth;
      // Check both regular nodes and leaf groups
      const items = tree.querySelectorAll(".tree-node, .tree-leaf-group");
      let rightmostRight = -Infinity;
      for (const n of items) {
        const r = n.getBoundingClientRect();
        if (r.right > rightmostRight) rightmostRight = r.right;
      }
      const containerRight = tree.getBoundingClientRect().right;
      return { rightmostRight, containerRight };
    });
    // Rightmost node should be within or at the container edge
    expect(result.rightmostRight).toBeLessThanOrEqual(result.containerRight + 2);
  });

  test("compact layout: leaf members rendered as stacked groups", async ({ page }) => {
    const modal = await openHierarchy(page);
    const leafGroups = modal.locator(".tree-leaf-group");
    const groupCount = await leafGroups.count();
    expect(groupCount).toBeGreaterThanOrEqual(1);
    // Each group should contain leaf rows
    const firstGroup = leafGroups.first();
    const rows = firstGroup.locator(".tree-leaf-row");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
    // Rows should have name and role
    await expect(rows.first().locator(".tree-leaf-name")).toBeVisible();
    await expect(rows.first().locator(".tree-leaf-role")).toBeVisible();
  });

  test("compact layout: leaf rows show name and role on separate lines", async ({ page }) => {
    const modal = await openHierarchy(page);

    const wrapCheck = await page.evaluate(() => {
      const row = document.querySelector("#hierarchy-modal .tree-leaf-row");
      if (!row) return null;
      const text = row.querySelector(".tree-leaf-text");
      const name = row.querySelector(".tree-leaf-name");
      const role = row.querySelector(".tree-leaf-role");
      const rowRect = row.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      const roleRect = role.getBoundingClientRect();
      const nameStyles = getComputedStyle(name);
      const roleStyles = getComputedStyle(role);
      return {
        textExists: !!text,
        rowHeight: rowRect.height,
        nameWhiteSpace: nameStyles.whiteSpace,
        roleWhiteSpace: roleStyles.whiteSpace,
        nameLineClamp: nameStyles.webkitLineClamp,
        roleStartsAfterName: roleRect.top >= nameRect.bottom - 1,
        fitsInsideRow: roleRect.bottom <= rowRect.bottom + 1,
      };
    });

    expect(wrapCheck).not.toBeNull();
    expect(wrapCheck!.textExists).toBe(true);
    expect(wrapCheck!.rowHeight).toBeGreaterThan(30);
    expect(wrapCheck!.nameWhiteSpace).toBe("normal");
    expect(wrapCheck!.roleWhiteSpace).toBe("nowrap");
    expect(wrapCheck!.nameLineClamp).toBe("2");
    expect(wrapCheck!.roleStartsAfterName).toBe(true);
    expect(wrapCheck!.fitsInsideRow).toBe(true);
  });

  test("compact layout: no overlapping elements", async ({ page }) => {
    const modal = await openHierarchy(page);
    const overlaps = await page.evaluate(() => {
      const canvas = document.querySelector(".tree-canvas")!;
      const items: DOMRect[] = [];
      for (const el of canvas.querySelectorAll(".tree-node, .tree-leaf-group")) {
        items.push(el.getBoundingClientRect());
      }
      let count = 0;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
            count++;
          }
        }
      }
      return count;
    });
    expect(overlaps).toBe(0);
  });

  test("compact layout: SVG connector lines present", async ({ page }) => {
    const modal = await openHierarchy(page);
    const svg = modal.locator(".tree-lines");
    await expect(svg).toBeVisible();
    const pathCount = await svg.locator("path").count();
    expect(pathCount).toBeGreaterThanOrEqual(1);
  });

  test("compact layout: connector lines start at the bottom edge of manager cards", async ({ page }) => {
    const modal = await openHierarchy(page);
    const alignment = await page.evaluate(() => {
      const canvas = document.querySelector("#hierarchy-modal .tree-canvas");
      const nodes = [...canvas.querySelectorAll(".tree-node-manager")];
      const paths = [...canvas.querySelectorAll(".tree-lines path")];
      const starts = paths.map((p) => {
        const match = p.getAttribute("d")?.match(/^M([\d.]+),([\d.]+)/);
        if (!match) return null;
        return { x: Number(match[1]), y: Number(match[2]) };
      }).filter(Boolean);
      let best = null;
      for (const start of starts) {
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          const centerX = parseFloat(node.style.left || "0") + rect.width / 2;
          const expectedY = parseFloat(node.style.top || "0") + rect.height;
          const xDelta = Math.abs(start.x - centerX);
          const yDelta = Math.abs(start.y - expectedY);
          if (xDelta > 3) continue;
          if (!best || yDelta < best.delta) {
            best = { delta: yDelta };
          }
        }
      }
      return best;
    });

    expect(alignment).not.toBeNull();
    expect(alignment!.delta).toBeLessThanOrEqual(1.5);
  });
});
