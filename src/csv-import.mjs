import {
  state, setShowLanding,
  employeeSequence, setEmployeeSequence,
  teamSequence, setTeamSequence,
  randomTeamColors,
} from './state.mjs';
import { escapeHtml, pickRandomItem, inferTimezoneFromLocation, inferLevelFromTitle } from './utils.mjs';
import { createIcons, render } from './render.mjs';

export function parseCSV(text) {
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

export function autoMapColumns(headers) {
  const fieldAliases = {
    name: ["name", "full name", "fullname", "employee", "person", "member"],
    role: ["role", "title", "job title", "jobtitle", "position", "line detail 1"],
    location: ["location", "city", "office", "site", "line detail 3"],
    timezone: ["timezone", "time zone", "tz"],
    notes: ["notes", "note", "comments", "comment"],
    level: ["level", "grade", "ic level", "iclevel"],
    manager: ["manager", "reports to", "reportsto", "supervisor", "boss", "current manager", "original manager"],
    team: ["team", "group", "department", "dept", "org", "organization name"],
    employeeId: ["unique identifier", "employee id", "worker id", "emplid"],
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

export function loadCsvData(rows, headers, mapping, loadMode) {
  const dataRows = rows.slice(1);

  const getValue = (row, field) => {
    const idx = mapping[field];
    return idx !== undefined && idx < row.length ? row[idx].trim() : "";
  };

  // Build ID → name lookup if employeeId column is mapped (for ID-based manager resolution)
  const idToName = new Map();
  if (mapping.employeeId !== undefined) {
    for (const row of dataRows) {
      const eid = getValue(row, "employeeId");
      const name = getValue(row, "name");
      if (eid && name) idToName.set(eid, name);
    }
  }

  // Resolve a manager value: if it matches an employeeId, return the corresponding name
  const resolveManager = (raw) => {
    if (!raw) return "";
    if (idToName.size > 0 && idToName.has(raw)) return idToName.get(raw);
    return raw;
  };

  const hasTimezoneColumn = mapping.timezone !== undefined;

  // Detect unfilled/vacant positions: "P-123456 Title (Unfilled)" or "P-123456 Title (Position Fill:...)"
  const unfilledPattern = /^P-\d+\s+(.+?)\s*\((Unfilled|Position Fill:)/;

  // Create people from CSV rows
  const newPeople = [];
  for (const row of dataRows) {
    let rawName = getValue(row, "name");
    if (!rawName) continue;

    // Detect unfilled/vacant positions
    let requested = false;
    let role = getValue(row, "role") || "Team Member";
    const unfilledMatch = rawName.match(unfilledPattern);
    if (unfilledMatch) {
      role = unfilledMatch[1].trim();
      rawName = `Open - ${role}`;
      requested = true;
    }

    // Clean name: strip [C] contingent marker
    let notes = getValue(row, "notes") || "";
    const isContingent = /\s*\[C\]\s*$/.test(rawName);
    if (isContingent) {
      rawName = rawName.replace(/\s*\[C\]\s*$/, "").trim();
      if (role === "Contingent Worker") {
        // Don't duplicate in notes if already the role
      } else {
        notes = notes ? `${notes}; Contingent Worker` : "Contingent Worker";
      }
    }

    // Clean name: strip (On Leave) and similar status annotations
    const onLeaveMatch = rawName.match(/\s*\(On Leave\)\s*$/i);
    if (onLeaveMatch) {
      rawName = rawName.replace(/\s*\(On Leave\)\s*$/i, "").trim();
      notes = notes ? `${notes}; On Leave` : "On Leave";
    }

    // Clean name: strip redundant Workday self-reference like "Sydney Green (Sydney Green)"
    const dupeNameMatch = rawName.match(/^(.+?)\s*\(\1\)\s*$/);
    if (dupeNameMatch) {
      rawName = dupeNameMatch[1].trim();
    }

    const name = rawName;
    const location = getValue(row, "location") || "Remote";
    const managerRaw = getValue(row, "manager");
    const resolvedManager = resolveManager(managerRaw);

    setEmployeeSequence(employeeSequence + 1);
    const id = `p${employeeSequence}`;
    state.employees[id] = {
      id,
      name,
      role,
      location,
      timezone: hasTimezoneColumn
        ? (getValue(row, "timezone") || "GMT (UTC+0)")
        : inferTimezoneFromLocation(location),
      notes,
      requested,
      level: getValue(row, "level") ? Number(getValue(row, "level")) || null : inferLevelFromTitle(role),
      currentManager: resolvedManager,
    };
    newPeople.push({
      id,
      manager: resolvedManager,
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

    for (const [teamName, members] of teamGroups) {
      setTeamSequence(teamSequence + 1);
      const teamId = `t${teamSequence}`;
      const memberNames = new Set(members.map((m) => state.employees[m.id].name));
      let managerId = null;
      for (const m of members) {
        const isManager = members.some(
          (other) => other.id !== m.id && other.manager === state.employees[m.id].name
        );
        if (isManager && !managerId) {
          managerId = m.id;
        }
      }

      const teamMembers = members
        .filter((m) => m.id !== managerId)
        .map((m) => ({ id: m.id }));

      state.teams[teamId] = {
        id: teamId,
        name: teamName,
        ownLayout: "expanded",
        manager: managerId,
        members: teamMembers,
        subTeams: [],
        color: pickRandomItem(randomTeamColors),
      };
      state.rootTeams.push(teamId);
    }

    for (const p of noTeam) {
      state.unassignedEmployees.push(p.id);
    }
  } else if (loadMode === "people-hierarchy") {
    buildTeamsFromManagers(newPeople);
  }

  state.initialized = true;
  setShowLanding(false);
  render();
}

function buildTeamsFromManagers(newPeople) {
  const byName = new Map();
  for (const p of newPeople) {
    byName.set(state.employees[p.id].name, p);
  }

  // Find people who are managers (others report to them)
  const managedBy = new Map(); // managerName -> [person]
  for (const p of newPeople) {
    if (p.manager && byName.has(p.manager)) {
      if (!managedBy.has(p.manager)) managedBy.set(p.manager, []);
      managedBy.get(p.manager).push(p);
    }
  }

  // Create a team for each manager (flat first, then nest)
  const managerToTeamId = new Map(); // managerName -> teamId
  for (const [managerName, reports] of managedBy) {
    const managerPerson = byName.get(managerName);
    if (!managerPerson) continue;

    setTeamSequence(teamSequence + 1);
    const teamId = `t${teamSequence}`;
    managerToTeamId.set(managerName, teamId);

    // Initially, add all reports as employee members
    const teamMembers = reports.map((r) => ({ id: r.id }));

    state.teams[teamId] = {
      id: teamId,
      name: `${managerName}'s Team`,
      ownLayout: "expanded",
      manager: managerPerson.id,
      members: teamMembers,
      subTeams: [],
      color: pickRandomItem(randomTeamColors),
    };
  }

  // Now nest: if a report is also a manager (has their own team),
  // replace their employee entry in the parent with a team entry
  const nestedTeamIds = new Set();
  for (const [managerName, reports] of managedBy) {
    const parentTeamId = managerToTeamId.get(managerName);
    if (!parentTeamId) continue;
    const parentTeam = state.teams[parentTeamId];

    for (const r of reports) {
      const reportName = state.employees[r.id].name;
      const childTeamId = managerToTeamId.get(reportName);
      if (childTeamId) {
        // This report has their own team — move from members to subTeams
        const idx = parentTeam.members.findIndex(
          (m) => m.id === r.id
        );
        if (idx !== -1) {
          parentTeam.members.splice(idx, 1);
        }
        parentTeam.subTeams.push({ id: childTeamId });
        nestedTeamIds.add(childTeamId);
      }
    }
  }

  // Only top-level teams (not nested inside another) go to rootTeams
  for (const teamId of managerToTeamId.values()) {
    if (!nestedTeamIds.has(teamId)) {
      state.rootTeams.push(teamId);
    }
  }

  // Anyone not in any team and not a manager goes to unassigned
  const allTeamPersonIds = new Set();
  for (const t of Object.values(state.teams)) {
    if (t.manager) allTeamPersonIds.add(t.manager);
    for (const m of t.members) {
      allTeamPersonIds.add(m.id);
    }
  }
  for (const p of newPeople) {
    if (!allTeamPersonIds.has(p.id)) {
      state.unassignedEmployees.push(p.id);
    }
  }
}

export function openCsvImportModal() {
  document.getElementById("csv-import-modal")?.remove();

  const modal = document.createElement("div");
  modal.id = "csv-import-modal";
  modal.className = "modal-overlay modal-overlay-fullscreen";
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
            <input type="file" id="csv-file-input" accept=".csv,text/csv" />
          </label>
          <div id="csv-preview-area" class="csv-preview-area" hidden></div>
        </div>
        <div id="csv-mapping-step" class="csv-step" data-csv-step="mapping" hidden>
          <p class="csv-step-label">Map CSV columns to OrgBoard fields</p>
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
  createIcons({ nodes: modal.querySelectorAll("i[data-lucide]") });

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
      createIcons({ nodes: previewArea.querySelectorAll("i[data-lucide]") });
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

    // Build reverse mapping: columnIndex → field key
    const reverseMap = {};
    for (const [field, idx] of Object.entries(columnMapping)) {
      reverseMap[idx] = field;
    }

    const fieldOptions = fields.map((f) =>
      `<option value="${f.key}">${f.label}${f.required ? " *" : ""}</option>`
    ).join("");

    const previewRows = csvRows.slice(0, 6); // header + up to 5 data rows

    const container = modal.querySelector("#csv-mapping-fields");
    container.innerHTML = `
      <div class="csv-preview-scroll">
        <table class="csv-preview-table csv-mapping-table">
          <thead>
            <tr class="csv-mapping-row">
              ${csvHeaders.map((_, i) => {
                const mapped = reverseMap[i] || "";
                return `<th class="csv-mapping-cell">
                  <select class="csv-mapping-select" data-col="${i}">
                    <option value="">(skip)</option>
                    ${fields.map((f) =>
                      `<option value="${f.key}"${mapped === f.key ? " selected" : ""}>${f.label}${f.required ? " *" : ""}</option>`
                    ).join("")}
                  </select>
                </th>`;
              }).join("")}
            </tr>
            <tr>${csvHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>${previewRows.slice(1).map((row) =>
            `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`
          ).join("")}</tbody>
        </table>
      </div>
      <div id="csv-mapping-hints" class="csv-mapping-hints"></div>
    `;

    function updateHints() {
      const hints = [];
      const hasLocation = "location" in columnMapping;
      const hasTimezone = "timezone" in columnMapping;
      if (hasLocation && !hasTimezone) {
        hints.push('<i data-lucide="info"></i> Timezone will be inferred from location');
      }
      const hintsEl = container.querySelector("#csv-mapping-hints");
      hintsEl.innerHTML = hints.join("");
      createIcons({ nodes: hintsEl.querySelectorAll("i[data-lucide]") });
    }

    container.querySelectorAll(".csv-mapping-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const colIdx = Number(sel.dataset.col);
        const newField = sel.value;

        // Clear old mapping for this column
        for (const [field, idx] of Object.entries(columnMapping)) {
          if (idx === colIdx) delete columnMapping[field];
        }

        // If another column already has this field, clear it
        if (newField) {
          const oldCol = columnMapping[newField];
          if (oldCol !== undefined && oldCol !== colIdx) {
            delete columnMapping[newField];
            const oldSel = container.querySelector(`.csv-mapping-select[data-col="${oldCol}"]`);
            if (oldSel) oldSel.value = "";
          }
          columnMapping[newField] = colIdx;
        }

        nextBtn.disabled = !("name" in columnMapping);
        updateHints();
      });
    });

    updateHints();
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
      // Analyze mapped columns to recommend the best load mode
      const dataRows = csvRows.slice(1);
      const teamIdx = columnMapping.team;
      const mgrIdx = columnMapping.manager;
      const hasTeamData = teamIdx !== undefined && dataRows.some(r => r[teamIdx] && r[teamIdx].trim());
      const hasMgrData = mgrIdx !== undefined && dataRows.some(r => r[mgrIdx] && r[mgrIdx].trim());

      // Hide/show mode options based on available data
      const teamOption = modeStep.querySelector('input[value="team-hierarchy"]').closest(".csv-mode-option");
      const mgrOption = modeStep.querySelector('input[value="people-hierarchy"]').closest(".csv-mode-option");
      teamOption.style.display = hasTeamData ? "" : "none";
      mgrOption.style.display = hasMgrData ? "" : "none";

      // Auto-select the best available mode
      let recommended = hasTeamData ? "team-hierarchy" : hasMgrData ? "people-hierarchy" : "unassigned";
      modeStep.querySelectorAll("input[name='csv-load-mode']").forEach((r) => {
        r.checked = r.value === recommended;
      });

      nextBtn.disabled = false;
    }
  }

  nextBtn.addEventListener("click", () => {
    if (currentStep === "file") {
      goToStep("mapping");
    } else if (currentStep === "mapping") {
      goToStep("mode");
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
