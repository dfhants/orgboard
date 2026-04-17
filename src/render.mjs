import { createIcons as _createIcons, icons } from "lucide";
import { escapeHtml, hashString, colorForManager, colorForTimezone, timezoneColors, managerPillPalette, parseUtcOffset, computeMaxTimezoneGap, ribbonColorForGap, computeTeamCheckStatus, ribbonColorForCheckStatus, ribbonTooltipForCheckStatus } from './utils.mjs';
import {
  state, dragState,
  scenarios, activeScenarioId, showLanding, globalCriteria,
  boardZoom,
  getTeam, getAllManagers, findMemberEntry,
  oppositeLayout, layoutIcons,
} from './state.mjs';
import { countDirectEmployees, countNestedTeams, countTeamMemberships, collectAllEmployeesInTeam, buildHierarchyTree, computeTeamStats, computeGlobalStats, computeManagerChanges } from './team-logic.mjs';
import { evaluateAllChecks, describeCriterion, checkTypes } from './checks.mjs';
import { sortAllTeams } from './operations.mjs';
import { debouncedSave } from './scenarios.mjs';

export const createIcons = (opts) => _createIcons({ icons, ...opts });

const app = document.getElementById("app");
let lastCheckResults = null;

export function renderLandingPage() {
  return `
    <div class="landing-page">
      <div class="landing-content">
        <img class="landing-logo" src="/icons/icon.svg" width="168" height="168" alt="OrgBoard" />
        <h1 class="landing-title">Welcome to OrgBoard</h1>
        <p class="landing-subtitle">A drag-and-drop team organizer for planning org structures, comparing scenarios, and validating team composition — all offline in your browser.</p>
        <p class="landing-privacy"><i data-lucide="lock"></i> Your data stays on your device — nothing is sent to a server.</p>
        <div class="landing-options">
          <button class="landing-card" type="button" data-landing-action="demo">
            <span class="landing-card-icon"><i data-lucide="layout-grid"></i></span>
            <span class="landing-card-title">Launch demo</span>
            <span class="landing-card-desc">Explore with sample teams and people already set up</span>
          </button>
          <button class="landing-card" type="button" data-landing-action="import">
            <span class="landing-card-icon"><i data-lucide="upload"></i></span>
            <span class="landing-card-title">Import from CSV</span>
            <span class="landing-card-desc">Load your own data with column mapping and load options</span>
          </button>
          <button class="landing-card" type="button" data-landing-action="blank">
            <span class="landing-card-icon"><i data-lucide="plus-square"></i></span>
            <span class="landing-card-title">Start blank</span>
            <span class="landing-card-desc">Begin with an empty board and build from scratch</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

export function renderRootLayoutButton() {
  const next = oppositeLayout[state.rootLayout];
  return `
    <button
      class="team-control-button"
      type="button"
      title="Switch to ${next} layout"
      aria-label="Switch to ${next} layout"
      data-action="toggle-root-layout"
    >${layoutIcons[next]}</button>
  `;
}

export function renderFacepile(team) {
  const peopleDots = team.members
    .map((member) => {
      const emp = state.employees[member.id];
      const color = emp ? colorForTimezone(emp.timezone) : "rgba(200, 200, 200, 0.5)";
      const tip = emp ? `${emp.name} \u2014 ${emp.role}\n${emp.location}\n${emp.timezone}` : "";
      return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
    })
    .join("");

  const teamDots = team.subTeams
    .map((entry) => {
      const nested = getTeam(entry.id);
      const color = nested?.color ?? "rgba(200, 200, 200, 0.5)";
      const memberCount = nested ? countDirectEmployees(nested) : 0;
      const tip = nested ? `${nested.name} team (${memberCount} people)` : "";
      return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
    })
    .join("");

  const allDots = peopleDots + teamDots;
  if (!allDots) {
    return '<span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop members here"></span></span>';
  }
  return `<span class="member-facepile" aria-hidden="true">${allDots}</span>`;
}

export function renderCollapsedManager(team) {
  if (!team.manager) {
    return '<span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop a manager here"></span></span>';
  }
  const emp = state.employees[team.manager];
  const color = emp ? colorForTimezone(emp.timezone) : "rgba(200, 200, 200, 0.5)";
  const tip = emp ? `${emp.name} \u2014 ${emp.role}\n${emp.location}\n${emp.timezone}` : "";
  return `<span class="member-facepile" aria-hidden="true"><span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span></span>`;
}

export function renderEmployeeCard(employeeId, contextTeamId) {
  const employee = state.employees[employeeId];
  if (!employee) {
    return "";
  }

  let overridePill = "";
  let splitMergeButton = "";

  if (contextTeamId) {
    const team = getTeam(contextTeamId);
    const isManager = team?.manager === employeeId;
    const overrideValue = isManager ? team?.managerOverride : findMemberEntry(employeeId, contextTeamId)?.managerOverride;
    if (overrideValue) {
      const overrideMgr = state.employees[overrideValue];
      if (overrideMgr) {
        const pillColor = colorForManager(overrideValue);
        overridePill = `<span class="manager-override-pill" style="background:${pillColor}" title="Manager override: ${escapeHtml(overrideMgr.name)}"><i data-lucide="split"></i>${escapeHtml(overrideMgr.name)}</span>`;
      }
      splitMergeButton = `<button class="card-action-button card-merge-button" type="button" data-action="reset-manager-override" data-id="${employee.id}" data-team-id="${contextTeamId}" title="Reset to team manager"><i data-lucide="merge"></i></button>`;
    } else {
      splitMergeButton = `<button class="card-action-button card-split-button" type="button" data-action="set-manager-override" data-id="${employee.id}" data-team-id="${contextTeamId}" title="Set alternative manager"><i data-lucide="split"></i></button>`;
    }
  }

  const editButton = `<button class="card-action-button card-edit-button" type="button" data-action="edit-employee" data-id="${employee.id}" title="Edit person"><i data-lucide="pencil"></i></button>`;
  const membershipCount = countTeamMemberships(state.teams, employeeId);
  const membershipBadge = membershipCount > 1 ? `<span class="card-membership-count" title="In ${membershipCount} teams">${membershipCount}</span>` : "";
  const notesHtml = employee.notes ? `<div class="card-notes" title="${escapeHtml(employee.notes)}">${escapeHtml(employee.notes)}</div>` : "";
  const requestedClass = employee.requested ? " card-requested" : "";

  const currentManagerHtml = "";

  return `
    <article
      class="person-card${requestedClass}"
      draggable="true"
      data-drag-kind="employee"
      data-id="${employee.id}"
      style="background:${colorForTimezone(employee.timezone)}"
    >
      <div class="card-top-actions">
        ${splitMergeButton}
        ${editButton}
        <button class="card-action-button card-delete-button" type="button" data-action="delete-employee" data-id="${employee.id}"><i data-lucide="x"></i></button>
      </div>
      ${overridePill}
      <div class="person-name">${escapeHtml(employee.name)}${membershipBadge}</div>
      <div class="person-role">${escapeHtml(employee.role)}</div>
      <div class="person-location">${escapeHtml(employee.location)}</div>
      <div class="person-timezone">${escapeHtml(employee.timezone)}${employee.level != null ? `<span class="person-level">L${escapeHtml(String(employee.level))}</span>` : ""}</div>
      ${currentManagerHtml}
      ${notesHtml}
    </article>
  `;
}

function renderPeople(team) {
  if (team.members.length === 0) {
    return '<p class="empty-note">Drop people here</p>';
  }

  return team.members.map((member, index) => `
    <div class="member-entry" data-member-index="${index}" data-member-type="employee" data-member-id="${member.id}">
      ${renderEmployeeCard(member.id, team.id)}
    </div>
  `).join("");
}

function renderSubTeamFacepile(team) {
  if (team.subTeams.length === 0) return '';
  const dots = team.subTeams
    .map((entry) => {
      const nested = getTeam(entry.id);
      const color = nested?.color ?? "rgba(200, 200, 200, 0.5)";
      const memberCount = nested ? countDirectEmployees(nested) : 0;
      const tip = nested ? `${nested.name} team (${memberCount} people)` : "";
      return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
    })
    .join("");
  return `<span class="member-facepile" aria-hidden="true">${dots}</span>`;
}

function renderSubTeams(team) {
  if (team.subTeams.length === 0) return '';

  return team.subTeams.map((entry, index) => `
    <div class="member-entry" data-member-index="${index}" data-member-type="team" data-member-id="${entry.id}">
      <div class="child-team">${renderTeam(entry.id)}</div>
    </div>
  `).join("");
}

export function renderTeam(teamId, options = {}) {
  const team = getTeam(teamId);
  const teamView = options.forcedView ?? team.ownLayout;
  const caption = `${countDirectEmployees(team)} people, ${countNestedTeams(team)} nested teams`;
  const isCollapsed = teamView === "collapsed";
  const chevronClass = isCollapsed ? "" : " is-expanded";

  // Compute timezone spread ribbon color (default when no checks active)
  const empIds = collectAllEmployeesInTeam(state.teams, teamId);
  const offsets = empIds.map(id => state.employees[id]).filter(Boolean).map(e => parseUtcOffset(e.timezone)).filter(o => !Number.isNaN(o));
  const tzGap = empIds.length === 0 ? null : computeMaxTimezoneGap(offsets);
  let ribbonColor = ribbonColorForGap(tzGap);
  let ribbonTitle = tzGap == null ? "No employees" : `${tzGap}h timezone spread`;

  // Override with check-status ribbon when team-scoped checks are active
  let checkStatus = "";
  if (lastCheckResults) {
    // If any criterion is pinned, only pinned results drive the ribbon
    const hasPinned = globalCriteria.some((c) => c.enabled && c.pinned);
    const pinnedIds = hasPinned ? new Set(globalCriteria.filter((c) => c.enabled && c.pinned).map((c) => c.id)) : null;
    const filteredResults = pinnedIds
      ? lastCheckResults.results.filter((r) => pinnedIds.has(r.criterionId))
      : lastCheckResults.results;

    const status = computeTeamCheckStatus(filteredResults, teamId, checkTypes);
    const statusColor = ribbonColorForCheckStatus(status);
    if (statusColor) {
      ribbonColor = statusColor;
      checkStatus = status.failed === 0 ? "pass" : status.passed === 0 ? "fail" : "mixed";
      ribbonTitle = ribbonTooltipForCheckStatus(filteredResults, teamId, checkTypes) ?? ribbonTitle;
    }
  }

  return `
    <section class="team" data-team-id="${team.id}" data-view="${teamView}" data-tz-gap="${tzGap ?? ""}"${checkStatus ? ` data-check-status="${checkStatus}"` : ""} style="--team-accent:${team.color}; --ribbon-color:${ribbonColor}" title="${ribbonTitle}">
      <div class="team-titlebar" data-team-id="${team.id}">
        <h2 class="team-name"><span class="team-name-text">${escapeHtml(team.name)}</span></h2>
        <div class="team-toolbar">
          <div class="team-toolbar-left">
            <div class="team-handle" draggable="true" data-drag-kind="team" data-id="${team.id}" title="Drag team"><i data-lucide="grip-vertical"></i></div>
            <button class="team-control-button team-menu-trigger" type="button" data-action="open-team-menu" data-team-id="${team.id}" title="Team actions" aria-label="Team actions" aria-haspopup="true"><i data-lucide="ellipsis"></i></button>
            <button class="team-control-button team-stats-trigger" type="button" data-action="open-team-stats" data-team-id="${team.id}" title="${caption}" aria-label="Team stats: ${caption}"><i data-lucide="bar-chart-3"></i></button>
            <button class="team-control-button team-chevron${chevronClass}" type="button" data-action="toggle-collapse" data-team-id="${team.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'}"><i data-lucide="chevron-right"></i></button>
          </div>
        </div>
      </div>

      <div class="team-body ${state.rootLayout}">
        <div class="slot member-slot dropzone layout-${state.rootLayout}" data-drop-kind="members" data-team-id="${team.id}">
          <div class="slot manager-slot dropzone" data-drop-kind="manager" data-team-id="${team.id}">
            ${isCollapsed ? renderCollapsedManager(team) : (team.manager ? renderEmployeeCard(team.manager, team.id) : '<p class="empty-note">Drop a manager here</p>')}
          </div>
          ${isCollapsed ? renderFacepile(team) : renderPeople(team)}
        </div>
        <div class="slot subteam-slot dropzone" data-drop-kind="subteams" data-team-id="${team.id}">${isCollapsed ? renderSubTeamFacepile(team) : renderSubTeams(team)}</div>
      </div>
    </section>
  `;
}

/* ── Compact tree layout (custom Reingold-Tilford) ── */

const NODE_W = 140;   // node width
const NODE_H = 62;    // baseline node height used for layout and connector anchoring
const LEAF_H = 38;    // compact leaf-row height
const H_GAP = 6;      // minimum horizontal gap between nodes
const V_GAP = 40;     // vertical gap between levels

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

/**
 * Bundle leaf children into leaf-group pseudo-nodes.
 * A "leaf" is any child with no children of its own.
 * This collapses N horizontal leaves into 1 vertical column.
 */
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

/**
 * Reingold-Tilford tree layout.
 * Each laid-out node stores: { data, children, x (relative to parent), absX (after resolve) }
 */
function layoutNode(data) {
  const kids = (data.children || []).map(c => layoutNode(c));
  const n = { data, children: kids, x: 0 };

  if (kids.length === 0) return n;
  if (kids.length === 1) {
    kids[0].x = 0;
    return n;
  }

  // Place children left-to-right, shifting each to avoid overlap with all previous subtrees
  kids[0].x = 0;
  for (let i = 1; i < kids.length; i++) {
    const rightContour = getContour(kids, i, "right"); // contour of kids[0..i-1] combined
    const leftContour = getLeftContour(kids[i]);
    let shift = 0;
    const depth = Math.min(rightContour.length, leftContour.length);
    for (let d = 0; d < depth; d++) {
      const needed = rightContour[d] - leftContour[d] + NODE_W + H_GAP;
      if (needed > shift) shift = needed;
    }
    kids[i].x = shift;
  }

  // Centre parent over first and last child
  n.x = 0; // will be relative to caller
  const mid = (kids[0].x + kids[kids.length - 1].x) / 2;
  // Shift all children so parent is at 0
  for (const k of kids) k.x -= mid;

  // Keep bundled leaves outside the branch subtree so parent leaf stacks do not
  // sit inside child-org lanes where connector lines become confusing.
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

/** Get the left contour (min x at each depth) of a single subtree */
function getLeftContour(node) {
  const c = [];
  (function walk(n, x, d) {
    if (d >= c.length) c.push(x);
    else if (x < c[d]) c[d] = x;
    for (const ch of n.children) walk(ch, x + ch.x, d + 1);
  })(node, 0, 0);
  return c;
}

/** Get the combined right contour (max x at each depth) of kids[0..endIdx-1] */
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

/** Flatten tree with absolute positions */
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

/** Lay out one or more trees side by side */
export function computeTreeLayout(trees, collapsedKeys = new Set()) {
  const bundled = trees.map(t => bundleLeaves(t, collapsedKeys));
  const layouts = bundled.map(t => layoutNode(t));

  const out = { nodes: [], edges: [], leafGroups: [] };
  let xOffset = 0;

  for (const laid of layouts) {
    // Find leftmost position in this tree
    const leftC = getLeftContour(laid);
    const minLeft = Math.min(...leftC);
    const shift = xOffset - minLeft;

    flatten(laid, shift, 0, out);

    // Find rightmost position to set offset for next tree
    const rightC = [];
    (function walk(n, x, d) {
      if (d >= rightC.length) rightC.push(x);
      else if (x > rightC[d]) rightC[d] = x;
      for (const ch of n.children) walk(ch, x + ch.x, d + 1);
    })(laid, shift, 0);
    const maxRight = Math.max(...rightC);
    xOffset = maxRight + NODE_W + H_GAP * 3;
  }

  // Normalise so min x = 0
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

  // Reparent employee nodes with cross-tree overrides
  const employeeMovers = refs.filter((r) => r.node?.type === "employee" && r.node?.isOverride);
  for (const src of employeeMovers) {
    const srcTeam = state.teams[src.node.teamId];
    const srcMember = srcTeam?.members?.find((m) => m.id === src.node.employee?.id);
    const targetManagerId = srcMember?.managerOverride;
    if (!targetManagerId) continue;

    const target = byEmployeeId.get(targetManagerId);
    if (!target || !src.parentChildren || target.node === src.node) continue;
    if (isAncestor(src, target)) continue; // avoid cycles

    const idx = src.parentChildren.indexOf(src.node);
    if (idx >= 0) src.parentChildren.splice(idx, 1);
    if (!Array.isArray(target.node.children)) target.node.children = [];
    target.node.children.push(src.node);
  }

  // Reparent root/team manager nodes with managerOverride (cross-team reporting)
  const teamMovers = refs.filter((r) => (r.node?.type === "root" || r.node?.type === "team") && r.node?.managerOverride);
  for (const src of teamMovers) {
    const targetManagerId = src.node.managerOverride;
    const target = byEmployeeId.get(targetManagerId);
    if (!target || target.node === src.node) continue;
    if (isAncestor(src, target)) continue; // avoid cycles

    // Remove from top-level trees array if it's a root
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

  // Compute canvas bounds accounting for leaf group stacks
  let maxY = 0;
  for (const n of layout.nodes) maxY = Math.max(maxY, n.y + NODE_H);
  for (const g of layout.leafGroups) maxY = Math.max(maxY, g.y + g.members.length * LEAF_H + 4);

  const maxX = Math.max(
    ...layout.nodes.map(n => n.x + NODE_W),
    ...layout.leafGroups.map(g => g.x + NODE_W),
    0
  );

  // SVG connector lines
  const lines = layout.edges.map(e => {
    const x1 = e.x1 + halfW, y1 = e.y1 + NODE_H;
    const x2 = e.x2 + halfW, y2 = e.y2;
    const midY = y1 + (y2 - y1) * 0.5;
    const cls = e.isOverride ? ' class="tree-line-override"' : '';
    return `<path d="M${x1},${y1} V${midY} H${x2} V${y2}"${cls} />`;
  }).join("");

  const svg = `<svg class="tree-lines" width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
  const nodesHtml = layout.nodes.map(n => renderNodeHtml(n.node, editMode, n.x, n.y)).join("");

  // Render leaf group stacks
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

function renderTzBadges(timezones) {
  const sorted = Object.entries(timezones).sort((a, b) => b[1] - a[1]);
  return sorted.map(([tz, count]) => {
    const bg = colorForTimezone(tz);
    return `<span class="stats-tz-badge" style="background:${bg}"><span>${escapeHtml(tz)}</span> <span class="stats-tz-badge-count">${count}</span></span>`;
  }).join("");
}

function renderTeamStatsBlock(stats, nested) {
  if (!stats) return "";
  const nestedHtml = stats.nestedStats.length > 0
    ? `<div class="stats-nested">${stats.nestedStats.map((s) => renderTeamStatsBlock(s, true)).join("")}</div>`
    : "";
  const roleRows = Object.entries(stats.roles).sort((a, b) => b[1] - a[1]).map(([role, count]) =>
    `<div class="stats-row"><span class="stats-row-label">${escapeHtml(role)}</span><span class="stats-row-value">${count}</span></div>`
  ).join("");
  const tzHtml = Object.keys(stats.timezones).length > 0
    ? `<div class="stats-tz-list">${renderTzBadges(stats.timezones)}</div>`
    : "";
  return `
    <details class="stats-section stats-collapsible">
      <summary class="stats-team-header">
        <span class="stats-team-dot" style="background:${stats.color}"></span>
        <span class="stats-team-name">${escapeHtml(stats.name)}</span>
        <span class="stats-team-count">${stats.totalPeople}</span>
      </summary>
      ${roleRows}
      ${tzHtml}
      ${nestedHtml}
    </details>
  `;
}

function renderManagerChangesSection() {
  const { changes, unchanged, noOriginal, tracked } = computeManagerChanges(state);
  if (tracked === 0 && noOriginal.length === 0) return "";

  const pct = tracked > 0 ? Math.round((changes.length / tracked) * 100) : 0;
  const summaryClass = changes.length > 0 ? "has-changes" : "no-changes";

  const changeRows = changes.map((c) => {
    const to = c.to ?? "unassigned";
    return `<div class="manager-change-row">
      <span class="manager-change-name">${escapeHtml(c.employee.name)}</span>
      <span class="manager-change-detail">${escapeHtml(c.from)} → ${escapeHtml(to)}</span>
    </div>`;
  }).join("");

  return `
    <div class="stats-section">
      <h3 class="stats-section-title">Manager changes</h3>
      <div class="stats-row ${summaryClass}"><span class="stats-row-label">Changed</span><span class="stats-row-value">${changes.length} of ${tracked} (${pct}%)</span></div>
      <div class="stats-row"><span class="stats-row-label">Unchanged</span><span class="stats-row-value">${unchanged.length}</span></div>
      ${noOriginal.length > 0 ? `<div class="stats-row"><span class="stats-row-label">No original manager</span><span class="stats-row-value">${noOriginal.length}</span></div>` : ""}
      ${changes.length > 0 ? `<details class="stats-collapsible"><summary class="stats-collapsible-toggle">${changes.length} changed</summary>${changeRows}</details>` : ""}
    </div>
  `;
}

function renderNotesPanelContent(panel) {
  panel.innerHTML = `
    <div class="stats-panel-header">
      <div class="stats-panel-tabs">
        <button class="stats-panel-tab" type="button" data-action="switch-to-stats">Stats</button>
        <button class="stats-panel-tab" type="button" data-action="switch-to-checks">Checks</button>
        <button class="stats-panel-tab is-active" type="button" data-action="toggle-notes-panel">Notes</button>
      </div>
      <div class="stats-panel-header-actions">
        <button class="team-control-button" type="button" data-action="copy-notes" title="Copy notes to clipboard" aria-label="Copy notes to clipboard"><i data-lucide="copy"></i></button>
        <button class="team-control-button" type="button" data-action="close-right-panel" title="Close panel" aria-label="Close panel">
          <i data-lucide="panel-right-close"></i>
        </button>
      </div>
    </div>
    <div class="notes-panel-body">
      <textarea id="notes-textarea" class="notes-textarea" placeholder="Type scenario notes here…">${escapeHtml(state.notes)}</textarea>
    </div>
  `;

  const textarea = panel.querySelector("#notes-textarea");
  if (textarea) {
    textarea.addEventListener("input", (e) => {
      state.notes = e.target.value;
      debouncedSave();
    });
  }
}

function renderStatsPanel() {
  let panel = document.getElementById("stats-panel");
  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "stats-panel";
    document.body.appendChild(panel);
  }

  const statsOpen = state.statsPanelOpen;
  const checksOpen = state.checksPanelOpen;
  const notesOpen = state.notesPanelOpen;
  const anyOpen = statsOpen || checksOpen || notesOpen;
  panel.className = `stats-panel${anyOpen ? " is-open" : ""}`;

  if (!anyOpen) {
    // Use cached check results for badge count (already evaluated at start of render())
    if (!lastCheckResults) lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
    const failCount = lastCheckResults.summary.failed;
    const failBadge = failCount > 0 ? `<span class="strip-badge strip-badge-fail">${failCount}</span>` : "";

    panel.innerHTML = `
      <div class="stats-panel-strip" data-action="toggle-stats-panel" title="Open stats">
        <i data-lucide="sigma"></i>
        <span class="stats-panel-strip-label">STATS</span>
      </div>
      <div class="stats-panel-strip checks-strip" data-action="toggle-checks-panel" title="Open checks">
        <i data-lucide="list-checks"></i>
        <span class="stats-panel-strip-label">CHECKS</span>
        ${failBadge}
      </div>
      <div class="stats-panel-strip notes-strip" data-action="toggle-notes-panel" title="Open notes">
        <i data-lucide="notebook-pen"></i>
        <span class="stats-panel-strip-label">NOTES</span>
      </div>
    `;
    return;
  }

  if (statsOpen) {
    renderStatsPanelContent(panel);
  } else if (checksOpen) {
    renderChecksPanelContent(panel);
  } else {
    renderNotesPanelContent(panel);
  }
}

function renderStatsPanelContent(panel) {
  const global = computeGlobalStats(state);
  const teamBlocks = state.rootTeams.map((id) => renderTeamStatsBlock(computeTeamStats(state, id), false)).join("");

  const globalRoleRows = Object.entries(global.roles).sort((a, b) => b[1] - a[1]).map(([role, count]) =>
    `<div class="stats-row"><span class="stats-row-label">${escapeHtml(role)}</span><span class="stats-row-value">${count}</span></div>`
  ).join("");

  const globalTzHtml = Object.keys(global.timezones).length > 0
    ? `<div class="stats-tz-list">${renderTzBadges(global.timezones)}</div>`
    : "";

  panel.innerHTML = `
    <div class="stats-panel-header">
      <div class="stats-panel-tabs">
        <button class="stats-panel-tab is-active" type="button" data-action="toggle-stats-panel">Stats</button>
        <button class="stats-panel-tab" type="button" data-action="switch-to-checks">Checks</button>
        <button class="stats-panel-tab" type="button" data-action="switch-to-notes">Notes</button>
      </div>
      <button class="team-control-button" type="button" data-action="close-right-panel" title="Close panel" aria-label="Close panel">
        <i data-lucide="panel-right-close"></i>
      </button>
    </div>
    <div class="stats-panel-body">
      <div class="stats-section">
        <h3 class="stats-section-title">Overview</h3>
        <div class="stats-row"><span class="stats-row-label">Total people</span><span class="stats-row-value">${global.totalPeople}</span></div>
        <div class="stats-row"><span class="stats-row-label">Assigned</span><span class="stats-row-value">${global.totalAssigned}</span></div>
        <div class="stats-row"><span class="stats-row-label">Unassigned</span><span class="stats-row-value">${global.totalUnassigned}</span></div>
        <div class="stats-row"><span class="stats-row-label">Teams</span><span class="stats-row-value">${global.teamCount}</span></div>
      </div>
      <details class="stats-section stats-collapsible">
        <summary class="stats-section-title">People by role</summary>
        ${globalRoleRows}
      </details>
      <div class="stats-section">
        <h3 class="stats-section-title">Timezones</h3>
        ${globalTzHtml}
      </div>
      ${renderManagerChangesSection()}
      <div class="stats-divider"></div>
      <h3 class="stats-section-title">Teams</h3>
      ${teamBlocks}
    </div>
  `;
}

export function renderChecksPanelContent(panel) {
  if (!lastCheckResults) lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
  const { results, summary } = lastCheckResults;

  const criteriaCards = globalCriteria.map((criterion) => {
    const result = results.find((r) => r.criterionId === criterion.id);
    const passed = result ? result.passed : null;
    const statusIcon = !criterion.enabled ? "minus" : passed ? "check" : "x";
    const statusClass = !criterion.enabled ? "disabled" : passed ? "pass" : "fail";
    const description = describeCriterion(criterion.type, criterion.config);

    const detailRows = result ? result.details.map((d) => `
      <div class="check-detail-row ${d.passed ? "pass" : "fail"}">
        <i data-lucide="${d.passed ? "check" : "x"}" class="check-detail-icon"></i>
        ${d.teamName ? `<span class="check-detail-team">${escapeHtml(d.teamName)}</span>` : ""}
        <span class="check-detail-msg">${escapeHtml(d.message)}</span>
      </div>
    `).join("") : "";

    const DETAIL_COLLAPSE_THRESHOLD = 3;
    const detailCount = result ? result.details.length : 0;
    const failCount = result ? result.details.filter((d) => !d.passed).length : 0;
    let detailsHtml = "";
    if (detailRows) {
      if (detailCount > DETAIL_COLLAPSE_THRESHOLD) {
        const label = failCount > 0
          ? `${failCount} failing / ${detailCount} teams`
          : `${detailCount} teams`;
        detailsHtml = `
          <details class="check-details-collapsible">
            <summary class="check-details-toggle">${escapeHtml(label)}</summary>
            <div class="check-details">${detailRows}</div>
          </details>`;
      } else {
        detailsHtml = `<div class="check-details">${detailRows}</div>`;
      }
    }

    return `
      <div class="check-card ${statusClass}" data-criterion-id="${criterion.id}">
        <div class="check-card-header">
          <i data-lucide="${statusIcon}" class="check-status-icon"></i>
          <div class="check-card-info">
            <div class="check-card-name">${escapeHtml(criterion.name)}</div>
            <div class="check-card-desc">${escapeHtml(description)}</div>
          </div>
          <div class="check-card-actions">            <button class="team-control-button${criterion.pinned ? ' is-pinned' : ''}" type="button" data-action="pin-criterion" data-id="${criterion.id}" title="${criterion.pinned ? 'Unpin from ribbon' : 'Pin to ribbon'}" aria-label="${criterion.pinned ? 'Unpin from ribbon' : 'Pin to ribbon'}">
              <i data-lucide="${criterion.pinned ? 'pin' : 'pin-off'}"></i>
            </button>            <button class="team-control-button" type="button" data-action="toggle-criterion" data-id="${criterion.id}" title="${criterion.enabled ? "Disable" : "Enable"}" aria-label="${criterion.enabled ? "Disable" : "Enable"}">
              <i data-lucide="${criterion.enabled ? "eye" : "eye-off"}"></i>
            </button>
            <button class="team-control-button" type="button" data-action="edit-criterion" data-id="${criterion.id}" title="Edit" aria-label="Edit">
              <i data-lucide="pencil"></i>
            </button>
            <button class="team-control-button" type="button" data-action="delete-criterion" data-id="${criterion.id}" title="Delete" aria-label="Delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join("");

  const summaryHtml = summary.total > 0
    ? `<div class="checks-summary ${summary.failed > 0 ? "has-failures" : "all-pass"}">
        <span class="checks-summary-count">${summary.passed}/${summary.total} passing</span>
      </div>`
    : "";

  panel.innerHTML = `
    <div class="stats-panel-header">
      <div class="stats-panel-tabs">
        <button class="stats-panel-tab" type="button" data-action="switch-to-stats">Stats</button>
        <button class="stats-panel-tab is-active" type="button" data-action="toggle-checks-panel">Checks</button>
        <button class="stats-panel-tab" type="button" data-action="switch-to-notes">Notes</button>
      </div>
      <button class="team-control-button" type="button" data-action="close-right-panel" title="Close panel" aria-label="Close panel">
        <i data-lucide="panel-right-close"></i>
      </button>
    </div>
    <div class="stats-panel-body checks-panel-body">
      ${summaryHtml}
      <div class="checks-list">
        ${criteriaCards || '<p class="checks-empty">No checks defined yet.<br>Add a check to validate your team structure.</p>'}
      </div>
      <button class="toolbar-button checks-add-button" type="button" data-action="add-criterion">
        <i data-lucide="plus"></i> Add check
      </button>
    </div>
  `;
}

/**
 * Tighten the layout after rendering.
 *
 * CSS flex column-wrap (horizontal mode) and row-wrap (vertical mode) cannot
 * auto-size the cross-axis of the container. We measure actual rendered
 * content bottom-up and set explicit heights (horizontal) or widths (vertical)
 * so that containers, teams, and the root dropzone shrink-wrap their children.
 *
 * Must be called after every DOM mutation that changes card counts or layout.
 */
export function tightenLayout() {
  const rootDropzone = document.querySelector(".root-dropzone");
  if (!rootDropzone) return;

  const isHorizontal = state.rootLayout === "horizontal";

  // --- Reset previously set inline sizes ---
  // Skip slots with a dragging-source — their dimensions are frozen
  // to prevent collapse when the dragged card is display:none.
  const resetProp = isHorizontal ? "height" : "width";
  rootDropzone.style[resetProp] = "";
  for (const team of document.querySelectorAll(".team")) {
    team.style[resetProp] = "";
  }
  for (const slot of document.querySelectorAll(".member-slot")) {
    if (slot.dataset.dragFrozen) continue;
    slot.style[resetProp] = "";
    // Also clear the opposite axis from a previous mode
    slot.style[isHorizontal ? "width" : "height"] = "";
  }
  for (const subSlot of document.querySelectorAll(".subteam-slot")) {
    subSlot.style[resetProp] = "";
    // Also clear the opposite axis from a previous mode
    subSlot.style[isHorizontal ? "width" : "height"] = "";
  }
  // Reset member-entry wrappers around child teams
  for (const entry of document.querySelectorAll(".subteam-slot > .member-entry")) {
    entry.style[resetProp] = "";
    entry.style[isHorizontal ? "width" : "height"] = "";
  }

  // Force reflow so measurements reflect natural CSS sizes
  void document.body.offsetHeight;

  if (isHorizontal) {
    tightenHorizontal(rootDropzone);
  } else {
    tightenVertical(rootDropzone);
  }
}

/**
 * Horizontal mode: tighten heights bottom-up.
 * container (.member-slot) → subteam-slot → parent (.team) → grandparent (.root-dropzone)
 *
 * Must process deepest nested teams first so their measured heights are
 * available when tightening parent containers.
 */
function tightenHorizontal(rootDropzone) {
  // Collect all expanded teams and sort deepest-first (by nesting depth)
  const allTeams = [...document.querySelectorAll(".team")].filter(
    (t) => t.dataset.view !== "collapsed"
  );
  allTeams.sort((a, b) => {
    const depthOf = (el) => {
      let d = 0;
      let p = el.parentElement;
      while (p) { if (p.classList?.contains("team")) d++; p = p.parentElement; }
      return d;
    };
    return depthOf(b) - depthOf(a); // deepest first
  });

  for (const team of allTeams) {
    const teamBody = team.querySelector(":scope > .team-body");
    if (!teamBody) continue;

    // 1. Tighten the member-slot (container) to its cards
    const slot = teamBody.querySelector(":scope > .member-slot.layout-horizontal");
    if (slot && !slot.dataset.dragFrozen) {
      const children = slot.querySelectorAll(
        ":scope > .manager-slot, :scope > .member-entry:not(.dragging-source), :scope > .drag-preview-entry, :scope > .empty-note"
      );
      if (children.length > 0) {
        const slotTop = slot.getBoundingClientRect().top;
        const cs = getComputedStyle(slot);
        const maxBottom = Math.max(
          ...Array.from(children, (c) => c.getBoundingClientRect().bottom)
        );
        slot.style.height =
          maxBottom - slotTop + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + "px";
      }
    }

    // 2. Tighten member-entry wrappers around child teams in the subteam-slot.
    //    These are the intermediate wrappers (member-entry > child-team > team)
    //    that must pass the height constraint through — like demo .parent.
    const subSlot = teamBody.querySelector(":scope > .subteam-slot");
    if (subSlot && subSlot.children.length > 0) {
      for (const entry of subSlot.querySelectorAll(":scope > .member-entry:not(.dragging-source)")) {
        const childTeam = entry.querySelector(":scope > .child-team");
        if (!childTeam) continue;
        const innerTeam = childTeam.querySelector(":scope > .team");
        if (!innerTeam || innerTeam.getBoundingClientRect().height === 0) continue;
        const entryTop = entry.getBoundingClientRect().top;
        const cs = getComputedStyle(entry);
        const innerBottom = innerTeam.getBoundingClientRect().bottom;
        entry.style.height =
          innerBottom - entryTop + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + "px";
      }

      // Now tighten the subteam-slot itself to its child entries
      const visibleChildren = [...subSlot.children].filter(
        (c) => !c.classList.contains("dragging-source") && c.getBoundingClientRect().height > 0
      );
      if (visibleChildren.length > 0) {
        const subTop = subSlot.getBoundingClientRect().top;
        const cs = getComputedStyle(subSlot);
        const maxBottom = Math.max(
          ...Array.from(visibleChildren, (c) => c.getBoundingClientRect().bottom)
        );
        subSlot.style.height =
          maxBottom - subTop + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + "px";
      }
    }

    // 3. Tighten the team itself to its tallest body child
    const directChildren = teamBody.querySelectorAll(
      ":scope > .member-slot, :scope > .subteam-slot"
    );
    if (directChildren.length === 0) continue;

    const teamTop = team.getBoundingClientRect().top;
    const cs = getComputedStyle(team);
    const maxBottom = Math.max(
      ...Array.from(directChildren, (c) => c.getBoundingClientRect().bottom)
    );
    team.style.height =
      maxBottom - teamTop + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + "px";
  }

  // 4. Tighten root-dropzone (grandparent) to its tallest child
  const gpChildren = rootDropzone.querySelectorAll(":scope > .team, :scope > .member-entry");
  if (gpChildren.length === 0) return;

  const gpTop = rootDropzone.getBoundingClientRect().top;
  const gpCs = getComputedStyle(rootDropzone);
  const gpMaxBottom = Math.max(
    ...Array.from(gpChildren, (c) => c.getBoundingClientRect().bottom)
  );
  rootDropzone.style.height =
    gpMaxBottom - gpTop + parseFloat(gpCs.paddingBottom) + parseFloat(gpCs.borderBottomWidth) + "px";
}

/**
 * Vertical mode: tighten widths bottom-up.
 * container (.member-slot) → parent (.team) → grandparent (.root-dropzone)
 */
/**
 * Vertical mode: tighten widths bottom-up.
 * container (.member-slot) → subteam-slot → parent (.team) → grandparent (.root-dropzone)
 *
 * Must process deepest nested teams first (same as horizontal).
 */
function tightenVertical(rootDropzone) {
  // Collect all expanded teams and sort deepest-first
  const allTeams = [...document.querySelectorAll(".team")].filter(
    (t) => t.dataset.view !== "collapsed"
  );
  allTeams.sort((a, b) => {
    const depthOf = (el) => {
      let d = 0;
      let p = el.parentElement;
      while (p) { if (p.classList?.contains("team")) d++; p = p.parentElement; }
      return d;
    };
    return depthOf(b) - depthOf(a); // deepest first
  });

  for (const team of allTeams) {
    const teamBody = team.querySelector(":scope > .team-body");
    if (!teamBody) continue;

    // 1. Tighten the member-slot (container) to its cards
    const slot = teamBody.querySelector(":scope > .member-slot.layout-vertical");
    if (slot && !slot.dataset.dragFrozen) {
      const children = slot.querySelectorAll(
        ":scope > .manager-slot, :scope > .member-entry:not(.dragging-source), :scope > .drag-preview-entry, :scope > .empty-note"
      );
      if (children.length > 0) {
        const slotLeft = slot.getBoundingClientRect().left;
        const cs = getComputedStyle(slot);
        const maxRight = Math.max(
          ...Array.from(children, (c) => c.getBoundingClientRect().right)
        );
        slot.style.width =
          maxRight - slotLeft + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) + "px";
      }
    }

    // 2. Tighten member-entry wrappers around child teams in the subteam-slot.
    const subSlot = teamBody.querySelector(":scope > .subteam-slot");
    if (subSlot && subSlot.children.length > 0) {
      for (const entry of subSlot.querySelectorAll(":scope > .member-entry:not(.dragging-source)")) {
        const childTeam = entry.querySelector(":scope > .child-team");
        if (!childTeam) continue;
        const innerTeam = childTeam.querySelector(":scope > .team");
        if (!innerTeam || innerTeam.getBoundingClientRect().width === 0) continue;
        const entryLeft = entry.getBoundingClientRect().left;
        const cs = getComputedStyle(entry);
        const innerRight = innerTeam.getBoundingClientRect().right;
        entry.style.width =
          innerRight - entryLeft + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) + "px";
      }

      // Now tighten the subteam-slot itself to its child entries
      const visibleChildren = [...subSlot.children].filter(
        (c) => !c.classList.contains("dragging-source") && c.getBoundingClientRect().width > 0
      );
      if (visibleChildren.length > 0) {
        const subLeft = subSlot.getBoundingClientRect().left;
        const cs = getComputedStyle(subSlot);
        const maxRight = Math.max(
          ...Array.from(visibleChildren, (c) => c.getBoundingClientRect().right)
        );
        subSlot.style.width =
          maxRight - subLeft + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) + "px";
      }
    }

    // 3. Tighten the team itself to its widest body child
    const directChildren = teamBody.querySelectorAll(
      ":scope > .member-slot, :scope > .subteam-slot"
    );
    if (directChildren.length === 0) continue;

    const teamLeft = team.getBoundingClientRect().left;
    const cs = getComputedStyle(team);
    const maxRight = Math.max(
      ...Array.from(directChildren, (c) => c.getBoundingClientRect().right)
    );
    team.style.width =
      maxRight - teamLeft + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) + "px";
  }

  // 4. Tighten root-dropzone (grandparent) to its widest child
  const gpChildren = rootDropzone.querySelectorAll(":scope > .team, :scope > .member-entry");
  if (gpChildren.length === 0) return;

  const gpLeft = rootDropzone.getBoundingClientRect().left;
  const gpCs = getComputedStyle(rootDropzone);
  const gpMaxRight = Math.max(
    ...Array.from(gpChildren, (c) => c.getBoundingClientRect().right)
  );
  rootDropzone.style.width =
    gpMaxRight - gpLeft + parseFloat(gpCs.paddingRight) + parseFloat(gpCs.borderRightWidth) + "px";
}

// Backwards-compat alias used by drag-drop.mjs
export const applyHorizontalPacking = tightenLayout;

// Re-run tightenLayout when the page-shell resizes (window resize, drawer toggle, etc.)
let packingObserver = null;

function applyBoardZoomToShell(zoom) {
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  shell.style.setProperty("--board-zoom", String(zoom));
  const zoomLayer = document.querySelector(".board-zoom-layer");
  if (zoomLayer) zoomLayer.style.zoom = String(zoom);
}

function withUnzoomedLayout(fn) {
  const zoomLayer = document.querySelector(".board-zoom-layer");
  if (!zoomLayer) {
    fn();
    return;
  }
  const prevZoom = zoomLayer.style.zoom || String(boardZoom);
  zoomLayer.style.zoom = "1";
  fn();
  zoomLayer.style.zoom = prevZoom;
}

export function observeShellResize() {
  packingObserver?.disconnect();
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  packingObserver = new ResizeObserver(() => {
    withUnzoomedLayout(() => tightenLayout());
  });
  packingObserver.observe(shell);
}

export function renderTabs() {
  const container = document.getElementById("scenario-tabs");
  if (!container) return;

  container.innerHTML = scenarios.map((s) => {
    const isActive = s.id === activeScenarioId;
    const closeBtn = scenarios.length > 1
      ? `<button class="scenario-tab-close" data-close-scenario="${s.id}" title="Close scenario" aria-label="Close scenario"><i data-lucide="x"></i></button>`
      : "";
    return `<button class="scenario-tab${isActive ? " is-active" : ""}" data-scenario-id="${s.id}">
      <span class="scenario-tab-name" data-tab-name="${s.id}">${escapeHtml(s.name)}</span>
      ${closeBtn}
    </button>`;
  }).join("") + `<button class="scenario-tab-add" title="New scenario" aria-label="New scenario"><i data-lucide="plus"></i></button>`;

  createIcons({ nodes: container.querySelectorAll("i[data-lucide]") });

  // Scroll active tab into view
  const activeTab = container.querySelector(".scenario-tab.is-active");
  if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

export function render() {
  if (showLanding) {
    app.innerHTML = renderLandingPage();
    applyBoardZoomToShell(1);

    // Hide unassigned drawer
    const drawer = document.getElementById("unassigned-drawer");
    if (drawer) drawer.style.display = "none";

    // Hide action bar
    const actionBar = document.getElementById("action-bar");
    if (actionBar) actionBar.style.display = "none";

    // Remove side panels
    document.querySelector(".stats-panel")?.remove();

    // Reset page-shell margins
    const shell = document.querySelector(".page-shell");
    if (shell) {
      shell.style.marginRight = "0";
      shell.style.marginLeft = "0";
      shell.style.height = "calc(100vh - 52px)";
    }

    renderTabs();
    createIcons();
    debouncedSave();
    return;
  }

  // Ensure drawer is visible after leaving landing page
  const existingDrawer = document.getElementById("unassigned-drawer");
  if (existingDrawer) existingDrawer.style.display = "";

  // Ensure action bar is visible after leaving landing page
  const existingActionBar = document.getElementById("action-bar");
  if (existingActionBar) existingActionBar.style.display = "";

  // Clear any inline overrides from landing page
  const shell = document.querySelector(".page-shell");
  if (shell) {
    shell.style.marginRight = "";
    shell.style.marginLeft = "";
    shell.dataset.layout = state.rootLayout;
    shell.style.setProperty("--board-zoom", "1");
    const zoomLayer = shell.querySelector(".board-zoom-layer");
    if (zoomLayer) zoomLayer.style.zoom = "1";
  }

  // Re-apply active sort so teams stay sorted after drag-drop / mutations
  sortAllTeams(state.activeSortLayers);

  // Evaluate checks once so renderTeam() can use cached results for ribbons
  lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));

  const barCollapsed = state.unassignedBarCollapsed;
  const barChevronClass = barCollapsed ? "" : " is-expanded";
  const unassignedCount = state.unassignedEmployees.length;

  app.innerHTML = `
    <div class="board-zoom-layer">
      <div class="root-dropzone dropzone" data-drop-kind="root" data-layout="${state.rootLayout}">
        ${state.rootTeams.length > 0 ? state.rootTeams.map((teamId) => renderTeam(teamId)).join("") : `
          <div class="empty-board">
            <i data-lucide="users"></i>
            <p class="empty-board-title">No teams yet</p>
            <p class="empty-board-hint">Create a team or import a CSV to get started</p>
          </div>
        `}
      </div>
    </div>
  `;

  let drawer = document.getElementById('unassigned-drawer');
  if (!drawer) {
    drawer = document.createElement('section');
    drawer.id = 'unassigned-drawer';
    document.body.appendChild(drawer);
  }

  let actionBarEl = document.getElementById('action-bar');
  if (!actionBarEl) {
    actionBarEl = document.createElement('div');
    actionBarEl.id = 'action-bar';
    actionBarEl.className = 'action-bar';
    document.body.appendChild(actionBarEl);
  }
  actionBarEl.innerHTML = `
    ${renderRootLayoutButton()}
    <span class="action-bar-divider"></span>
    <button class="team-control-button" type="button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out"><i data-lucide="minus"></i></button>
    <button class="team-control-button zoom-level-button" type="button" data-action="zoom-reset" title="Reset zoom" aria-label="Reset zoom"><span id="zoom-level-label">${Math.round(boardZoom * 100)}%</span></button>
    <button class="team-control-button" type="button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in"><i data-lucide="plus"></i></button>
    <span class="action-bar-divider"></span>
    <button id="add-person-btn" class="team-control-button" type="button" data-action="add-root-person" title="Add person" aria-label="Add person"><i data-lucide="user-plus"></i></button>
    <button class="team-control-button" type="button" data-action="add-root-team" title="Add team" aria-label="Add team"><i data-lucide="users"></i></button>
    <button class="team-control-button" type="button" id="action-bar-import-csv" title="Import CSV" aria-label="Import CSV"><i data-lucide="upload"></i></button>
    <span class="action-bar-divider"></span>
    <button class="team-control-button${state.activeSortLayers?.length ? ' is-active' : ''}" type="button" data-action="open-sort-modal" title="Sort all teams" aria-label="Sort all teams"><i data-lucide="arrow-up-down"></i></button>
    <button class="team-control-button" type="button" data-action="view-hierarchy" title="View hierarchy" aria-label="View hierarchy"><i data-lucide="network"></i></button>
    <span class="action-bar-divider"></span>
    <button class="team-control-button" type="button" data-action="open-board-legend" title="Board legend" aria-label="Board legend"><i data-lucide="info"></i></button>
  `;

  drawer.className = `unassigned-bar${barCollapsed ? ' is-collapsed' : ''}`;
  drawer.innerHTML = `
    <div class="unassigned-bar-header">
      <button class="team-control-button drawer-chevron${barCollapsed ? '' : ' is-expanded'}" type="button" title="${barCollapsed ? 'Expand' : 'Collapse'} unassigned" aria-label="${barCollapsed ? 'Expand' : 'Collapse'} unassigned"><i data-lucide="chevron-up"></i></button>
      <strong>Unassigned employees</strong>
      <span class="unassigned-count">${unassignedCount}</span>
      ${unassignedCount > 0 ? '<button class="team-control-button delete-all-unassigned" type="button" title="Delete all unassigned employees" aria-label="Delete all unassigned employees"><i data-lucide="trash-2"></i></button>' : ''}
    </div>
    ${barCollapsed ? '' : `
    <div class="roster-cards-wrapper">
      <div class="roster-cards dropzone" data-drop-kind="roster">
        ${unassignedCount > 0 ? state.unassignedEmployees.map((id) => renderEmployeeCard(id, null)).join("") : '<p class="empty-note">Drop here to unassign.</p>'}
      </div>
    </div>
    `}
  `;

  if (!barCollapsed) {
    const rosterCards = drawer.querySelector('.roster-cards');
    const wrapper = drawer.querySelector('.roster-cards-wrapper');
    if (rosterCards && wrapper) {
      const updateScrollIndicators = () => {
        wrapper.classList.toggle('can-scroll-left', rosterCards.scrollLeft > 0);
        wrapper.classList.toggle('can-scroll-right', rosterCards.scrollLeft + rosterCards.clientWidth < rosterCards.scrollWidth - 1);
      };
      rosterCards.addEventListener('scroll', updateScrollIndicators);
    }
  }

  renderStatsPanel();
  renderTabs();
  createIcons();
  applyBoardZoomToShell(boardZoom);
  applyHorizontalPacking();

  // Update scroll indicators after all layout is settled
  if (!barCollapsed) {
    const rosterCards = drawer.querySelector('.roster-cards');
    const wrapper = drawer.querySelector('.roster-cards-wrapper');
    if (rosterCards && wrapper) {
      wrapper.classList.toggle('can-scroll-left', rosterCards.scrollLeft > 0);
      wrapper.classList.toggle('can-scroll-right', rosterCards.scrollLeft + rosterCards.clientWidth < rosterCards.scrollWidth - 1);
    }
  }

  debouncedSave();
}
