import { calculateSlotSize } from "./packing.mjs";
import { escapeHtml, hashString, colorForManager, colorForTimezone, pickRandomItem, initializeSequence, timezoneColors, managerPillPalette } from './utils.mjs';
import { isTeamInside, normalizeInsertIndex, cleanupManagerOverrides, countDirectEmployees, countNestedTeams, countTeamMemberships, collectAllEmployeesInTeam, buildHierarchyTree, computeTeamStats, computeGlobalStats, computeManagerChanges } from './team-logic.mjs';
import { initDB, listScenarios, loadScenario, saveScenario, deleteScenario, getMeta, setMeta, exportDB, listCriteria, saveCriterion, deleteCriterion } from './db.mjs';
import {
  state, setState, dragState, setDragState, dropPreview, setDropPreview,
  dragImageProxy, setDragImageProxy, employeeSequence, setEmployeeSequence,
  teamSequence, setTeamSequence, isCopyMode, setIsCopyMode,
  scenarios, setScenarios, activeScenarioId, setActiveScenarioId,
  scenarioSequence, setScenarioSequence, showLanding, setShowLanding,
  createInitialState, createBlankState, getTeam, getAllManagers, findMemberEntry,
  layoutLabels, childLayoutModes, oppositeLayout, layoutIcons,
  randomTeamColors, randomTeamNames,
} from './state.mjs';
import { evaluateAllChecks, describeCriterion, checkTypes } from './checks.mjs';

let globalCriteria = [];        // Loaded from criteria table on init
let lastCheckResults = null;    // Cache of evaluateAllChecks() output

function generateScenarioId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nextScenarioName() {
  setScenarioSequence(scenarioSequence + 1);
  return `Scenario ${scenarioSequence}`;
}

function debouncedSave() {
  if (activeScenarioId) {
    const entry = scenarios.find((s) => s.id === activeScenarioId);
    if (entry) {
      saveScenario(activeScenarioId, entry.name, state);
      setMeta("activeScenarioId", activeScenarioId);
    }
  }
}

function switchToScenario(id) {
  // Save current scenario before switching
  if (activeScenarioId) {
    const current = scenarios.find((s) => s.id === activeScenarioId);
    if (current) saveScenario(activeScenarioId, current.name, state);
  }

  const loaded = loadScenario(id);
  if (!loaded) return;

  setState(loaded);
  setActiveScenarioId(id);
  setShowLanding(!state.initialized);
  setDragState(null);
  setDropPreview(null);
  setDragImageProxy(null);
  setIsCopyMode(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  setMeta("activeScenarioId", id);
  render();
}

function createNewScenario() {
  const id = generateScenarioId();
  const name = nextScenarioName();
  const newState = createBlankState();

  // Save current before switching
  if (activeScenarioId) {
    const current = scenarios.find((s) => s.id === activeScenarioId);
    if (current) saveScenario(activeScenarioId, current.name, state);
  }

  scenarios.push({ id, name });
  saveScenario(id, name, newState);

  setState(newState);
  setActiveScenarioId(id);
  setDragState(null);
  setDropPreview(null);
  setDragImageProxy(null);
  setIsCopyMode(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  setMeta("activeScenarioId", id);
  setShowLanding(true);
  render();
}

function loadDemoData() {
  setState(createInitialState());
  state.initialized = true;
  setShowLanding(false);
  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));
  render();
}

function loadBlankBoard() {
  state.initialized = true;
  setShowLanding(false);
  render();
}

// ─── CSV parsing ───

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      if (text[i] === '"') {
        i++;
        let field = "";
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
        row.push(field);
      } else {
        let field = "";
        while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          field += text[i];
          i++;
        }
        row.push(field);
      }
      if (i < len && text[i] === ",") {
        i++;
      } else {
        break;
      }
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
      rows.push(row);
    }
  }
  return rows;
}

function autoMapColumns(headers) {
  const fieldAliases = {
    name: ["name", "full name", "fullname", "employee", "person", "member"],
    role: ["role", "title", "job title", "jobtitle", "position"],
    location: ["location", "city", "office", "site"],
    timezone: ["timezone", "time zone", "tz"],
    notes: ["notes", "note", "comments", "comment"],
    level: ["level", "grade", "ic level", "iclevel"],
    manager: ["manager", "reports to", "reportsto", "supervisor", "boss", "current manager", "original manager"],
    team: ["team", "group", "department", "dept", "org"],
  };

  const mapping = {};
  for (const [field, aliases] of Object.entries(fieldAliases)) {
    const idx = headers.findIndex((h) =>
      aliases.some((a) => h.toLowerCase().trim() === a)
    );
    if (idx !== -1) mapping[field] = idx;
  }
  return mapping;
}

function loadCsvData(rows, headers, mapping, loadMode) {
  const dataRows = rows.slice(1);

  const getValue = (row, field) => {
    const idx = mapping[field];
    return idx !== undefined && idx < row.length ? row[idx].trim() : "";
  };

  // Create people from CSV rows
  const newPeople = [];
  for (const row of dataRows) {
    const name = getValue(row, "name");
    if (!name) continue;

    setEmployeeSequence(employeeSequence + 1);
    const id = `p${employeeSequence}`;
    state.employees[id] = {
      id,
      name,
      role: getValue(row, "role") || "Team Member",
      location: getValue(row, "location") || "Remote",
      timezone: getValue(row, "timezone") || "GMT (UTC+0)",
      notes: getValue(row, "notes") || "",
      requested: false,
      level: getValue(row, "level") ? Number(getValue(row, "level")) || null : null,
      currentManager: getValue(row, "manager") || "",
    };
    newPeople.push({
      id,
      manager: getValue(row, "manager"),
      team: getValue(row, "team"),
    });
  }

  if (loadMode === "unassigned") {
    for (const p of newPeople) {
      state.unassignedEmployees.push(p.id);
    }
  } else if (loadMode === "team-hierarchy") {
    // Group people by team column
    const teamGroups = new Map();
    const noTeam = [];
    for (const p of newPeople) {
      if (p.team) {
        if (!teamGroups.has(p.team)) teamGroups.set(p.team, []);
        teamGroups.get(p.team).push(p);
      } else {
        noTeam.push(p);
      }
    }

    // Create teams
    for (const [teamName, members] of teamGroups) {
      setTeamSequence(teamSequence + 1);
      const teamId = `t${teamSequence}`;
      // Check if any member is a manager for others in this team
      const memberNames = new Set(members.map((m) => state.employees[m.id].name));
      let managerId = null;
      for (const m of members) {
        if (m.manager && !memberNames.has(m.manager)) {
          // This member's manager is outside the team — not a team manager
        }
        // If someone else in this team lists this person as their manager
        const isManager = members.some(
          (other) => other.id !== m.id && other.manager === state.employees[m.id].name
        );
        if (isManager && !managerId) {
          managerId = m.id;
        }
      }

      const teamMembers = members
        .filter((m) => m.id !== managerId)
        .map((m) => ({ type: "employee", id: m.id }));

      state.teams[teamId] = {
        id: teamId,
        name: teamName,
        ownLayout: "expanded",
        manager: managerId,
        members: teamMembers,
        childLayout: "horizontal",
        color: pickRandomItem(randomTeamColors),
      };
      state.rootTeams.push(teamId);
    }

    for (const p of noTeam) {
      state.unassignedEmployees.push(p.id);
    }
  } else if (loadMode === "people-hierarchy") {
    // Build teams from manager relationships
    const byName = new Map();
    for (const p of newPeople) {
      byName.set(state.employees[p.id].name, p);
    }

    // Find people who are managers (others report to them)
    const managedBy = new Map(); // managerName -> [person]
    const hasManager = new Set();
    for (const p of newPeople) {
      if (p.manager && byName.has(p.manager)) {
        if (!managedBy.has(p.manager)) managedBy.set(p.manager, []);
        managedBy.get(p.manager).push(p);
        hasManager.add(p.id);
      }
    }

    // Create a team for each manager
    for (const [managerName, reports] of managedBy) {
      const managerPerson = byName.get(managerName);
      if (!managerPerson) continue;

      setTeamSequence(teamSequence + 1);
      const teamId = `t${teamSequence}`;
      const teamMembers = reports.map((r) => ({ type: "employee", id: r.id }));

      state.teams[teamId] = {
        id: teamId,
        name: `${managerName}'s Team`,
        ownLayout: "expanded",
        manager: managerPerson.id,
        members: teamMembers,
        childLayout: "horizontal",
        color: pickRandomItem(randomTeamColors),
      };
      state.rootTeams.push(teamId);
    }

    // Anyone not in a team and not a manager goes to unassigned
    for (const p of newPeople) {
      const isInTeam = Object.values(state.teams).some(
        (t) => t.manager === p.id || t.members.some((m) => m.id === p.id)
      );
      if (!isInTeam) {
        state.unassignedEmployees.push(p.id);
      }
    }
  }

  state.initialized = true;
  setShowLanding(false);
  render();
}

// ─── Landing page ───

function renderLandingPage() {
  return `
    <div class="landing-page">
      <div class="landing-content">
        <svg class="landing-logo" viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="14" fill="var(--accent)"/><rect x="14" y="14" width="14" height="14" fill="#fff"/><rect x="36" y="14" width="14" height="14" fill="#fff"/><rect x="25" y="36" width="14" height="14" fill="#fff"/></svg>
        <h1 class="landing-title">Welcome to TeamBoard</h1>
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

// ─── CSV import modal ───

function openCsvImportModal(existingScenario = false) {
  document.getElementById("csv-import-modal")?.remove();

  const modal = document.createElement("div");
  modal.id = "csv-import-modal";
  modal.className = "modal-overlay modal-overlay-fullscreen";
  modal.dataset.existing = existingScenario ? "true" : "false";
  modal.innerHTML = `
    <div class="modal-panel modal-panel-fullscreen csv-import-panel">
      <div class="modal-fullscreen-header">
        <h3 class="modal-title">Import from CSV</h3>
        <button id="csv-import-cancel-x" class="team-control-button" type="button" title="Close" aria-label="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="csv-import-body">
        <div class="csv-step" data-csv-step="file">
          <label class="csv-file-label">
            <i data-lucide="file-up"></i>
            <span>Choose a CSV file</span>
            <input type="file" id="csv-file-input" accept=".csv,text/csv" hidden />
          </label>
          <div id="csv-preview-area" class="csv-preview-area" hidden></div>
        </div>
        <div id="csv-mapping-step" class="csv-step" data-csv-step="mapping" hidden>
          <p class="csv-step-label">Map CSV columns to TeamBoard fields</p>
          <div id="csv-mapping-fields"></div>
        </div>
        <div id="csv-mode-step" class="csv-step" data-csv-step="mode" hidden>
          <p class="csv-step-label">How should people be loaded?</p>
          <label class="csv-mode-option">
            <input type="radio" name="csv-load-mode" value="team-hierarchy" checked />
            <span>
              <strong>Team hierarchy</strong>
              <small>Create teams from the "team" column; assign managers where possible</small>
            </span>
          </label>
          <label class="csv-mode-option">
            <input type="radio" name="csv-load-mode" value="people-hierarchy" />
            <span>
              <strong>People hierarchy</strong>
              <small>Build teams from the "manager" column — each manager gets a team</small>
            </span>
          </label>
          <label class="csv-mode-option">
            <input type="radio" name="csv-load-mode" value="unassigned" />
            <span>
              <strong>Unassigned bar</strong>
              <small>Load everyone into the unassigned tray — no teams created</small>
            </span>
          </label>
        </div>
      </div>
      <div class="modal-fullscreen-footer">
        <button id="csv-import-back" class="toolbar-button" type="button" hidden>Back</button>
        <button id="csv-import-cancel" class="toolbar-button" type="button">Cancel</button>
        <button id="csv-import-next" class="toolbar-button modal-submit" type="button" disabled>Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  lucide.createIcons({ nodes: modal.querySelectorAll("i[data-lucide]") });

  // State for the wizard
  let csvRows = null;
  let csvHeaders = null;
  let columnMapping = {};
  let currentStep = "file"; // file → mapping → mode

  const fileInput = modal.querySelector("#csv-file-input");
  const previewArea = modal.querySelector("#csv-preview-area");
  const mappingStep = modal.querySelector("#csv-mapping-step");
  const modeStep = modal.querySelector("#csv-mode-step");
  const nextBtn = modal.querySelector("#csv-import-next");
  const backBtn = modal.querySelector("#csv-import-back");

  // If importing into existing scenario, force unassigned mode
  if (existingScenario) {
    modeStep.querySelectorAll("input[name='csv-load-mode']").forEach((r) => {
      r.checked = r.value === "unassigned";
      if (r.value !== "unassigned") r.closest(".csv-mode-option").style.display = "none";
    });
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      csvRows = parseCSV(reader.result);
      if (csvRows.length < 2) {
        previewArea.innerHTML = '<p class="csv-error">CSV must have a header row and at least one data row.</p>';
        previewArea.hidden = false;
        nextBtn.disabled = true;
        return;
      }
      csvHeaders = csvRows[0];
      columnMapping = autoMapColumns(csvHeaders);

      // Show preview
      const previewRows = csvRows.slice(0, 6); // header + 5 data rows
      previewArea.innerHTML = `
        <p class="csv-file-name"><i data-lucide="file-text"></i> ${escapeHtml(file.name)} — ${csvRows.length - 1} rows</p>
        <div class="csv-preview-scroll">
          <table class="csv-preview-table">
            <thead><tr>${csvHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${previewRows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      `;
      previewArea.hidden = false;
      nextBtn.disabled = false;
      modal.querySelector(".csv-file-label span").textContent = file.name;
      lucide.createIcons({ nodes: previewArea.querySelectorAll("i[data-lucide]") });
    };
    reader.readAsText(file);
  });

  function renderMappingFields() {
    const fields = [
      { key: "name", label: "Name", required: true },
      { key: "role", label: "Role" },
      { key: "location", label: "Location" },
      { key: "timezone", label: "Timezone" },
      { key: "notes", label: "Notes" },
      { key: "manager", label: "Manager" },
      { key: "team", label: "Team" },
    ];

    const container = modal.querySelector("#csv-mapping-fields");
    container.innerHTML = fields.map((f) => {
      const options = ['<option value="">(skip)</option>']
        .concat(csvHeaders.map((h, i) =>
          `<option value="${i}"${columnMapping[f.key] === i ? " selected" : ""}>${escapeHtml(h)}</option>`
        ));
      return `
        <label class="csv-mapping-row">
          <span class="csv-mapping-label">${f.label}${f.required ? ' <em>*</em>' : ''}</span>
          <select class="modal-input csv-mapping-select" data-field="${f.key}">${options.join("")}</select>
        </label>
      `;
    }).join("");

    container.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const field = sel.dataset.field;
        const val = sel.value;
        if (val === "") {
          delete columnMapping[field];
        } else {
          columnMapping[field] = Number(val);
        }
        nextBtn.disabled = !("name" in columnMapping);
      });
    });
  }

  function goToStep(step) {
    currentStep = step;
    modal.querySelector('[data-csv-step="file"]').hidden = step !== "file";
    mappingStep.hidden = step !== "mapping";
    modeStep.hidden = step !== "mode";
    backBtn.hidden = step === "file";
    nextBtn.textContent = step === "mode" ? "Import" : "Next";
    if (step === "mapping") {
      renderMappingFields();
      nextBtn.disabled = !("name" in columnMapping);
    } else if (step === "mode") {
      nextBtn.disabled = false;
    }
  }

  nextBtn.addEventListener("click", () => {
    if (currentStep === "file") {
      goToStep("mapping");
    } else if (currentStep === "mapping") {
      if (existingScenario) {
        // Skip mode step — always unassigned for existing
        loadCsvData(csvRows, csvHeaders, columnMapping, "unassigned");
        modal.remove();
      } else {
        goToStep("mode");
      }
    } else if (currentStep === "mode") {
      const mode = modal.querySelector("input[name='csv-load-mode']:checked").value;
      loadCsvData(csvRows, csvHeaders, columnMapping, mode);
      modal.remove();
    }
  });

  backBtn.addEventListener("click", () => {
    if (currentStep === "mapping") goToStep("file");
    else if (currentStep === "mode") goToStep("mapping");
  });

  modal.querySelector("#csv-import-cancel").addEventListener("click", () => modal.remove());
  modal.querySelector("#csv-import-cancel-x").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}

function closeScenario(id) {
  if (scenarios.length <= 1) return; // Can't close last tab
  if (!confirm("Close this scenario? It will be permanently deleted.")) return;

  deleteScenario(id);
  setScenarios(scenarios.filter((s) => s.id !== id));

  if (activeScenarioId === id) {
    // Switch to nearest tab
    const newActive = scenarios[scenarios.length - 1];
    switchToScenario(newActive.id);
  } else {
    renderTabs();
  }
}

function renameScenario(id, newName) {
  const entry = scenarios.find((s) => s.id === id);
  if (!entry) return;
  entry.name = newName;
  if (id === activeScenarioId) {
    saveScenario(id, newName, state);
  } else {
    const loaded = loadScenario(id);
    if (loaded) saveScenario(id, newName, loaded);
  }
  renderTabs();
}

function handleExportDB() {
  const data = exportDB();
  if (!data) return;
  const blob = new Blob([data], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "teamboard.db";
  a.click();
  URL.revokeObjectURL(url);
}

const app = document.getElementById("app");

function addRandomRootTeam() {
  setTeamSequence(teamSequence + 1);
  const teamId = `t${teamSequence}`;
  state.teams[teamId] = {
    id: teamId,
    name: pickRandomItem(randomTeamNames),
    ownLayout: "expanded",
    manager: null,
    members: [],
    childLayout: pickRandomItem(childLayoutModes),
    color: pickRandomItem(randomTeamColors),
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

function removeEmployeeFromCurrentLocation(employeeId) {
  state.unassignedEmployees = state.unassignedEmployees.filter((id) => id !== employeeId);

  // Preserve managerOverride when moving between teams
  let preservedOverride = null;
  for (const team of Object.values(state.teams)) {
    if (team.manager === employeeId && team.managerOverride) {
      preservedOverride = team.managerOverride;
    }
    const member = team.members.find((m) => m.type === "employee" && m.id === employeeId);
    if (member?.managerOverride) {
      preservedOverride = member.managerOverride;
    }
  }

  for (const team of Object.values(state.teams)) {
    if (team.manager === employeeId) {
      team.manager = null;
      delete team.managerOverride;
    }
    team.members = team.members.filter(
      (member) => !(member.type === "employee" && member.id === employeeId),
    );
  }

  // Stash preserved override so moveEmployeeToTeam can pick it up
  if (preservedOverride) {
    removeEmployeeFromCurrentLocation._preservedOverride = preservedOverride;
  } else {
    delete removeEmployeeFromCurrentLocation._preservedOverride;
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
    // Restore preserved override for the manager
    if (removeEmployeeFromCurrentLocation._preservedOverride) {
      team.managerOverride = removeEmployeeFromCurrentLocation._preservedOverride;
      delete removeEmployeeFromCurrentLocation._preservedOverride;
    }
    cleanupManagerOverrides(state);
    return true;
  }

  const entry = { type: "employee", id: employeeId };
  // Restore preserved override from move
  if (removeEmployeeFromCurrentLocation._preservedOverride) {
    entry.managerOverride = removeEmployeeFromCurrentLocation._preservedOverride;
    delete removeEmployeeFromCurrentLocation._preservedOverride;
  }
  insertMember(teamId, entry, adjustedInsertIndex);
  cleanupManagerOverrides(state);
  return true;
}

function moveEmployeeToRoster(employeeId) {
  removeEmployeeFromCurrentLocation(employeeId);
  if (!state.unassignedEmployees.includes(employeeId)) {
    state.unassignedEmployees.push(employeeId);
  }
}

function moveTeamToTarget(teamId, targetTeamId, insertIndex) {
  if (targetTeamId && (teamId === targetTeamId || isTeamInside(state.teams, teamId, targetTeamId))) {
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
  setEmployeeSequence(employeeSequence + 1);
  const newId = `p${employeeSequence}`;
  state.employees[newId] = { ...original, id: newId };
  return newId;
}

function deepCopyTeam(teamId) {
  const original = getTeam(teamId);
  if (!original) return null;
  setTeamSequence(teamSequence + 1);
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
  cleanupManagerOverrides(state);
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

function toggleChildLayout(teamId) {
  const team = getTeam(teamId);
  team.childLayout = team.childLayout === "horizontal" ? "vertical" : "horizontal";
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
    return dropKind === "members" && dragState.id !== teamId && !isTeamInside(state.teams, dragState.id, teamId);
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

function renderRootLayoutButton() {
  return `
    <button
      class="team-control-button"
      type="button"
      title="Switch to ${layoutLabels[oppositeLayout[state.rootLayout]].toLowerCase()} layout"
      aria-label="Switch to ${layoutLabels[oppositeLayout[state.rootLayout]].toLowerCase()} layout"
      data-action="toggle-root-layout"
    >${layoutIcons[state.rootLayout]}</button>
  `;
}

function renderCreateButtons(teamId) {
  return `
    <button class="team-control-button" type="button" data-action="add-team-employee" data-team-id="${teamId}" title="Add person" aria-label="Add person"><i data-lucide="user-plus"></i></button>
    <button class="team-control-button" type="button" data-action="add-child-team" data-team-id="${teamId}" title="Add team" aria-label="Add team"><i data-lucide="users"></i></button>
  `;
}

function renderChildLayoutButton(team) {
  return `
    <button
      class="team-control-button"
      type="button"
      title="Switch to ${layoutLabels[oppositeLayout[team.childLayout]].toLowerCase()} layout"
      aria-label="Switch to ${layoutLabels[oppositeLayout[team.childLayout]].toLowerCase()} layout"
      data-action="toggle-child-layout"
      data-team-id="${team.id}"
    >${layoutIcons[team.childLayout]}</button>
  `;
}

function renderFacepile(team) {
  if (team.members.length === 0) {
    return '<span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop members here"></span></span>';
  }
  const maxDots = 7;
  const overflow = team.members.length - maxDots;
  const visible = overflow > 0 ? team.members.slice(0, maxDots) : team.members;

  const dots = visible
    .map((member) => {
      if (member.type === "employee") {
        const emp = state.employees[member.id];
        const color = emp ? colorForTimezone(emp.timezone) : "rgba(200, 200, 200, 0.5)";
        const tip = emp ? `${emp.name} \u2014 ${emp.role}\n${emp.location}\n${emp.timezone}` : "";
        return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
      }
      const nested = getTeam(member.id);
      const color = nested?.color ?? "rgba(200, 200, 200, 0.5)";
      const memberCount = nested ? countDirectEmployees(getTeam(member.id)) : 0;
      const tip = nested ? `${nested.name} team (${memberCount} people)` : "";
      return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
    })
    .join("");

  const overflowDot = overflow > 0
    ? `<span class="facepile-dot facepile-overflow">+${overflow}</span>`
    : "";

  return `<span class="member-facepile" aria-hidden="true">${dots}${overflowDot}</span>`;
}

function renderCollapsedManager(team) {
  if (!team.manager) {
    return '<span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop a manager here"></span></span>';
  }
  const emp = state.employees[team.manager];
  const color = emp ? colorForTimezone(emp.timezone) : "rgba(200, 200, 200, 0.5)";
  const tip = emp ? `${emp.name} \u2014 ${emp.role}\n${emp.location}\n${emp.timezone}` : "";
  return `<span class="member-facepile" aria-hidden="true"><span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span></span>`;
}

function renderEmployeeCard(employeeId, contextTeamId) {
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
        overridePill = `<span class="manager-override-pill" style="background:${pillColor}" title="Manager override: ${escapeHtml(overrideMgr.name)}"><i data-lucide="briefcase-business"></i>${escapeHtml(overrideMgr.name)}</span>`;
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

  const currentManagerHtml = employee.currentManager ? `<div class="person-current-manager" title="Current manager: ${escapeHtml(employee.currentManager)}"><i data-lucide="user-check"></i>${escapeHtml(employee.currentManager)}</div>` : "";

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
      <div class="person-role">${escapeHtml(employee.role)}${employee.level != null ? `<span class="person-level">L${employee.level}</span>` : ""}</div>
      <div class="person-location">${escapeHtml(employee.location)}</div>
      <div class="person-timezone">${escapeHtml(employee.timezone)}</div>
      ${currentManagerHtml}
      ${notesHtml}
    </article>
  `;
}

function renderMembers(team) {
  if (team.members.length === 0) {
    return '<p class="empty-note">Drop people or teams here</p>';
  }

  return team.members
    .map((member, index) => {
      let content = "";

      if (member.type === "employee") {
        content = renderEmployeeCard(member.id, team.id);
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
  const caption = `${countDirectEmployees(team)} people, ${countNestedTeams(team)} nested teams`;
  const isCollapsed = teamView === "collapsed";
  const chevronClass = isCollapsed ? "" : " is-expanded";

  return `
    <section class="team" data-team-id="${team.id}" data-view="${teamView}" style="--team-accent:${team.color}">
      <div class="team-titlebar" data-team-id="${team.id}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(team.name)}">
        <div class="team-handle" draggable="true" data-drag-kind="team" data-id="${team.id}" title="Drag team"><i data-lucide="grip-vertical"></i></div>
        <div class="team-titleblock">
          <div class="team-name-row">
            <h2 class="team-name"><span class="team-name-text">${escapeHtml(team.name)}</span></h2>
            <button class="team-control-button team-chevron${chevronClass}" type="button" data-action="toggle-collapse" data-team-id="${team.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'}"><i data-lucide="chevron-right"></i></button>
            <div class="team-title-actions">
              ${renderChildLayoutButton(team)}
              ${renderCreateButtons(team.id)}
              <button class="team-control-button team-delete-button" type="button" data-action="delete-team" data-id="${team.id}" title="Delete team" aria-label="Delete team"><i data-lucide="x"></i></button>
            </div>
          </div>
          <p class="team-caption">${caption}</p>
        </div>
      </div>

      <div class="team-body ${bodyLayout}" data-layout="${bodyLayout}">
        <div class="slot manager-slot dropzone" data-drop-kind="manager" data-team-id="${team.id}">
          ${isCollapsed ? renderCollapsedManager(team) : (team.manager ? renderEmployeeCard(team.manager, team.id) : '<p class="empty-note">Drop a manager here</p>')}
        </div>
        <div class="slot member-slot dropzone layout-${team.childLayout}" data-drop-kind="members" data-team-id="${team.id}">
          ${isCollapsed ? renderFacepile(team) : renderMembers(team)}
        </div>
      </div>
    </section>
  `;
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
  lucide.createIcons({ attrs: { class: ["lucide"] } });
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
  lucide.createIcons({ attrs: { class: ["lucide"] } });

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

/* ── Hierarchy tree ── */

function renderHierarchyNode(node, editMode) {
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

function openHierarchyModal(teamId) {
  document.getElementById("hierarchy-modal")?.remove();

  let trees;
  if (teamId) {
    const tree = buildHierarchyTree(state, teamId);
    if (!tree) return;
    trees = [tree];
  } else {
    trees = state.rootTeams.map((id) => buildHierarchyTree(state, id)).filter(Boolean);
    if (trees.length === 0) return;
  }

  const modal = document.createElement("div");
  modal.id = "hierarchy-modal";
  modal.className = "modal-overlay";
  if (teamId) modal.dataset.teamId = teamId;
  modal.dataset.editMode = "false";

  function renderModalContent(editMode) {
    const treeHtml = trees.map((t) => renderHierarchyNode(t, editMode)).join("");
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
    lucide.createIcons();
  }

  renderModalContent(false);
  document.body.appendChild(modal);
}

openHierarchyModal.__rerenderInPlace = function (modal) {
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
  lucide.createIcons();
};

function openTreeOverridePopover(anchorEl, employeeId, teamId) {
  document.querySelector(".tree-override-popover")?.remove();
  const team = getTeam(teamId);
  if (!team) return;
  const isManager = team.manager === employeeId;
  const managers = getAllManagers().filter((m) => m.id !== employeeId && (isManager || m.id !== team.manager));
  if (managers.length === 0) return;

  const currentOverride = isManager ? (team.managerOverride ?? null) : (findMemberEntry(employeeId, teamId)?.managerOverride ?? null);

  const items = managers.map((m) => {
    const pillColor = colorForManager(m.id);
    const isTeamMgr = team.manager === m.id;
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

  // Position relative to anchor
  const rect = anchorEl.getBoundingClientRect();
  popover.style.position = "fixed";
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${rect.left + rect.width / 2}px`;
  popover.style.transform = "translateX(-50%)";
  popover.style.zIndex = "300";

  document.body.appendChild(popover);

  // Reposition if off-screen
  const popRect = popover.getBoundingClientRect();
  if (popRect.right > window.innerWidth - 8) {
    popover.style.left = `${window.innerWidth - popRect.width - 8}px`;
    popover.style.transform = "none";
  }
  if (popRect.left < 8) {
    popover.style.left = "8px";
    popover.style.transform = "none";
  }

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
    cleanupManagerOverrides(state);
    popover.remove();
    // Re-render the tree in place
    const modal = document.getElementById("hierarchy-modal");
    if (modal) {
      openHierarchyModal.__rerenderInPlace(modal);
    }
    render();
  });
}

/* ── Stats panel helpers ── */

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
    <div class="stats-section">
      <div class="stats-team-header">
        <span class="stats-team-dot" style="background:${stats.color}"></span>
        <span class="stats-team-name">${escapeHtml(stats.name)}</span>
        <span class="stats-team-count">${stats.totalPeople}</span>
      </div>
      ${roleRows}
      ${tzHtml}
      ${nestedHtml}
    </div>
  `;
}

function renderManagerChangesSection() {
  const { changes, unchanged, noOriginal, tracked } = computeManagerChanges(state);
  if (tracked === 0 && noOriginal.length === 0) return "";

  const pct = tracked > 0 ? Math.round((changes.length / tracked) * 100) : 0;
  const summaryClass = changes.length > 0 ? "has-changes" : "no-changes";

  const changeRows = changes.map((c) => {
    const to = c.to ?? "unassigned";
    return `<div class="stats-row manager-change-row">
      <span class="stats-row-label">${escapeHtml(c.employee.name)}</span>
      <span class="stats-row-value manager-change-detail">${escapeHtml(c.from)} → ${escapeHtml(to)}</span>
    </div>`;
  }).join("");

  return `
    <div class="stats-section">
      <h3 class="stats-section-title">Manager changes</h3>
      <div class="stats-row ${summaryClass}"><span class="stats-row-label">Changed</span><span class="stats-row-value">${changes.length} of ${tracked} (${pct}%)</span></div>
      <div class="stats-row"><span class="stats-row-label">Unchanged</span><span class="stats-row-value">${unchanged.length}</span></div>
      ${noOriginal.length > 0 ? `<div class="stats-row"><span class="stats-row-label">No original manager</span><span class="stats-row-value">${noOriginal.length}</span></div>` : ""}
      ${changeRows}
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
    // Re-evaluate checks for badge count
    lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
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
      <div class="stats-section">
        <h3 class="stats-section-title">People by role</h3>
        ${globalRoleRows}
      </div>
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

function renderChecksPanelContent(panel) {
  lastCheckResults = evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
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
          <div class="check-card-actions">
            <button class="team-control-button" type="button" data-action="toggle-criterion" data-id="${criterion.id}" title="${criterion.enabled ? "Disable" : "Enable"}" aria-label="${criterion.enabled ? "Disable" : "Enable"}">
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

function syncShellHeight() {
  const drawer = document.getElementById("unassigned-drawer");
  const drawerH = drawer ? drawer.getBoundingClientRect().height : 52;
  document.querySelector(".page-shell").style.height = `calc(100vh - 52px - ${Math.ceil(drawerH)}px)`;
}

function renderTabs() {
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

  lucide.createIcons({ nodes: container.querySelectorAll("i[data-lucide]") });
}

function render() {
  if (showLanding) {
    app.innerHTML = renderLandingPage();

    // Hide unassigned drawer
    const drawer = document.getElementById("unassigned-drawer");
    if (drawer) drawer.style.display = "none";

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
    lucide.createIcons();
    debouncedSave();
    return;
  }

  // Ensure drawer is visible after leaving landing page
  const existingDrawer = document.getElementById("unassigned-drawer");
  if (existingDrawer) existingDrawer.style.display = "";

  // Clear any inline overrides from landing page
  const shell = document.querySelector(".page-shell");
  if (shell) {
    shell.style.marginRight = "";
    shell.style.marginLeft = "";
    shell.style.height = "";
  }

  const rootArrangement = state.rootLayout === "vertical" ? "vertical" : "horizontal";
  const barCollapsed = state.unassignedBarCollapsed;
  const barChevronClass = barCollapsed ? "" : " is-expanded";
  const unassignedCount = state.unassignedEmployees.length;

  app.innerHTML = `
    <div class="root-dropzone dropzone" data-drop-kind="root" data-layout="${rootArrangement}">
      ${state.rootTeams.length > 0 ? state.rootTeams.map((teamId) => renderTeam(teamId)).join("") : '<p class="empty-note">Drop a team here.</p>'}
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
  lucide.createIcons();
  applyMemberSlotPacking();
  syncShellHeight();

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

function applyMemberSlotPacking() {
  const slots = [...document.querySelectorAll('.member-slot')].sort(
    (left, right) => left.querySelectorAll('.member-slot').length - right.querySelectorAll('.member-slot').length,
  );

  slots.forEach((slot) => {
    const entries = [...slot.querySelectorAll(':scope > .member-entry:not(.dragging-source)')];
    if (entries.length === 0) {
      return;
    }

    slot.style.width = '';
    slot.style.height = '';

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
  setDragImageProxy(null);
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
  setDragImageProxy(proxy);

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

function createDropPreview(dropzone) {
  const preview = document.createElement("div");
  const isCollapsed = dropzone?.closest('.team[data-view="collapsed"]');
  if (isCollapsed) {
    preview.className = "facepile-dot drag-preview-dot";
    preview.setAttribute("aria-hidden", "true");
    return preview;
  }
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
  setDropPreview(null);

  if (previewParent?.classList.contains("member-slot")) {
    applyMemberSlotPacking();
  }
}

function updateDropPreview(dropzone, event) {
  if (!dragState || dropzone.dataset.dropKind !== "members") {
    removeDropPreview();
    return;
  }

  const isCollapsed = !!dropzone.closest('.team[data-view="collapsed"]');
  const currentIsCollapsed = dropPreview?.classList.contains("drag-preview-dot");
  if (dropPreview && isCollapsed !== !!currentIsCollapsed) {
    removeDropPreview();
  }

  if (!dropPreview) {
    setDropPreview(createDropPreview(dropzone));
  }

  if (isCollapsed) {
    const facepile = dropzone.querySelector(".member-facepile");
    if (facepile && dropPreview.parentElement !== facepile) {
      facepile.appendChild(dropPreview);
    }
    return;
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

  // Only use a .member-entry as the source element when it lives inside the
  // same slot (manager-slot / member-slot / roster-cards) as the draggable.
  // Without this check, dragging a manager out of a *nested* child team would
  // find the outer .member-entry that wraps the entire child team, causing the
  // whole team to disappear while dragging.
  const closestMemberEntry = draggable.closest(".member-entry");
  const closestSlot = draggable.closest(".manager-slot, .member-slot, .roster-cards");
  const memberEntryInSameSlot =
    closestMemberEntry && closestSlot?.contains(closestMemberEntry)
      ? closestMemberEntry
      : null;

  const sourceElement = draggable.dataset.dragKind === "team"
    ? memberEntryInSameSlot ?? draggable.closest(".team")
    : memberEntryInSameSlot ?? draggable.closest(".person-card");

  setDragState({
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
  });

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
  setDragState(null);
  clearDropHighlights();
});

function resolveDropzone(event) {
  const naiveDropzone = event.target.closest(".dropzone");
  if (!dragState) return naiveDropzone;

  const teamEl = event.target.closest(".team");
  if (!teamEl) return naiveDropzone;

  const managerSlot = teamEl.querySelector(":scope > .team-body > .manager-slot.dropzone");
  const memberSlot = teamEl.querySelector(":scope > .team-body > .member-slot.dropzone");

  if (naiveDropzone === managerSlot || naiveDropzone === memberSlot) {
    return naiveDropzone;
  }

  function distToRect(el) {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - event.clientX, 0, event.clientX - r.right);
    const dy = Math.max(r.top - event.clientY, 0, event.clientY - r.bottom);
    return dx * dx + dy * dy;
  }

  let best = null;
  let bestDist = Infinity;
  for (const slot of [managerSlot, memberSlot]) {
    if (!slot) continue;
    const { dropKind, teamId } = slot.dataset;
    if (!canDrop(dropKind, teamId)) continue;
    const d = distToRect(slot);
    if (d < bestDist) { bestDist = d; best = slot; }
  }

  return best ?? naiveDropzone;
}

document.addEventListener("dragover", (event) => {
  if (state.unassignedBarCollapsed && dragState?.type === "employee") {
    const bar = event.target.closest(".unassigned-bar");
    if (bar) {
      state.unassignedBarCollapsed = false;
      render();
      return;
    }
  }

  const dropzone = resolveDropzone(event);
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
  const dropzone = resolveDropzone(event);
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
  setDragState(null);
  clearDropHighlights();
  render();
});

document.addEventListener("click", (event) => {
  /* ── Landing page actions ── */
  const landingBtn = event.target.closest("[data-landing-action]");
  if (landingBtn) {
    const action = landingBtn.dataset.landingAction;
    if (action === "demo") loadDemoData();
    else if (action === "import") openCsvImportModal(false);
    else if (action === "blank") loadBlankBoard();
    return;
  }

  /* ── Import CSV (existing scenario) ── */
  if (event.target.closest("#import-csv-btn")) {
    openCsvImportModal(true);
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
    closeScenario(btn.dataset.closeScenario);
    return;
  }

  /* ── Scenario tab add ── */
  if (event.target.closest(".scenario-tab-add")) {
    createNewScenario();
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
      } else {
        renderTabs();
      }
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
    document.getElementById("hierarchy-modal")?.remove();
    return;
  }

  if (event.target.closest("[data-action='toggle-tree-edit']")) {
    const modal = document.getElementById("hierarchy-modal");
    if (modal) {
      const isEdit = modal.dataset.editMode === "true";
      modal.dataset.editMode = isEdit ? "false" : "true";
      const teamId = modal.dataset.teamId;
      openHierarchyModal.__rerenderInPlace(modal);
    }
    return;
  }

  if (event.target.closest("[data-tree-click]")) {
    const el = event.target.closest("[data-tree-click]");
    const modal = document.getElementById("hierarchy-modal");
    if (!modal || modal.dataset.editMode !== "true") return;
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
        const criterion = { id: generateCriterionId(), name, type, config, enabled: true, sort_order: globalCriteria.length };
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
      insertMember(targetTeamId, { type: "employee", id: employeeId });
    } else {
      state.unassignedEmployees.push(employeeId);
    }
    modal.remove();
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
      "toggle-collapse": () => toggleTeamLayout(teamId),
      "toggle-child-layout": () => toggleChildLayout(teamId),
      "toggle-root-layout": () => {
        state.rootLayout = oppositeLayout[state.rootLayout];
      },
      "view-hierarchy": () => { openHierarchyModal(teamId); return false; },
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
          globalCriteria = globalCriteria.filter((cr) => cr.id !== id);
        }
      },
      "toggle-criterion": () => {
        const c = globalCriteria.find((cr) => cr.id === id);
        if (c) {
          c.enabled = !c.enabled;
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
      applyMemberSlotPacking();
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

  const barHeader = event.target.closest(".unassigned-bar-header");
  if (barHeader) {
    state.unassignedBarCollapsed = !state.unassignedBarCollapsed;
    render();
    return;
  }

  const titlebar = event.target.closest(".team-titlebar[data-team-id]");
  if (titlebar && !event.target.closest(".team-title-actions") && !event.target.closest(".team-handle")) {
    toggleTeamLayout(titlebar.dataset.teamId);
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const hierarchyModal = document.getElementById("hierarchy-modal");
    if (hierarchyModal) { hierarchyModal.remove(); return; }
  }

  if ((event.key === "Enter" || event.key === " ") && event.target.closest(".team-titlebar[data-team-id]") && !event.target.closest(".team-name-input")) {
    event.preventDefault();
    const titlebar = event.target.closest(".team-titlebar[data-team-id]");
    toggleTeamLayout(titlebar.dataset.teamId);
    render();
    return;
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

// ─── Async init: load DB, restore scenarios, render ───
(async () => {
  await initDB();

  const existingScenarios = listScenarios();
  if (existingScenarios.length > 0) {
    setScenarios(existingScenarios.map(({ id, name }) => ({ id, name })));
    // Derive scenarioSequence from existing names like "Scenario 3"
    for (const s of scenarios) {
      const m = s.name.match(/^Scenario\s+(\d+)$/);
      if (m) setScenarioSequence(Math.max(scenarioSequence, Number(m[1])));
    }

    const lastActiveId = getMeta("activeScenarioId");
    const target = scenarios.find((s) => s.id === lastActiveId) ?? scenarios[scenarios.length - 1];
    setActiveScenarioId(target.id);

    const loaded = loadScenario(activeScenarioId);
    if (loaded) {
      setState(loaded);
      setShowLanding(!state.initialized);
    }
  } else {
    // First run — show landing page
    const id = generateScenarioId();
    const name = nextScenarioName();
    setState(createBlankState());
    setScenarios([{ id, name }]);
    setActiveScenarioId(id);
    saveScenario(id, name, state);
    setMeta("activeScenarioId", id);
    setShowLanding(true);
  }

  setEmployeeSequence(initializeSequence(state.employees, "p"));
  setTeamSequence(initializeSequence(state.teams, "t"));

  // Load global criteria from DB
  globalCriteria = listCriteria();

  render();
})();
