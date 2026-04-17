import { state, boardZoom } from './state.mjs';

/**
 * Tighten the layout after rendering.
 *
 * CSS flex column-wrap (horizontal mode) and row-wrap (vertical mode) cannot
 * auto-size the cross-axis of the container. We measure actual rendered
 * content bottom-up and set explicit heights (horizontal) or widths (vertical)
 * so that containers, teams, and the root dropzone shrink-wrap their children.
 *
 * Must be called after every DOM mutation that changes card counts or layout.
 */
export function tightenLayout() {
  const rootDropzone = document.querySelector(".root-dropzone");
  if (!rootDropzone) return;

  const isHorizontal = state.rootLayout === "horizontal";

  // --- Reset previously set inline sizes (clear both axes to handle layout switches) ---
  rootDropzone.style.height = "";
  rootDropzone.style.width = "";
  for (const team of document.querySelectorAll(".team")) {
    team.style.height = "";
    team.style.width = "";
  }
  for (const slot of document.querySelectorAll(".member-slot")) {
    if (slot.dataset.dragFrozen) continue;
    slot.style.height = "";
    slot.style.width = "";
  }
  for (const subSlot of document.querySelectorAll(".subteam-slot")) {
    subSlot.style.height = "";
    subSlot.style.width = "";
  }
  for (const entry of document.querySelectorAll(".subteam-slot > .member-entry")) {
    entry.style.height = "";
    entry.style.width = "";
  }

  void document.body.offsetHeight;

  if (isHorizontal) {
    tightenAxis(rootDropzone, "height", "top", "bottom", "paddingBottom", "borderBottomWidth", "layout-horizontal");
  } else {
    tightenAxis(rootDropzone, "width", "left", "right", "paddingRight", "borderRightWidth", "layout-vertical");
  }
}

// Backwards-compat alias used by drag-drop.mjs
export const applyHorizontalPacking = tightenLayout;

function tightenAxis(rootDropzone, sizeProp, startEdge, endEdge, paddingProp, borderProp, layoutClass) {
  const allTeams = [...document.querySelectorAll(".team")].filter(
    (t) => t.dataset.view !== "collapsed"
  );
  allTeams.sort((a, b) => {
    const depthOf = (el) => {
      let d = 0;
      let p = el.parentElement;
      while (p) { if (p.classList?.contains("team")) d++; p = p.parentElement; }
      return d;
    };
    return depthOf(b) - depthOf(a);
  });

  for (const team of allTeams) {
    const teamBody = team.querySelector(":scope > .team-body");
    if (!teamBody) continue;

    const slot = teamBody.querySelector(`:scope > .member-slot.${layoutClass}`);
    if (slot && !slot.dataset.dragFrozen) {
      const children = slot.querySelectorAll(
        ":scope > .manager-slot, :scope > .member-entry:not(.dragging-source), :scope > .drag-preview-entry, :scope > .empty-note"
      );
      if (children.length > 0) {
        const slotStart = slot.getBoundingClientRect()[startEdge];
        const cs = getComputedStyle(slot);
        const maxEnd = Math.max(
          ...Array.from(children, (c) => c.getBoundingClientRect()[endEdge])
        );
        slot.style[sizeProp] =
          maxEnd - slotStart + parseFloat(cs[paddingProp]) + parseFloat(cs[borderProp]) + "px";
      }
    }

    const subSlot = teamBody.querySelector(":scope > .subteam-slot");
    if (subSlot && subSlot.children.length > 0) {
      for (const entry of subSlot.querySelectorAll(":scope > .member-entry:not(.dragging-source)")) {
        const childTeam = entry.querySelector(":scope > .child-team");
        if (!childTeam) continue;
        const innerTeam = childTeam.querySelector(":scope > .team");
        if (!innerTeam || innerTeam.getBoundingClientRect()[sizeProp] === 0) continue;
        const entryStart = entry.getBoundingClientRect()[startEdge];
        const cs = getComputedStyle(entry);
        const innerEnd = innerTeam.getBoundingClientRect()[endEdge];
        entry.style[sizeProp] =
          innerEnd - entryStart + parseFloat(cs[paddingProp]) + parseFloat(cs[borderProp]) + "px";
      }

      const visibleChildren = [...subSlot.children].filter(
        (c) => !c.classList.contains("dragging-source") && c.getBoundingClientRect()[sizeProp] > 0
      );
      if (visibleChildren.length > 0) {
        const subStart = subSlot.getBoundingClientRect()[startEdge];
        const cs = getComputedStyle(subSlot);
        const maxEnd = Math.max(
          ...Array.from(visibleChildren, (c) => c.getBoundingClientRect()[endEdge])
        );
        subSlot.style[sizeProp] =
          maxEnd - subStart + parseFloat(cs[paddingProp]) + parseFloat(cs[borderProp]) + "px";
      }
    }

    const directChildren = teamBody.querySelectorAll(
      ":scope > .member-slot, :scope > .subteam-slot"
    );
    if (directChildren.length === 0) continue;

    const teamStart = team.getBoundingClientRect()[startEdge];
    const cs = getComputedStyle(team);
    const maxEnd = Math.max(
      ...Array.from(directChildren, (c) => c.getBoundingClientRect()[endEdge])
    );
    team.style[sizeProp] =
      maxEnd - teamStart + parseFloat(cs[paddingProp]) + parseFloat(cs[borderProp]) + "px";
  }

  const gpChildren = rootDropzone.querySelectorAll(":scope > .team, :scope > .member-entry");
  if (gpChildren.length === 0) return;

  const gpStart = rootDropzone.getBoundingClientRect()[startEdge];
  const gpCs = getComputedStyle(rootDropzone);
  const gpMaxEnd = Math.max(
    ...Array.from(gpChildren, (c) => c.getBoundingClientRect()[endEdge])
  );
  rootDropzone.style[sizeProp] =
    gpMaxEnd - gpStart + parseFloat(gpCs[paddingProp]) + parseFloat(gpCs[borderProp]) + "px";
}

export function applyBoardZoomToShell(zoom) {
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  shell.style.setProperty("--board-zoom", String(zoom));
  const zoomLayer = document.querySelector(".board-zoom-layer");
  if (zoomLayer) zoomLayer.style.zoom = String(zoom);
}

function withUnzoomedLayout(fn) {
  const zoomLayer = document.querySelector(".board-zoom-layer");
  if (!zoomLayer) {
    fn();
    return;
  }
  const prevZoom = zoomLayer.style.zoom || String(boardZoom);
  zoomLayer.style.zoom = "1";
  fn();
  zoomLayer.style.zoom = prevZoom;
}

let packingObserver = null;

export function observeShellResize() {
  packingObserver?.disconnect();
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  packingObserver = new ResizeObserver(() => {
    withUnzoomedLayout(() => tightenLayout());
  });
  packingObserver.observe(shell);
}
