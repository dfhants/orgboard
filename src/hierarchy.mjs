import { escapeHtml, colorForTimezone, colorForManager } from './utils.mjs';
import { state, getTeam, findMemberEntry, globalCriteria } from './state.mjs';
import { buildHierarchyTree } from './team-logic.mjs';
import { createIcons } from './icons.mjs';

/* ── Compact tree layout (custom Reingold-Tilford) ── */

const NODE_W = 140;
const NODE_H = 62;
const LEAF_H = 38;
const H_GAP = 6;
const V_GAP = 40;

function hierarchyNodeKey(node) {
  if (!node) return "";
  if (node.type === "root" || node.type === "team") {
    return `team:${node.teamId || ""}`;
  }
  if (node.type === "employee" && node.employee?.id) {
    return `emp:${node.teamId || ""}:${node.employee.id}`;
  }
  return "";
}

function bundleLeaves(node, collapsedKeys = new Set()) {
  if (!node.children || node.children.length === 0) return node;
  const nodeKey = hierarchyNodeKey(node);
  const isCollapsed = nodeKey && collapsedKeys.has(nodeKey);
  const processed = node.children.map(c => bundleLeaves(c, collapsedKeys));
  const branches = [];
  const leaves = [];
  for (const child of processed) {
    const isLeaf = !child.children || child.children.length === 0;
    const isBranchType = child.type === "root" || child.type === "team";
    if (isLeaf && !isBranchType) {
      leaves.push(child);
    } else {
      branches.push(child);
    }
  }
  const newChildren = [...branches];
  if (leaves.length > 0) {
    newChildren.push({ type: "leaf-group", members: leaves, children: [] });
  }
  return {
    ...node,
    __nodeKey: nodeKey,
    __collapsible: newChildren.length > 0,
    __collapsed: !!isCollapsed,
    children: isCollapsed ? [] : newChildren,
  };
}

function layoutNode(data) {
  const kids = (data.children || []).map(c => layoutNode(c));
  const n = { data, children: kids, x: 0 };

  if (kids.length === 0) return n;
  if (kids.length === 1) {
    kids[0].x = 0;
    return n;
  }

  kids[0].x = 0;
  for (let i = 1; i < kids.length; i++) {
    const rightContour = getContour(kids, i, "right");
    const leftContour = getLeftContour(kids[i]);
    let shift = 0;
    const depth = Math.min(rightContour.length, leftContour.length);
    for (let d = 0; d < depth; d++) {
      const needed = rightContour[d] - leftContour[d] + NODE_W + H_GAP;
      if (needed > shift) shift = needed;
    }
    kids[i].x = shift;
  }

  n.x = 0;
  const mid = (kids[0].x + kids[kids.length - 1].x) / 2;
  for (const k of kids) k.x -= mid;

  const leafKids = kids.filter((k) => k.data?.type === "leaf-group");
  const branchKids = kids.filter((k) => k.data?.type !== "leaf-group");
  if (leafKids.length > 0 && branchKids.length > 0) {
    const maxBranchRight = Math.max(...branchKids.map((k) => k.x + getSubtreeMaxX(k)));
    let nextLeafX = maxBranchRight + NODE_W + H_GAP;
    for (const leaf of leafKids) {
      if (leaf.x < nextLeafX) leaf.x = nextLeafX;
      nextLeafX = leaf.x + NODE_W + H_GAP;
    }
  }

  return n;
}

function getSubtreeMaxX(node) {
  let maxX = 0;
  (function walk(n, x) {
    if (x > maxX) maxX = x;
    for (const ch of n.children || []) walk(ch, x + ch.x);
  })(node, 0);
  return maxX;
}

function getLeftContour(node) {
  const c = [];
  (function walk(n, x, d) {
    if (d >= c.length) c.push(x);
    else if (x < c[d]) c[d] = x;
    for (const ch of n.children) walk(ch, x + ch.x, d + 1);
  })(node, 0, 0);
  return c;
}

function getContour(kids, endIdx, side) {
  const c = [];
  for (let i = 0; i < endIdx; i++) {
    const offX = kids[i].x;
    (function walk(n, x, d) {
      if (d >= c.length) c.push(x);
      else if (side === "right" ? x > c[d] : x < c[d]) c[d] = x;
      for (const ch of n.children) walk(ch, x + ch.x, d + 1);
    })(kids[i], offX, 0);
  }
  return c;
}

function flatten(node, absX, depth, out) {
  const x = absX;
  const y = depth * (NODE_H + V_GAP);

  if (node.data.type === "leaf-group") {
    out.leafGroups.push({ members: node.data.members, x, y });
  } else {
    out.nodes.push({ node: node.data, x, y });
  }

  for (const child of node.children) {
    const cx = absX + child.x;
    const cy = (depth + 1) * (NODE_H + V_GAP);
    out.edges.push({ x1: x, y1: y, x2: cx, y2: cy, isOverride: !!child.data.isOverride });
    flatten(child, cx, depth + 1, out);
  }
}

export function computeTreeLayout(trees, collapsedKeys = new Set()) {
  const bundled = trees.map(t => bundleLeaves(t, collapsedKeys));
  const layouts = bundled.map(t => layoutNode(t));

  const out = { nodes: [], edges: [], leafGroups: [] };
  let xOffset = 0;

  for (const laid of layouts) {
    const leftC = getLeftContour(laid);
    const minLeft = Math.min(...leftC);
    const shift = xOffset - minLeft;

    flatten(laid, shift, 0, out);

    const rightC = [];
    (function walk(n, x, d) {
      if (d >= rightC.length) rightC.push(x);
      else if (x > rightC[d]) rightC[d] = x;
      for (const ch of n.children) walk(ch, x + ch.x, d + 1);
    })(laid, shift, 0);
    const maxRight = Math.max(...rightC);
    xOffset = maxRight + NODE_W + H_GAP * 3;
  }

  const allX = [...out.nodes.map(n => n.x), ...out.leafGroups.map(g => g.x)];
  if (allX.length > 0) {
    const minX = Math.min(...allX);
    for (const n of out.nodes) n.x -= minX;
    for (const g of out.leafGroups) g.x -= minX;
    for (const e of out.edges) { e.x1 -= minX; e.x2 -= minX; }
  }
  return out;
}

function renderNodeHtml(node, editMode, x, y) {
  const isRoot = node.type === "root";
  const isTeamNode = node.type === "team";

  if (isRoot || isTeamNode) {
    const emp = node.employee;
    const teamName = node.teamName || "";
    const color = node.teamColor || "var(--accent)";
    if (emp) {
      const tz = colorForTimezone(emp.timezone);
      const clickAttr = `data-tree-click="manager" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"`;
      const toggleHtml = node.__collapsible
        ? `<button class="tree-node-toggle" type="button" data-tree-toggle="${node.__nodeKey}" aria-label="${node.__collapsed ? "Expand" : "Collapse"} branch"><i data-lucide="${node.__collapsed ? "chevron-right" : "chevron-down"}"></i></button>`
        : "";
      const movedClass = editMode && node.isOverride ? " tree-node--moved" : "";
      return `
        <div class="tree-node tree-node-manager tree-node--editable${movedClass}" ${clickAttr} style="left:${x}px;top:${y}px;--node-accent:${color}">
          ${toggleHtml}
          <div class="tree-node-color" style="background:${tz}"></div>
          <div class="tree-node-name">${escapeHtml(emp.name)}</div>
          <div class="tree-node-role">${escapeHtml(emp.role)}</div>
          <div class="tree-node-team">${escapeHtml(teamName)}</div>
        </div>
      `;
    } else {
      return `
        <div class="tree-node tree-node-manager tree-node-empty" style="left:${x}px;top:${y}px;--node-accent:${color}">
          <div class="tree-node-name">No manager</div>
          <div class="tree-node-team">${escapeHtml(teamName)}</div>
        </div>
      `;
    }
  } else {
    const emp = node.employee;
    const tz = colorForTimezone(emp.timezone);
    const overrideClass = node.isOverride ? " tree-node-override" : "";
    const clickAttr = `data-tree-click="member" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"`;
    const toggleHtml = node.__collapsible
      ? `<button class="tree-node-toggle" type="button" data-tree-toggle="${node.__nodeKey}" aria-label="${node.__collapsed ? "Expand" : "Collapse"} branch"><i data-lucide="${node.__collapsed ? "chevron-right" : "chevron-down"}"></i></button>`
      : "";
    const movedClass = editMode && node.isOverride ? " tree-node--moved" : "";
    return `
      <div class="tree-node tree-node-member${overrideClass} tree-node--editable${movedClass}" ${clickAttr} style="left:${x}px;top:${y}px">
        ${toggleHtml}
        <div class="tree-node-color" style="background:${tz}"></div>
        <div class="tree-node-name">${escapeHtml(emp.name)}</div>
        <div class="tree-node-role">${escapeHtml(emp.role)}</div>
      </div>
    `;
  }
}

function reparentCrossTreeOverrides(trees) {
  if (!Array.isArray(trees) || trees.length === 0) return trees;

  const refs = [];
  function walk(node, parent, parentChildren) {
    if (!node) return;
    refs.push({ node, parent, parentChildren });
    for (const child of node.children || []) {
      walk(child, node, node.children);
    }
  }
  for (const tree of trees) walk(tree, null, null);

  const byEmployeeId = new Map();
  for (const ref of refs) {
    const id = ref.node?.employee?.id;
    if (id) byEmployeeId.set(id, ref);
  }

  function isAncestor(candidateAncestor, nodeRef) {
    let cur = nodeRef;
    while (cur?.parent) {
      if (cur.parent === candidateAncestor.node) return true;
      cur = refs.find((r) => r.node === cur.parent) || null;
    }
    return false;
  }

  const employeeMovers = refs.filter((r) => r.node?.type === "employee" && r.node?.isOverride);
  for (const src of employeeMovers) {
    const srcTeam = state.teams[src.node.teamId];
    const srcMember = srcTeam?.members?.find((m) => m.id === src.node.employee?.id);
    const targetManagerId = srcMember?.managerOverride;
    if (!targetManagerId) continue;

    const target = byEmployeeId.get(targetManagerId);
    if (!target || !src.parentChildren || target.node === src.node) continue;
    if (isAncestor(src, target)) continue;

    const idx = src.parentChildren.indexOf(src.node);
    if (idx >= 0) src.parentChildren.splice(idx, 1);
    if (!Array.isArray(target.node.children)) target.node.children = [];
    target.node.children.push(src.node);
  }

  const teamMovers = refs.filter((r) => (r.node?.type === "root" || r.node?.type === "team") && r.node?.managerOverride);
  for (const src of teamMovers) {
    const targetManagerId = src.node.managerOverride;
    const target = byEmployeeId.get(targetManagerId);
    if (!target || target.node === src.node) continue;
    if (isAncestor(src, target)) continue;

    const treeIdx = trees.indexOf(src.node);
    if (treeIdx >= 0) {
      trees.splice(treeIdx, 1);
    } else if (src.parentChildren) {
      const idx = src.parentChildren.indexOf(src.node);
      if (idx >= 0) src.parentChildren.splice(idx, 1);
    }
    if (!Array.isArray(target.node.children)) target.node.children = [];
    target.node.children.push(src.node);
  }

  return trees;
}

export function renderHierarchyNode(node, editMode) {
  if (!node) return "";

  const isRoot = node.type === "root";
  const isTeamNode = node.type === "team";

  let nodeHtml;
  if (isRoot || isTeamNode) {
    const emp = node.employee;
    const teamName = node.teamName || "";
    const color = node.teamColor || "var(--accent)";
    if (emp) {
      const tz = colorForTimezone(emp.timezone);
      const clickAttr = `data-tree-click="manager" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"`;
      nodeHtml = `
        <div class="tree-node tree-node-manager tree-node--editable" ${clickAttr} style="--node-accent:${color}">
          <div class="tree-node-color" style="background:${tz}"></div>
          <div class="tree-node-name">${escapeHtml(emp.name)}</div>
          <div class="tree-node-role">${escapeHtml(emp.role)}</div>
          <div class="tree-node-team">${escapeHtml(teamName)}</div>
        </div>
      `;
    } else {
      nodeHtml = `
        <div class="tree-node tree-node-manager tree-node-empty" style="--node-accent:${color}">
          <div class="tree-node-name">No manager</div>
          <div class="tree-node-team">${escapeHtml(teamName)}</div>
        </div>
      `;
    }
  } else {
    const emp = node.employee;
    const tz = colorForTimezone(emp.timezone);
    const overrideClass = node.isOverride ? " tree-node-override" : "";
    const clickAttr = `data-tree-click="member" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"`;
    nodeHtml = `
      <div class="tree-node tree-node-member${overrideClass} tree-node--editable" ${clickAttr}>
        <div class="tree-node-color" style="background:${tz}"></div>
        <div class="tree-node-name">${escapeHtml(emp.name)}</div>
        <div class="tree-node-role">${escapeHtml(emp.role)}</div>
      </div>
    `;
  }

  if (node.children && node.children.length > 0) {
    const childrenHtml = node.children.map((child) => {
      const overrideClass = child.isOverride ? " tree-branch-override" : "";
      return `<li class="tree-branch${overrideClass}">${renderHierarchyNode(child, editMode)}</li>`;
    }).join("");
    return `${nodeHtml}<ul class="tree-children">${childrenHtml}</ul>`;
  }

  return nodeHtml;
}

export function renderCompactTree(trees, editMode, collapsedKeys = new Set()) {
  const adjustedTrees = reparentCrossTreeOverrides(trees);
  const layout = computeTreeLayout(adjustedTrees, collapsedKeys);
  const halfW = NODE_W / 2;

  let maxY = 0;
  for (const n of layout.nodes) maxY = Math.max(maxY, n.y + NODE_H);
  for (const g of layout.leafGroups) maxY = Math.max(maxY, g.y + g.members.length * LEAF_H + 4);

  const maxX = Math.max(
    ...layout.nodes.map(n => n.x + NODE_W),
    ...layout.leafGroups.map(g => g.x + NODE_W),
    0
  );

  const lines = layout.edges.map(e => {
    const x1 = e.x1 + halfW, y1 = e.y1 + NODE_H;
    const x2 = e.x2 + halfW, y2 = e.y2;
    const midY = y1 + (y2 - y1) * 0.5;
    const cls = e.isOverride ? ' class="tree-line-override"' : '';
    return `<path d="M${x1},${y1} V${midY} H${x2} V${y2}"${cls} />`;
  }).join("");

  const svg = `<svg class="tree-lines" width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
  const nodesHtml = layout.nodes.map(n => renderNodeHtml(n.node, editMode, n.x, n.y)).join("");

  const groupsHtml = layout.leafGroups.map(g => {
    const rows = g.members.map(member => {
      const emp = member.employee;
      const tz = colorForTimezone(emp.timezone);
      const overrideClass = member.isOverride ? " tree-leaf-override" : "";
      const movedClass = editMode && member.isOverride ? " tree-leaf-row--moved" : "";
      const clickAttr = `data-tree-click="member" data-employee-id="${emp.id}" data-tree-team-id="${member.teamId}"`;
      return `<div class="tree-leaf-row${overrideClass}${movedClass} tree-node--editable" ${clickAttr}>
        <span class="tree-leaf-tz" style="background:${tz}"></span>
        <span class="tree-leaf-text">
          <span class="tree-leaf-name">${escapeHtml(emp.name)}</span>
          <span class="tree-leaf-role">${escapeHtml(emp.role)}</span>
        </span>
      </div>`;
    }).join("");
    return `<div class="tree-leaf-group" style="left:${g.x}px;top:${g.y}px">${rows}</div>`;
  }).join("");

  return `<div class="tree-canvas" style="width:${maxX}px;height:${maxY}px">${svg}${nodesHtml}${groupsHtml}</div>`;
}

export function rerenderHierarchyInPlace(modal) {
  const teamId = modal.dataset.teamId || null;
  const editMode = modal.dataset.editMode === "true";
  const collapsedKeys = new Set(JSON.parse(modal.dataset.collapsedKeys || "[]"));

  const trees = getHierarchyTreesForModal(teamId);
  if (trees.length === 0) return;

  const title = teamId ? `${escapeHtml(trees[0].teamName)} — Reporting Hierarchy` : "Reporting Hierarchy";
  const actionButtons = editMode
    ? `<button class="toolbar-button modal-submit" type="button" data-action="save-tree-edit">Save</button>
        <button class="toolbar-button" type="button" data-action="cancel-tree-edit">Cancel</button>`
      : `<button id="hierarchy-modal-close" class="toolbar-button" type="button">Close</button>`;
  modal.innerHTML = `
    <div class="modal-panel modal-panel-fullscreen hierarchy-modal-panel hierarchy-modal-panel--rerender">
      <div class="hierarchy-modal-header">
        <h3 class="modal-title">${title}</h3>
        <div class="hierarchy-modal-actions">
          ${actionButtons}
        </div>
      </div>
      ${editMode ? '<p class="hierarchy-edit-banner">Click a person to reassign their manager. Save to keep changes or Cancel to revert.</p>' : ''}
      <div class="tree-container">
        ${renderCompactTree(trees, editMode, collapsedKeys)}
      </div>
    </div>
  `;
  createIcons();
}

export function getHierarchyTreesForModal(teamId = null) {
  if (teamId) {
    const tree = buildHierarchyTree(state, teamId);
    return tree ? [tree] : [];
  }

  const teamTrees = state.rootTeams.map((id) => buildHierarchyTree(state, id)).filter(Boolean);
  const unassignedTrees = (state.unassignedEmployees || [])
    .map((id) => state.employees[id])
    .filter(Boolean)
    .map((employee) => ({
      employee,
      children: [],
      isOverride: false,
      teamId: "__unassigned__",
      teamName: "Unassigned",
      teamColor: "var(--line-soft)",
      type: "employee",
    }));

  return [...teamTrees, ...unassignedTrees];
}
