import { escapeHtml, colorForTimezone } from '../utils.mjs';
import { state, globalCriteria } from '../state.mjs';
import { computeTeamStats, computeGlobalStats, computeManagerChanges } from '../team-logic.mjs';
import { evaluateAllChecks, describeCriterion, checkTypes } from '../checks.mjs';
import { debouncedSave } from '../scenarios.mjs';
import { useEffect } from 'preact/hooks';

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

export function StatsPanel({ lastCheckResults }) {
  const statsOpen = state.statsPanelOpen;
  const checksOpen = state.checksPanelOpen;
  const notesOpen = state.notesPanelOpen;
  const anyOpen = statsOpen || checksOpen || notesOpen;

  if (!anyOpen) {
    const results = lastCheckResults;
    const failCount = results ? results.summary.failed : 0;
    const failBadge = failCount > 0 ? `<span class="strip-badge strip-badge-fail">${failCount}</span>` : "";

    return (
      <aside id="stats-panel" class="stats-panel">
        <div class="stats-panel-strip" data-action="toggle-stats-panel" title="Open stats">
          <i data-lucide="sigma"></i>
          <span class="stats-panel-strip-label">STATS</span>
        </div>
        <div class="stats-panel-strip checks-strip" data-action="toggle-checks-panel" title="Open checks" dangerouslySetInnerHTML={{ __html: `
          <i data-lucide="list-checks"></i>
          <span class="stats-panel-strip-label">CHECKS</span>
          ${failBadge}
        ` }} />
        <div class="stats-panel-strip notes-strip" data-action="toggle-notes-panel" title="Open notes">
          <i data-lucide="notebook-pen"></i>
          <span class="stats-panel-strip-label">NOTES</span>
        </div>
      </aside>
    );
  }

  if (statsOpen) return <StatsPanelContent lastCheckResults={lastCheckResults} />;
  if (checksOpen) return <ChecksPanelContent lastCheckResults={lastCheckResults} />;
  return <NotesPanelContent />;
}

function StatsPanelContent() {
  const global = computeGlobalStats(state);
  const teamBlocks = state.rootTeams.map((id) => renderTeamStatsBlock(computeTeamStats(state, id), false)).join("");

  const globalRoleRows = Object.entries(global.roles).sort((a, b) => b[1] - a[1]).map(([role, count]) =>
    `<div class="stats-row"><span class="stats-row-label">${escapeHtml(role)}</span><span class="stats-row-value">${count}</span></div>`
  ).join("");

  const globalTzHtml = Object.keys(global.timezones).length > 0
    ? `<div class="stats-tz-list">${renderTzBadges(global.timezones)}</div>`
    : "";

  const bodyHtml = `
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
  `;

  return (
    <aside id="stats-panel" class="stats-panel is-open">
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
      <div class="stats-panel-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </aside>
  );
}

function ChecksPanelContent({ lastCheckResults }) {
  const results = lastCheckResults ?? evaluateAllChecks(state, globalCriteria.filter((c) => c.enabled));
  const { summary } = results;

  const criteriaCards = globalCriteria.map((criterion) => {
    const result = results.results.find((r) => r.criterionId === criterion.id);
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

  const bodyHtml = `
    ${summaryHtml}
    <div class="checks-list">
      ${criteriaCards || '<p class="checks-empty">No checks defined yet.<br>Add a check to validate your team structure.</p>'}
    </div>
    <button class="toolbar-button checks-add-button" type="button" data-action="add-criterion">
      <i data-lucide="plus"></i> Add check
    </button>
  `;

  return (
    <aside id="stats-panel" class="stats-panel is-open">
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
      <div class="stats-panel-body checks-panel-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </aside>
  );
}

function NotesPanelContent() {
  const onNotesInput = (e) => {
    state.notes = e.target.value;
    debouncedSave();
  };

  return (
    <aside id="stats-panel" class="stats-panel is-open">
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
        <textarea id="notes-textarea" class="notes-textarea" placeholder="Type scenario notes here…" value={state.notes || ""} onInput={onNotesInput} />
      </div>
    </aside>
  );
}
