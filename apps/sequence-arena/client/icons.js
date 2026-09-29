// Sequence Arena icon set — a small, hand-authored inline-SVG library.
//
// Why: toolbar icons used to be emoji / text glyphs ("📊", "🎬", "♪", "☾"), so their look
// depended on whatever system emoji font the device shipped (and rendered as tofu where none
// existed). These icons are drawn on a 24px grid with a single stroke weight so every surface
// gets the same crisp, font-independent glyph that inherits `currentColor`.
//
// Security: DOM is built with document.createElementNS + setAttribute only (no innerHTML /
// markup strings), per scripts/static-security-lint-test.mjs.
//
// Usage:
//   <span class="icon-slot" data-icon="chart"></span>  +  mountIcons(document)
//   setIcon(slotElement, "speakerOff")                  // swap glyph on state change
//   createIcon("close", { size: 18 })                   // standalone SVGElement

const SVG_NS = "http://www.w3.org/2000/svg";

// Each icon is a list of [tagName, attributes] primitives. Shared presentation attributes
// (stroke, fill, caps) live on the root <svg>; a primitive may override (e.g. fill for dots).
const SPEAKER_BODY = ["path", { d: "M4 9.5h3.5L12 5.5v13l-4.5-4H4z" }];
const PHONE_BODY = ["rect", { x: "8", y: "4", width: "8", height: "16", rx: "2" }];
const DOT = { fill: "currentColor", stroke: "none" };

const ICONS = {
  globe: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M3 12h18" }],
    ["path", { d: "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" }],
  ],
  sun: [
    ["circle", { cx: "12", cy: "12", r: "4" }],
    ["path", { d: "M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" }],
  ],
  moon: [["path", { d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" }]],
  chart: [
    ["path", { d: "M4 20h16" }],
    ["rect", { x: "5", y: "11", width: "3", height: "6", rx: "1" }],
    ["rect", { x: "10.5", y: "7", width: "3", height: "10", rx: "1" }],
    ["rect", { x: "16", y: "4", width: "3", height: "13", rx: "1" }],
  ],
  film: [
    ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5" }],
    ["path", { d: "M10 9.2v5.6l4.6-2.8z", fill: "currentColor" }],
  ],
  help: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.1-2.5 3.8" }],
    ["circle", { cx: "12", cy: "17.1", r: "1.1", ...DOT }],
  ],
  download: [
    ["path", { d: "M12 4v11" }],
    ["path", { d: "M7.5 10.5 12 15l4.5-4.5" }],
    ["path", { d: "M5 19.5h14" }],
  ],
  speaker: [SPEAKER_BODY, ["path", { d: "M15.5 9a4 4 0 0 1 0 6" }], ["path", { d: "M18 6.5a7.5 7.5 0 0 1 0 11" }]],
  speakerOff: [SPEAKER_BODY, ["path", { d: "M16 9.5l5 5M21 9.5l-5 5" }]],
  vibrate: [PHONE_BODY, ["path", { d: "M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" }]],
  vibrateOff: [PHONE_BODY, ["path", { d: "M3.5 3.5l17 17" }]],
  bell: [["path", { d: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" }], ["path", { d: "M10 20.5a2 2 0 0 0 4 0" }]],
  settings: [
    ["path", { d: "M4 7h9M17 7h3M4 17h3M11 17h9" }],
    ["circle", { cx: "15", cy: "7", r: "2" }],
    ["circle", { cx: "9", cy: "17", r: "2" }],
  ],
  close: [["path", { d: "M6 6l12 12M18 6 6 18" }]],
  menu: [["path", { d: "M4 7h16M4 12h16M4 17h16" }]],
  more: [
    ["circle", { cx: "6", cy: "12", r: "1.6", ...DOT }],
    ["circle", { cx: "12", cy: "12", r: "1.6", ...DOT }],
    ["circle", { cx: "18", cy: "12", r: "1.6", ...DOT }],
  ],
  share: [
    ["path", { d: "M12 3.5v11M8 7.5l4-4 4 4" }],
    ["path", { d: "M7 11H5.5a1 1 0 0 0-1 1v7a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1 1 0 0 0-1-1H17" }],
  ],
  play: [["path", { d: "M8 5.5v13l10.5-6.5z", fill: "currentColor" }]],
  trophy: [
    ["path", { d: "M8 4h8v5a4 4 0 0 1-8 0z" }],
    ["path", { d: "M8 5.5H5V7a3 3 0 0 0 3 3M16 5.5h3V7a3 3 0 0 1-3 3" }],
    ["path", { d: "M12 13v3.5M8.5 20h7M10 20l.5-3.5h3L14 20" }],
  ],
  puzzle: [["path", { d: "M4 7h4a2.25 2.25 0 1 1 4.5 0H17v4.5a2.25 2.25 0 1 1 0 4.5V20H4z" }]],
  calendar: [
    ["rect", { x: "4", y: "5.5", width: "16", height: "14.5", rx: "2" }],
    ["path", { d: "M4 10h16M8.5 3.5v4M15.5 3.5v4" }],
  ],
  user: [["circle", { cx: "12", cy: "8.5", r: "3.5" }], ["path", { d: "M5 20a7 7 0 0 1 14 0" }]],
  check: [["path", { d: "M5 12.5 9.5 17 19 7.5" }]],
  chevronDown: [["path", { d: "M6 9.5l6 6 6-6" }]],
  chevronRight: [["path", { d: "M9.5 6l6 6-6 6" }]],
  compass: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M15.5 8.5l-2 5-5 2 2-5z" }]],
  users: [
    ["circle", { cx: "9", cy: "8.5", r: "3.25" }],
    ["path", { d: "M3 19.5a6 6 0 0 1 12 0" }],
    ["path", { d: "M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.2a6 6 0 0 1 3.5 5.3" }],
  ],
};

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

// Build a decorative SVG. Icons are aria-hidden by default: the owning control carries the
// accessible name (aria-label or visible text). Pass `title` only for a standalone, meaningful
// graphic — it then becomes role="img" with an accessible name.
export function createIcon(name, { size = 20, title = "", className = "" } = {}) {
  if (typeof document === "undefined" || !hasIcon(name)) {
    return null;
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icon icon-${name}${className ? ` ${className}` : ""}`);
  if (title) {
    svg.setAttribute("role", "img");
    const titleNode = document.createElementNS(SVG_NS, "title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const [tag, attrs] of ICONS[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    svg.appendChild(node);
  }
  return svg;
}

// Render `name` into a slot element, replacing its children. No-op when the slot already shows
// that icon, so state-sync functions can call it on every render without DOM churn.
export function setIcon(slot, name, options) {
  if (!slot || slot.getAttribute("data-icon-rendered") === name) {
    return;
  }
  const icon = createIcon(name, options);
  if (!icon) return;
  slot.replaceChildren(icon);
  slot.setAttribute("data-icon", name);
  slot.setAttribute("data-icon-rendered", name);
}

// Hydrate every `[data-icon]` placeholder under `root` (static markup declares the slot; JS
// draws the glyph). Returns the number of slots rendered.
export function mountIcons(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope || typeof scope.querySelectorAll !== "function") {
    return 0;
  }
  let count = 0;
  for (const slot of scope.querySelectorAll("[data-icon]")) {
    const name = slot.getAttribute("data-icon");
    if (name && hasIcon(name)) {
      const size = Number(slot.getAttribute("data-icon-size")) || undefined;
      setIcon(slot, name, size ? { size } : undefined);
      count += 1;
    }
  }
  return count;
}
