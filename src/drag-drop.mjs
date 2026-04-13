import {
  state, dragState, setDragState, isCopyMode,
  getTeam,
} from './state.mjs';
import {
  moveEmployeeToTeam, moveEmployeeToRoster, moveTeamToTarget,
  copyEmployeeToTeam, copyEmployeeToRoster, copyTeamToTarget,
} from './operations.mjs';
import { isTeamInside } from './team-logic.mjs';
import { render } from './render.mjs';

function canDrop(dropKind, teamId) {
  if (!dragState) return false;

  if (dropKind === "root") return dragState.type === "team";
  if (dropKind === "roster") return dragState.type === "employee";

  if (dragState.type === "employee") {
    if (dropKind === "manager") {
      const team = getTeam(teamId);
      return !team.manager || team.manager === dragState.id;
    }
    return dropKind === "members";
  }

  if (dragState.type === "team") {
    if (dropKind === "subteams") {
      return dragState.id !== teamId && !isTeamInside(state.teams, dragState.id, teamId);
    }
    return false;
  }

  return false;
}

function clearDropHighlights() {
  document.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
}

function resolveDropzone(event) {
  const naiveDropzone = event.target.closest(".dropzone");
  if (!dragState) return naiveDropzone;

  const teamEl = event.target.closest(".team");
  if (!teamEl) return naiveDropzone;

  const managerSlot = teamEl.querySelector(":scope > .team-body > .member-slot > .manager-slot.dropzone");
  const memberSlot = teamEl.querySelector(":scope > .team-body > .member-slot.dropzone");
  const subteamSlot = teamEl.querySelector(":scope > .team-body > .subteam-slot.dropzone");

  // Team drags: anywhere on a team resolves to its subteam-slot
  if (dragState.type === "team" && subteamSlot) {
    const { teamId } = subteamSlot.dataset;
    if (canDrop("subteams", teamId)) return subteamSlot;
    return naiveDropzone;
  }

  // If the naive dropzone is a valid slot AND canDrop passes, use it directly
  if (naiveDropzone === managerSlot || naiveDropzone === memberSlot) {
    const { dropKind, teamId } = naiveDropzone.dataset;
    if (canDrop(dropKind, teamId)) return naiveDropzone;
  }

  // Prefer the manager slot when cursor is inside its bounds
  if (managerSlot) {
    const { dropKind, teamId } = managerSlot.dataset;
    if (canDrop(dropKind, teamId)) {
      const r = managerSlot.getBoundingClientRect();
      if (event.clientX >= r.left && event.clientX <= r.right &&
          event.clientY >= r.top && event.clientY <= r.bottom) {
        return managerSlot;
      }
    }
  }

  // Distance-based fallback: find the nearest valid slot
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

export function setupDragDropListeners() {
  document.addEventListener("dragstart", (event) => {
    const draggable = event.target.closest("[draggable='true'][data-drag-kind]");
    if (!draggable) return;

    setDragState({
      type: draggable.dataset.dragKind,
      id: draggable.dataset.id,
    });

    event.dataTransfer.effectAllowed = isCopyMode ? "copy" : "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: dragState.type, id: dragState.id }));

    if (!isCopyMode) {
      // Only mark a .member-entry as the source when it lives inside the
      // same slot as the draggable. Without this check, dragging a manager
      // from a nested child team finds the outer .member-entry wrapping the
      // entire child team, making the whole team disappear.
      const closestEntry = draggable.closest(".member-entry");
      const closestSlot = draggable.closest(".manager-slot, .member-slot, .subteam-slot, .roster-cards");
      const sourceEntry = closestEntry && closestSlot?.contains(closestEntry)
        ? closestEntry
        : draggable.closest(".person-card");
      if (sourceEntry) {
        setTimeout(() => sourceEntry.classList.add("dragging-source"), 0);
      }
    }
  });

  document.addEventListener("dragend", () => {
    document.querySelectorAll(".dragging-source").forEach((el) => el.classList.remove("dragging-source"));
    setDragState(null);
    clearDropHighlights();
  });

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
    if (!dropzone) return;

    const { dropKind, teamId } = dropzone.dataset;
    if (!canDrop(dropKind, teamId)) return;

    event.preventDefault();
    clearDropHighlights();
    const collapsedTeam = dropzone.closest('.team[data-view="collapsed"]');
    if (collapsedTeam) {
      collapsedTeam.classList.add("is-over");
    } else {
      dropzone.classList.add("is-over");
    }
  });

  document.addEventListener("dragleave", (event) => {
    const dropzone = event.target.closest(".dropzone");
    if (dropzone) dropzone.classList.remove("is-over");
    const team = event.target.closest(".team.is-over");
    if (team && !team.contains(event.relatedTarget)) {
      team.classList.remove("is-over");
    }
  });

  document.addEventListener("drop", (event) => {
    const dropzone = resolveDropzone(event);
    if (!dropzone || !dragState) return;

    const { dropKind, teamId } = dropzone.dataset;
    if (!canDrop(dropKind, teamId)) {
      clearDropHighlights();
      return;
    }

    event.preventDefault();

    if (isCopyMode) {
      if (dropKind === "roster" && dragState.type === "employee") copyEmployeeToRoster(dragState.id);
      if (dropKind === "root" && dragState.type === "team") copyTeamToTarget(dragState.id, null);
      if (dropKind === "manager" && dragState.type === "employee") copyEmployeeToTeam(dragState.id, teamId, "manager");
      if (dropKind === "members" && dragState.type === "employee") copyEmployeeToTeam(dragState.id, teamId, "members");
      if (dropKind === "subteams" && dragState.type === "team") copyTeamToTarget(dragState.id, teamId);
    } else {
      if (dropKind === "roster" && dragState.type === "employee") moveEmployeeToRoster(dragState.id);
      if (dropKind === "root" && dragState.type === "team") moveTeamToTarget(dragState.id, null);
      if (dropKind === "manager" && dragState.type === "employee") moveEmployeeToTeam(dragState.id, teamId, "manager");
      if (dropKind === "members" && dragState.type === "employee") moveEmployeeToTeam(dragState.id, teamId, "members");
      if (dropKind === "subteams" && dragState.type === "team") moveTeamToTarget(dragState.id, teamId);
    }

    setDragState(null);
    clearDropHighlights();
    render();
  });
}
