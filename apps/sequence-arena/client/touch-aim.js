// Touch "aim and release" for the board on phones.
// A phone board cell is only ~24–41 CSS px — smaller than a fingertip — so a tap can land on
// the neighbouring cell, and the finger hides the very card being targeted. With a card
// selected, press and hold (or slide) on the board: a magnifier above the finger shows the
// cell under it (green outline = a legal target, red = not), slide to adjust, release to
// place. Lifting off the board or on a cell that is not a target cancels. A quick tap still
// goes through the normal click → place path untouched, and only pointerType "touch" ever
// gets here, so mouse, pen, keyboard and the mouse-driven test suite behave exactly as before.
// DOM is built with createElement only; the magnifier is a canvas copying the live board.

const HOLD_MS = 150; // finger held this long without lifting → aim mode
const SLOP_PX = 8; // or moved this far
const LOUPE_PX = 120; // magnifier diameter (CSS px)
const LOUPE_CELLS = 2.2; // board cells visible across the magnifier
const LIFT_PX = 52; // gap between the fingertip and the magnifier
const EDGE_PX = 6;
const CLICK_GRACE_MS = 800;

export function createTouchAim({ canvas, boardSize, canAim, isLegal, place, onAim, haptic }) {
  let gesture = null; // { id, x, y, startX, startY, aiming, cell, timer }
  let loupe = null;
  let loupeCtx = null;
  let frame = 0;
  let swallowClickUntil = 0;

  function cellAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const pitch = rect.width / boardSize;
    const col = Math.min(boardSize - 1, Math.max(0, Math.floor((clientX - rect.left) / pitch)));
    const row = Math.min(boardSize - 1, Math.max(0, Math.floor((clientY - rect.top) / pitch)));
    return row * boardSize + col;
  }

  function ensureLoupe() {
    if (loupe) return;
    loupe = document.createElement("canvas");
    loupe.className = "board-loupe";
    loupe.setAttribute("aria-hidden", "true");
    loupe.hidden = true;
    document.body.append(loupe);
    loupeCtx = loupe.getContext("2d");
  }

  function positionLoupe() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = gesture.x - LOUPE_PX / 2;
    let y = gesture.y - LIFT_PX - LOUPE_PX;
    if (y < EDGE_PX) {
      // No room above (top rows): beside the finger, on the side with more space.
      y = Math.min(vh - LOUPE_PX - EDGE_PX, Math.max(EDGE_PX, gesture.y - LOUPE_PX / 2));
      x = gesture.x < vw / 2 ? gesture.x + LIFT_PX : gesture.x - LIFT_PX - LOUPE_PX;
    }
    x = Math.min(vw - LOUPE_PX - EDGE_PX, Math.max(EDGE_PX, x));
    loupe.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function roundedRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function paint() {
    frame = 0;
    if (!gesture || !gesture.aiming) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    const px = Math.round(LOUPE_PX * dpr);
    if (loupe.width !== px) {
      loupe.width = px;
      loupe.height = px;
    }
    const pitch = rect.width / boardSize;
    const cell = gesture.cell;
    // Centre on the aimed cell (snaps, so the card is always whole), or on the finger when off
    // the board. Source coordinates are canvas backing pixels.
    const fx = cell == null ? gesture.x - rect.left : ((cell % boardSize) + 0.5) * pitch;
    const fy = cell == null ? gesture.y - rect.top : (Math.floor(cell / boardSize) + 0.5) * pitch;
    const k = canvas.width / rect.width;
    const span = pitch * LOUPE_CELLS;
    const g = loupeCtx;
    g.clearRect(0, 0, px, px);
    g.save();
    g.beginPath();
    g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "#0b231c";
    g.fillRect(0, 0, px, px);
    g.drawImage(canvas, (fx - span / 2) * k, (fy - span / 2) * k, span * k, span * k, 0, 0, px, px);
    if (cell != null) {
      // Board cards are 0.6912 × 0.96 of the cell pitch, centred in the cell.
      const cellPx = px / LOUPE_CELLS;
      const w = cellPx * 0.6912 + 8 * dpr;
      const h = cellPx * 0.96 + 8 * dpr;
      g.lineWidth = 4 * dpr;
      g.strokeStyle = isLegal(cell) ? "rgba(34, 197, 104, 0.98)" : "rgba(214, 58, 82, 0.95)";
      roundedRectPath(g, (px - w) / 2, (px - h) / 2, w, h, 8 * dpr);
      g.stroke();
    }
    g.restore();
    g.lineWidth = 3 * dpr;
    g.strokeStyle = "rgba(255, 248, 233, 0.96)";
    g.beginPath();
    g.arc(px / 2, px / 2, px / 2 - 1.5 * dpr, 0, Math.PI * 2);
    g.stroke();
    // Keep copying while aiming: the board's target pulse keeps animating underneath.
    frame = window.requestAnimationFrame(paint);
  }

  function updateAim() {
    const cell = cellAt(gesture.x, gesture.y);
    if (cell !== gesture.cell) {
      gesture.cell = cell;
      const legal = cell != null && isLegal(cell);
      onAim?.(legal ? cell : null);
      if (legal) haptic?.();
    }
    positionLoupe();
    if (!frame) frame = window.requestAnimationFrame(paint);
  }

  function startAiming() {
    if (!gesture || gesture.aiming) return;
    window.clearTimeout(gesture.timer);
    if (!canAim()) {
      gesture = null;
      return;
    }
    gesture.aiming = true;
    ensureLoupe();
    loupe.hidden = false;
    updateAim();
  }

  function end() {
    if (!gesture) return null;
    const ended = gesture;
    window.clearTimeout(ended.timer);
    gesture = null;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (loupe) loupe.hidden = true;
    // The browser may still turn the gesture into a click; that click must not place again.
    if (ended.aiming) swallowClickUntil = performance.now() + CLICK_GRACE_MS;
    return ended;
  }

  canvas.addEventListener("pointerdown", (event) => {
    // Any new press starts fresh: a cancelled aim must not swallow the next real tap.
    swallowClickUntil = 0;
    if (gesture && event.pointerId !== gesture.id) {
      end(); // a second finger cancels the aim
      return;
    }
    if (event.pointerType !== "touch" || !event.isPrimary || !canAim()) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, aiming: false, cell: undefined, timer: 0 };
    gesture.timer = window.setTimeout(startAiming, HOLD_MS);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    if (gesture.aiming) {
      updateAim();
    } else if (Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > SLOP_PX) {
      startAiming();
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const ended = end();
    if (!ended.aiming) return; // a quick tap: the regular click handler places
    const cell = cellAt(event.clientX, event.clientY);
    if (cell != null && canAim() && isLegal(cell)) place(cell);
  });

  for (const type of ["pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, (event) => {
      if (gesture && event.pointerId === gesture.id) end();
    });
  }

  // Android opens a context menu on a long press; never while aiming.
  canvas.addEventListener("contextmenu", (event) => {
    if (gesture?.aiming || performance.now() < swallowClickUntil) event.preventDefault();
  });

  return {
    // True (once) for the click a just-finished aim gesture produces.
    consumeClick() {
      if (performance.now() >= swallowClickUntil) return false;
      swallowClickUntil = 0;
      return true;
    },
    isAiming: () => Boolean(gesture?.aiming),
    cancel: end,
  };
}
