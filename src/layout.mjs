import { boardZoom, setBoardZoom, MIN_BOARD_ZOOM, BOARD_ZOOM_STEP } from './state.mjs';

/**
 * Board zoom.
 *
 * The board's layout is pure CSS flow (see tokens.css) and depends only on
 * its content. Zoom — a scale transform on .board-zoom-layer, driven by the
 * --board-zoom custom property — is the only thing that adapts it to the
 * viewport.
 */

export function applyBoardZoomToShell(zoom) {
  const shell = document.querySelector(".page-shell");
  if (!shell) return;
  shell.style.setProperty("--board-zoom", String(zoom));
}

export function syncBoardZoomUI() {
  applyBoardZoomToShell(boardZoom);
  const label = document.getElementById("zoom-level-label");
  if (label) label.textContent = `${Math.round(boardZoom * 100)}%`;
  updateBoardScrollFades();
}

/**
 * The zoom at which a board of the given natural (100%) size exactly fits the
 * available area, in whole percent and never above `max`. Zoom is a plain
 * scale, so this is simple division.
 */
export function computeFitZoom({ boardWidth, boardHeight, availableWidth, availableHeight, min = MIN_BOARD_ZOOM, max = 1 }) {
  if (!(boardWidth > 0) || !(boardHeight > 0)) return max;
  const fit = Math.min(availableWidth / boardWidth, availableHeight / boardHeight, max);
  return Math.max(min, Math.floor(fit * 100) / 100);
}

/** The zoom at which the whole board is visible without scrolling, or null with no board. */
function measureFitZoom() {
  const shell = document.querySelector(".page-shell");
  const board = shell?.querySelector(".root-dropzone");
  if (!shell || !board || board.children.length === 0) return null;

  const cs = getComputedStyle(shell);
  const inset = parseFloat(cs.getPropertyValue("--board-inset")) || 0;
  const clearance = parseFloat(cs.getPropertyValue("--board-clearance")) || 0;
  // The board's dashed drop outline sits a few pixels outside the teams
  const OUTLINE = 6;

  // Measure the teams themselves — the board element stretches to fill the shell.
  // Rects are on-screen sizes, so divide by the current zoom for natural size.
  const origin = board.getBoundingClientRect();
  let right = origin.left;
  let bottom = origin.top;
  for (const child of board.children) {
    const rect = child.getBoundingClientRect();
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  return computeFitZoom({
    boardWidth: (right - origin.left) / boardZoom,
    boardHeight: (bottom - origin.top) / boardZoom,
    availableWidth: shell.clientWidth - 2 * inset - OUTLINE,
    availableHeight: shell.clientHeight - inset - clearance - OUTLINE,
  });
}

/**
 * The smallest zoom worth having: the one that shows the whole board. There is
 * nothing more to see by zooming out past it.
 */
export function minBoardZoom() {
  return measureFitZoom() ?? 1;
}

/**
 * The next zoom level one step in or out. Levels are whole multiples of
 * `step`, so from an in-between value (such as a fit zoom of 13%) stepping in
 * lands on 20%, not 23%. Stepping out never goes below `min`.
 */
export function nextZoomLevel(zoom, direction, { step, min }) {
  const pct = Math.round(zoom * 100);
  const stepPct = Math.round(step * 100);
  if (direction > 0) return (Math.floor(pct / stepPct) + 1) * stepPct / 100;
  const down = (Math.ceil(pct / stepPct) - 1) * stepPct / 100;
  return Math.min(zoom, Math.max(down, min));
}

/** Zoom one step in (direction > 0) or out, stopping at the zoom that fits the whole board. */
export function stepBoardZoom(direction) {
  setBoardZoom(nextZoomLevel(boardZoom, direction, { step: BOARD_ZOOM_STEP, min: minBoardZoom() }));
  syncBoardZoomUI();
}

/** Zoom so the whole board is visible, then scroll back to its top-left. */
export function fitBoardToScreen() {
  const fit = measureFitZoom();
  if (fit == null) return;
  setBoardZoom(fit);
  syncBoardZoomUI();
  document.querySelector(".page-shell")?.scrollTo({ left: 0, top: 0 });
}

/** Which edges of a scroll container have more content beyond them. */
export function scrollableEdges({ scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight }) {
  return {
    left: scrollLeft > 0,
    right: scrollLeft + clientWidth < scrollWidth - 1,
    up: scrollTop > 0,
    down: scrollTop + clientHeight < scrollHeight - 1,
  };
}

/** Fade the board out at each edge it can still be scrolled towards. */
export function updateBoardScrollFades() {
  const shell = document.querySelector(".page-shell");
  const fades = document.querySelector(".board-scroll-fades");
  if (!shell || !fades) return;
  for (const [edge, on] of Object.entries(scrollableEdges(shell))) {
    fades.classList.toggle(`can-scroll-${edge}`, on);
  }
}
