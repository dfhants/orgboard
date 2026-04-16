import { escapeHtml, colorForTimezone, colorForManager } from '../utils.mjs';
import { state, getTeam, findMemberEntry } from '../state.mjs';
import { countTeamMemberships } from '../team-logic.mjs';

export function PersonCard({ employeeId, contextTeamId }) {
  const employee = state.employees[employeeId];
  if (!employee) return null;

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

  const html = `
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
    ${notesHtml}
  `;

  return (
    <article
      class={`person-card${requestedClass}`}
      draggable="true"
      data-drag-kind="employee"
      data-id={employee.id}
      style={`background:${colorForTimezone(employee.timezone)}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
