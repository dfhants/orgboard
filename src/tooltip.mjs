/**
 * Styled tooltips for anything with a `title` — icon buttons above all.
 *
 * One delegated listener serves the whole app, including markup rendered
 * later. While a tooltip is showing, the element's `title` is stashed so the
 * browser's own tooltip doesn't appear on top of ours; it is put back as soon
 * as the tooltip hides, so the attribute stays the single source of the text.
 */

const SHOW_DELAY = 350;   // ms before the first tooltip appears
const WARM_WINDOW = 400;  // ms after hiding during which the next one is instant
const GAP = 6;            // px between target and tooltip
const EDGE = 6;           // px kept clear of the viewport edge

// A team's title describes its status ribbon; popping that up whenever the
// pointer is anywhere inside a team would be noise, so it stays a native title.
const TARGET = "[title]:not(.team)";

let tip = null;
let current = null;
let stashedTitle = "";
let showTimer = 0;
let lastHidden = 0;

function ensureTip() {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  return tip;
}

/** Where to put a tooltip of the given size for a target rect, within a viewport. */
export function placeTooltip(target, size, viewport, { gap = GAP, edge = EDGE } = {}) {
  const above = target.top - gap - size.height;
  const below = target.bottom + gap;
  const fitsAbove = above >= edge;
  const fitsBelow = below + size.height <= viewport.height - edge;
  const top = fitsAbove || !fitsBelow ? Math.max(edge, above) : below;
  const centred = target.left + target.width / 2 - size.width / 2;
  const left = Math.min(Math.max(edge, centred), Math.max(edge, viewport.width - edge - size.width));
  return { top, left, placement: fitsAbove || !fitsBelow ? "top" : "bottom" };
}

function show(el) {
  const text = el.getAttribute("title");
  if (!text) return;
  hide();

  current = el;
  stashedTitle = text;
  el.setAttribute("title", "");

  const node = ensureTip();
  node.textContent = text;
  node.classList.add("is-visible");
  const { top, left, placement } = placeTooltip(
    el.getBoundingClientRect(),
    { width: node.offsetWidth, height: node.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  node.dataset.placement = placement;
  node.style.top = `${Math.round(top)}px`;
  node.style.left = `${Math.round(left)}px`;
}

function hide() {
  clearTimeout(showTimer);
  if (current) {
    // Put the title back unless the app changed it while we held it
    if (current.getAttribute("title") === "") current.setAttribute("title", stashedTitle);
    current = null;
    lastHidden = Date.now();
  }
  tip?.classList.remove("is-visible");
}

function schedule(el) {
  if (el === current) return;
  hide();
  const warm = Date.now() - lastHidden < WARM_WINDOW;
  showTimer = setTimeout(() => show(el), warm ? 0 : SHOW_DELAY);
}

export function setupTooltips() {
  document.addEventListener("mouseover", (event) => {
    const el = event.target instanceof Element ? event.target.closest(TARGET) : null;
    if (el) schedule(el);
    else hide();
  });
  document.addEventListener("mouseout", (event) => {
    if (current && !current.contains(event.relatedTarget)) hide();
  });
  document.addEventListener("focusin", (event) => {
    const el = event.target instanceof Element ? event.target.closest(TARGET) : null;
    // Only for keyboard focus — a mouse click focuses too, and should dismiss instead
    if (el && el.matches(":focus-visible")) schedule(el);
  });
  document.addEventListener("focusout", hide);
  for (const type of ["mousedown", "dragstart", "wheel", "keydown"]) {
    document.addEventListener(type, hide, { capture: true, passive: true });
  }
  window.addEventListener("blur", hide);
}
