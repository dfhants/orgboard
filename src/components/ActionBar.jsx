import { state, boardZoom, oppositeLayout } from '../state.mjs';

export function ActionBar() {
  const next = oppositeLayout[state.rootLayout];
  const layoutIcon = next === "horizontal" ? "square-arrow-right" : "square-arrow-down";

  return (
    <div id="action-bar" class="action-bar">
      <button
        class="team-control-button"
        type="button"
        title={`Switch to ${next} layout`}
        aria-label={`Switch to ${next} layout`}
        data-action="toggle-root-layout"
      ><i data-lucide={layoutIcon}></i></button>

      <span class="action-bar-divider"></span>
      <button class="team-control-button" type="button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out"><i data-lucide="minus"></i></button>
      <button class="team-control-button zoom-level-button" type="button" data-action="zoom-reset" title="Reset zoom" aria-label="Reset zoom"><span id="zoom-level-label">{Math.round(boardZoom * 100)}%</span></button>
      <button class="team-control-button" type="button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in"><i data-lucide="plus"></i></button>
      <span class="action-bar-divider"></span>
      <button id="add-person-btn" class="team-control-button" type="button" data-action="add-root-person" title="Add person" aria-label="Add person"><i data-lucide="user-plus"></i></button>
      <button class="team-control-button" type="button" data-action="add-root-team" title="Add team" aria-label="Add team"><i data-lucide="users"></i></button>
      <button class="team-control-button" type="button" id="action-bar-import-csv" title="Import CSV" aria-label="Import CSV"><i data-lucide="upload"></i></button>
      <span class="action-bar-divider"></span>
      <button class={`team-control-button${state.activeSortLayers?.length ? ' is-active' : ''}`} type="button" data-action="open-sort-modal" title="Sort all teams" aria-label="Sort all teams"><i data-lucide="arrow-up-down"></i></button>
      <button class="team-control-button" type="button" data-action="view-hierarchy" title="View hierarchy" aria-label="View hierarchy"><i data-lucide="network"></i></button>
      <span class="action-bar-divider"></span>
      <button class="team-control-button" type="button" data-action="open-board-legend" title="Board legend" aria-label="Board legend"><i data-lucide="info"></i></button>
      <button class="team-control-button" type="button" data-action="open-help" title="Help" aria-label="Help"><i data-lucide="circle-help"></i></button>
    </div>
  );
}
