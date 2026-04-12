import {
  state, dragState, setDragState, dropPreview, setDropPreview,
  dragImageProxy, setDragImageProxy, isCopyMode,
  getTeam,
} from './state.mjs';
import {
  moveEmployeeToTeam, moveEmployeeToRoster, moveTeamToTarget,
  copyEmployeeToTeam, copyEmployeeToRoster, copyTeamToTarget,
  insertSubTeam,
} from './operations.mjs';
import { isTeamInside } from './team-logic.mjs';
import { render, applyHorizontalPacking as tightenLayout } from './render.mjs';

export function canDrop(dropKind, teamId) {
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
    if (dropKind === "subteams") {
      return dragState.id !== teamId && !isTeamInside(state.teams, dragState.id, teamId);
    }
    return false;
  }

  return false;
}

const HYSTERESIS_PX = 8;
let lastInsertDropzone = null;
let lastInsertIndex = -1;
let lastInsertX = 0;
let lastInsertY = 0;

export function resetInsertionHysteresis() {
  lastInsertDropzone = null;
  lastInsertIndex = -1;
  lastInsertX = 0;
  lastInsertY = 0;
}

function computeRawInsertionIndex(entries, event) {
  if (entries.length === 0) return 0;

  // Group entries into visual columns by their left coordinate.
  // Entries within 5px of each other horizontally are in the same column.
  const COL_SNAP = 5;
  const columns = []; // [{left, entries: [{idx, rect}]}]
  for (let i = 0; i < entries.length; i++) {
    const rect = entries[i].getBoundingClientRect();
    let col = columns.find(c => Math.abs(c.left - rect.left) < COL_SNAP);
    if (!col) {
      col = { left: rect.left, entries: [] };
      columns.push(col);
    }
    col.entries.push({ idx: i, rect });
  }
  // Sort columns left-to-right, entries within each column top-to-bottom
  columns.sort((a, b) => a.left - b.left);
  for (const col of columns) {
    col.entries.sort((a, b) => a.rect.top - b.rect.top);
  }

  // Find which column the cursor is in
  const lastCol = columns[columns.length - 1];
  const lastRight = lastCol.left + lastCol.entries[0].rect.width;
  // If cursor is past the right edge of the last column → after all entries
  if (event.clientX > lastRight) {
    return entries.length;
  }

  let targetCol = lastCol; // default to last
  for (let ci = 0; ci < columns.length - 1; ci++) {
    const rightEdge = columns[ci].left + columns[ci].entries[0].rect.width;
    const nextLeft = columns[ci + 1].left;
    const boundary = (rightEdge + nextLeft) / 2;
    if (event.clientX < boundary) {
      targetCol = columns[ci];
      break;
    }
  }

  // Within the column, find vertical insertion point using gap midpoints.
  // The boundary between "before entry N" and "before entry N+1" is the
  // midpoint of the gap between entries, not the midpoint of the entry itself.
  const colEntries = targetCol.entries;
  for (let i = 0; i < colEntries.length; i++) {
    const { idx, rect } = colEntries[i];
    const nextRect = colEntries[i + 1]?.rect;
    const boundary = nextRect
      ? (rect.bottom + nextRect.top) / 2
      : rect.bottom;
    if (event.clientY < boundary) {
      return idx;
    }
  }

  // Below all entries in this column → after the last entry in this column
  return colEntries[colEntries.length - 1].idx + 1;
}

export function getMemberInsertionIndex(dropzone, event) {
  const entries = [...dropzone.querySelectorAll(
    ':scope > .member-entry:not(.drag-preview-entry):not(.dragging-source)'
  )];

  if (entries.length === 0) {
    const teamId = dropzone.dataset.teamId;
    return teamId ? getTeam(teamId).members.length : 0;
  }

  const rawIndex = computeRawInsertionIndex(entries, event);

  // Map visual position to array index using data-member-index attributes
  function visualToArrayIndex(visIdx) {
    if (visIdx < entries.length) {
      return Number(entries[visIdx].dataset.memberIndex);
    }
    const teamId = dropzone.dataset.teamId;
    const dropKind = dropzone.dataset.dropKind;
    if (teamId) {
      const team = getTeam(teamId);
      return dropKind === "subteams" ? team.subTeams.length : team.members.length;
    }
    return 0;
  }

  if (dropzone === lastInsertDropzone && lastInsertIndex !== rawIndex && lastInsertIndex >= 0 && lastInsertIndex <= entries.length) {
    const dx = Math.abs(event.clientX - lastInsertX);
    const dy = Math.abs(event.clientY - lastInsertY);
    if (Math.max(dx, dy) < HYSTERESIS_PX) {
      return visualToArrayIndex(lastInsertIndex);
    }
  }

  lastInsertDropzone = dropzone;
  lastInsertIndex = rawIndex;
  lastInsertX = event.clientX;
  lastInsertY = event.clientY;
  const result = visualToArrayIndex(rawIndex);
  return result;
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
  proxy.style.width = `${Math.round(previewRect.width)}px`;
  proxy.style.height = `${Math.round(previewRect.height)}px`;
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
}

function updateDropPreview(dropzone, event) {
  const dk = dropzone.dataset.dropKind;
  if (!dragState || (dk !== "members" && dk !== "subteams")) {
    removeDropPreview();
    return;
  }

  const isCollapsed = !!dropzone.closest('.team[data-view="collapsed"]');
  if (isCollapsed) {
    // Collapsed teams just highlight the team border — no preview element
    removeDropPreview();
    return;
  }

  if (!dropPreview) {
    setDropPreview(createDropPreview(dropzone));
  }

  // Place preview among direct children.
  // Temporarily detach the preview so its presence doesn't shift entry
  // rects and cause computeRawInsertionIndex to oscillate.
  const previewWasInDropzone = dropPreview.parentElement === dropzone;
  const previewNextSibling = dropPreview.nextSibling;
  if (previewWasInDropzone) {
    dropPreview.remove();
  }

  const entries = [...dropzone.children].filter(
    (node) =>
      node.classList.contains("member-entry") &&
      !node.classList.contains("drag-preview-entry") &&
      !node.classList.contains("dragging-source"),
  );
  const insertPos = computeRawInsertionIndex(entries, event);
  const anchor = entries[insertPos] ?? null;

  // Check current logical position (where preview was before detach)
  let currentPos = -1;
  if (previewWasInDropzone) {
    currentPos = 0;
    // Count member-entries that come before the preview's old position
    let node = dropzone.firstChild;
    const refNode = previewNextSibling; // what was after the preview
    while (node && node !== refNode) {
      if (node.classList?.contains("member-entry") && !node.classList.contains("dragging-source")) {
        currentPos++;
      }
      node = node.nextSibling;
    }
  }
  const moved = currentPos !== insertPos;

  if (moved) {
    dropzone.insertBefore(dropPreview, anchor);
    tightenLayout();
  } else if (previewWasInDropzone) {
    // Re-insert at original position (since we detached it)
    dropzone.insertBefore(dropPreview, previewNextSibling);
  }
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
    if (canDrop("subteams", teamId)) {
      return subteamSlot;
    }
    return naiveDropzone;
  }

  // If the naive dropzone is a valid slot AND canDrop passes, use it directly
  if (naiveDropzone === managerSlot || naiveDropzone === memberSlot) {
    const { dropKind, teamId } = naiveDropzone.dataset;
    if (canDrop(dropKind, teamId)) {
      return naiveDropzone;
    }
    // Otherwise fall through to distance-based resolution
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

export function setupDragDropListeners() {
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
    const closestSlot = draggable.closest(".manager-slot, .member-slot, .subteam-slot, .roster-cards");
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
          : draggable.closest(".subteam-slot")
            ? "subteams"
            : draggable.closest(".roster-cards")
              ? "roster"
              : null,
      sourceTeamId: draggable.closest(".member-slot, .manager-slot, .subteam-slot")?.dataset.teamId ?? null,
      sourceIndex: Number(draggable.closest(".member-entry")?.dataset.memberIndex ?? -1),
      previewWidth: Math.round(previewRect?.width ?? 84),
      previewHeight: Math.round(previewRect?.height ?? 84),
      sourceElement,
    });

    event.dataTransfer.effectAllowed = isCopyMode ? "copy" : "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: dragState.type, id: dragState.id }));
    setCustomDragImage(event, draggable, previewNode);

    if (!isCopyMode && sourceElement) {
      // Freeze the member-slot's dimensions before hiding the source element,
      // so CSS max-content doesn't cause the slot to shrink when the card
      // becomes display:none.
      const memberSlot = sourceElement.closest(".member-slot");
      if (memberSlot) {
        memberSlot.style.width = memberSlot.offsetWidth + "px";
        memberSlot.style.height = memberSlot.offsetHeight + "px";
        memberSlot.dataset.dragFrozen = "true";
      }
      setTimeout(() => {
        sourceElement.classList.add("dragging-source");
      }, 0);
    }
  });

  document.addEventListener("dragend", () => {
    if (dragState?.sourceElement) {
      dragState.sourceElement.classList.remove("dragging-source");
      // Unfreeze the member-slot dimensions and re-tighten
      const memberSlot = dragState.sourceElement.closest(".member-slot");
      if (memberSlot) {
        memberSlot.style.width = "";
        memberSlot.style.height = "";
        delete memberSlot.dataset.dragFrozen;
      }
    }
    removeDragImageProxy();
    removeDropPreview();
    resetInsertionHysteresis();
    setDragState(null);
    clearDropHighlights();
    tightenLayout();
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
    if (!dropzone) {
      return;
    }

    const { dropKind, teamId } = dropzone.dataset;
    if (!canDrop(dropKind, teamId)) {
      return;
    }

    event.preventDefault();
    clearDropHighlights();
    const collapsedTeam = dropzone.closest('.team[data-view="collapsed"]');
    if (collapsedTeam) {
      collapsedTeam.classList.add("is-over");
    } else {
      dropzone.classList.add("is-over");
    }
    updateDropPreview(dropzone, event);
  });

  document.addEventListener("dragleave", (event) => {
    const dropzone = event.target.closest(".dropzone");
    if (dropzone) {
      dropzone.classList.remove("is-over");
    }
    const team = event.target.closest(".team.is-over");
    if (team && !team.contains(event.relatedTarget)) {
      team.classList.remove("is-over");
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
      (dropKind === "members" || dropKind === "subteams") ? getMemberInsertionIndex(dropzone, event) : undefined;

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

      if (dropKind === "members" && dragState.type === "employee") {
        copyEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
      }

      if (dropKind === "subteams" && dragState.type === "team") {
        copyTeamToTarget(dragState.id, teamId, insertIndex);
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

      if (dropKind === "members" && dragState.type === "employee") {
        moveEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
      }

      if (dropKind === "subteams" && dragState.type === "team") {
        moveTeamToTarget(dragState.id, teamId, insertIndex);
      }
    }

    removeDragImageProxy();
    removeDropPreview();
    setDragState(null);
    clearDropHighlights();
    render();
  });
}
