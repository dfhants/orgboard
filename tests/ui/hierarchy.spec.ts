import { test, expect } from "./fixtures";

test.describe("Hierarchy Tree Modal", () => {
  const openHierarchy = async (page: import("@playwright/test").Page) => {
    await page.locator('.action-bar [data-action="view-hierarchy"]').click();
    const modal = page.locator("#hierarchy-modal");
    await expect(modal).toBeVisible();
    return modal;
  };

  const assignFirstAvailableOverride = async (page: import("@playwright/test").Page, modal: import("@playwright/test").Locator, selector = ".tree-leaf-row.tree-node--editable") => {
    await modal.locator(selector).first().click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    const items = popover.locator(".tree-popover-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const hasTag = await items.nth(i).locator(".manager-pick-tag").count();
      if (hasTag === 0) {
        await items.nth(i).click();
        await expect(popover).not.toBeVisible();
        return true;
      }
    }
    return false;
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

  test("global hierarchy renders unassigned people as separate top-level trees", async ({ page }) => {
    const modal = await openHierarchy(page);
    const tree = modal.locator(".tree-container");
    await expect(tree).toContainText("Eli Vasquez");
    await expect(tree).toContainText("Nia Ramaswamy");
  });

  test("tree shows nested team subtree", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".tree-container")).toContainText("Research");
  });

  test("branch toggle chevrons are rendered on first modal open", async ({ page }) => {
    const modal = await openHierarchy(page);
    const toggles = modal.locator(".tree-node-toggle");
    await expect(toggles.first()).toBeVisible();
    await expect(modal.locator(".tree-node-toggle svg").first()).toBeVisible();
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

  test("direct reassignment enters dirty mode and shows edit banner", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator(".hierarchy-edit-banner")).not.toBeVisible();
    const assigned = await assignFirstAvailableOverride(page, modal);
    if (!assigned) return;
    await expect(modal.locator(".hierarchy-edit-banner")).toBeVisible();
    await expect(modal.locator(".hierarchy-edit-banner")).toContainText("Click a person");
    await expect(modal.locator(".tree-node--editable").first()).toBeVisible();
  });

  test("in-place hierarchy updates do not reapply modal open animation", async ({ page }) => {
    const modal = await openHierarchy(page);
    const panel = modal.locator(".hierarchy-modal-panel");

    await expect(panel).not.toHaveClass(/hierarchy-modal-panel--rerender/);

    const assigned = await assignFirstAvailableOverride(page, modal);
    if (!assigned) return;
    await expect(modal.locator(".hierarchy-modal-panel")).toHaveClass(/hierarchy-modal-panel--rerender/);
  });

  test("Save and Cancel buttons appear only after a reassignment", async ({ page }) => {
    const modal = await openHierarchy(page);
    await expect(modal.locator("[data-action='save-tree-edit']")).not.toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).not.toBeVisible();

    const assigned = await assignFirstAvailableOverride(page, modal);
    if (!assigned) return;

    await expect(modal.locator("[data-action='save-tree-edit']")).toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).toBeVisible();
  });

  test("Save exits dirty mode and keeps changes", async ({ page }) => {
    const modal = await openHierarchy(page);
    const assigned = await assignFirstAvailableOverride(page, modal);
    if (!assigned) return;

    await modal.locator("[data-action='save-tree-edit']").click();
    await expect(modal.locator("[data-action='save-tree-edit']")).not.toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).not.toBeVisible();
    const overrides = await modal.locator(".tree-leaf-override, .tree-node-override, .tree-line-override").count();
    expect(overrides).toBeGreaterThan(0);
  });

  test("Cancel exits dirty mode and reverts changes", async ({ page }) => {
    const modal = await openHierarchy(page);
    const initialOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    const assigned = await assignFirstAvailableOverride(page, modal);
    if (!assigned) return;

    await modal.locator("[data-action='cancel-tree-edit']").click();
    await expect(modal.locator("[data-action='save-tree-edit']")).not.toBeVisible();
    await expect(modal.locator("[data-action='cancel-tree-edit']")).not.toBeVisible();
    const afterOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    expect(afterOverrides).toBe(initialOverrides);
  });

  test("clicking node opens popover without an edit toggle", async ({ page }) => {
    const modal = await openHierarchy(page);
    const memberNode = modal.locator(".tree-leaf-row.tree-node--editable").first();
    await memberNode.click();
    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
  });

  test("edit mode: assigning override updates tree and shows moved indicator", async ({ page }) => {
    const modal = await openHierarchy(page);
    const initialOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();

    const picked = await assignFirstAvailableOverride(page, modal);
    if (!picked) return;

    const newOverrides = await modal.locator(".tree-leaf-override, .tree-node-override").count();
    expect(newOverrides).toBeGreaterThan(initialOverrides);
    const movedIndicators = await modal.locator(".tree-node--moved, .tree-leaf-row--moved").count();
    expect(movedIndicators).toBeGreaterThan(0);
  });

  test("edit mode: assigning override does not rerender board until Save", async ({ page }) => {
    const modal = await openHierarchy(page);

    await page.evaluate(() => {
      const firstCard = document.querySelector(".person-card");
      if (firstCard) firstCard.setAttribute("data-edit-marker", "persist-during-edit");
    });

    const picked = await assignFirstAvailableOverride(page, modal);
    if (!picked) return;

    const markerDuringEdit = await page.evaluate(() => !!document.querySelector('.person-card[data-edit-marker="persist-during-edit"]'));
    expect(markerDuringEdit).toBe(true);

    await modal.locator("[data-action='save-tree-edit']").click();
    const markerAfterSave = await page.evaluate(() => !!document.querySelector('.person-card[data-edit-marker="persist-during-edit"]'));
    expect(markerAfterSave).toBe(false);
  });

  test("edit mode: overriding a person reparents them under the new manager in the tree", async ({ page }) => {
    await page.evaluate(() => {
      const t = window.__test;
      const state = t.getState();
      let seq = t.getEmployeeSequence();
      const mgrId = `p${++seq}`;
      const repId = `p${++seq}`;
      state.employees[mgrId] = {
        id: mgrId,
        name: "Jamie Test Manager",
        role: "Senior Engineer",
        location: "Remote",
        timezone: "EST (UTC−5)",
        notes: "",
        requested: false,
        level: 6,
        currentManager: "Ava Richardson",
      };
      state.employees[repId] = {
        id: repId,
        name: "Sam Test Report",
        role: "Engineer",
        location: "Remote",
        timezone: "EST (UTC−5)",
        notes: "",
        requested: false,
        level: 5,
        currentManager: "Ava Richardson",
      };
      state.teams.t1.members.push({ id: mgrId });
      state.teams.t1.members.push({ id: repId });
      t.setEmployeeSequence(seq);
      t.render();
    });

    const modal = await openHierarchy(page);
    await modal.locator('.tree-leaf-row.tree-node--editable:has-text("Sam Test Report")').click();

    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    await popover.locator('.tree-popover-item:has-text("Jamie Test Manager")').click();
    await expect(popover).not.toBeVisible();

    const after = await page.evaluate(() => {
      const modalEl = document.querySelector("#hierarchy-modal");
      const jamieNode = [...modalEl.querySelectorAll(".tree-node")].find((el) =>
        el.querySelector(".tree-node-name")?.textContent?.includes("Jamie Test Manager")
      );
      const samLeaf = [...modalEl.querySelectorAll(".tree-leaf-row")].find((el) =>
        el.querySelector(".tree-leaf-name")?.textContent?.includes("Sam Test Report")
      );
      if (!jamieNode || !samLeaf) return null;
      const jamieRect = jamieNode.getBoundingClientRect();
      const samRect = samLeaf.getBoundingClientRect();
      return {
        jamieIsNode: true,
        samBelowJamie: samRect.top > jamieRect.bottom - 1,
        roughlyAligned: Math.abs((samRect.left + samRect.right) / 2 - (jamieRect.left + jamieRect.right) / 2) < 90,
      };
    });

    expect(after).not.toBeNull();
    expect(after!.jamieIsNode).toBe(true);
    expect(after!.samBelowJamie).toBe(true);
    expect(after!.roughlyAligned).toBe(true);
  });

  test("edit mode: Theo override to Zuri reparents across teams", async ({ page }) => {
    await page.evaluate(() => {
      const t = window.__test;
      const state = t.getState();
      const research = state.teams.t3;
      const theo = research.members.find((m) => m.id === "p7");
      if (theo) theo.managerOverride = "p3"; // Zuri Okafor
      t.render();
    });

    const modal = await openHierarchy(page);

    const layout = await page.evaluate(() => {
      const modalEl = document.querySelector("#hierarchy-modal");
      const zuriNode = [...modalEl.querySelectorAll(".tree-node")].find((el) =>
        el.querySelector(".tree-node-name")?.textContent?.includes("Zuri Okafor")
      );
      const theoLeaf = [...modalEl.querySelectorAll(".tree-leaf-row")].find((el) =>
        el.querySelector(".tree-leaf-name")?.textContent?.includes("Theo Carmichael")
      );
      const irisNode = [...modalEl.querySelectorAll(".tree-node")].find((el) =>
        el.querySelector(".tree-node-name")?.textContent?.includes("Iris Tanaka")
      );
      if (!zuriNode || !theoLeaf || !irisNode) return null;
      const z = zuriNode.getBoundingClientRect();
      const t = theoLeaf.getBoundingClientRect();
      const i = irisNode.getBoundingClientRect();
      return {
        theoBelowZuri: t.top > z.bottom - 1,
        theoCloserToZuriThanIris: Math.abs((t.left + t.right) / 2 - (z.left + z.right) / 2)
          < Math.abs((t.left + t.right) / 2 - (i.left + i.right) / 2),
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.theoBelowZuri).toBe(true);
    expect(layout!.theoCloserToZuriThanIris).toBe(true);
  });

  test("edit mode: cross-team reassignment works inside a single root tree", async ({ page }) => {
    await page.evaluate(() => {
      const t = window.__test;
      const state = t.getState();

      state.initialized = true;
      state.rootLayout = "horizontal";
      state.unassignedEmployees = [];
      state.employees = {
        p1: { id: "p1", name: "Root Manager", location: "Remote", timezone: "EST (UTC−5)", role: "Director", notes: "", requested: false, level: 8, currentManager: "" },
        p2: { id: "p2", name: "Leaf Target", location: "Remote", timezone: "EST (UTC−5)", role: "Engineer", notes: "", requested: false, level: 5, currentManager: "Team Alpha Manager" },
        p3: { id: "p3", name: "Moved Person", location: "Remote", timezone: "PST (UTC−8)", role: "Designer", notes: "", requested: false, level: 4, currentManager: "Team Beta Manager" },
        p4: { id: "p4", name: "Team Alpha Manager", location: "Remote", timezone: "CST (UTC−6)", role: "Manager", notes: "", requested: false, level: 7, currentManager: "Root Manager" },
        p5: { id: "p5", name: "Team Beta Manager", location: "Remote", timezone: "GMT (UTC+0)", role: "Manager", notes: "", requested: false, level: 7, currentManager: "Root Manager" },
      };
      state.teams = {
        t1: {
          id: "t1",
          name: "Root Team",
          ownLayout: "expanded",
          manager: "p1",
          members: [],
          subTeams: [{ id: "t2" }, { id: "t3" }],
          color: "#818cf8",
        },
        t2: {
          id: "t2",
          name: "Alpha",
          ownLayout: "expanded",
          manager: "p4",
          members: [{ id: "p2" }],
          subTeams: [],
          color: "#60a5fa",
        },
        t3: {
          id: "t3",
          name: "Beta",
          ownLayout: "expanded",
          manager: "p5",
          members: [{ id: "p3" }],
          subTeams: [],
          color: "#38bdf8",
        },
      };
      state.rootTeams = ["t1"];
      t.setEmployeeSequence(5);
      t.render();
    });

    const modal = await openHierarchy(page);
    await modal.locator('.tree-node--editable:has-text("Moved Person")').first().click();

    const popover = page.locator(".tree-override-popover");
    await expect(popover).toBeVisible();
    await popover.locator('.tree-popover-item:has-text("Leaf Target")').click();
    await expect(popover).not.toBeVisible();

    const after = await page.evaluate(() => {
      const modalEl = document.querySelector("#hierarchy-modal");
      const targetNode = [...modalEl.querySelectorAll(".tree-node")].find((el) =>
        el.querySelector(".tree-node-name")?.textContent?.includes("Leaf Target")
      );
      const targetLeaf = [...modalEl.querySelectorAll(".tree-leaf-row")].find((el) =>
        el.querySelector(".tree-leaf-name")?.textContent?.includes("Leaf Target")
      );
      const movedLeaf = [...modalEl.querySelectorAll(".tree-leaf-row")].find((el) =>
        el.querySelector(".tree-leaf-name")?.textContent?.includes("Moved Person")
      );
      if (!targetNode || !movedLeaf) {
        return {
          targetAsNode: !!targetNode,
          targetAsLeaf: !!targetLeaf,
          movedFound: !!movedLeaf,
        };
      }
      const targetRect = targetNode.getBoundingClientRect();
      const movedRect = movedLeaf.getBoundingClientRect();
      return {
        targetAsNode: true,
        targetAsLeaf: !!targetLeaf,
        movedFound: true,
        movedBelowTarget: movedRect.top > targetRect.bottom - 1,
        roughlyAligned: Math.abs((movedRect.left + movedRect.right) / 2 - (targetRect.left + targetRect.right) / 2) < 90,
      };
    });

    expect(after.targetAsNode).toBe(true);
    expect(after.targetAsLeaf).toBe(false);
    expect(after.movedFound).toBe(true);
    expect(after.movedBelowTarget).toBe(true);
    expect(after.roughlyAligned).toBe(true);
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

  test("compact layout: leaf rows do not overlap across depths", async ({ page }) => {
    await page.evaluate(async () => {
      const stateMod = await import("/src/state.mjs");
      const nextState = stateMod.createBlankState();
      nextState.initialized = true;
      nextState.rootLayout = "horizontal";

      const makeEmp = (id, name, role, manager = "") => ({
        id,
        name,
        location: "Remote",
        timezone: "EST (UTC−5)",
        role,
        notes: "",
        requested: false,
        level: 5,
        currentManager: manager,
      });

      nextState.employees = {
        p1: makeEmp("p1", "Root", "Director"),
        p2: makeEmp("p2", "Manager A", "Manager", "Root"),
        p3: makeEmp("p3", "Manager B", "Manager", "Manager A"),
        p10: makeEmp("p10", "A Leaf 1", "Engineer", "Root"),
        p11: makeEmp("p11", "A Leaf 2", "Engineer", "Root"),
        p12: makeEmp("p12", "A Leaf 3", "Engineer", "Root"),
        p13: makeEmp("p13", "A Leaf 4", "Engineer", "Root"),
        p20: makeEmp("p20", "B Leaf 1", "Designer", "Manager A"),
        p21: makeEmp("p21", "B Leaf 2", "Designer", "Manager A"),
        p22: makeEmp("p22", "B Leaf 3", "Designer", "Manager A"),
        p23: makeEmp("p23", "B Leaf 4", "Designer", "Manager A"),
      };

      nextState.teams = {
        t1: {
          id: "t1",
          name: "Root Team",
          ownLayout: "expanded",
          manager: "p1",
          members: [
            { id: "p2" },
            { id: "p10" },
            { id: "p11" },
            { id: "p12" },
            { id: "p13" },
            { id: "p3", managerOverride: "p2" },
            { id: "p20", managerOverride: "p2" },
            { id: "p21", managerOverride: "p2" },
            { id: "p22", managerOverride: "p2" },
            { id: "p23", managerOverride: "p2" },
          ],
          subTeams: [],
          color: "#818cf8",
        },
      };
      nextState.rootTeams = ["t1"];

      stateMod.setState(nextState);
      stateMod.setShowLanding(false);
      stateMod.setEmployeeSequence(23);
      window.__test.render();
    });

    const modal = await openHierarchy(page);

    const overlaps = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#hierarchy-modal .tree-leaf-row")].map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });

      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i];
          const b = rows[j];
          const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          if (overlaps) count++;
        }
      }
      return count;
    });

    expect(modal).toBeVisible();
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
