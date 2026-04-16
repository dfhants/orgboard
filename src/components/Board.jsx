import { state } from '../state.mjs';
import { evaluateAllChecks } from '../checks.mjs';
import { globalCriteria } from '../state.mjs';
import { sortAllTeams } from '../operations.mjs';
import { TeamSection } from './TeamSection.jsx';

export function Board({ lastCheckResults }) {
  return (
    <div class="board-zoom-layer">
      <div class="root-dropzone dropzone" data-drop-kind="root" data-layout={state.rootLayout}>
        {state.rootTeams.length > 0
          ? state.rootTeams.map((teamId) => (
              <TeamSection teamId={teamId} lastCheckResults={lastCheckResults} key={teamId} />
            ))
          : (
            <div class="empty-board">
              <i data-lucide="users"></i>
              <p class="empty-board-title">No teams yet</p>
              <p class="empty-board-hint">Create a team or import a CSV to get started</p>
            </div>
          )}
      </div>
    </div>
  );
}
