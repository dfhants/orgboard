import { createIcons as _createIcons, icons } from "lucide";
import { escapeHtml, hashString, colorForManager, colorForTimezone, timezoneColors, managerPillPalette, parseUtcOffset, computeMaxTimezoneGap, ribbonColorForGap, computeTeamCheckStatus, ribbonColorForCheckStatus, ribbonTooltipForCheckStatus } from './utils.mjs';
import {
  state, dragState,
  scenarios, activeScenarioId, showLanding, globalCriteria,
  getTeam, getAllManagers, findMemberEntry,
  oppositeLayout, layoutIcons,
} from './state.mjs';
import { countDirectEmployees, countNestedTeams, countTeamMemberships, collectAllEmployeesInTeam, buildHierarchyTree, computeTeamStats, computeGlobalStats, computeManagerChanges } from './team-logic.mjs';
import { evaluateAllChecks, describeCriterion, checkTypes } from './checks.mjs';
import { debouncedSave } from './scenarios.mjs';

export const createIcons = (opts) => _createIcons({ icons, ...opts });

const app = document.getElementById("app");
let lastCheckResults = null;

export function renderLandingPage() {
  return `
    <div class="landing-page">
      <div class="landing-content">
        <svg class="landing-logo" viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="14" fill="var(--accent)"/><rect x="14" y="14" width="14" height="14" fill="#fff"/><rect x="36" y="14" width="14" height="14" fill="#fff"/><rect x="25" y="36" width="14" height="14" fill="#fff"/></svg>
        <h1 class="landing-title">Welcome to OrgBoard</h1>
        <p class="landing-subtitle">How would you like to get started?</p>
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
      <div class="person-timezone">${escapeHtml(employee.timezone)}${employee.level != null ? `<span class="person-level">L${employee.level}</span>` : ""}</div>
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
      const clickAttr = editMode ? `data-tree-click="manager" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"` : "";
      nodeHtml = `
        <div class="tree-node tree-node-manager${editMode ? ' tree-node--editable' : ''}" ${clickAttr} style="--node-accent:${color}">
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
    const clickAttr = editMode ? `data-tree-click="member" data-employee-id="${emp.id}" data-tree-team-id="${node.teamId}"` : "";
    nodeHtml = `
      <div class="tree-node tree-node-member${overrideClass}${editMode ? ' tree-node--editable' : ''}" ${clickAttr}>
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

export function rerenderHierarchyInPlace(modal) {
  const teamId = modal.dataset.teamId || null;
  const editMode = modal.dataset.editMode === "true";

  let trees;
  if (teamId) {
    const tree = buildHierarchyTree(state, teamId);
    if (!tree) return;
    trees = [tree];
  } else {
    trees = state.rootTeams.map((id) => buildHierarchyTree(state, id)).filter(Boolean);
    if (trees.length === 0) return;
  }

  const editToggleClass = editMode ? " is-active" : "";
  const editLabel = editMode ? "Done editing" : "Edit overrides";
  const title = teamId ? `${escapeHtml(trees[0].teamName)} — Reporting Hierarchy` : "Reporting Hierarchy";
  modal.innerHTML = `
    <div class="modal-panel hierarchy-modal-panel">
      <div class="hierarchy-modal-header">
        <h3 class="modal-title">${title}</h3>
        <div class="hierarchy-modal-actions">
          <button class="toolbar-button hierarchy-edit-toggle${editToggleClass}" type="button" data-action="toggle-tree-edit" title="${editLabel}"><i data-lucide="pencil"></i> ${editLabel}</button>
          <button id="hierarchy-modal-close" class="toolbar-button" type="button">Close</button>
        </div>
      </div>
      ${editMode ? '<p class="hierarchy-edit-banner">Click a person to change their reporting line</p>' : ''}
      <div class="tree-container">
        <ul class="tree-root">${trees.map((t) => `<li class="tree-branch">${renderHierarchyNode(t, editMode)}</li>`).join("")}</ul>
      </div>
    </div>
  `;
  createIcons();
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
  document.body.classList.toggle("stats-panel-open", anyOpen);

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
      <details class="stats-section stats-collapsible" open>
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
        ${detailRows ? `<div class="check-details">${detailRows}</div>` : ""}
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

export function syncShellHeight() {
  const drawer = document.getElementById("unassigned-drawer");
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  // Derive target height from state, not getBoundingClientRect(), because the
  // drawer CSS-transitions its max-height and measuring mid-transition returns
  // the old value.  Max-height: 200px expanded, 52px collapsed (see unassigned.css).
  const drawerH = drawer ? (state.unassignedBarCollapsed ? 52 : 200) : 0;
  shell.style.height = `calc(100vh - 52px - ${drawerH}px)`;
}

/**
 * Size member-slots in horizontal layout so CSS flex-flow: column wrap
 * produces the right number of columns.
 *
 * Counts boxes, measures their effective flex heights (including margins),
 * computes how many columns are needed, and sets the slot width accordingly.
 *
 * Vertical mode doesn't need JS sizing — CSS flex-wrap: wrap handles row
 * layout natively.  We still clean up stale inline widths when switching.
 */
export function applyPacking() {
  // Clean up stale column wrappers from previous approach
  for (const w of document.querySelectorAll(".member-slot > .people-column, .member-slot > .people-row")) {
    const parent = w.parentElement;
    while (w.firstChild) parent.insertBefore(w.firstChild, w);
    w.remove();
    parent.classList.remove("has-columns");
  }

  // Clear inline widths when not in horizontal mode
  if (state.rootLayout !== "horizontal") {
    for (const slot of document.querySelectorAll(".member-slot")) {
      slot.style.width = "";
    }
    return;
  }

  const slots = document.querySelectorAll(".member-slot.layout-horizontal");
  for (const slot of slots) {
    // Collapsed teams use facepile dots — no packing needed.
    const team = slot.closest('.team');
    if (team?.dataset.view === 'collapsed') { slot.style.width = ''; continue; }

    // During drag, skip the source slot — keep its width stable to prevent
    // layout oscillation from the ResizeObserver feedback loop.
    if (slot.querySelector(":scope > .dragging-source")) {
      continue;
    }

    const boxes = [...slot.querySelectorAll(":scope > .manager-slot, :scope > .member-entry:not(.dragging-source)")];
    if (boxes.length === 0) { slot.style.width = ""; continue; }

    const slotStyle = getComputedStyle(slot);
    const availableHeight = slot.clientHeight
      - parseFloat(slotStyle.paddingTop)
      - parseFloat(slotStyle.paddingBottom);
    const gap = parseFloat(slotStyle.columnGap) || parseFloat(slotStyle.gap) || 10;
    const rowGap = parseFloat(slotStyle.rowGap) || parseFloat(slotStyle.gap) || 10;

    // Measure each box's effective height in the flex context (including margins)
    const measurements = boxes.map((b) => {
      const s = getComputedStyle(b);
      const mt = parseFloat(s.marginTop) || 0;
      const mb = parseFloat(s.marginBottom) || 0;
      return {
        flexHeight: b.offsetHeight + mt + mb,
        flexWidth: b.offsetWidth + (parseFloat(s.marginLeft) || 0) + (parseFloat(s.marginRight) || 0),
      };
    });

    // Compute how many columns we need by greedy packing
    let cols = 1;
    let colUsed = 0;
    let maxColWidth = 0;
    let curColMaxWidth = 0;
    for (let i = 0; i < measurements.length; i++) {
      const { flexHeight, flexWidth } = measurements[i];
      if (colUsed > 0 && colUsed + rowGap + flexHeight > availableHeight) {
        if (curColMaxWidth > maxColWidth) maxColWidth = curColMaxWidth;
        cols++;
        colUsed = flexHeight;
        curColMaxWidth = flexWidth;
      } else {
        colUsed += (colUsed > 0 ? rowGap : 0) + flexHeight;
        if (flexWidth > curColMaxWidth) curColMaxWidth = flexWidth;
      }
    }
    if (curColMaxWidth > maxColWidth) maxColWidth = curColMaxWidth;

    // Set width: cols * maxCardWidth + (cols-1) * columnGap + padding
    const padding = parseFloat(slotStyle.paddingLeft) + parseFloat(slotStyle.paddingRight);
    const totalWidth = cols * maxColWidth + (cols - 1) * gap + padding;
    slot.style.width = `${Math.ceil(totalWidth)}px`;
  }
}

// Backwards-compat alias used by tests
export const applyHorizontalPacking = applyPacking;

// Re-run packing when the page-shell resizes (window resize, drawer toggle, etc.)
let packingObserver = null;
export function observeShellResize() {
  packingObserver?.disconnect();
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  packingObserver = new ResizeObserver(() => {
    syncShellHeight();
    applyPacking();
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
    shell.style.height = "";
    shell.dataset.layout = state.rootLayout;
  }

  // Evaluate checks once so renderTeam() can use cached results for ribbons
  lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));

  const barCollapsed = state.unassignedBarCollapsed;
  const barChevronClass = barCollapsed ? "" : " is-expanded";
  const unassignedCount = state.unassignedEmployees.length;

  app.innerHTML = `
    <div class="root-dropzone dropzone" data-drop-kind="root" data-layout="${state.rootLayout}">
      ${state.rootTeams.length > 0 ? state.rootTeams.map((teamId) => renderTeam(teamId)).join("") : `
        <div class="empty-board">
          <i data-lucide="users"></i>
          <p class="empty-board-title">No teams yet</p>
          <p class="empty-board-hint">Create a team or import a CSV to get started</p>
        </div>
      `}
    </div>
  `;

  let actionBar = document.getElementById('action-bar');
  if (!actionBar) {
    actionBar = document.createElement('div');
    actionBar.id = 'action-bar';
    actionBar.className = 'action-bar';
    document.body.appendChild(actionBar);
  }
  actionBar.innerHTML = `
    ${renderRootLayoutButton()}
    <span class="action-bar-divider"></span>
    <button id="add-person-btn" class="team-control-button" type="button" data-action="add-root-person" title="Add person" aria-label="Add person"><i data-lucide="user-plus"></i></button>
    <button class="team-control-button" type="button" data-action="add-root-team" title="Add team" aria-label="Add team"><i data-lucide="users"></i></button>
    <button class="team-control-button" type="button" id="action-bar-import-csv" title="Import CSV" aria-label="Import CSV"><i data-lucide="upload"></i></button>
    <span class="action-bar-divider"></span>
    <button class="team-control-button" type="button" data-action="view-hierarchy" title="View hierarchy" aria-label="View hierarchy"><i data-lucide="network"></i></button>
  `;

  let drawer = document.getElementById('unassigned-drawer');
  if (!drawer) {
    drawer = document.createElement('section');
    drawer.id = 'unassigned-drawer';
    document.body.appendChild(drawer);
  }
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
  syncShellHeight();
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
