import { state } from '../state.mjs';
import { PersonCard } from './PersonCard.jsx';

export function UnassignedBar() {
  const barCollapsed = state.unassignedBarCollapsed;
  const unassignedCount = state.unassignedEmployees.length;

  return (
    <section id="unassigned-drawer" class={`unassigned-bar${barCollapsed ? ' is-collapsed' : ''}`}>
      <div class="unassigned-bar-header">
        <button class={`team-control-button drawer-chevron${barCollapsed ? '' : ' is-expanded'}`} type="button" title={`${barCollapsed ? 'Expand' : 'Collapse'} unassigned`} aria-label={`${barCollapsed ? 'Expand' : 'Collapse'} unassigned`}><i data-lucide="chevron-up"></i></button>
        <strong>Unassigned employees</strong>
        <span class="unassigned-count">{unassignedCount}</span>
        {unassignedCount > 0 && (
          <button class="team-control-button delete-all-unassigned" type="button" title="Delete all unassigned employees" aria-label="Delete all unassigned employees"><i data-lucide="trash-2"></i></button>
        )}
      </div>
      {!barCollapsed && (
        <div class="roster-cards-wrapper">
          <div class="roster-cards dropzone" data-drop-kind="roster">
            {unassignedCount > 0
              ? state.unassignedEmployees.map((id) => (
                  <PersonCard employeeId={id} contextTeamId={null} key={id} />
                ))
              : <p class="empty-note">Drop here to unassign.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
