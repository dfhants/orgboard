import {
  state,
  dragState, setIsCopyMode,
  boardZoom, setBoardZoom, BOARD_ZOOM_STEP,
  employeeSequence, setEmployeeSequence,
  scenarios, activeScenarioId,
  getTeam, getAllManagers, findMemberEntry,
  oppositeLayout,
  globalCriteria, setGlobalCriteria,
} from './state.mjs';
import { escapeHtml, timezoneColors, colorForManager, colorForTimezone } from './utils.mjs';
import { cleanupManagerOverrides, buildHierarchyTree, computeTeamStats, getValidManagerOverrideCandidates } from './team-logic.mjs';
import { checkTypes, describeCriterion } from './checks.mjs';
import { saveCriterion, deleteCriterion } from './db.mjs';
import {
  addRandomRootTeam, addRandomTeamToTeam,
  deleteEmployee, deleteTeam, deleteAllUnassigned,
  toggleTeamLayout,
  insertMember,
  sortKeys,
} from './operations.mjs';
import { openCsvImportModal } from './csv-import.mjs';
import {
  switchToScenario, createNewScenario,
  loadDemoData, loadBlankBoard,
  closeScenario, renameScenario, handleExportDB, handleImportDB,
} from './scenarios.mjs';
import {
  render, renderTabs, createIcons,
  renderHierarchyNode, rerenderHierarchyInPlace, renderCompactTree, getHierarchyTreesForModal,
} from './render.mjs';

function syncBoardZoomUI() {
  const shell = document.querySelector(".page-shell");
  if (shell) shell.style.setProperty("--board-zoom", String(boardZoom));
  const zoomLayer = document.querySelector(".board-zoom-layer");
  if (zoomLayer) zoomLayer.style.zoom = String(boardZoom);
  const label = document.getElementById("zoom-level-label");
  if (label) label.textContent = `${Math.round(boardZoom * 100)}%`;
}

function openImportDBPicker() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".db,application/x-sqlite3,application/octet-stream";
  input.style.display = "none";

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    try {
      await handleImportDB(file);
      render();
      renderTabs();
    } catch (err) {
      console.error("OrgBoard: failed to import database", err);
      alert("Could not import OrgBoard database. Please choose a valid orgboard.db export.");
    }
  }, { once: true });

  document.body.appendChild(input);
  input.click();
}

function openDeleteAllUnassignedModal() {
  document.getElementById("delete-all-unassigned-modal")?.remove();
  const count = state.unassignedEmployees.length;
  if (count === 0) return;

  const modal = document.createElement("div");
  modal.id = "delete-all-unassigned-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-panel">
      <h3 class="modal-title">Delete unassigned employees</h3>
      <p class="modal-body-text">Are you sure you want to permanently delete <strong>${count}</strong> unassigned employee${count === 1 ? '' : 's'}? This cannot be undone.</p>
      <div class="modal-actions">
        <button id="delete-all-unassigned-cancel" class="toolbar-button" type="button">Cancel</button>
        <button id="delete-all-unassigned-confirm" class="toolbar-button modal-submit modal-danger" type="button">Delete all</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function openAddPersonModal(teamId) {
  document.getElementById("add-person-modal")?.remove();
  const tzOptions = Object.keys(timezoneColors).map(
    (tz) => `<option value="${escapeHtml(tz)}">${escapeHtml(tz)}</option>`
  ).join("");

  const modal = document.createElement("div");
  modal.id = "add-person-modal";
  modal.className = "modal-overlay";
  modal.dataset.teamId = teamId || "";
  modal.innerHTML = `
    <div class="modal-panel">
      <h3 class="modal-title">Add person${teamId ? ` to ${escapeHtml(getTeam(teamId)?.name ?? "team")}` : ""}</h3>
      <label class="modal-label">Name<input id="ap-name" class="modal-input" type="text" placeholder="Full name" autofocus /></label>
      <label class="modal-label">Role<input id="ap-role" class="modal-input" type="text" placeholder="Job title" /></label>
      <label class="modal-label">Level<input id="ap-level" class="modal-input" type="number" min="1" max="15" placeholder="e.g. 5" /></label>
      <label class="modal-label">Location<input id="ap-location" class="modal-input" type="text" placeholder="City, Country" /></label>
      <label class="modal-label">Time zone<select id="ap-timezone" class="modal-input">${tzOptions}</select></label>
      <label class="modal-label">Current manager<input id="ap-current-manager" class="modal-input" type="text" placeholder="Original / current manager name" /></label>
      <label class="modal-label">Notes<textarea id="ap-notes" class="modal-input modal-textarea" placeholder="Notes / nuance" rows="3"></textarea></label>
      <label class="modal-switch-label"><input id="ap-requested" type="checkbox" class="modal-switch" /> Requested position</label>
      <div class="modal-actions">
        <button id="add-person-cancel" class="toolbar-button" type="button">Cancel</button>
        <button id="add-person-submit" class="toolbar-button modal-submit" type="button">Add person</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#ap-name").focus();
}

function openEditPersonModal(employeeId) {
  document.getElementById("edit-person-modal")?.remove();
  const employee = state.employees[employeeId];
  if (!employee) return;

  const tzOptions = Object.keys(timezoneColors).map(
    (tz) => `<option value="${escapeHtml(tz)}"${tz === employee.timezone ? " selected" : ""}>${escapeHtml(tz)}</option>`
  ).join("");

  const modal = document.createElement("div");
  modal.id = "edit-person-modal";
  modal.className = "modal-overlay";
  modal.dataset.employeeId = employeeId;
  modal.innerHTML = `
    <div class="modal-panel">
      <h3 class="modal-title">Edit person</h3>
      <label class="modal-label">Name<input id="ep-name" class="modal-input" type="text" value="${escapeHtml(employee.name)}" autofocus /></label>
      <label class="modal-label">Role<input id="ep-role" class="modal-input" type="text" value="${escapeHtml(employee.role)}" /></label>
      <label class="modal-label">Level<input id="ep-level" class="modal-input" type="number" min="1" max="15" value="${employee.level != null ? employee.level : ''}" /></label>
      <label class="modal-label">Location<input id="ep-location" class="modal-input" type="text" value="${escapeHtml(employee.location)}" /></label>
      <label class="modal-label">Time zone<select id="ep-timezone" class="modal-input">${tzOptions}</select></label>
      <label class="modal-label">Current manager<input id="ep-current-manager" class="modal-input" type="text" value="${escapeHtml(employee.currentManager || '')}" placeholder="Original / current manager name" /></label>
      <label class="modal-label">Notes<textarea id="ep-notes" class="modal-input modal-textarea" rows="3">${escapeHtml(employee.notes || "")}</textarea></label>
      <label class="modal-switch-label"><input id="ep-requested" type="checkbox" class="modal-switch"${employee.requested ? " checked" : ""} /> Requested position</label>
      <div class="modal-actions">
        <button id="edit-person-cancel" class="toolbar-button" type="button">Cancel</button>
        <button id="edit-person-submit" class="toolbar-button modal-submit" type="button">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#ep-name").focus();
}

// ─── Criterion add/edit modal ───

function generateCriterionId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const checkTypeEntries = Object.entries(checkTypes);

function buildConfigFields(type, config) {
  config = config || {};
  switch (type) {
    case "employee-count": {
      const filterFieldOpts = ["level", "role", "location", "timezone"].map((f) =>
        `<option value="${f}"${config.filter?.field === f ? " selected" : ""}>${f}</option>`).join("");
      const filterOpOpts = [">=", "<=", "==", "!=", "contains"].map((o) => {
        const opLabel = { ">=": "is at least", "<=": "is at most", "==": "is", "!=": "is not", "contains": "contains" }[o];
        return `<option value="${escapeHtml(o)}"${config.filter?.op === o ? " selected" : ""}>${opLabel}</option>`;
      }).join("");
      return `
        <div class="config-sentence">
          <span class="config-word">Each team should have</span>
          <select data-cr="operator" class="modal-input">
            <option value=">="${config.operator === ">=" ? " selected" : ""}>at least</option>
            <option value="<="${config.operator === "<=" ? " selected" : ""}>at most</option>
            <option value="=="${config.operator === "==" ? " selected" : ""}>exactly</option>
          </select>
          <input data-cr="value" class="modal-input" type="number" min="0" value="${config.value ?? 1}" />
          <span class="config-word">people</span>
          <fieldset class="modal-fieldset"><legend>Only count people where… (optional)</legend>
            <div class="filter-row">
              <select data-cr="filter-field" class="modal-input"><option value="">everyone (no filter)</option>${filterFieldOpts}</select>
              <select data-cr="filter-op" class="modal-input">${filterOpOpts}</select>
              <input data-cr="filter-value" class="modal-input" type="text" value="${escapeHtml(config.filter?.value ?? "")}" placeholder="e.g. Designer, London" />
            </div>
          </fieldset>
        </div>`;
    }
    case "distinct-values": {
      const fieldOpts = ["timezone", "location", "role"].map((f) =>
        `<option value="${f}"${config.field === f ? " selected" : ""}>${f}s</option>`).join("");
      return `
        <div class="config-sentence">
          <span class="config-word">Each team should have</span>
          <select data-cr="operator" class="modal-input">
            <option value="<="${config.operator === "<=" ? " selected" : ""}>at most</option>
            <option value=">="${config.operator === ">=" ? " selected" : ""}>at least</option>
          </select>
          <input data-cr="value" class="modal-input" type="number" min="1" value="${config.value ?? 2}" />
          <span class="config-word">different</span>
          <select data-cr="field" class="modal-input">${fieldOpts}</select>
        </div>`;
    }
    case "timezone-gap":
      return `
        <div class="config-sentence">
          <span class="config-word">Max timezone gap in a team:</span>
          <input data-cr="maxHours" class="modal-input" type="number" min="0" value="${config.maxHours ?? 5}" />
          <span class="config-word">hours</span>
        </div>`;
    case "has-manager":
      return `
        <div class="config-sentence">
          <span class="config-word">Every team must have a manager assigned. No configuration needed.</span>
        </div>`;
    case "manager-match": {
      const fieldOpts = ["location", "timezone"].map((f) =>
        `<option value="${f}"${config.field === f ? " selected" : ""}>${f}</option>`).join("");
      return `
        <div class="config-sentence">
          <span class="config-word">Manager's</span>
          <select data-cr="field" class="modal-input">${fieldOpts}</select>
          <span class="config-word">must match</span>
          <select data-cr="match" class="modal-input">
            <option value="any"${config.match === "any" ? " selected" : ""}>at least one member</option>
            <option value="majority"${config.match === "majority" ? " selected" : ""}>most members</option>
            <option value="all"${config.match === "all" ? " selected" : ""}>all members</option>
          </select>
        </div>`;
    }
    case "max-direct-reports":
      return `
        <div class="config-sentence">
          <span class="config-word">No manager should have more than</span>
          <input data-cr="maxReports" class="modal-input" type="number" min="1" value="${config.maxReports ?? 8}" />
          <span class="config-word">direct reports</span>
        </div>`;
    case "requested-limit":
      return `
        <div class="config-sentence">
          <span class="config-word">Each team should have</span>
          <select data-cr="operator" class="modal-input">
            <option value="<="${config.operator === "<=" ? " selected" : ""}>at most</option>
            <option value="=="${config.operator === "==" ? " selected" : ""}>exactly</option>
          </select>
          <input data-cr="value" class="modal-input" type="number" min="0" value="${config.value ?? 2}" />
          <span class="config-word">open positions</span>
        </div>`;
    case "role-coverage":
      return `
        <div class="config-sentence">
          <span class="config-word">Every team must include a role containing</span>
          <input data-cr="rolePattern" class="modal-input" type="text" value="${escapeHtml(config.rolePattern ?? "")}" placeholder="e.g. Designer, QA Lead" />
        </div>`;
    case "scenario-count": {
      const subjectOpts = [
        ["teams", "teams"],
        ["people", "people"],
        ["unassigned", "unassigned people"],
        ["managers", "managers"],
      ].map(([val, label]) =>
        `<option value="${val}"${config.subject === val ? " selected" : ""}>${label}</option>`).join("");
      return `
        <div class="config-sentence">
          <span class="config-word">There should be</span>
          <select data-cr="operator" class="modal-input">
            <option value=">="${config.operator === ">=" ? " selected" : ""}>at least</option>
            <option value="<="${config.operator === "<=" ? " selected" : ""}>at most</option>
            <option value="=="${config.operator === "==" ? " selected" : ""}>exactly</option>
          </select>
          <input data-cr="value" class="modal-input" type="number" min="0" value="${config.value ?? 1}" />
          <select data-cr="subject" class="modal-input">${subjectOpts}</select>
        </div>`;
    }
    case "max-memberships":
      return `
        <div class="config-sentence">
          <span class="config-word">No person should belong to more than</span>
          <input data-cr="maxTeams" class="modal-input" type="number" min="1" value="${config.maxTeams ?? 2}" />
          <span class="config-word">teams</span>
        </div>`;
    case "all-assigned":
      return `
        <div class="config-sentence">
          <span class="config-word">Everyone must be assigned to at least one team. No configuration needed.</span>
        </div>`;
    case "manager-changed":
      return `
        <div class="config-sentence">
          <span class="config-word">Allow</span>
          <select data-cr="operator" class="modal-input">
            <option value="<="${config.operator === "<=" ? " selected" : ""}>at most</option>
            <option value=">="${config.operator === ">=" ? " selected" : ""}>at least</option>
            <option value="=="${config.operator === "==" ? " selected" : ""}>exactly</option>
          </select>
          <input data-cr="value" class="modal-input" type="number" min="0" value="${config.value ?? 0}" />
          <span class="config-word">people to change manager</span>
        </div>`;
    default:
      return "";
  }
}

function readConfigFromContainer(type, container) {
  const val = (name) => container.querySelector(`[data-cr="${name}"]`)?.value ?? "";
  const num = (name) => Number(val(name));

  switch (type) {
    case "employee-count": {
      const config = { operator: val("operator"), value: num("value") };
      const filterField = val("filter-field");
      if (filterField) {
        config.filter = { field: filterField, op: val("filter-op"), value: val("filter-value") };
      }
      return config;
    }
    case "distinct-values":
      return { field: val("field"), operator: val("operator"), value: num("value") };
    case "timezone-gap":
      return { maxHours: num("maxHours") };
    case "has-manager":
      return {};
    case "manager-match":
      return { field: val("field"), match: val("match") };
    case "max-direct-reports":
      return { maxReports: num("maxReports") };
    case "requested-limit":
      return { operator: val("operator"), value: num("value") };
    case "role-coverage":
      return { rolePattern: val("rolePattern") };
    case "scenario-count":
      return { subject: val("subject"), operator: val("operator"), value: num("value") };
    case "max-memberships":
      return { maxTeams: num("maxTeams") };
    case "all-assigned":
      return {};
    case "manager-changed":
      return { operator: val("operator"), value: num("value") };
    default:
      return {};
  }
}

/** Icon map for check types */
const checkTypeIcons = {
  "employee-count": "users", "distinct-values": "layers", "timezone-gap": "clock",
  "has-manager": "user-check", "manager-match": "link", "max-direct-reports": "git-branch",
  "requested-limit": "user-plus", "role-coverage": "briefcase", "scenario-count": "hash",
  "max-memberships": "repeat", "all-assigned": "check-circle", "manager-changed": "arrow-right-left",
};

function updateBatchSubmitLabel(modal) {
  const count = modal.querySelectorAll(".check-instance").length;
  const btn = modal.querySelector("#criterion-submit");
  btn.textContent = count > 0 ? `Add ${count} check${count !== 1 ? "s" : ""}` : "Select checks above";
  btn.disabled = count === 0;
}

function addCheckInstance(modal, type, config) {
  const list = modal.querySelector(".check-instance-list");
  const def = checkTypes[type];
  const icon = checkTypeIcons[type] || "check";
  const scopeLabel = def.scope === "team" ? "Per team" : "Scenario-wide";
  const instance = document.createElement("div");
  instance.className = "check-instance";
  instance.dataset.type = type;
  instance.innerHTML = `
    <div class="check-instance-header">
      <i data-lucide="${icon}" class="check-type-icon"></i>
      <span class="check-instance-label">${escapeHtml(def.label)}</span>
      <span class="check-type-scope">${scopeLabel}</span>
      <button class="team-control-button check-instance-remove" type="button" title="Remove" aria-label="Remove">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="check-instance-config">${buildConfigFields(type, config || {})}</div>
  `;
  instance.querySelector(".check-instance-remove").addEventListener("click", () => {
    instance.remove();
    updateBatchSubmitLabel(modal);
  });
  list.appendChild(instance);
  createIcons({ attrs: { class: ["lucide"] } });
  updateBatchSubmitLabel(modal);
  instance.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openCriterionModal(criterionId) {
  document.getElementById("criterion-modal")?.remove();
  const existing = criterionId ? globalCriteria.find((c) => c.id === criterionId) : null;
  const isEdit = !!existing;

  const modal = document.createElement("div");
  modal.id = "criterion-modal";
  modal.className = "modal-overlay modal-overlay-fullscreen";
  modal.dataset.criterionId = criterionId || "";
  modal.dataset.mode = isEdit ? "edit" : "add";

  const scopeLabel = (scope) => scope === "team" ? "Per team" : "Scenario-wide";

  if (isEdit) {
    // ── Edit mode: single check ──
    const def = checkTypes[existing.type];
    const icon = checkTypeIcons[existing.type] || "check";
    modal.innerHTML = `
      <div class="modal-panel modal-panel-fullscreen">
        <div class="modal-fullscreen-header">
          <h3 class="modal-title">Edit check</h3>
          <button id="criterion-cancel" class="team-control-button" type="button" title="Close" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="check-instance-list">
          <div class="check-instance" data-type="${existing.type}">
            <div class="check-instance-header">
              <i data-lucide="${icon}" class="check-type-icon"></i>
              <span class="check-instance-label">${escapeHtml(def.label)}</span>
              <span class="check-type-scope">${scopeLabel(def.scope)}</span>
            </div>
            <div class="check-instance-config">${buildConfigFields(existing.type, existing.config)}</div>
          </div>
        </div>
        <label class="modal-label" style="max-width:400px">Name<input data-cr="name" class="modal-input" type="text" value="${escapeHtml(existing.name ?? "")}" placeholder="Auto-generated if empty" /></label>
        <div class="modal-fullscreen-footer">
          <button id="criterion-cancel-btn" class="toolbar-button" type="button">Cancel</button>
          <button id="criterion-submit" class="toolbar-button modal-submit" type="button">Save</button>
        </div>
      </div>
    `;
  } else {
    // ── Add mode: type picker grid + instance list ──
    const cards = checkTypeEntries.map(([key, def]) => {
      const icon = checkTypeIcons[key] || "check";
      return `
        <button class="check-type-card" data-type="${key}" type="button">
          <i data-lucide="${icon}" class="check-type-icon"></i>
          <div class="check-type-card-text">
            <div class="check-type-card-label">${escapeHtml(def.label)}</div>
            <div class="check-type-card-desc">${escapeHtml(def.description)}</div>
          </div>
          <i data-lucide="plus" class="check-type-add-icon"></i>
        </button>
      `;
    }).join("");

    modal.innerHTML = `
      <div class="modal-panel modal-panel-fullscreen">
        <div class="modal-fullscreen-header">
          <h3 class="modal-title">Add checks</h3>
          <button id="criterion-cancel" class="team-control-button" type="button" title="Close" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="check-type-grid">${cards}</div>
        <div class="check-instance-list-wrapper">
          <h4 class="check-instance-list-title">Selected checks</h4>
          <div class="check-instance-list">
            <p class="check-instance-empty">Click a check type above to add it. You can add the same type multiple times with different settings.</p>
          </div>
        </div>
        <div class="modal-fullscreen-footer">
          <button id="criterion-cancel-btn" class="toolbar-button" type="button">Cancel</button>
          <button id="criterion-submit" class="toolbar-button modal-submit" type="button" disabled>Select checks above</button>
        </div>
      </div>
    `;
  }

  document.body.appendChild(modal);
  createIcons({ attrs: { class: ["lucide"] } });

  // ── Card click adds instance (add mode only) ──
  if (!isEdit) {
    modal.querySelectorAll(".check-type-card").forEach((card) => {
      card.addEventListener("click", () => {
        // Remove empty message on first add
        modal.querySelector(".check-instance-empty")?.remove();
        addCheckInstance(modal, card.dataset.type, null);
      });
    });
  }
}

function openManagerOverrideModal(employeeId, teamId) {
  document.getElementById("manager-override-modal")?.remove();
  const team = getTeam(teamId);
  const emp = state.employees[employeeId];
  const isManager = team?.manager === employeeId;
  const managers = getAllManagers().filter((m) => m.id !== employeeId && (isManager || m.id !== team?.manager));

  if (managers.length === 0) {
    return; // No managers to pick from
  }

  const listItems = managers.map((m) => {
    const pillColor = colorForManager(m.id);
    const isTeamMgr = team?.manager === m.id;
    return `
      <button class="manager-pick-item" type="button" data-manager-id="${m.id}">
        <span class="manager-pick-pill" style="background:${pillColor}"></span>
        <span class="manager-pick-name">${escapeHtml(m.name)}</span>
        <span class="manager-pick-role">${escapeHtml(m.role)}</span>
        ${isTeamMgr ? '<span class="manager-pick-tag">team manager</span>' : ''}
      </button>
    `;
  }).join("");

  const modal = document.createElement("div");
  modal.id = "manager-override-modal";
  modal.className = "modal-overlay";
  modal.dataset.employeeId = employeeId;
  modal.dataset.teamId = teamId;
  modal.innerHTML = `
    <div class="modal-panel">
      <h3 class="modal-title">Set alternative manager for ${escapeHtml(emp?.name ?? "person")}</h3>
      <div class="manager-pick-list">${listItems}</div>
      <div class="modal-actions">
        <button id="manager-override-cancel" class="toolbar-button" type="button">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function openTeamStatsModal(teamId) {
  document.getElementById("team-stats-modal")?.remove();

  const stats = computeTeamStats(state, teamId);
  if (!stats) return;

  const roleRows = Object.entries(stats.roles)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) =>
      `<div class="stats-row"><span class="stats-row-label">${escapeHtml(role)}</span><span class="stats-row-value">${count}</span></div>`
    ).join("") || '<p class="empty-note">No roles</p>';

  const tzRows = Object.entries(stats.timezones)
    .sort((a, b) => b[1] - a[1])
    .map(([tz, count]) => {
      const bg = colorForTimezone(tz);
      return `<span class="stats-tz-badge" style="background:${bg}"><span>${escapeHtml(tz)}</span> <span class="stats-tz-badge-count">${count}</span></span>`;
    }).join("") || '<p class="empty-note">No timezones</p>';

  const nestedHtml = stats.nestedStats.length > 0
    ? stats.nestedStats.map((s) =>
        `<div class="team-stats-nested-row">
          <span class="stats-team-dot" style="background:${s.color}"></span>
          <span class="stats-team-name">${escapeHtml(s.name)}</span>
          <span class="stats-team-count">${s.totalPeople}</span>
        </div>`
      ).join("")
    : "";

  const modal = document.createElement("div");
  modal.id = "team-stats-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-panel team-stats-panel">
      <h3 class="modal-title">${escapeHtml(stats.name)}</h3>
      <div class="team-stats-overview">
        <div class="stats-row"><span class="stats-row-label">Total people</span><span class="stats-row-value">${stats.totalPeople}</span></div>
        ${stats.nestedStats.length > 0 ? `<div class="stats-row"><span class="stats-row-label">Nested teams</span><span class="stats-row-value">${stats.nestedStats.length}</span></div>` : ""}
      </div>
      <div class="team-stats-section">
        <h4 class="team-stats-section-title">Roles</h4>
        <div class="team-stats-columns">${roleRows}</div>
      </div>
      <div class="team-stats-section">
        <h4 class="team-stats-section-title">Timezones</h4>
        <div class="stats-tz-list">${tzRows}</div>
      </div>
      ${nestedHtml ? `<div class="team-stats-section"><h4 class="team-stats-section-title">Nested teams</h4><div class="team-stats-columns">${nestedHtml}</div></div>` : ""}
      <div class="modal-actions">
        <button id="team-stats-close" class="toolbar-button" type="button">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  createIcons({ nameAttr: "data-lucide", attrs: { width: 15, height: 15 } });
}

function openSortModal() {
  document.getElementById("sort-modal")?.remove();

  const allKeys = Object.entries(sortKeys);
  const hasExisting = state.activeSortLayers && state.activeSortLayers.length > 0;
  let layers = hasExisting
    ? state.activeSortLayers.map((l) => ({ ...l }))
    : [{ key: "level", direction: "asc" }, { key: "name", direction: "asc" }];

  function renderLayers() {
    return layers.map((layer, i) => {
      const keySelect = allKeys.map(([k, { label }]) =>
        `<option value="${k}"${layer.key === k ? " selected" : ""}>${escapeHtml(label)}</option>`
      ).join("");
      const canRemove = layers.length > 1;
      return `<div class="sort-layer" data-layer-index="${i}">
        <span class="sort-layer-number">${i + 1}</span>
        <select class="sort-layer-key">${keySelect}</select>
        <button type="button" class="sort-layer-dir" data-dir="${layer.direction}" title="${layer.direction === 'asc' ? 'Ascending' : 'Descending'}">
          <i data-lucide="${layer.direction === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>
        </button>
        ${canRemove ? `<button type="button" class="sort-layer-remove" title="Remove"><i data-lucide="x"></i></button>` : ""}
      </div>`;
    }).join("");
  }

  function usedKeys() {
    return new Set(layers.map((l) => l.key));
  }

  function rebuild() {
    panel.querySelector(".sort-layers").innerHTML = renderLayers();
    const used = usedKeys();
    const addBtn = panel.querySelector("#sort-add-layer");
    if (addBtn) addBtn.style.display = used.size >= allKeys.length ? "none" : "";
    createIcons({ nameAttr: "data-lucide", attrs: { width: 13, height: 13 } });
  }

  const modal = document.createElement("div");
  modal.id = "sort-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-panel sort-modal-panel">
      <h3 class="modal-title">Sort all teams</h3>
      <div class="sort-layers"></div>
      <button type="button" class="sort-add-layer-btn" id="sort-add-layer"><i data-lucide="plus"></i> Add sort level</button>
      <div class="modal-actions">
        ${hasExisting ? '<button id="sort-modal-clear" class="toolbar-button" type="button">Clear sort</button>' : ''}
        <button id="sort-modal-cancel" class="toolbar-button" type="button">Cancel</button>
        <button id="sort-modal-apply" class="toolbar-button primary" type="button">Apply</button>
      </div>
    </div>
  `;
  const panel = modal.querySelector(".modal-panel");
  document.body.appendChild(modal);
  rebuild();

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("#sort-modal-cancel")) {
      modal.remove();
      return;
    }
    if (e.target.closest("#sort-modal-apply")) {
      state.activeSortLayers = layers.map((l) => ({ ...l }));
      modal.remove();
      render();
      return;
    }
    if (e.target.closest("#sort-modal-clear")) {
      state.activeSortLayers = [];
      modal.remove();
      render();
      return;
    }
    if (e.target.closest("#sort-add-layer")) {
      const used = usedKeys();
      const next = allKeys.find(([k]) => !used.has(k));
      if (next) {
        layers.push({ key: next[0], direction: "asc" });
        rebuild();
      }
      return;
    }
    const dirBtn = e.target.closest(".sort-layer-dir");
    if (dirBtn) {
      const idx = Number(dirBtn.closest(".sort-layer").dataset.layerIndex);
      layers[idx].direction = layers[idx].direction === "asc" ? "desc" : "asc";
      rebuild();
      return;
    }
    const removeBtn = e.target.closest(".sort-layer-remove");
    if (removeBtn) {
      const idx = Number(removeBtn.closest(".sort-layer").dataset.layerIndex);
      layers.splice(idx, 1);
      rebuild();
      return;
    }
  });

  modal.addEventListener("change", (e) => {
    const select = e.target.closest(".sort-layer-key");
    if (select) {
      const idx = Number(select.closest(".sort-layer").dataset.layerIndex);
      layers[idx].key = select.value;
      rebuild();
    }
  });
}

function snapshotOverrides() {
  const snapshot = { teams: {}, members: {} };
  for (const team of Object.values(state.teams)) {
    snapshot.teams[team.id] = team.managerOverride ?? null;
    snapshot.members[team.id] = {};
    for (const member of team.members) {
      snapshot.members[team.id][member.id] = member.managerOverride ?? null;
    }
  }
  return snapshot;
}

function restoreOverrides(snapshot) {
  for (const team of Object.values(state.teams)) {
    const teamSnap = snapshot.teams?.[team.id];
    if (teamSnap == null) {
      delete team.managerOverride;
    } else {
      team.managerOverride = teamSnap;
    }
    const memberSnap = snapshot.members?.[team.id] || {};
    for (const member of team.members) {
      const val = memberSnap[member.id];
      if (val == null) {
        delete member.managerOverride;
      } else {
        member.managerOverride = val;
      }
    }
  }
}

function openHierarchyModal(teamId) {
  document.getElementById("hierarchy-modal")?.remove();

  const trees = getHierarchyTreesForModal(teamId || null);
  if (trees.length === 0) return;

  const modal = document.createElement("div");
  modal.id = "hierarchy-modal";
  modal.className = "modal-overlay modal-overlay-fullscreen";
  if (teamId) modal.dataset.teamId = teamId;
  modal.dataset.editMode = "false";
  modal.dataset.collapsedKeys = "[]";
  modal.dataset.editSnapshot = JSON.stringify(snapshotOverrides());

  function renderModalContent(editMode) {
    const collapsedKeys = new Set(JSON.parse(modal.dataset.collapsedKeys || "[]"));
    const title = teamId ? `${escapeHtml(trees[0].teamName)} — Reporting Hierarchy` : "Reporting Hierarchy";
    const actionButtons = editMode
      ? `<button class="toolbar-button modal-submit" type="button" data-action="save-tree-edit">Save</button>
        <button class="toolbar-button" type="button" data-action="cancel-tree-edit">Cancel</button>`
      : `<button id="hierarchy-modal-close" class="toolbar-button" type="button">Close</button>`;
    modal.innerHTML = `
      <div class="modal-panel modal-panel-fullscreen hierarchy-modal-panel">
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
    createIcons({ nodes: modal.querySelectorAll('i[data-lucide]') });
  }

  document.body.appendChild(modal);
  renderModalContent(false);
}

function closeHierarchyModal({ restoreUnsaved = true } = {}) {
  const modal = document.getElementById("hierarchy-modal");
  if (!modal) return;
  if (restoreUnsaved && modal.dataset.editMode === "true") {
    const snapshot = JSON.parse(modal.dataset.editSnapshot || "{}");
    restoreOverrides(snapshot);
    cleanupManagerOverrides(state);
    render();
  }
  modal.remove();
}

function appendPopoverForMeasurement(popover, zIndex = 300) {
  popover.style.position = "fixed";
  popover.style.top = "0px";
  popover.style.left = "0px";
  popover.style.transform = "none";
  popover.style.visibility = "hidden";
  popover.style.zIndex = String(zIndex);
  document.body.appendChild(popover);
}

function positionPopover(anchorEl, popover, { gap = 4, edgePadding = 8 } = {}) {
  const anchorRect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const maxLeft = Math.max(edgePadding, window.innerWidth - popRect.width - edgePadding);
  const centeredLeft = anchorRect.left + (anchorRect.width - popRect.width) / 2;
  const left = Math.min(Math.max(centeredLeft, edgePadding), maxLeft);

  const belowTop = anchorRect.bottom + gap;
  const aboveTop = anchorRect.top - popRect.height - gap;
  const maxTop = Math.max(edgePadding, window.innerHeight - popRect.height - edgePadding);

  let top = belowTop;
  if (belowTop + popRect.height > window.innerHeight - edgePadding && aboveTop >= edgePadding) {
    top = aboveTop;
  } else {
    top = Math.min(Math.max(belowTop, edgePadding), maxTop);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = "visible";
}

function openTeamMenu(anchorEl, teamId) {
  document.querySelector(".team-menu-popover")?.remove();

  const team = getTeam(teamId);
  if (!team) return;

  const popover = document.createElement("div");
  popover.className = "team-menu-popover";
  popover.innerHTML = `
    <button class="team-menu-item" type="button" data-menu-action="add-person" data-team-id="${teamId}">
      <i data-lucide="user-plus"></i><span>Add person</span>
    </button>
    <button class="team-menu-item" type="button" data-menu-action="add-team" data-team-id="${teamId}">
      <i data-lucide="users"></i><span>Add team</span>
    </button>
    <div class="team-menu-divider"></div>
    <button class="team-menu-item" type="button" data-menu-action="view-hierarchy" data-team-id="${teamId}">
      <i data-lucide="network"></i><span>View hierarchy</span>
    </button>
    <div class="team-menu-divider"></div>
    <button class="team-menu-item is-danger" type="button" data-menu-action="delete" data-team-id="${teamId}">
      <i data-lucide="trash-2"></i><span>Delete team</span>
    </button>
  `;

  appendPopoverForMeasurement(popover);
  createIcons({ nameAttr: "data-lucide", attrs: { width: 15, height: 15 } });
  positionPopover(anchorEl, popover);

  // Close on outside click
  setTimeout(() => {
    function closePopover(e) {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener("click", closePopover, true);
      }
    }
    document.addEventListener("click", closePopover, true);
  }, 0);

  popover.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu-action]");
    if (!btn) return;
    const action = btn.dataset.menuAction;
    const tid = btn.dataset.teamId;
    popover.remove();
    if (action === "add-person") {
      openAddPersonModal(tid);
    } else if (action === "add-team") {
      addRandomTeamToTeam(tid);
      render();
    } else if (action === "view-hierarchy") {
      openHierarchyModal(tid);
    } else if (action === "delete") {
      deleteTeam(tid);
      render();
    }
  });
}

function openBoardLegend(anchorEl) {
  document.querySelector(".board-legend-popover")?.remove();

  const popover = document.createElement("div");
  popover.className = "board-legend-popover";
  popover.innerHTML = `
    <div class="legend-section">
      <div class="legend-title">Board areas</div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-manager"></span>
        <span>Manager slot</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-members"></span>
        <span>Team members</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-subteams"></span>
        <span>Sub-teams</span>
      </div>
    </div>
    <div class="legend-divider"></div>
    <div class="legend-section">
      <div class="legend-title">Visual cues</div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-requested"></span>
        <span>Dashed card = open position</span>
      </div>
      <div class="legend-item">
        <span class="legend-swatch legend-swatch-ribbon"></span>
        <span>Left ribbon = timezone gap</span>
      </div>
    </div>
    <div class="legend-divider"></div>
    <div class="legend-section">
      <div class="legend-title">Keyboard shortcuts</div>
      <div class="legend-item"><kbd>C</kbd><span>Hold while dragging to copy</span></div>
      <div class="legend-item"><kbd>Esc</kbd><span>Close modal / panel</span></div>
      <div class="legend-item"><kbd>Ctrl</kbd> + <kbd>scroll</kbd><span>Zoom board</span></div>
    </div>
  `;

  appendPopoverForMeasurement(popover);
  createIcons({ nameAttr: "data-lucide", attrs: { width: 15, height: 15 } });
  positionPopover(anchorEl, popover, { gap: 8 });

  setTimeout(() => {
    function closePopover(e) {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener("click", closePopover, true);
      }
    }
    document.addEventListener("click", closePopover, true);
  }, 0);
}

function openTreeOverridePopover(anchorEl, employeeId, teamId) {
  document.querySelector(".tree-override-popover")?.remove();
  const team = getTeam(teamId);
  if (!team) return;
  const isManager = team.manager === employeeId;
  const managers = getValidManagerOverrideCandidates(state, employeeId);
  if (managers.length === 0) return;

  const currentOverride = isManager ? (team.managerOverride ?? null) : (findMemberEntry(employeeId, teamId)?.managerOverride ?? null);

  const items = managers.map((m) => {
    const pillColor = colorForManager(m.id);
    const isTeamMgr = Object.values(state.teams).some((t) => t.manager === m.id);
    const isActive = currentOverride === m.id;
    return `
      <button class="tree-popover-item${isActive ? ' is-active' : ''}" type="button" data-tree-assign="${m.id}">
        <span class="manager-pick-pill" style="background:${pillColor}"></span>
        <span class="manager-pick-name">${escapeHtml(m.name)}</span>
        ${isTeamMgr ? '<span class="manager-pick-tag">team mgr</span>' : ''}
      </button>
    `;
  }).join("");

  const resetBtn = currentOverride
    ? `<button class="tree-popover-item tree-popover-reset" type="button" data-tree-assign="__reset__"><span class="manager-pick-name">Reset to team manager</span></button>`
    : "";

  const popover = document.createElement("div");
  popover.className = "tree-override-popover";
  popover.dataset.employeeId = employeeId;
  popover.dataset.teamId = teamId;
  popover.innerHTML = `
    <div class="tree-popover-list">${items}${resetBtn}</div>
  `;

  appendPopoverForMeasurement(popover);
  positionPopover(anchorEl, popover);

  // Close on outside click (delayed to avoid immediate close)
  setTimeout(() => {
    function closePopover(e) {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener("click", closePopover, true);
      }
    }
    document.addEventListener("click", closePopover, true);
  }, 0);

  popover.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tree-assign]");
    if (!btn) return;
    const assignId = btn.dataset.treeAssign;
    const team = getTeam(teamId);
    if (team?.manager === employeeId) {
      if (assignId === "__reset__") {
        delete team.managerOverride;
      } else {
        team.managerOverride = assignId;
      }
    } else {
      const member = findMemberEntry(employeeId, teamId);
      if (member) {
        if (assignId === "__reset__") {
          delete member.managerOverride;
        } else {
          member.managerOverride = assignId;
        }
      }
    }
    const modal = document.getElementById("hierarchy-modal");
    if (modal && modal.dataset.editMode !== "true") {
      modal.dataset.editMode = "true";
    }
    cleanupManagerOverrides(state);
    popover.remove();
    // Re-render the tree in place
    if (modal) {
      rerenderHierarchyInPlace(modal);
    }
  });
}

export function setupEventListeners() {
  document.addEventListener("click", (event) => {
    /* ── Landing page actions ── */
    const landingBtn = event.target.closest("[data-landing-action]");
    if (landingBtn) {
      const action = landingBtn.dataset.landingAction;
      if (action === "demo") { loadDemoData(); render(); }
      else if (action === "import") openCsvImportModal();
      else if (action === "blank") { loadBlankBoard(); render(); }
      return;
    }

    /* ── Import database / CSV ── */
    if (event.target.closest("#import-db-btn")) {
      openImportDBPicker();
      return;
    }

    if (event.target.closest("#action-bar-import-csv")) {
      openCsvImportModal();
      return;
    }

    /* ── Export DB ── */
    if (event.target.closest("#export-db-btn")) {
      handleExportDB();
      return;
    }

    /* ── Scenario tab close ── */
    if (event.target.closest("[data-close-scenario]")) {
      const btn = event.target.closest("[data-close-scenario]");
      if (closeScenario(btn.dataset.closeScenario)) {
        render();
      }
      return;
    }

    /* ── Scenario tab add ── */
    if (event.target.closest(".scenario-tab-add")) {
      createNewScenario();
      render();
      return;
    }

    /* ── Scenario tab name (click to rename — only on active tab) ── */
    if (event.target.closest(".scenario-tab-name")) {
      const nameEl = event.target.closest(".scenario-tab-name");
      const scenarioId = nameEl.dataset.tabName;
      const entry = scenarios.find((s) => s.id === scenarioId);
      if (!entry) return;

      // If clicking a non-active tab name, switch to it instead of renaming
      if (scenarioId !== activeScenarioId) {
        switchToScenario(scenarioId);
        render();
        return;
      }

      const input = document.createElement("input");
      input.type = "text";
      input.className = "scenario-tab-input";
      input.value = entry.name;
      input.size = Math.max(1, entry.name.length);
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      input.addEventListener("input", () => {
        input.size = Math.max(1, input.value.length);
      });
      const commit = () => {
        const newName = input.value.trim();
        if (newName && newName !== entry.name) {
          renameScenario(scenarioId, newName);
        }
        renderTabs();
      };
      input.addEventListener("blur", commit, { once: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { input.value = entry.name; input.blur(); }
      });
      return;
    }

    /* ── Scenario tab switch ── */
    if (event.target.closest(".scenario-tab")) {
      const tab = event.target.closest(".scenario-tab");
      const scenarioId = tab.dataset.scenarioId;
      if (scenarioId && scenarioId !== activeScenarioId) {
        switchToScenario(scenarioId);
        render();
      }
      return;
    }

    /* ── Manager override modal ── */
    if (event.target.closest(".manager-pick-item")) {
      const item = event.target.closest(".manager-pick-item");
      const modal = document.getElementById("manager-override-modal");
      if (modal) {
        const empId = modal.dataset.employeeId;
        const teamId = modal.dataset.teamId;
        const managerId = item.dataset.managerId;
        const team = getTeam(teamId);
        if (team?.manager === empId) {
          team.managerOverride = managerId;
        } else {
          const member = findMemberEntry(empId, teamId);
          if (member) {
            member.managerOverride = managerId;
          }
        }
        cleanupManagerOverrides(state);
        modal.remove();
        render();
      }
      return;
    }

    if (event.target.closest("#manager-override-cancel") || event.target.id === "manager-override-modal") {
      document.getElementById("manager-override-modal")?.remove();
      return;
    }

    /* ── Hierarchy modal ── */
    if (event.target.closest("#hierarchy-modal-close") || event.target.id === "hierarchy-modal") {
      closeHierarchyModal();
      return;
    }

    if (event.target.closest("[data-action='save-tree-edit']")) {
      const modal = document.getElementById("hierarchy-modal");
      if (modal) {
        modal.dataset.editMode = "false";
        modal.dataset.editSnapshot = JSON.stringify(snapshotOverrides());
        rerenderHierarchyInPlace(modal);
        render();
      }
      return;
    }

    if (event.target.closest("[data-action='cancel-tree-edit']")) {
      const modal = document.getElementById("hierarchy-modal");
      if (modal) {
        const snapshot = JSON.parse(modal.dataset.editSnapshot || "{}");
        restoreOverrides(snapshot);
        cleanupManagerOverrides(state);
        modal.dataset.editMode = "false";
        rerenderHierarchyInPlace(modal);
        render();
      }
      return;
    }

    if (event.target.closest("[data-tree-toggle]")) {
      const toggle = event.target.closest("[data-tree-toggle]");
      const modal = document.getElementById("hierarchy-modal");
      if (!modal) return;
      const key = toggle.dataset.treeToggle;
      const collapsed = new Set(JSON.parse(modal.dataset.collapsedKeys || "[]"));
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      modal.dataset.collapsedKeys = JSON.stringify([...collapsed]);
      rerenderHierarchyInPlace(modal);
      return;
    }

    if (event.target.closest("[data-tree-click]")) {
      const el = event.target.closest("[data-tree-click]");
      const modal = document.getElementById("hierarchy-modal");
      if (!modal) return;
      const empId = el.dataset.employeeId;
      const treeTeamId = el.dataset.treeTeamId;
      openTreeOverridePopover(el, empId, treeTeamId);
      return;
    }

    /* ── Criterion modal ── */
    if (event.target.closest("#criterion-submit")) {
      event.preventDefault();
      const modal = document.getElementById("criterion-modal");
      const isEdit = modal.dataset.mode === "edit";

      if (isEdit) {
        const existingId = modal.dataset.criterionId;
        const existing = globalCriteria.find((c) => c.id === existingId);
        if (existing) {
          const inst = modal.querySelector(".check-instance");
          const type = inst.dataset.type;
          const config = readConfigFromContainer(type, inst);
          const rawName = modal.querySelector('[data-cr="name"]')?.value.trim() ?? "";
          existing.name = rawName || describeCriterion(type, config);
          existing.type = type;
          existing.config = config;
          saveCriterion(existing);
        }
      } else {
        // Batch add — save every instance
        const instances = modal.querySelectorAll(".check-instance");
        instances.forEach((inst) => {
          const type = inst.dataset.type;
          const config = readConfigFromContainer(type, inst);
          const name = describeCriterion(type, config);
          const criterion = { id: generateCriterionId(), name, type, config, enabled: true, pinned: false, sort_order: globalCriteria.length };
          globalCriteria.push(criterion);
          saveCriterion(criterion);
        });
      }
      modal.remove();
      render();
      return;
    }

    if (event.target.closest("#criterion-cancel") || event.target.closest("#criterion-cancel-btn") || event.target.id === "criterion-modal") {
      document.getElementById("criterion-modal")?.remove();
      return;
    }

    /* ── Modal submit ── */
    if (event.target.closest("#add-person-submit")) {
      event.preventDefault();
      const modal = document.getElementById("add-person-modal");
      const name = modal.querySelector("#ap-name").value.trim();
      const role = modal.querySelector("#ap-role").value.trim();
      const location = modal.querySelector("#ap-location").value.trim();
      const timezone = modal.querySelector("#ap-timezone").value;
      const targetTeamId = modal.dataset.teamId || null;

      if (!name) { modal.querySelector("#ap-name").focus(); return; }

      setEmployeeSequence(employeeSequence + 1);
      const employeeId = `p${employeeSequence}`;
      state.employees[employeeId] = { id: employeeId, name, location: location || "Remote", timezone, role: role || "Team Member", notes: modal.querySelector("#ap-notes").value.trim(), requested: modal.querySelector("#ap-requested").checked, level: modal.querySelector("#ap-level").value ? Number(modal.querySelector("#ap-level").value) : null, currentManager: modal.querySelector("#ap-current-manager").value.trim() };

      if (targetTeamId) {
        insertMember(targetTeamId, { id: employeeId });
      } else {
        state.unassignedEmployees.push(employeeId);
      }
      modal.remove();
      render();
      return;
    }

    if (event.target.closest("#delete-all-unassigned-cancel") || event.target.id === "delete-all-unassigned-modal") {
      document.getElementById("delete-all-unassigned-modal")?.remove();
      return;
    }

    if (event.target.closest("#team-stats-close") || event.target.id === "team-stats-modal") {
      document.getElementById("team-stats-modal")?.remove();
      return;
    }

    if (event.target.closest("#delete-all-unassigned-confirm")) {
      document.getElementById("delete-all-unassigned-modal")?.remove();
      deleteAllUnassigned();
      render();
      return;
    }

    if (event.target.closest("#add-person-cancel") || event.target.id === "add-person-modal") {
      document.getElementById("add-person-modal")?.remove();
      return;
    }

    /* ── Edit person modal ── */
    if (event.target.closest("#edit-person-submit")) {
      event.preventDefault();
      const modal = document.getElementById("edit-person-modal");
      const employeeId = modal.dataset.employeeId;
      const employee = state.employees[employeeId];
      if (!employee) { modal.remove(); render(); return; }

      const name = modal.querySelector("#ep-name").value.trim();
      if (!name) { modal.querySelector("#ep-name").focus(); return; }

      employee.name = name;
      employee.role = modal.querySelector("#ep-role").value.trim() || "Team Member";
      employee.location = modal.querySelector("#ep-location").value.trim() || "Remote";
      employee.timezone = modal.querySelector("#ep-timezone").value;
      employee.notes = modal.querySelector("#ep-notes").value.trim();
      employee.requested = modal.querySelector("#ep-requested").checked;
      employee.level = modal.querySelector("#ep-level").value ? Number(modal.querySelector("#ep-level").value) : null;
      employee.currentManager = modal.querySelector("#ep-current-manager").value.trim();
      modal.remove();
      render();
      return;
    }

    if (event.target.closest("#edit-person-cancel") || event.target.id === "edit-person-modal") {
      document.getElementById("edit-person-modal")?.remove();
      return;
    }

    const button = event.target.closest("[data-action]");
    if (button) {
      const { action, id } = button.dataset;
      const teamId = button.dataset.teamId;

      const actions = {
        "delete-employee": () => deleteEmployee(id),
        "delete-team": () => deleteTeam(id),
        "edit-employee": () => { openEditPersonModal(id); return false; },
        "add-team-employee": () => { openAddPersonModal(teamId); return false; },
        "add-root-person": () => { openAddPersonModal(null); return false; },
        "add-root-team": () => addRandomRootTeam(),
        "add-child-team": () => addRandomTeamToTeam(teamId),
        "open-team-menu": () => { openTeamMenu(button, teamId); return false; },
        "open-sort-modal": () => { openSortModal(); return false; },
        "open-team-stats": () => { openTeamStatsModal(teamId); return false; },
        "toggle-collapse": () => toggleTeamLayout(teamId),
        "toggle-root-layout": () => {
          state.rootLayout = oppositeLayout[state.rootLayout];
        },
        "zoom-in": () => {
          setBoardZoom(boardZoom + BOARD_ZOOM_STEP);
          syncBoardZoomUI();
          return false;
        },
        "zoom-out": () => {
          setBoardZoom(boardZoom - BOARD_ZOOM_STEP);
          syncBoardZoomUI();
          return false;
        },
        "zoom-reset": () => {
          setBoardZoom(1);
          syncBoardZoomUI();
          return false;
        },
        "view-hierarchy": () => { openHierarchyModal(teamId); return false; },
        "open-board-legend": () => { openBoardLegend(button); return false; },
        "set-manager-override": () => { openManagerOverrideModal(id, teamId); return false; },
        "reset-manager-override": () => {
          const team = getTeam(teamId);
          if (team?.manager === id) {
            delete team.managerOverride;
          } else {
            const member = findMemberEntry(id, teamId);
            if (member) delete member.managerOverride;
          }
        },
        "toggle-stats-panel": () => {
          state.statsPanelOpen = !state.statsPanelOpen;
          if (state.statsPanelOpen) { state.checksPanelOpen = false; state.notesPanelOpen = false; }
        },
        "toggle-checks-panel": () => {
          state.checksPanelOpen = !state.checksPanelOpen;
          if (state.checksPanelOpen) { state.statsPanelOpen = false; state.notesPanelOpen = false; }
        },
        "switch-to-stats": () => {
          state.statsPanelOpen = true;
          state.checksPanelOpen = false;
          state.notesPanelOpen = false;
        },
        "switch-to-checks": () => {
          state.checksPanelOpen = true;
          state.statsPanelOpen = false;
          state.notesPanelOpen = false;
        },
        "switch-to-notes": () => {
          state.notesPanelOpen = true;
          state.statsPanelOpen = false;
          state.checksPanelOpen = false;
        },
        "close-right-panel": () => {
          state.statsPanelOpen = false;
          state.checksPanelOpen = false;
          state.notesPanelOpen = false;
        },
        "toggle-notes-panel": () => {
          state.notesPanelOpen = !state.notesPanelOpen;
          if (state.notesPanelOpen) { state.statsPanelOpen = false; state.checksPanelOpen = false; }
        },
        "copy-notes": () => {
          navigator.clipboard.writeText(state.notes);
          return false;
        },
        "add-criterion": () => { openCriterionModal(null); return false; },
        "edit-criterion": () => { openCriterionModal(id); return false; },
        "delete-criterion": () => {
          const c = globalCriteria.find((cr) => cr.id === id);
          if (c) {
            deleteCriterion(c.id);
            setGlobalCriteria(globalCriteria.filter((cr) => cr.id !== id));
          }
        },
        "toggle-criterion": () => {
          const c = globalCriteria.find((cr) => cr.id === id);
          if (c) {
            c.enabled = !c.enabled;
            saveCriterion(c);
          }
        },
        "pin-criterion": () => {
          const c = globalCriteria.find((cr) => cr.id === id);
          if (c) {
            c.pinned = !c.pinned;
            saveCriterion(c);
          }
        },
      };

      const handler = actions[action];
      if (handler) {
        const result = handler();
        if (result !== false) render();
      }
      return;
    }

    if (event.target.closest(".team-name-text")) {
      const textEl = event.target.closest(".team-name-text");
      const teamId = textEl.closest(".team").dataset.teamId;
      const team = state.teams[teamId];
      if (!team) return;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "team-name-input";
      input.value = team.name;
      input.size = Math.max(1, team.name.length);
      textEl.replaceWith(input);
      input.focus();
      input.select();
      input.addEventListener("input", () => {
        input.size = Math.max(1, input.value.length);
      });
      const commit = () => {
        const newName = input.value.trim();
        if (newName && newName !== team.name) {
          team.name = newName;
        }
        render();
      };
      input.addEventListener("blur", commit, { once: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { input.value = team.name; input.blur(); }
      });
      return;
    }

    if (event.target.closest(".delete-all-unassigned")) {
      openDeleteAllUnassignedModal();
      return;
    }

    const barHeader = event.target.closest(".unassigned-bar-header");
    if (barHeader) {
      state.unassignedBarCollapsed = !state.unassignedBarCollapsed;
      render();
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const deleteAllModal = document.getElementById("delete-all-unassigned-modal");
      if (deleteAllModal) { deleteAllModal.remove(); return; }
      const teamStatsModal = document.getElementById("team-stats-modal");
      if (teamStatsModal) { teamStatsModal.remove(); return; }
      const hierarchyModal = document.getElementById("hierarchy-modal");
      if (hierarchyModal) { closeHierarchyModal(); return; }
    }

    if (event.key === "c" || event.key === "C") {
      setIsCopyMode(true);
      if (dragState?.sourceElement) {
        dragState.sourceElement.classList.remove("dragging-source");
      }
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "c" || event.key === "C") {
      setIsCopyMode(false);
      if (dragState?.sourceElement) {
        dragState.sourceElement.classList.add("dragging-source");
      }
    }
  });

  window.addEventListener("blur", () => {
    setIsCopyMode(false);
  });

  document.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const shell = event.target instanceof Element
      ? event.target.closest(".page-shell")
      : null;
    if (!shell) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? BOARD_ZOOM_STEP : -BOARD_ZOOM_STEP;
    setBoardZoom(boardZoom + delta);
    syncBoardZoomUI();
  }, { passive: false });
}
