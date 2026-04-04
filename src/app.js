import { calculateSlotSize } from "./packing.mjs";

const layoutModes = ["collapsed", "horizontal", "vertical"];
const layoutLabels = {
  collapsed: "Collapsed",
  horizontal: "Horizontal",
  vertical: "Vertical",
};
const childLayoutModes = ["horizontal", "vertical"];
const layoutIcons = {
  horizontal: "↔",
  vertical: "↕",
};

const randomNames = [
  "Aria",
  "Blake",
  "Cora",
  "Dane",
  "Esme",
  "Flynn",
  "Gia",
  "Hugo",
  "Indi",
  "Jett",
  "Kaia",
  "Leo",
];
const randomRoles = [
  "Coordinator",
  "Specialist",
  "Planner",
  "Engineer",
  "Designer",
  "Operator",
  "Advisor",
  "Strategist",
];
const randomColors = [
  "#f5b971",
  "#9ccfd8",
  "#e88973",
  "#a7c957",
  "#c3bef0",
  "#f4978e",
  "#84a59d",
  "#f6bd60",
  "#90be6d",
  "#b8c0ff",
];
const randomTeamNames = [
  "Studio",
  "Platform",
  "Growth",
  "Insights",
  "Delivery",
  "Quality",
  "Enablement",
  "Partnerships",
];

const createInitialState = () => ({
  rootLayout: "horizontal",
  unassignedEmployees: ["p9", "p10"],
  employees: {
    p1: { id: "p1", name: "Ava", role: "Director", color: "#f5b971" },
    p2: { id: "p2", name: "Milo", role: "Engineer", color: "#9ccfd8" },
    p3: { id: "p3", name: "Zuri", role: "Designer", color: "#e88973" },
    p4: { id: "p4", name: "Noah", role: "Manager", color: "#a7c957" },
    p5: { id: "p5", name: "Lena", role: "Analyst", color: "#c3bef0" },
    p6: { id: "p6", name: "Iris", role: "Lead", color: "#f4978e" },
    p7: { id: "p7", name: "Theo", role: "QA", color: "#84a59d" },
    p8: { id: "p8", name: "June", role: "Ops", color: "#f6bd60" },
    p9: { id: "p9", name: "Eli", role: "Support", color: "#90be6d" },
    p10: { id: "p10", name: "Nia", role: "Intern", color: "#b8c0ff" },
  },
  teams: {
    t1: {
      id: "t1",
      name: "Product",
      ownLayout: "expanded",
      manager: "p1",
      members: [
        { type: "employee", id: "p2" },
        { type: "employee", id: "p3" },
        { type: "team", id: "t3" },
      ],
      childLayout: "horizontal",
      color: "#f3dfc1",
    },
    t2: {
      id: "t2",
      name: "Operations",
      ownLayout: "expanded",
      manager: "p4",
      members: [
        { type: "employee", id: "p5" },
        { type: "team", id: "t4" },
      ],
      childLayout: "vertical",
      color: "#dce7c8",
    },
    t3: {
      id: "t3",
      name: "Research",
      ownLayout: "collapsed",
      manager: "p6",
      members: [{ type: "employee", id: "p7" }],
      childLayout: "vertical",
      color: "#f3cfd1",
    },
    t4: {
      id: "t4",
      name: "Field",
      ownLayout: "expanded",
      manager: null,
      members: [{ type: "employee", id: "p8" }],
      childLayout: "horizontal",
      color: "#d6e6ea",
    },
  },
  rootTeams: ["t1", "t2"],
});

let state = createInitialState();
let dragState = null;
let dropPreview = null;
let dragImageProxy = null;
let employeeSequence = 10;
let teamSequence = 4;
let isCopyMode = false;

const app = document.getElementById("app");
const resetButton = document.getElementById("reset-demo");
const rootLayoutControls = document.getElementById("root-layout-controls");

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function getTeam(teamId) {
  return state.teams[teamId];
}

function countNestedTeams(teamId) {
  return getTeam(teamId).members.filter((member) => member.type === "team").length;
}

function countDirectEmployees(teamId) {
  return getTeam(teamId).members.filter((member) => member.type === "employee").length;
}

function initializeEmployeeSequence() {
  employeeSequence = Object.keys(state.employees).reduce((maxId, employeeId) => {
    const numericId = Number(employeeId.replace(/^p/, ""));
    return Number.isNaN(numericId) ? maxId : Math.max(maxId, numericId);
  }, 0);
}

function initializeTeamSequence() {
  teamSequence = Object.keys(state.teams).reduce((maxId, teamId) => {
    const numericId = Number(teamId.replace(/^t/, ""));
    return Number.isNaN(numericId) ? maxId : Math.max(maxId, numericId);
  }, 0);
}

function pickRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function addRandomEmployee() {
  employeeSequence += 1;
  const employeeId = `p${employeeSequence}`;
  const employee = {
    id: employeeId,
    name: pickRandomItem(randomNames),
    role: pickRandomItem(randomRoles),
    color: pickRandomItem(randomColors),
  };

  state.employees[employeeId] = employee;
  state.unassignedEmployees.push(employeeId);
}

function createRandomEmployeeRecord() {
  employeeSequence += 1;
  const employeeId = `p${employeeSequence}`;
  const employee = {
    id: employeeId,
    name: pickRandomItem(randomNames),
    role: pickRandomItem(randomRoles),
    color: pickRandomItem(randomColors),
  };

  state.employees[employeeId] = employee;
  return employeeId;
}

function addRandomEmployeeToTeam(teamId) {
  const employeeId = createRandomEmployeeRecord();
  insertMember(teamId, { type: "employee", id: employeeId });
}

function addRandomRootTeam() {
  teamSequence += 1;
  const teamId = `t${teamSequence}`;
  state.teams[teamId] = {
    id: teamId,
    name: pickRandomItem(randomTeamNames),
    ownLayout: "expanded",
    manager: null,
    members: [],
    childLayout: pickRandomItem(childLayoutModes),
    color: pickRandomItem(randomColors),
  };

  state.rootTeams.push(teamId);
  return teamId;
}

function addRandomTeamToTeam(parentTeamId) {
  const parentTeam = getTeam(parentTeamId);
  const teamId = addRandomRootTeam();

  state.rootTeams = state.rootTeams.filter((id) => id !== teamId);
  insertMember(parentTeamId, { type: "team", id: teamId });

  if (parentTeam.ownLayout === "collapsed") {
    parentTeam.ownLayout = "expanded";
  }
}

function isTeamInside(draggedTeamId, targetTeamId) {
  const queue = [draggedTeamId];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentTeam = getTeam(current);
    for (const member of currentTeam.members) {
      if (member.type !== "team") {
        continue;
      }
      if (member.id === targetTeamId) {
        return true;
      }
      queue.push(member.id);
    }
  }

  return false;
}

function removeEmployeeFromCurrentLocation(employeeId) {
  state.unassignedEmployees = state.unassignedEmployees.filter((id) => id !== employeeId);

  for (const team of Object.values(state.teams)) {
    if (team.manager === employeeId) {
      team.manager = null;
    }
    team.members = team.members.filter(
      (member) => !(member.type === "employee" && member.id === employeeId),
    );
  }
}

function removeTeamFromCurrentLocation(teamId) {
  state.rootTeams = state.rootTeams.filter((id) => id !== teamId);

  for (const team of Object.values(state.teams)) {
    team.members = team.members.filter(
      (member) => !(member.type === "team" && member.id === teamId),
    );
  }
}

function normalizeInsertIndex(members, insertIndex) {
  if (typeof insertIndex !== "number" || Number.isNaN(insertIndex)) {
    return members.length;
  }

  return Math.max(0, Math.min(insertIndex, members.length));
}

function adjustInsertIndexForSameList(targetTeamId, insertIndex) {
  if (
    typeof insertIndex !== "number" ||
    !dragState ||
    dragState.sourceSlot !== "members" ||
    dragState.sourceTeamId !== targetTeamId
  ) {
    return insertIndex;
  }

  return dragState.sourceIndex < insertIndex ? insertIndex - 1 : insertIndex;
}

function insertMember(teamId, member, insertIndex) {
  const members = getTeam(teamId).members;
  members.splice(normalizeInsertIndex(members, insertIndex), 0, member);
}

function moveEmployeeToTeam(employeeId, teamId, slot, insertIndex) {
  const team = getTeam(teamId);
  if (slot === "manager" && team.manager && team.manager !== employeeId) {
    return false;
  }

  const adjustedInsertIndex = adjustInsertIndexForSameList(teamId, insertIndex);
  removeEmployeeFromCurrentLocation(employeeId);

  if (slot === "manager") {
    team.manager = employeeId;
    return true;
  }

  insertMember(teamId, { type: "employee", id: employeeId }, adjustedInsertIndex);
  return true;
}

function moveEmployeeToRoster(employeeId) {
  removeEmployeeFromCurrentLocation(employeeId);
  if (!state.unassignedEmployees.includes(employeeId)) {
    state.unassignedEmployees.push(employeeId);
  }
}

function moveTeamToTarget(teamId, targetTeamId, insertIndex) {
  if (targetTeamId && (teamId === targetTeamId || isTeamInside(teamId, targetTeamId))) {
    return false;
  }

  const adjustedInsertIndex = adjustInsertIndexForSameList(targetTeamId, insertIndex);
  removeTeamFromCurrentLocation(teamId);

  if (!targetTeamId) {
    state.rootTeams.push(teamId);
    return true;
  }

  insertMember(targetTeamId, { type: "team", id: teamId }, adjustedInsertIndex);
  return true;
}

function deepCopyEmployee(employeeId) {
  const original = state.employees[employeeId];
  if (!original) return null;
  employeeSequence += 1;
  const newId = `p${employeeSequence}`;
  state.employees[newId] = { ...original, id: newId };
  return newId;
}

function deepCopyTeam(teamId) {
  const original = getTeam(teamId);
  if (!original) return null;
  teamSequence += 1;
  const newTeamId = `t${teamSequence}`;
  const newManager = original.manager ? deepCopyEmployee(original.manager) : null;
  const newMembers = original.members.map((member) => {
    if (member.type === "employee") {
      return { type: "employee", id: deepCopyEmployee(member.id) };
    }
    return { type: "team", id: deepCopyTeam(member.id) };
  });
  state.teams[newTeamId] = {
    ...original,
    id: newTeamId,
    manager: newManager,
    members: newMembers,
  };
  return newTeamId;
}

function copyEmployeeToTeam(employeeId, teamId, slot, insertIndex) {
  const newId = deepCopyEmployee(employeeId);
  if (!newId) return false;
  const team = getTeam(teamId);
  if (slot === "manager") {
    if (team.manager) return false;
    team.manager = newId;
    return true;
  }
  insertMember(teamId, { type: "employee", id: newId }, insertIndex);
  return true;
}

function copyEmployeeToRoster(employeeId) {
  const newId = deepCopyEmployee(employeeId);
  if (!newId) return false;
  state.unassignedEmployees.push(newId);
  return true;
}

function copyTeamToTarget(teamId, targetTeamId, insertIndex) {
  const newId = deepCopyTeam(teamId);
  if (!newId) return false;
  if (!targetTeamId) {
    state.rootTeams.push(newId);
    return true;
  }
  insertMember(targetTeamId, { type: "team", id: newId }, insertIndex);
  return true;
}

function deleteEmployee(employeeId) {
  removeEmployeeFromCurrentLocation(employeeId);
  delete state.employees[employeeId];
}

function deleteTeam(teamId) {
  const team = getTeam(teamId);
  if (!team) {
    return;
  }

  for (const member of [...team.members]) {
    if (member.type === "team") {
      deleteTeam(member.id);
    }
  }

  removeTeamFromCurrentLocation(teamId);
  delete state.teams[teamId];
}

function setChildLayout(teamId, layout) {
  getTeam(teamId).childLayout = layout;
}

function toggleChildLayout(teamId) {
  const team = getTeam(teamId);
  team.childLayout = team.childLayout === "horizontal" ? "vertical" : "horizontal";
}

function setTeamLayout(teamId, layout) {
  getTeam(teamId).ownLayout = layout;
}

function toggleTeamLayout(teamId) {
  const team = getTeam(teamId);
  team.ownLayout = team.ownLayout === "collapsed" ? "expanded" : "collapsed";
}

function canDrop(dropKind, teamId) {
  if (!dragState) {
    return false;
  }

  if (dropKind === "root") {
    return dragState.type === "team";
  }

  if (dropKind === "roster") {
    return dragState.type === "employee";
  }

  if (dragState.type === "employee") {
    if (dropKind === "manager") {
      const team = getTeam(teamId);
      return !team.manager || team.manager === dragState.id;
    }
    return dropKind === "members";
  }

  if (dragState.type === "team") {
    return dropKind === "members" && dragState.id !== teamId && !isTeamInside(dragState.id, teamId);
  }

  return false;
}

function getMemberInsertionIndex(dropzone, event) {
  const entries = [...dropzone.children].filter(
    (node) => node.classList.contains("member-entry") && !node.classList.contains("drag-preview-entry"),
  );
  if (entries.length === 0) {
    const teamId = dropzone.dataset.teamId;
    return teamId ? getTeam(teamId).members.length : 0;
  }

  const isVerticalLayout = dropzone.classList.contains("layout-vertical");

  if (isVerticalLayout) {
    for (let index = 0; index < entries.length; index += 1) {
      const rect = entries[index].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return entries.length;
  }

  for (let index = 0; index < entries.length; index += 1) {
    const rect = entries[index].getBoundingClientRect();
    if (event.clientY < rect.top) {
      return index;
    }
    if (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2) {
      return index;
    }
  }

  return entries.length;
}

function renderLayoutButtons(activeLayout, targetType, targetId) {
  return layoutModes
    .map(
      (layout) => `
        <button
          class="${targetType === "root" ? "layout-button" : "team-layout-button"} ${layout === activeLayout ? "is-active" : ""}"
          data-action="set-layout"
          data-target-type="${targetType}"
          data-target-id="${targetId ?? "root"}"
          data-layout="${layout}"
          type="button"
        >
          ${layoutLabels[layout]}
        </button>
      `,
    )
    .join("");
}

function renderCreateMenu(teamId) {
  return `
    <details class="team-menu">
      <summary
        class="team-menu-trigger team-menu-trigger-icon team-control-button"
        title="Create"
        aria-label="Create"
      >+</summary>
      <div class="team-menu-panel">
        <button class="team-menu-button" type="button" data-action="add-team-employee" data-team-id="${teamId}">New person</button>
        <button class="team-menu-button" type="button" data-action="add-child-team" data-team-id="${teamId}">New team</button>
      </div>
    </details>
  `;
}

function renderChildLayoutButton(team) {
  return `
    <button
      class="team-menu-button team-menu-button-icon team-control-button"
      type="button"
      title="${layoutLabels[team.childLayout]} layout"
      aria-label="${layoutLabels[team.childLayout]} layout"
      data-action="toggle-child-layout"
      data-team-id="${team.id}"
    >${layoutIcons[team.childLayout]}</button>
  `;
}

function getMemberColors(team) {
  return team.members.map((member) => {
    if (member.type === "employee") {
      return state.employees[member.id]?.color ?? "rgba(200, 200, 200, 0.5)";
    }
    return getTeam(member.id)?.color ?? "rgba(200, 200, 200, 0.5)";
  });
}

function renderFacepile(team) {
  const colors = getMemberColors(team);
  const maxDots = 7;
  const overflow = colors.length - maxDots;
  const visibleColors = overflow > 0 ? colors.slice(0, maxDots) : colors;

  const dots = visibleColors
    .map((color) => `<span class="facepile-dot" style="background:${color}"></span>`)
    .join("");

  const overflowDot = overflow > 0
    ? `<span class="facepile-dot facepile-overflow">+${overflow}</span>`
    : "";

  return `<span class="member-facepile" aria-hidden="true">${dots}${overflowDot}</span>`;
}

function renderCollapsedMembers(team) {
  return renderFacepile(team);
}

function renderCollapsedManager(team) {
  if (!team.manager) {
    return '<p class="empty-note">Drop one here.</p>';
  }
  const color = state.employees[team.manager]?.color ?? "rgba(200, 200, 200, 0.5)";
  return `<span class="member-facepile" aria-hidden="true"><span class="facepile-dot" style="background:${color}"></span></span>`;
}

function renderEmployeeCard(employeeId) {
  const employee = state.employees[employeeId];
  if (!employee) {
    return "";
  }

  return `
    <article
      class="person-card"
      draggable="true"
      data-drag-kind="employee"
      data-id="${employee.id}"
      style="background:${employee.color}"
    >
      <button class="card-delete-button" type="button" data-action="delete-employee" data-id="${employee.id}">x</button>
      <div class="person-avatar"></div>
      <div class="person-name">${escapeHtml(employee.name)}</div>
      <div class="person-role">${escapeHtml(employee.role)}</div>
    </article>
  `;
}

function renderMembers(team) {
  if (team.members.length === 0) {
    return '<p class="empty-note">Drop here.</p>';
  }

  return team.members
    .map((member, index) => {
      let content = "";

      if (member.type === "employee") {
        content = renderEmployeeCard(member.id);
      } else {
        content = `<div class="child-team">${renderTeam(member.id)}</div>`;
      }

      return `
        <div class="member-entry" data-member-index="${index}" data-member-type="${member.type}" data-member-id="${member.id}">
          ${content}
        </div>
      `;
    })
    .join("");
}

function renderTeam(teamId, options = {}) {
  const team = getTeam(teamId);
  const teamView = options.forcedView ?? team.ownLayout;
  const bodyLayout = team.childLayout;
  const caption = `${countDirectEmployees(team.id)} people, ${countNestedTeams(team.id)} nested teams`;
  const isCollapsed = teamView === "collapsed";
  const chevronClass = isCollapsed ? "" : " is-expanded";

  return `
    <section class="team" data-team-id="${team.id}" data-view="${teamView}" style="background:${team.color}">
      <div class="team-titlebar" data-team-id="${team.id}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(team.name)}">
        <div class="team-handle" draggable="true" data-drag-kind="team" data-id="${team.id}" title="Drag team"></div>
        <div class="team-titleblock">
          <div class="team-name-row">
            <h2 class="team-name"><span class="team-chevron${chevronClass}">▶</span> ${escapeHtml(team.name)}</h2>
            <div class="team-title-actions">
              ${renderChildLayoutButton(team)}
              ${renderCreateMenu(team.id)}
              <button class="team-control-button team-delete-button" type="button" data-action="delete-team" data-id="${team.id}" title="Delete team" aria-label="Delete team">x</button>
            </div>
          </div>
          <p class="team-caption">${caption}</p>
        </div>
      </div>

      <div class="team-body ${bodyLayout}" data-layout="${bodyLayout}">
        <div class="slot manager-slot dropzone" data-drop-kind="manager" data-team-id="${team.id}">
          ${isCollapsed ? renderCollapsedManager(team) : (team.manager ? renderEmployeeCard(team.manager) : '<p class="empty-note">Drop one here.</p>')}
        </div>
        <div class="slot member-slot dropzone layout-${team.childLayout}" data-drop-kind="members" data-team-id="${team.id}">
          ${isCollapsed ? renderCollapsedMembers(team) : renderMembers(team)}
        </div>
      </div>
    </section>
  `;
}

function render() {
  const rootForcedView = state.rootLayout === "collapsed" ? "collapsed" : undefined;
  const rootArrangement = state.rootLayout === "vertical" ? "vertical" : "horizontal";

  rootLayoutControls.innerHTML = renderLayoutButtons(state.rootLayout, "root", null);

  app.innerHTML = `
    <section class="roster">
      <div class="roster-header">
        <div>
          <strong>Unassigned employees</strong>
          <p class="subtitle">Use this as a parking area for individual cards.</p>
        </div>
      </div>
      <div class="roster-cards dropzone" data-drop-kind="roster">
        ${state.unassignedEmployees.length > 0 ? state.unassignedEmployees.map(renderEmployeeCard).join("") : '<p class="empty-note">Drop here to unassign.</p>'}
      </div>
    </section>

    <section class="board">
      <div class="board-header">
        <div>
          <strong>Team board</strong>
          <p class="subtitle">Each team can collapse itself, while its layout menu controls both panel direction and member flow.</p>
        </div>
        <button class="team-control-button board-create-button" type="button" data-action="add-root-team" title="Create top-level team" aria-label="Create top-level team">+</button>
      </div>
      <div class="root-dropzone dropzone" data-drop-kind="root" data-layout="${rootArrangement}">
        ${state.rootTeams.length > 0 ? state.rootTeams.map((teamId) => renderTeam(teamId, { forcedView: rootForcedView })).join("") : '<p class="empty-note">Drop a team here.</p>'}
      </div>
    </section>
  `;

  applyMemberSlotPacking();
}

function applyMemberSlotPacking() {
  const slots = [...document.querySelectorAll('.member-slot')].sort(
    (left, right) => left.querySelectorAll('.member-slot').length - right.querySelectorAll('.member-slot').length,
  );

  slots.forEach((slot) => {
    slot.style.width = '';
    slot.style.height = '';

    const entries = [...slot.querySelectorAll(':scope > .member-entry')];
    if (entries.length === 0) {
      return;
    }

    const entryRects = entries.map((entry) => {
      const rect = entry.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    const slotStyles = window.getComputedStyle(slot);
    const layout = slot.classList.contains('layout-horizontal') ? 'horizontal'
      : slot.classList.contains('layout-vertical') ? 'vertical'
      : null;

    if (!layout) return;

    const gap = parseFloat(slotStyles.columnGap || slotStyles.gap || '0');
    const { width, height } = calculateSlotSize({
      layout,
      entries: entryRects,
      gap,
      paddingX: parseFloat(slotStyles.paddingLeft) + parseFloat(slotStyles.paddingRight),
      paddingY: parseFloat(slotStyles.paddingTop) + parseFloat(slotStyles.paddingBottom),
      borderX: parseFloat(slotStyles.borderLeftWidth) + parseFloat(slotStyles.borderRightWidth),
      borderY: parseFloat(slotStyles.borderTopWidth) + parseFloat(slotStyles.borderBottomWidth),
    });

    if (width !== null) slot.style.width = `${width}px`;
    if (height !== null) slot.style.height = `${height}px`;
  });
}

function clearDropHighlights() {
  document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
}

function getDragPreviewNode(draggable) {
  if (draggable.dataset.dragKind === "team") {
    return draggable.closest(".team");
  }

  return draggable.closest(".person-card");
}

function removeDragImageProxy() {
  if (!dragImageProxy) {
    return;
  }

  dragImageProxy.remove();
  dragImageProxy = null;
}

function setCustomDragImage(event, draggable, previewNode) {
  if (!event.dataTransfer || !previewNode) {
    return;
  }

  removeDragImageProxy();

  const previewRect = previewNode.getBoundingClientRect();
  const draggableRect = draggable.getBoundingClientRect();
  const computedStyles = window.getComputedStyle(previewNode);
  const proxy = previewNode.cloneNode(true);

  proxy.classList.add("drag-image-proxy");
  proxy.style.width = `${Math.ceil(previewRect.width)}px`;
  proxy.style.height = `${Math.ceil(previewRect.height)}px`;
  proxy.style.position = "fixed";
  proxy.style.top = "-10000px";
  proxy.style.left = "-10000px";
  proxy.style.margin = "0";
  proxy.style.pointerEvents = "none";
  proxy.style.zIndex = "9999";
  proxy.style.overflow = "hidden";
  proxy.style.borderRadius = computedStyles.borderRadius;
  proxy.style.boxShadow = computedStyles.boxShadow;
  proxy.style.clipPath = `inset(0 round ${computedStyles.borderRadius})`;

  document.body.append(proxy);
  dragImageProxy = proxy;

  const offsetX = Math.max(
    0,
    Math.min(
      Math.round(draggableRect.left - previewRect.left + draggableRect.width / 2),
      Math.ceil(previewRect.width),
    ),
  );
  const offsetY = Math.max(
    0,
    Math.min(
      Math.round(draggableRect.top - previewRect.top + draggableRect.height / 2),
      Math.ceil(previewRect.height),
    ),
  );

  event.dataTransfer.setDragImage(proxy, offsetX, offsetY);
}

function createDropPreview() {
  const preview = document.createElement("div");
  preview.className = `member-entry drag-preview-entry drag-preview-${dragState.type}`;
  preview.setAttribute("aria-hidden", "true");
  preview.style.width = `${dragState.previewWidth}px`;
  preview.style.height = `${dragState.previewHeight}px`;
  return preview;
}

function removeDropPreview() {
  const previewParent = dropPreview?.parentElement;

  if (!dropPreview) {
    return;
  }

  dropPreview.remove();
  dropPreview = null;

  if (previewParent?.classList.contains("member-slot")) {
    applyMemberSlotPacking();
  }
}

function updateDropPreview(dropzone, event) {
  if (!dragState || dropzone.dataset.dropKind !== "members") {
    removeDropPreview();
    return;
  }

  if (!dropPreview) {
    dropPreview = createDropPreview();
  }

  const insertIndex = getMemberInsertionIndex(dropzone, event);
  const entries = [...dropzone.children].filter(
    (node) => node.classList.contains("member-entry") && !node.classList.contains("drag-preview-entry"),
  );
  const anchor = entries[insertIndex] ?? null;
  const moved = dropPreview.parentElement !== dropzone || dropPreview.nextSibling !== anchor;

  if (!moved) {
    return;
  }

  dropzone.insertBefore(dropPreview, anchor);
  applyMemberSlotPacking();
}

document.addEventListener("dragstart", (event) => {
  const draggable = event.target.closest("[draggable='true'][data-drag-kind]");
  if (!draggable) {
    return;
  }

  const previewNode = getDragPreviewNode(draggable);
  const previewRect = previewNode?.getBoundingClientRect();

  const sourceElement = draggable.dataset.dragKind === "team"
    ? draggable.closest(".member-entry") ?? draggable.closest(".team")
    : draggable.closest(".member-entry") ?? draggable.closest(".person-card");

  dragState = {
    type: draggable.dataset.dragKind,
    id: draggable.dataset.id,
    sourceSlot: draggable.closest(".manager-slot")
      ? "manager"
      : draggable.closest(".member-slot")
        ? "members"
        : draggable.closest(".roster-cards")
          ? "roster"
          : null,
    sourceTeamId: draggable.closest(".member-slot, .manager-slot")?.dataset.teamId ?? null,
    sourceIndex: Number(draggable.closest(".member-entry")?.dataset.memberIndex ?? -1),
    previewWidth: Math.ceil(previewRect?.width ?? 84),
    previewHeight: Math.ceil(previewRect?.height ?? 84),
    sourceElement,
  };

  event.dataTransfer.effectAllowed = isCopyMode ? "copy" : "move";
  event.dataTransfer.setData("text/plain", JSON.stringify({ type: dragState.type, id: dragState.id }));
  setCustomDragImage(event, draggable, previewNode);

  if (!isCopyMode && sourceElement) {
    setTimeout(() => {
      sourceElement.classList.add("dragging-source");
    }, 0);
  }
});

document.addEventListener("dragend", () => {
  if (dragState?.sourceElement) {
    dragState.sourceElement.classList.remove("dragging-source");
  }
  removeDragImageProxy();
  removeDropPreview();
  dragState = null;
  clearDropHighlights();
});

document.addEventListener("dragover", (event) => {
  const dropzone = event.target.closest(".dropzone");
  if (!dropzone) {
    return;
  }

  const { dropKind, teamId } = dropzone.dataset;
  if (!canDrop(dropKind, teamId)) {
    return;
  }

  event.preventDefault();
  clearDropHighlights();
  dropzone.classList.add("is-over");
  updateDropPreview(dropzone, event);
});

document.addEventListener("dragleave", (event) => {
  const dropzone = event.target.closest(".dropzone");
  if (dropzone) {
    dropzone.classList.remove("is-over");
  }
});

document.addEventListener("drop", (event) => {
  const dropzone = event.target.closest(".dropzone");
  if (!dropzone || !dragState) {
    removeDragImageProxy();
    removeDropPreview();
    return;
  }

  const { dropKind, teamId } = dropzone.dataset;
  if (!canDrop(dropKind, teamId)) {
    removeDragImageProxy();
    removeDropPreview();
    clearDropHighlights();
    return;
  }

  event.preventDefault();

  const insertIndex =
    dropKind === "members" ? getMemberInsertionIndex(dropzone, event) : undefined;

  if (isCopyMode) {
    if (dropKind === "roster" && dragState.type === "employee") {
      copyEmployeeToRoster(dragState.id);
    }

    if (dropKind === "root" && dragState.type === "team") {
      copyTeamToTarget(dragState.id, null);
    }

    if (dropKind === "manager" && dragState.type === "employee") {
      copyEmployeeToTeam(dragState.id, teamId, "manager");
    }

    if (dropKind === "members") {
      if (dragState.type === "employee") {
        copyEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
      }

      if (dragState.type === "team") {
        copyTeamToTarget(dragState.id, teamId, insertIndex);
      }
    }
  } else {
    if (dropKind === "roster" && dragState.type === "employee") {
      moveEmployeeToRoster(dragState.id);
    }

    if (dropKind === "root" && dragState.type === "team") {
      moveTeamToTarget(dragState.id, null);
    }

    if (dropKind === "manager" && dragState.type === "employee") {
      moveEmployeeToTeam(dragState.id, teamId, "manager");
    }

    if (dropKind === "members") {
      if (dragState.type === "employee") {
        moveEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
      }

      if (dragState.type === "team") {
        moveTeamToTarget(dragState.id, teamId, insertIndex);
      }
    }
  }

  removeDragImageProxy();
  removeDropPreview();
  dragState = null;
  clearDropHighlights();
  render();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) {
    const { action, id, targetType, targetId, layout } = button.dataset;

    if (action === "delete-employee") {
      deleteEmployee(id);
      render();
      return;
    }

    if (action === "delete-team") {
    deleteTeam(id);
    render();
    return;
  }

  if (action === "add-employee") {
    addRandomEmployee();
    render();
    return;
  }

  if (action === "add-team-employee") {
    addRandomEmployeeToTeam(button.dataset.teamId);
    render();
    return;
  }

  if (action === "add-root-team") {
    addRandomRootTeam();
    render();
    return;
  }

  if (action === "add-child-team") {
    addRandomTeamToTeam(button.dataset.teamId);
    render();
    return;
  }

  if (action === "toggle-child-layout") {
    toggleChildLayout(button.dataset.teamId);
    render();
    return;
  }

  if (action === "set-layout") {
    if (targetType === "root") {
      state.rootLayout = layout;
    }

    render();
    return;
  }

  if (action === "set-child-layout") {
    setChildLayout(button.dataset.teamId, layout);
    render();
  }

    return;
  }

  const titlebar = event.target.closest(".team-titlebar[data-team-id]");
  if (titlebar && !event.target.closest(".team-title-actions") && !event.target.closest(".team-handle")) {
    toggleTeamLayout(titlebar.dataset.teamId);
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.closest(".team-titlebar[data-team-id]")) {
    event.preventDefault();
    const titlebar = event.target.closest(".team-titlebar[data-team-id]");
    toggleTeamLayout(titlebar.dataset.teamId);
    render();
    return;
  }

  if (event.key === "c" || event.key === "C") {
    isCopyMode = true;
    if (dragState?.sourceElement) {
      dragState.sourceElement.classList.remove("dragging-source");
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "c" || event.key === "C") {
    isCopyMode = false;
    if (dragState?.sourceElement) {
      dragState.sourceElement.classList.add("dragging-source");
    }
  }
});

window.addEventListener("blur", () => {
  isCopyMode = false;
});

resetButton.addEventListener("click", () => {
  state = createInitialState();
  initializeEmployeeSequence();
  initializeTeamSequence();
  removeDragImageProxy();
  removeDropPreview();
  dragState = null;
  clearDropHighlights();
  render();
});

initializeEmployeeSequence();
initializeTeamSequence();
render();
