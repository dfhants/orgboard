import { parseUtcOffset, computeMaxTimezoneGap, ribbonColorForGap, computeTeamCheckStatus, ribbonColorForCheckStatus, ribbonTooltipForCheckStatus } from '../utils.mjs';
import { state, getTeam, globalCriteria, notifyStateChange } from '../state.mjs';
import { countDirectEmployees, countNestedTeams, collectAllEmployeesInTeam } from '../team-logic.mjs';
import { checkTypes } from '../checks.mjs';
import { PersonCard } from './PersonCard.jsx';
import { Facepile, CollapsedManager, SubTeamFacepile } from './Facepile.jsx';
import { useInlineEdit } from './useInlineEdit.js';

export function TeamSection({ teamId, lastCheckResults, forcedView }) {
  const team = getTeam(teamId);
  if (!team) return null;

  const teamView = forcedView ?? team.ownLayout;
  const caption = `${countDirectEmployees(team)} people, ${countNestedTeams(team)} nested teams`;
  const isCollapsed = teamView === "collapsed";
  const chevronClass = isCollapsed ? "" : " is-expanded";

  // Compute timezone spread ribbon color
  const empIds = collectAllEmployeesInTeam(state.teams, teamId);
  const offsets = empIds.map(id => state.employees[id]).filter(Boolean).map(e => parseUtcOffset(e.timezone)).filter(o => !Number.isNaN(o));
  const tzGap = empIds.length === 0 ? null : computeMaxTimezoneGap(offsets);
  let ribbonColor = ribbonColorForGap(tzGap);
  let ribbonTitle = tzGap == null ? "No employees" : `${tzGap}h timezone spread`;

  // Override with check-status ribbon when team-scoped checks are active
  let checkStatus = "";
  if (lastCheckResults) {
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

  return (
    <section
      class="team"
      data-team-id={team.id}
      data-view={teamView}
      data-tz-gap={tzGap ?? ""}
      {...(checkStatus ? { "data-check-status": checkStatus } : {})}
      style={`--team-accent:${team.color}; --ribbon-color:${ribbonColor}`}
      title={ribbonTitle}
    >
      <div class="team-titlebar" data-team-id={team.id}>
        <h2 class="team-name"><TeamName team={team} /></h2>
        <div class="team-toolbar">
          <div class="team-toolbar-left">
            <div class="team-handle" draggable="true" data-drag-kind="team" data-id={team.id} title="Drag team"><i data-lucide="grip-vertical"></i></div>
            <button class="team-control-button team-menu-trigger" type="button" data-action="open-team-menu" data-team-id={team.id} title="Team actions" aria-label="Team actions" aria-haspopup="true"><i data-lucide="ellipsis"></i></button>
            <button class="team-control-button team-stats-trigger" type="button" data-action="open-team-stats" data-team-id={team.id} title={caption} aria-label={`Team stats: ${caption}`}><i data-lucide="bar-chart-3"></i></button>
            <button class={`team-control-button team-chevron${chevronClass}`} type="button" data-action="toggle-collapse" data-team-id={team.id} title={isCollapsed ? 'Expand' : 'Collapse'} aria-label={isCollapsed ? 'Expand' : 'Collapse'}><i data-lucide="chevron-right"></i></button>
          </div>
        </div>
      </div>

      <div class={`team-body ${state.rootLayout}`}>
        <div class={`slot member-slot dropzone layout-${state.rootLayout}`} data-drop-kind="members" data-team-id={team.id}>
          <div class="slot manager-slot dropzone" data-drop-kind="manager" data-team-id={team.id}>
            {isCollapsed
              ? <CollapsedManager team={team} />
              : (team.manager
                ? <PersonCard employeeId={team.manager} contextTeamId={team.id} />
                : <p class="empty-note">Drop a manager here</p>)}
          </div>
          {isCollapsed
            ? <Facepile team={team} />
            : <People team={team} />}
        </div>
        <div class="slot subteam-slot dropzone" data-drop-kind="subteams" data-team-id={team.id}>
          {isCollapsed
            ? <SubTeamFacepile team={team} />
            : <SubTeams team={team} lastCheckResults={lastCheckResults} />}
        </div>
      </div>
    </section>
  );
}

function People({ team }) {
  if (team.members.length === 0) {
    return <p class="empty-note">Drop people here</p>;
  }
  return team.members.map((member, index) => (
    <div class="member-entry" data-member-index={index} data-member-type="employee" data-member-id={member.id} key={member.id}>
      <PersonCard employeeId={member.id} contextTeamId={team.id} />
    </div>
  ));
}

function SubTeams({ team, lastCheckResults }) {
  if (team.subTeams.length === 0) return null;
  return team.subTeams.map((entry, index) => (
    <div class="member-entry" data-member-index={index} data-member-type="team" data-member-id={entry.id} key={entry.id}>
      <div class="child-team">
        <TeamSection teamId={entry.id} lastCheckResults={lastCheckResults} />
      </div>
    </div>
  ));
}

function TeamName({ team }) {
  const { editing, setEditing, inputProps } = useInlineEdit(team.name, (newName) => {
    team.name = newName;
    notifyStateChange();
  });

  if (editing) {
    return (
      <input
        {...inputProps}
        class="team-name-input"
      />
    );
  }

  return (
    <span class="team-name-text" onClick={() => setEditing(true)}>
      {team.name}
    </span>
  );
}
