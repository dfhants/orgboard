import { escapeHtml, colorForTimezone } from '../utils.mjs';
import { state, getTeam } from '../state.mjs';
import { countDirectEmployees } from '../team-logic.mjs';

const FALLBACK_COLOR = "rgba(200, 200, 200, 0.5)";

function personDot(memberId) {
  const emp = state.employees[memberId];
  const color = emp ? colorForTimezone(emp.timezone) : FALLBACK_COLOR;
  const tip = emp ? `${emp.name} \u2014 ${emp.role}\n${emp.location}\n${emp.timezone}` : "";
  return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
}

function subTeamDot(entryId) {
  const nested = getTeam(entryId);
  const color = nested?.color ?? FALLBACK_COLOR;
  const memberCount = nested ? countDirectEmployees(nested) : 0;
  const tip = nested ? `${nested.name} team (${memberCount} people)` : "";
  return `<span class="facepile-dot" style="background:${color}" title="${escapeHtml(tip)}"></span>`;
}

export function Facepile({ team }) {
  const allDots = team.members.map((m) => personDot(m.id)).join("")
    + team.subTeams.map((e) => subTeamDot(e.id)).join("");
  if (!allDots) {
    return <span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop members here"></span></span>;
  }
  return <span class="member-facepile" aria-hidden="true" dangerouslySetInnerHTML={{ __html: allDots }} />;
}

export function CollapsedManager({ team }) {
  if (!team.manager) {
    return <span class="member-facepile" aria-hidden="true"><span class="facepile-dot facepile-empty" title="Drop a manager here"></span></span>;
  }
  const dot = personDot(team.manager);
  return (
    <span class="member-facepile" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dot }} />
  );
}

export function SubTeamFacepile({ team }) {
  if (team.subTeams.length === 0) return null;
  const dots = team.subTeams.map((e) => subTeamDot(e.id)).join("");
  return <span class="member-facepile" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dots }} />;
}
