import {
  state, dragState, setDragState, dropPreview, setDropPreview,
  dragImageProxy, setDragImageProxy, isCopyMode,
  getTeam,
} from './state.mjs';
import {
  moveEmployeeToTeam, moveEmployeeToRoster, moveTeamToTarget,
  copyEmployeeToTeam, copyEmployeeToRoster, copyTeamToTarget,
} from './operations.mjs';
import { isTeamInside } from './team-logic.mjs';
import { render, applyHorizontalPacking } from './render.mjs';

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
    return dropKind === "members" && dragState.id !== teamId && !isTeamInside(state.teams, dragState.id, teamId);
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
  for (let index = 0; index < entries.length; index += 1) {
    const rect = entries[index].getBoundingClientRect();
    if (event.clientY < rect.top) {
      return index;
    }
    if (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2) {
      return index;
    }
  }

  return entries.length;
}

/**
 * Column-aware insertion index for horizontal layouts where entries live
 * inside .people-column wrappers.  Iterate columns left-to-right, entries
 * top-to-bottom within each column.
 */
function computeColumnInsertionIndex(flatEntries, columns, event) {
  let flatIdx = 0;
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const colRect = col.getBoundingClientRect();
    const colEntries = [...col.children].filter(
      n => n.classList.contains("member-entry") && !n.classList.contains("drag-preview-entry") && !n.classList.contains("dragging-source")
    );

    // Determine if cursor is within this column's horizontal band.
    // For the last column, extend to infinity on the right.
    const isLastCol = ci === columns.length - 1;
    const inColumn = isLastCol
      ? event.clientX >= colRect.left
      : event.clientX < colRect.right + (columns[ci + 1].getBoundingClientRect().left - colRect.right) / 2;

    if (inColumn) {
      for (const entry of colEntries) {
        const r = entry.getBoundingClientRect();
        if (event.clientY < r.top + r.height / 2) {
          return flatIdx;
        }
        flatIdx++;
      }
      // Below all entries in this column
      return flatIdx;
    }

    flatIdx += colEntries.length;
  }

  return flatEntries.length;
}

export function getMemberInsertionIndex(dropzone, event) {
  const peopleGroup = dropzone.querySelector(":scope > .people-group");
  const columns = peopleGroup ? [...peopleGroup.querySelectorAll(":scope > .people-column")] : [];
  const isColumnLayout = columns.length > 0;

  // Collect ALL member-entry nodes: employees inside .people-group (or its columns) + teams as direct children
  let entries;
  if (isColumnLayout) {
    // Column layout: entries live inside .people-column wrappers
    const pgEntries = [];
    for (const col of columns) {
      for (const child of col.children) {
        if (child.classList.contains("member-entry") && !child.classList.contains("drag-preview-entry") && !child.classList.contains("dragging-source")) {
          pgEntries.push(child);
        }
      }
    }
    // Also include direct team children of the dropzone
    const teamEntries = [...dropzone.querySelectorAll(
      ':scope > .member-entry:not(.drag-preview-entry):not(.dragging-source)'
    )];
    entries = [...pgEntries, ...teamEntries];
  } else {
    entries = [...dropzone.querySelectorAll(
      ':scope > .member-entry:not(.drag-preview-entry):not(.dragging-source), :scope > .people-group > .member-entry:not(.drag-preview-entry):not(.dragging-source)'
    )];
  }

  if (entries.length === 0) {
    const teamId = dropzone.dataset.teamId;
    return teamId ? getTeam(teamId).members.length : 0;
  }

  const rawIndex = isColumnLayout
    ? computeColumnInsertionIndex(entries, columns, event)
    : computeRawInsertionIndex(entries, event);

  // Map visual position to array index using data-member-index attributes
  function visualToArrayIndex(visIdx) {
    if (visIdx < entries.length) {
      return Number(entries[visIdx].dataset.memberIndex);
    }
    const teamId = dropzone.dataset.teamId;
    return teamId ? getTeam(teamId).members.length : 0;
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
  return visualToArrayIndex(rawIndex);
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
  const isCollapsed = dropzone?.closest('.team[data-view="collapsed"]');
  if (isCollapsed) {
    preview.className = "facepile-dot drag-preview-dot";
    preview.setAttribute("aria-hidden", "true");
    return preview;
  }
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
  if (!dragState || dropzone.dataset.dropKind !== "members") {
    removeDropPreview();
    return;
  }

  const isCollapsed = !!dropzone.closest('.team[data-view="collapsed"]');
  const currentIsCollapsed = dropPreview?.classList.contains("drag-preview-dot");
  if (dropPreview && isCollapsed !== !!currentIsCollapsed) {
    removeDropPreview();
  }

  if (!dropPreview) {
    setDropPreview(createDropPreview(dropzone));
  }

  if (isCollapsed) {
    const facepile = dropzone.querySelector(".member-facepile");
    if (facepile && dropPreview.parentElement !== facepile) {
      facepile.appendChild(dropPreview);
    }
    return;
  }

  // Place the preview in the correct container based on drag type
  const peopleGroup = dropzone.querySelector(":scope > .people-group");

  if (dragState.type === "employee" && peopleGroup) {
    // Employee preview goes inside people-group
    const columns = [...peopleGroup.querySelectorAll(":scope > .people-column")];
    const isColumnLayout = columns.length > 0;

    if (isColumnLayout) {
      // Column layout: entries are inside .people-column wrappers.
      // Collect flat entry list across all columns (left→right, top→bottom).
      const flatEntries = [];
      for (const col of columns) {
        for (const child of col.children) {
          if (child.classList.contains("member-entry") && !child.classList.contains("drag-preview-entry") && !child.classList.contains("dragging-source")) {
            flatEntries.push(child);
          }
        }
      }

      const insertPos = computeColumnInsertionIndex(flatEntries, columns, event);

      // Unwrap columns back to flat children in the people-group
      for (const col of columns) {
        while (col.firstChild) peopleGroup.insertBefore(col.firstChild, col);
        col.remove();
      }
      peopleGroup.classList.remove("has-columns");

      // Re-collect entries after unwrap (same elements, now direct children)
      const entries = [...peopleGroup.children].filter(
        n => n.classList.contains("member-entry") && !n.classList.contains("drag-preview-entry") && !n.classList.contains("dragging-source")
      );
      const anchor = entries[insertPos] ?? null;
      peopleGroup.insertBefore(dropPreview, anchor);

      // Repack into columns (including the preview)
      applyHorizontalPacking();
    } else {
      // Vertical / no-column layout — original behavior
      const entries = [...peopleGroup.children].filter(
        (node) =>
          node.classList.contains("member-entry") &&
          !node.classList.contains("drag-preview-entry") &&
          !node.classList.contains("dragging-source"),
      );
      const insertPos = computeRawInsertionIndex(entries, event);
      const anchor = entries[insertPos] ?? null;
      const moved = dropPreview.parentElement !== peopleGroup || dropPreview.nextSibling !== anchor;

      if (moved) {
        peopleGroup.insertBefore(dropPreview, anchor);
      }
    }
  } else {
    // Team preview (or employee into empty team with no people-group) goes as direct child of member-slot
    const entries = [...dropzone.children].filter(
      (node) =>
        node.classList.contains("member-entry") &&
        !node.classList.contains("drag-preview-entry") &&
        !node.classList.contains("dragging-source"),
    );
    const insertPos = computeRawInsertionIndex(entries, event);
    const anchor = entries[insertPos] ?? null;
    const moved = dropPreview.parentElement !== dropzone || dropPreview.nextSibling !== anchor;

    if (moved) {
      dropzone.insertBefore(dropPreview, anchor);
    }
  }
}

function resolveDropzone(event) {
  const naiveDropzone = event.target.closest(".dropzone");
  if (!dragState) return naiveDropzone;

  const teamEl = event.target.closest(".team");
  if (!teamEl) return naiveDropzone;

  const managerSlot = teamEl.querySelector(":scope > .team-body > .manager-slot.dropzone");
  const memberSlot = teamEl.querySelector(":scope > .team-body > .member-slot.dropzone");

  if (naiveDropzone === managerSlot || naiveDropzone === memberSlot) {
    return naiveDropzone;
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
    const closestSlot = draggable.closest(".manager-slot, .member-slot, .roster-cards");
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
          : draggable.closest(".roster-cards")
            ? "roster"
            : null,
      sourceTeamId: draggable.closest(".member-slot, .manager-slot")?.dataset.teamId ?? null,
      sourceIndex: Number(draggable.closest(".member-entry")?.dataset.memberIndex ?? -1),
      previewWidth: Math.round(previewRect?.width ?? 84),
      previewHeight: Math.round(previewRect?.height ?? 84),
      sourceElement,
    });

    event.dataTransfer.effectAllowed = isCopyMode ? "copy" : "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: dragState.type, id: dragState.id }));
    setCustomDragImage(event, draggable, previewNode);

    if (!isCopyMode && sourceElement) {
      setTimeout(() => {
        sourceElement.classList.add("dragging-source");
      }, 0);
    }
  });

  document.addEventListener("dragend", () => {
    if (dragState?.sourceElement) {
      dragState.sourceElement.classList.remove("dragging-source");
    }
    removeDragImageProxy();
    removeDropPreview();
    resetInsertionHysteresis();
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
    if (!dropzone) {
      return;
    }

    const { dropKind, teamId } = dropzone.dataset;
    if (!canDrop(dropKind, teamId)) {
      return;
    }

    event.preventDefault();
    clearDropHighlights();
    dropzone.classList.add("is-over");
    updateDropPreview(dropzone, event);
  });

  document.addEventListener("dragleave", (event) => {
    const dropzone = event.target.closest(".dropzone");
    if (dropzone) {
      dropzone.classList.remove("is-over");
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
      dropKind === "members" ? getMemberInsertionIndex(dropzone, event) : undefined;

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

      if (dropKind === "members") {
        if (dragState.type === "employee") {
          copyEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
        }

        if (dragState.type === "team") {
          copyTeamToTarget(dragState.id, teamId, insertIndex);
        }
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

      if (dropKind === "members") {
        if (dragState.type === "employee") {
          moveEmployeeToTeam(dragState.id, teamId, "members", insertIndex);
        }

        if (dragState.type === "team") {
          moveTeamToTarget(dragState.id, teamId, insertIndex);
        }
      }
    }

    removeDragImageProxy();
    removeDropPreview();
    setDragState(null);
    clearDropHighlights();
    render();
  });
}
