// Canvas RENDER ORCHESTRATION for the board: turns clientState.game + the live
// animation state into a full board frame. It sits one layer above the low-level
// painters in board-paint.js (drawRoundedRect/drawChip/drawBoardTargetMarker/
// drawCardFaceDetails) — it decides WHAT to draw where; those decide HOW to paint it.
// Following the board-paint.js precedent, the shared references this slice needs
// (canvas, the singleton 2D ctx, clientState, the animation timing constants, and the
// three peer helpers selectedCard/isYourTurn/scheduleTargetPulseFrame) are injected once
// at app.js boot via bindBoardRenderContext(); keeping them behind one module-scoped
// `host` handle let the ~630 extracted lines move here byte-identical (only the injected
// identifiers are read through `host`). The felt-pattern caches live here too since only
// getRailFeltPattern/getBoardSurfacePattern touch them.
import { BOARD_SIZE } from "../shared/game-core.js";
import {
  drawRoundedRect,
  drawChip,
  drawBoardTargetMarker,
  drawCardFaceDetails,
} from "./board-paint.js";

let host = null;

export function bindBoardRenderContext(context) {
  host = context;
}

// Cached CanvasPattern for the woven-felt look on the board rail. Generated once on first
// use (per theme variant) — regenerating a 32px noise pattern every frame would burn ~ms.
let railFeltPattern = null;
let railFeltPatternTheme = null;
// Cached pattern for the inner playing surface — finer grain, lower contrast than the rail
// so the rank/suit text and chips read cleanly on top of it.
let boardSurfacePattern = null;
let boardSurfacePatternTheme = null;

export function drawPlaceholderBoard() {
  const { canvas, ctx } = host;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const rail = ctx.createLinearGradient(0, 0, size, size);
  if (isDark) {
    rail.addColorStop(0, "#081d17");
    rail.addColorStop(1, "#030a08");
  } else {
    rail.addColorStop(0, "#19372d");
    rail.addColorStop(1, "#071612");
  }
  drawRoundedRect(0, 0, size, size, 34, rail, isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.12)", 4);

  const board = ctx.createLinearGradient(44, 44, size - 44, size - 44);
  if (isDark) {
    board.addColorStop(0, "#6b5424");
    board.addColorStop(0.55, "#4c3b18");
    board.addColorStop(1, "#2d2410");
  } else {
    board.addColorStop(0, "#f1dfae");
    board.addColorStop(0.55, "#d7bd78");
    board.addColorStop(1, "#a9803a");
  }
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  drawRoundedRect(
    54,
    54,
    size - 108,
    size - 108,
    26,
    board,
    isDark ? "rgba(12, 8, 2, 0.56)" : "rgba(62, 43, 18, 0.34)",
    3
  );
  ctx.restore();

  ctx.strokeStyle = isDark ? "rgba(220, 196, 140, 0.18)" : "rgba(84, 57, 22, 0.18)";
  ctx.lineWidth = 1.5;
  for (let index = 1; index < BOARD_SIZE; index += 1) {
    const position = 54 + ((size - 108) / BOARD_SIZE) * index;
    ctx.beginPath();
    ctx.moveTo(position, 70);
    ctx.lineTo(position, size - 70);
    ctx.moveTo(70, position);
    ctx.lineTo(size - 70, position);
    ctx.stroke();
  }

  ctx.fillStyle = isDark ? "rgba(244, 232, 196, 0.88)" : "rgba(44, 31, 17, 0.82)";
  ctx.font = '800 42px Georgia, "Times New Roman", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Sequence Arena", size / 2, size / 2 - 22);
  ctx.font = '700 18px "Trebuchet MS", sans-serif';
  ctx.fillStyle = isDark ? "rgba(244, 232, 196, 0.62)" : "rgba(44, 31, 17, 0.62)";
  ctx.fillText("방 준비 완료", size / 2, size / 2 + 22);
}

// Tiny offscreen canvas filled with a woven-felt look: a base tint plus a few diagonal
// hatch passes at very low alpha. Wrapped into a CanvasPattern so we can fill the full
// rail rectangle in one pass and the GPU tiles it. Result reads as the fuzz/weave of a
// game-table felt instead of a flat gradient.
function buildFeltPattern(baseRgba, darkLineRgba, lightLineRgba, tile = 28) {
  const { ctx } = host;
  const off = document.createElement("canvas");
  off.width = tile;
  off.height = tile;
  const pctx = off.getContext("2d");
  pctx.fillStyle = baseRgba;
  pctx.fillRect(0, 0, tile, tile);
  pctx.lineWidth = 1;
  // Two diagonal hatches at offset stride = woven-cloth look.
  pctx.strokeStyle = darkLineRgba;
  for (let i = -tile; i <= tile * 2; i += 4) {
    pctx.beginPath();
    pctx.moveTo(i, 0);
    pctx.lineTo(i + tile, tile);
    pctx.stroke();
  }
  pctx.strokeStyle = lightLineRgba;
  for (let i = -tile; i <= tile * 2; i += 4) {
    pctx.beginPath();
    pctx.moveTo(i + 2, 0);
    pctx.lineTo(i + 2 + tile, tile);
    pctx.stroke();
  }
  return ctx.createPattern(off, "repeat");
}

function getRailFeltPattern(theme) {
  if (railFeltPattern && railFeltPatternTheme === theme) return railFeltPattern;
  railFeltPatternTheme = theme;
  railFeltPattern =
    theme === "dark"
      ? buildFeltPattern("rgba(0,0,0,0)", "rgba(0,0,0,0.18)", "rgba(255,255,255,0.04)")
      : buildFeltPattern("rgba(0,0,0,0)", "rgba(0,0,0,0.14)", "rgba(255,255,255,0.06)");
  return railFeltPattern;
}

function getBoardSurfacePattern(theme) {
  if (boardSurfacePattern && boardSurfacePatternTheme === theme) return boardSurfacePattern;
  boardSurfacePatternTheme = theme;
  boardSurfacePattern =
    theme === "dark"
      ? buildFeltPattern("rgba(0,0,0,0)", "rgba(0,0,0,0.10)", "rgba(255,255,255,0.025)", 22)
      : buildFeltPattern("rgba(0,0,0,0)", "rgba(120,84,32,0.06)", "rgba(255,250,232,0.06)", 22);
  return boardSurfacePattern;
}

function boardPalette() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? {
        rail: ["#091e18", "#040f0c", "#020906"],
        railStroke: "rgba(255, 255, 255, 0.08)",
        board: ["#6a5423", "#4c3b17", "#2c2410"],
        boardStroke: "rgba(12, 8, 2, 0.52)",
      }
    : {
        rail: ["#183a30", "#0d261f", "#061411"],
        railStroke: "rgba(255, 255, 255, 0.14)",
        board: ["#f3e2b5", "#d6bd79", "#a77d35"],
        boardStroke: "rgba(39, 28, 16, 0.28)",
      };
}

export function drawBoard() {
  const { canvas, ctx, clientState, selectedCard, isYourTurn, scheduleTargetPulseFrame } = host;
  const { CHIP_PLACE_ANIM_MS, CHIP_REMOVE_ANIM_MS, TARGET_PULSE_ANIM_MS } = host.constants;
  if (!clientState.game) {
    drawPlaceholderBoard();
    return;
  }

  const size = canvas.width;
  const cellSize = size / BOARD_SIZE;
  const targetPulse = (performance.now() % TARGET_PULSE_ANIM_MS) / TARGET_PULSE_ANIM_MS;
  // Selection cannot change mid-draw, so the target-marker mode is resolved once per
  // frame here instead of per highlighted cell inside the extracted painter.
  const markerCard = selectedCard();
  ctx.clearRect(0, 0, size, size);

  const palette = boardPalette();
  const themeName = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

  // === RAIL (outer felt frame) ===
  const railGradient = ctx.createLinearGradient(0, 0, size, size);
  railGradient.addColorStop(0, palette.rail[0]);
  railGradient.addColorStop(0.48, palette.rail[1]);
  railGradient.addColorStop(1, palette.rail[2]);
  drawRoundedRect(0, 0, size, size, 34, railGradient, palette.railStroke, 4);
  // Woven-felt texture overlay on the rail.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.arcTo(size, 0, size, size, 34);
  ctx.arcTo(size, size, 0, size, 34);
  ctx.arcTo(0, size, 0, 0, 34);
  ctx.arcTo(0, 0, size, 0, 34);
  ctx.closePath();
  ctx.fillStyle = getRailFeltPattern(themeName);
  ctx.fill();
  ctx.restore();

  // === INNER PLAYING SURFACE ===
  const boardGradient = ctx.createLinearGradient(16, 16, size - 16, size - 16);
  boardGradient.addColorStop(0, palette.board[0]);
  boardGradient.addColorStop(0.52, palette.board[1]);
  boardGradient.addColorStop(1, palette.board[2]);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  drawRoundedRect(16, 16, size - 32, size - 32, 24, boardGradient, palette.boardStroke, 3);
  ctx.restore();
  // Fine paper-grain texture on the inner surface, fills the same rounded rect.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(16 + 24, 16);
  ctx.arcTo(size - 16, 16, size - 16, size - 16, 24);
  ctx.arcTo(size - 16, size - 16, 16, size - 16, 24);
  ctx.arcTo(16, size - 16, 16, 16, 24);
  ctx.arcTo(16, 16, size - 16, 16, 24);
  ctx.closePath();
  ctx.fillStyle = getBoardSurfacePattern(themeName);
  ctx.fill();
  ctx.restore();

  // === RAIL / SURFACE SEAM ===
  // Thin gold seam where the rail meets the playing surface — the metallic trim that
  // separates the felt rail from the card area on premium board games. Drawn as a slim
  // bright stroke just inside the surface edge.
  ctx.save();
  ctx.strokeStyle = themeName === "dark" ? "rgba(232, 196, 124, 0.62)" : "rgba(212, 162, 61, 0.74)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(18, 18, size - 36, size - 36, 22, "rgba(0,0,0,0)", ctx.strokeStyle, ctx.lineWidth);
  ctx.restore();

  // Inset shadow at the seam (surface feels recessed into the rail).
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(16 + 24, 16);
  ctx.arcTo(size - 16, 16, size - 16, size - 16, 24);
  ctx.arcTo(size - 16, size - 16, 16, size - 16, 24);
  ctx.arcTo(16, size - 16, 16, 16, 24);
  ctx.arcTo(16, 16, size - 16, 16, 24);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
  ctx.lineWidth = 8;
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 8;
  drawRoundedRect(14, 14, size - 28, size - 28, 26, "rgba(0,0,0,0)", ctx.strokeStyle, ctx.lineWidth);
  ctx.restore();

  const board = clientState.game?.board || [];
  for (const cell of board) {
    // 2026-05-25 — real playing-card aspect (~0.72 width:height like Bicycle poker
    // cards). Cards are full inner height but narrower; felt shows through on the
    // left/right of each card. Corner (wild) cells use the same card-rectangle box
    // and motif sizing so they don't look ~30% larger than the cards next to them.
    const x = cell.col * cellSize + 2;
    const y = cell.row * cellSize + 2;
    const inner = cellSize - 4;
    const cardHeight = inner;
    const cardWidth = inner * 0.72;
    const cardX = x + (inner - cardWidth) / 2;
    const cardY = y + (inner - cardHeight) / 2;
    const highlighted = clientState.legalTargets.includes(cell.id) && isYourTurn();
    const isLastMove = clientState.game.lastPlacedCellId === cell.id;
    const isKeyboardCursor =
      highlighted &&
      clientState.legalTargets[clientState.keyboardBoardIndex] === cell.id;

    let fill = highlighted ? "rgba(240, 255, 239, 0.98)" : "rgba(255, 252, 244, 0.95)";
    if (cell.corner) {
      fill = "rgba(248, 226, 169, 0.94)";
    } else if (cell.chip === "A") {
      fill = "rgba(250, 224, 229, 0.88)";
    } else if (cell.chip === "B") {
      fill = "rgba(224, 233, 255, 0.88)";
    }

    const stroke = isKeyboardCursor
      ? "rgba(199, 152, 61, 1)"
      : highlighted
        ? "rgba(36, 122, 81, 0.98)"
        : isLastMove
          ? "rgba(212, 162, 61, 0.88)"
          : "rgba(51, 35, 14, 0.2)";
    const lineWidth = isKeyboardCursor ? 6 : highlighted ? 5 : isLastMove ? 4 : 1.5;

    ctx.save();
    ctx.shadowColor = highlighted ? "rgba(34, 145, 83, 0.38)" : "rgba(36, 23, 9, 0.16)";
    ctx.shadowBlur = highlighted ? 14 : 5;
    ctx.shadowOffsetY = highlighted ? 0 : 2;
    // 2026-05-25 — corners now use the same card-rectangle box as regular cells so
    // their gold motif sits in a same-size frame as the playing cards around them
    // (was: corners filled the full inner square, which made them look ~30% larger
    // than the cards next to them).
    drawRoundedRect(cardX, cardY, cardWidth, cardHeight, 10, fill, stroke, lineWidth);
    ctx.restore();

    if (cell.corner) {
      // Wild corner cell — heraldic gold motif: concentric rings, sunburst rays, ornate star.
      // Centered on the card rectangle (not the cell square) so the motif aligns visually
      // with adjacent regular cards.
      const cx = cardX + cardWidth / 2;
      const cy = cardY + cardHeight / 2;
      // Radius keyed to the narrower dimension (cardWidth) so the motif fits inside the
      // rectangular card without overflowing into the felt gaps on left/right.
      const radius = cardWidth * 0.42;
      // All sizing now scales off cardWidth (the narrower dimension of the card box)
      // so the motif stays proportional to the same card frame that regular cells use.
      // Outer ring
      ctx.save();
      ctx.lineWidth = Math.max(1.4, cardWidth * 0.03);
      ctx.strokeStyle = "rgba(132, 96, 32, 0.78)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner ring
      ctx.strokeStyle = "rgba(132, 96, 32, 0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      // 8-point sunburst rays between the rings
      ctx.strokeStyle = "rgba(165, 122, 38, 0.7)";
      ctx.lineWidth = Math.max(1.2, cardWidth * 0.026);
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI / 4) * i;
        const x1 = cx + Math.cos(angle) * radius * 0.74;
        const y1 = cy + Math.sin(angle) * radius * 0.74;
        const x2 = cx + Math.cos(angle) * radius * 0.98;
        const y2 = cy + Math.sin(angle) * radius * 0.98;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      // Star — ornate, with a soft glow. Font scales off cardWidth so a 100px cell
      // with cardWidth ~69 yields ~48px star; previously inner*0.5 gave ~48 also but
      // the motif overflowed because rings/rays scaled off the (larger) inner.
      ctx.shadowColor = "rgba(212, 162, 61, 0.5)";
      ctx.shadowBlur = cardWidth * 0.08;
      ctx.fillStyle = "#7a5a1d";
      ctx.font = `800 ${Math.max(20, cardWidth * 0.66)}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", cx, cy - cardWidth * 0.02);
      ctx.restore();
      continue;
    }

    drawCardFaceDetails(cell.label, cardX, cardY, cardWidth, cardHeight);

    if (cell.chip) {
      const chipCenterX = cardX + cardWidth / 2;
      const chipCenterY = cardY + cardHeight / 2 + cardHeight * 0.07;
      // Chip radius is keyed to the cell `inner` dimension, not cardWidth — so the
      // 0.72-aspect card change doesn't shrink chips. Real Sequence chips overlap the
      // card edges; 0.32 of inner reproduces that "chip slightly wider than the card"
      // footprint.
      const chipRadius = inner * 0.32;
      const anim = clientState.chipPlacementAnim;
      let scale = 1;
      let scaleY = 1;
      let offsetY = 0;
      let alpha = 1;
      if (anim && anim.cellId === cell.id) {
        const t = Math.min(1, Math.max(0, (performance.now() - anim.startedAt) / (anim.durationMs || CHIP_PLACE_ANIM_MS)));
        const fall = 1 - t;
        offsetY = -fall * cardHeight * 0.45;
        alpha = Math.min(1, 0.1 + t * 2.6);
        if (t < 0.7) {
          // Free-fall: chip drops from off-screen-above, alpha ramps in, radius grows
          // from 0.3 to 1.08 (a touch larger than final to telegraph impact).
          scale = 0.3 + 1.08 * (t / 0.7);
        } else {
          // After impact (t=0.7): squash → bounce → settle. Uniform `scale` stays at
          // final size; scaleY varies on its own so the chip flattens like felt
          // absorbing weight, then rebounds slightly, then settles flat.
          scale = 1;
          if (t < 0.78) {
            scaleY = 1 - 0.3 * ((t - 0.7) / 0.08);          // squash 1.0 → 0.7
          } else if (t < 0.86) {
            scaleY = 0.7 + 0.35 * ((t - 0.78) / 0.08);      // bounce 0.7 → 1.05
          } else {
            scaleY = 1.05 - 0.05 * ((t - 0.86) / 0.14);     // settle 1.05 → 1.0
          }
        }
      } else if (anim && cell.chip) {
        // Adjacent-chip nudge: an occupied chip in one of the 8 cells around the
        // placement target gets a brief Y-only wobble when the new chip lands.
        // Sin half-cycle peaks mid-window and returns to rest. Scoped to 8-cell
        // neighborhood (Chebyshev distance 1) so the effect localises around
        // the impact instead of rippling across the whole board.
        const drow = Math.abs(Math.floor(cell.id / BOARD_SIZE) - Math.floor(anim.cellId / BOARD_SIZE));
        const dcol = Math.abs((cell.id % BOARD_SIZE) - (anim.cellId % BOARD_SIZE));
        if (drow <= 1 && dcol <= 1) {
          const elapsed = performance.now() - anim.startedAt;
          const nudgeStart = (anim.durationMs || CHIP_PLACE_ANIM_MS) * 0.72;
          const nudgeDur = 200;
          if (elapsed >= nudgeStart && elapsed <= nudgeStart + nudgeDur) {
            const u = (elapsed - nudgeStart) / nudgeDur;
            scaleY = 1 + 0.04 * Math.sin(u * Math.PI);
          }
        }
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      if (scaleY !== 1) {
        // Y-only transform anchored at the chip's landing center so squash/bounce
        // and neighbor nudge stay glued to their cells instead of drifting.
        const anchorY = chipCenterY + offsetY;
        ctx.translate(chipCenterX, anchorY);
        ctx.scale(1, scaleY);
        ctx.translate(-chipCenterX, -anchorY);
      }
      drawChip(
        chipCenterX,
        chipCenterY + offsetY,
        chipRadius * scale,
        cell.chip,
        cell.seqCount > 0
      );
      ctx.restore();
    }

    if (highlighted && markerCard) {
      drawBoardTargetMarker(
        cardX + cardWidth / 2,
        cardY + cardHeight / 2 + cardHeight * 0.07,
        cardWidth * 0.3,
        targetPulse,
        isKeyboardCursor,
        markerCard.action === "remove"
      );
    }

    const removal = clientState.chipRemovalAnim;
    if (!cell.chip && removal && removal.cellId === cell.id) {
      const t = Math.min(1, Math.max(0, (performance.now() - removal.startedAt) / (removal.durationMs || CHIP_REMOVE_ANIM_MS)));
      const chipCenterX = cardX + cardWidth / 2;
      const chipCenterY = cardY + cardHeight / 2 + cardHeight * 0.07;
      const chipRadius = inner * 0.32;
      const alpha = 1 - t;
      const scale = 1 + t * 0.9;
      ctx.save();
      ctx.globalAlpha = alpha * alpha;
      drawChip(chipCenterX, chipCenterY - t * cardHeight * 0.08, chipRadius * scale, removal.team, false);
      ctx.restore();

      const ringAlpha = Math.max(0, 0.42 * (1 - t));
      const ringRadius = chipRadius * (1 + t * 1.6);
      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = "rgba(173, 38, 62, 0.9)";
      ctx.lineWidth = Math.max(2, chipRadius * 0.22 * (1 - t));
      ctx.beginPath();
      ctx.arc(chipCenterX, chipCenterY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  drawSequenceCascade();
  drawVictoryWash();
  scheduleTargetPulseFrame();
}

// Render the sequence-completion cascade ON TOP of placed chips. Three layers:
// 1. Per-cell golden halo — each of the 5 cells lights up sequentially (cell i starts
//    at t = i * 0.09), fading in over ~15% of the animation and out over the rest.
// 2. Line stroke from c1 to c5 — appears at t≈0.2, fades by t≈0.7. Heavy blur shadow
//    gives the "line of light passing through the sequence" effect.
// 3. Board border pulse — last 240ms of the animation, sin half-cycle alpha, gold.
export function drawSequenceCascade() {
  const { canvas, ctx, clientState } = host;
  const { SEQUENCE_CASCADE_MS } = host.constants;
  const cascade = clientState.sequenceCascade;
  if (!cascade) return;
  const elapsed = performance.now() - cascade.startedAt;
  const t = Math.min(1, Math.max(0, elapsed / SEQUENCE_CASCADE_MS));
  const size = canvas.width;
  const cellSize = size / BOARD_SIZE;
  const haloColor = "255, 220, 96"; // warm gold; reads on both light and dark board

  // Layer 1: per-cell halos with staggered starts.
  for (let i = 0; i < cascade.cells.length; i += 1) {
    const cellId = cascade.cells[i];
    const stagger = i * 0.09;          // 0.0 / 0.09 / 0.18 / 0.27 / 0.36
    const fadeIn = 0.15;               // 15% of animation = 180ms
    if (t < stagger) continue;
    const localT = Math.min(1, (t - stagger) / (1 - stagger));
    const alpha = localT < fadeIn ? localT / fadeIn : Math.max(0, 1 - (localT - fadeIn) / (1 - fadeIn));
    if (alpha <= 0.01) continue;
    const col = cellId % BOARD_SIZE;
    const row = Math.floor(cellId / BOARD_SIZE);
    const cx = col * cellSize + 2 + (cellSize - 4) / 2;
    const cy = row * cellSize + 2 + (cellSize - 4) / 2 + (cellSize - 4) * 0.07;
    // Above two lines simplify to the same chipCenterX/Y formula used by the main draw loop.
    const radius = (cellSize - 4) * 0.32 * (1.2 + localT * 0.4);
    const grd = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2);
    grd.addColorStop(0, `rgba(${haloColor}, ${alpha * 0.85})`);
    grd.addColorStop(0.55, `rgba(${haloColor}, ${alpha * 0.32})`);
    grd.addColorStop(1, `rgba(${haloColor}, 0)`);
    ctx.save();
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Layer 2: line stroke connecting c1 to c5, fades in/out.
  if (cascade.cells.length >= 2 && t > 0.2 && t < 0.72) {
    const lineT = (t - 0.2) / 0.52;
    const lineAlpha = lineT < 0.25 ? lineT / 0.25 : Math.max(0, 1 - (lineT - 0.25) / 0.75);
    if (lineAlpha > 0.01) {
      const first = cascade.cells[0];
      const last = cascade.cells[cascade.cells.length - 1];
      const cellCenter = (id) => {
        const col = id % BOARD_SIZE;
        const row = Math.floor(id / BOARD_SIZE);
        return {
          x: col * cellSize + 2 + (cellSize - 4) / 2,
          y: row * cellSize + 2 + (cellSize - 4) / 2 + (cellSize - 4) * 0.07,
        };
      };
      const p1 = cellCenter(first);
      const p2 = cellCenter(last);
      ctx.save();
      ctx.globalAlpha = lineAlpha * 0.9;
      ctx.strokeStyle = `rgba(${haloColor}, 1)`;
      ctx.lineWidth = cellSize * 0.11;
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(${haloColor}, 0.78)`;
      ctx.shadowBlur = cellSize * 0.45;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Layer 3: board outer border pulse during the tail of the animation.
  if (t > 0.78) {
    const borderT = (t - 0.78) / 0.22;
    const borderAlpha = Math.sin(borderT * Math.PI) * 0.55;
    if (borderAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = borderAlpha;
      ctx.strokeStyle = `rgba(${haloColor}, 1)`;
      ctx.lineWidth = 6;
      ctx.shadowColor = `rgba(${haloColor}, 0.8)`;
      ctx.shadowBlur = 16;
      // Mirror the rounded-rect geometry used by drawRoundedRect at the top of drawBoard.
      const inset = 8;
      const r = 26;
      ctx.beginPath();
      ctx.moveTo(inset + r, inset);
      ctx.lineTo(size - inset - r, inset);
      ctx.quadraticCurveTo(size - inset, inset, size - inset, inset + r);
      ctx.lineTo(size - inset, size - inset - r);
      ctx.quadraticCurveTo(size - inset, size - inset, size - inset - r, size - inset);
      ctx.lineTo(inset + r, size - inset);
      ctx.quadraticCurveTo(inset, size - inset, inset, size - inset - r);
      ctx.lineTo(inset, inset + r);
      ctx.quadraticCurveTo(inset, inset, inset + r, inset);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Match-end celebration washed over the whole canvas for the winning side. Three phases:
// 1. Wash-in (0..30%): full-canvas radial gradient in the winning team's color builds up
//    to peak alpha at t=0.3.
// 2. Sweep (15..70%): diagonal light bar travels corner-to-corner over the wash.
// 3. Sparkle + fade (45..100%): five sparkle dots pulse around the board center, the
//    wash + sparkles fade to zero.
// Rendered AFTER the chips and cascade so it sits visually on top. Only fires for the
// winning client (registerVictoryWash is gated by the player's team match upstream).
export function drawVictoryWash() {
  const { canvas, ctx, clientState } = host;
  const { VICTORY_WASH_MS } = host.constants;
  const wash = clientState.victoryWash;
  if (!wash) return;
  const elapsed = performance.now() - wash.startedAt;
  const t = Math.min(1, Math.max(0, elapsed / VICTORY_WASH_MS));
  const size = canvas.width;
  // Ruby = warm rose-gold; Cobalt = cool indigo-cyan. Both bias toward the warm/cool end
  // of their team color but with extra brightness so the wash reads as "celebratory glow"
  // rather than "your team's chip color filling the screen".
  const tint = wash.team === "A" ? "255, 196, 132" : "180, 215, 255";

  // Phase 1 + 3: radial gradient wash. Alpha ramps up to peak ~0.32 at t=0.3, holds, fades.
  let washAlpha;
  if (t < 0.3) washAlpha = (t / 0.3) * 0.32;
  else if (t < 0.55) washAlpha = 0.32;
  else washAlpha = 0.32 * (1 - (t - 0.55) / 0.45);
  if (washAlpha > 0.01) {
    const grd = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
    grd.addColorStop(0, `rgba(${tint}, ${washAlpha})`);
    grd.addColorStop(0.6, `rgba(${tint}, ${washAlpha * 0.5})`);
    grd.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.save();
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  // Phase 2: diagonal light sweep. A wide stripe with feathered edges travels from
  // upper-left to lower-right between t=0.15 and t=0.7. Linear gradient orthogonal to
  // the travel direction gives the bar soft feathered edges.
  if (t > 0.15 && t < 0.7) {
    const sweepT = (t - 0.15) / 0.55;
    const progress = sweepT * 2 - 0.5; // -0.5 → 1.5 — overshoots so the bar enters/exits cleanly
    const cx = size * progress;
    const cy = size * progress;
    const barLen = size * 1.6;
    const barWid = size * 0.18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    const grd = ctx.createLinearGradient(0, -barWid / 2, 0, barWid / 2);
    grd.addColorStop(0, `rgba(${tint}, 0)`);
    grd.addColorStop(0.5, `rgba(${tint}, 0.42)`);
    grd.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(-barLen / 2, -barWid / 2, barLen, barWid);
    ctx.restore();
  }

  // Phase 3: five sparkle dots around board center, pulsing. Positions are fixed offsets
  // around center scaled by size — visual "burst" anchored to the board even though the
  // wash is full-canvas. Each dot pulses on its own offset so they don't all blink in unison.
  if (t > 0.45) {
    const sparkleT = (t - 0.45) / 0.55;
    const sparkleAlpha = sparkleT < 0.3 ? sparkleT / 0.3 : 1 - (sparkleT - 0.3) / 0.7;
    if (sparkleAlpha > 0.02) {
      const positions = [
        { ox: -0.22, oy: -0.18, phase: 0.0 },
        { ox: 0.24, oy: -0.2, phase: 0.15 },
        { ox: -0.18, oy: 0.22, phase: 0.3 },
        { ox: 0.2, oy: 0.18, phase: 0.45 },
        { ox: 0.0, oy: 0.0, phase: 0.6 },
      ];
      for (const p of positions) {
        const pulseT = (sparkleT - p.phase + 1) % 1;
        const localAlpha = sparkleAlpha * Math.max(0, Math.sin(pulseT * Math.PI));
        if (localAlpha < 0.02) continue;
        const x = size / 2 + p.ox * size;
        const y = size / 2 + p.oy * size;
        const r = size * 0.04 * (0.8 + 0.4 * Math.sin(pulseT * Math.PI));
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(${tint}, ${localAlpha})`);
        grd.addColorStop(1, `rgba(${tint}, 0)`);
        ctx.save();
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}
