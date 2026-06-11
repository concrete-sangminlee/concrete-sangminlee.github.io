// Canvas paint primitives for the board: card faces (pips, corners, court art),
// poker chips, rounded rects, and the legal-target marker. Everything here is a
// pure painter — input coordinates in, pixels out — except for the one piece of
// singleton state this app genuinely has: the 2D context of the single #game-canvas.
// app.js binds it once at boot via bindBoardPaintContext(); keeping `ctx` module-
// scoped means the ~400 extracted lines and their drawBoard call sites moved here
// byte-identical (no signature threading), which is what made this split safe.
import { TEAM_META } from "../shared/game-core.js";

let ctx = null;

export function bindBoardPaintContext(context) {
  ctx = context;
}

const CARD_PIP_LAYOUTS = {
  A: [{ x: 50, y: 50, scale: 1.42 }],
  2: [
    { x: 50, y: 29 },
    { x: 50, y: 71, flip: true },
  ],
  3: [
    { x: 50, y: 27 },
    { x: 50, y: 50 },
    { x: 50, y: 73, flip: true },
  ],
  4: [
    { x: 35, y: 29 },
    { x: 65, y: 29 },
    { x: 35, y: 71, flip: true },
    { x: 65, y: 71, flip: true },
  ],
  5: [
    { x: 35, y: 27 },
    { x: 65, y: 27 },
    { x: 50, y: 50 },
    { x: 35, y: 73, flip: true },
    { x: 65, y: 73, flip: true },
  ],
  6: [
    { x: 35, y: 24 },
    { x: 65, y: 24 },
    { x: 35, y: 50 },
    { x: 65, y: 50 },
    { x: 35, y: 76, flip: true },
    { x: 65, y: 76, flip: true },
  ],
  7: [
    { x: 35, y: 22 },
    { x: 65, y: 22 },
    { x: 50, y: 37 },
    { x: 35, y: 52 },
    { x: 65, y: 52 },
    { x: 35, y: 78, flip: true },
    { x: 65, y: 78, flip: true },
  ],
  8: [
    { x: 35, y: 22 },
    { x: 65, y: 22 },
    { x: 50, y: 36 },
    { x: 35, y: 50 },
    { x: 65, y: 50 },
    { x: 50, y: 64, flip: true },
    { x: 35, y: 78, flip: true },
    { x: 65, y: 78, flip: true },
  ],
  9: [
    { x: 35, y: 20 },
    { x: 65, y: 20 },
    { x: 35, y: 38 },
    { x: 65, y: 38 },
    { x: 50, y: 50 },
    { x: 35, y: 62, flip: true },
    { x: 65, y: 62, flip: true },
    { x: 35, y: 80, flip: true },
    { x: 65, y: 80, flip: true },
  ],
  10: [
    { x: 35, y: 18 },
    { x: 65, y: 18 },
    { x: 50, y: 30 },
    { x: 35, y: 40 },
    { x: 65, y: 40 },
    { x: 35, y: 60, flip: true },
    { x: 65, y: 60, flip: true },
    { x: 50, y: 70, flip: true },
    { x: 35, y: 82, flip: true },
    { x: 65, y: 82, flip: true },
  ],
};

export const COURT_RANKS = new Set(["J", "Q", "K"]);

export function pipLayoutForRank(rank) {
  return CARD_PIP_LAYOUTS[rank] || [];
}

export function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  if (strokeStyle) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
}

export function drawChip(x, y, radius, team, locked) {
  const teamMeta = TEAM_META[team];
  const gradient = ctx.createRadialGradient(x - radius * 0.34, y - radius * 0.42, radius * 0.12, x, y, radius);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.86)");
  gradient.addColorStop(0.24, teamMeta.soft);
  gradient.addColorStop(0.72, teamMeta.color);
  gradient.addColorStop(1, teamMeta.text);
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.52, radius * 0.86, radius * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = radius * 0.42;
  ctx.shadowOffsetY = radius * 0.16;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(2, radius * 0.12);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255, 248, 233, 0.72)";
  ctx.lineWidth = Math.max(1.4, radius * 0.09);
  ctx.lineCap = "round";
  for (let index = 0; index < 8; index += 1) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(radius * 0.68, 0);
    ctx.lineTo(radius * 0.9, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Inner medallion — flat disc filled with the team's deeper tone so the chip reads
  // as "edge ring + center stamp" like a real casino chip. Slight inner glow on top for
  // the convex highlight.
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.56, 0, Math.PI * 2);
  const medallion = ctx.createRadialGradient(x - radius * 0.18, y - radius * 0.22, radius * 0.04, x, y, radius * 0.56);
  medallion.addColorStop(0, teamMeta.soft);
  medallion.addColorStop(1, teamMeta.color);
  ctx.fillStyle = medallion;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, radius * 0.07);
  ctx.strokeStyle = "rgba(16, 24, 21, 0.32)";
  ctx.stroke();

  // Center monogram — team initial in white serif on the medallion. Reads like the
  // denomination stamp on a poker chip and gives players a quick at-a-glance team check
  // even when colors are hard to distinguish (color-blind users).
  const initial = team === "A" ? "루" : "코";
  ctx.save();
  ctx.fillStyle = "rgba(255, 250, 232, 0.94)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.max(10, radius * 0.62)}px Georgia, "Times New Roman", serif`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = radius * 0.08;
  ctx.shadowOffsetY = radius * 0.05;
  ctx.fillText(initial, x, y + radius * 0.03);
  ctx.restore();

  // Top specular highlight on the medallion (convex glass feel).
  const inner = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.24, 0, x, y, radius * 0.56);
  inner.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  inner.addColorStop(0.6, "rgba(255, 255, 255, 0.08)");
  inner.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = inner;
  ctx.fill();

  if (locked) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(210, 162, 61, 0.95)";
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBoardTargetMarker(centerX, centerY, radius, pulse, focused, removeMode) {
  const isRemove = removeMode === true;
  const beat = 0.5 + 0.5 * Math.sin(pulse * Math.PI * 2);
  ctx.save();
  ctx.globalAlpha = isRemove ? 0.88 : 0.8;
  ctx.strokeStyle = isRemove ? "rgba(173, 38, 62, 0.95)" : "rgba(36, 122, 81, 0.95)";
  ctx.lineWidth = Math.max(2, radius * (focused ? 0.18 : 0.13));
  ctx.setLineDash([Math.max(4, radius * 0.28), Math.max(3, radius * 0.18)]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * (1.12 + beat * 0.16), 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (isRemove) {
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.beginPath();
    ctx.moveTo(centerX - radius * 0.55, centerY - radius * 0.55);
    ctx.lineTo(centerX + radius * 0.55, centerY + radius * 0.55);
    ctx.moveTo(centerX + radius * 0.55, centerY - radius * 0.55);
    ctx.lineTo(centerX - radius * 0.55, centerY + radius * 0.55);
    ctx.stroke();
  } else {
    ctx.fillStyle = `rgba(36, 122, 81, ${0.12 + beat * 0.1})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 248, 233, 0.78)";
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.54, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (focused) {
    ctx.strokeStyle = "rgba(244, 211, 120, 0.98)";
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 1.42, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function splitCardLabel(label) {
  const value = String(label || "");
  return {
    rank: value.slice(0, -1),
    suit: value.slice(-1),
    isRed: value.endsWith("♥") || value.endsWith("♦"),
  };
}

function drawCardCorner(rank, suit, x, y, width, height, color, rotate = false) {
  // 2026-05-24 — bumped ratios from 0.20/0.17 to 0.28/0.24 (and floor from 9/8 to 11/10)
  // so the 100 board cells stay readable at the cell sizes a desktop sidebar imposes.
  // The corners are clamped by margins so the larger text doesn't run into the pip art.
  const shortSide = Math.min(width, height);
  const cornerSize = Math.max(11, shortSide * 0.28);
  const suitSize = Math.max(10, shortSide * 0.24);
  const marginX = width * 0.12;
  const marginY = height * 0.08;

  ctx.save();
  if (rotate) {
    ctx.translate(x + width - marginX, y + height - marginY);
    ctx.rotate(Math.PI);
  } else {
    ctx.translate(x + marginX, y + marginY);
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.font = `900 ${cornerSize}px Georgia, "Times New Roman", serif`;
  ctx.fillText(rank, 0, 0);
  ctx.font = `900 ${suitSize}px Georgia, "Times New Roman", serif`;
  ctx.fillText(suit, 0, cornerSize * 0.78);
  ctx.restore();
}

function drawFacePip(suit, x, y, size, color, flip = false) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) {
    ctx.rotate(Math.PI);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px Georgia, "Times New Roman", serif`;
  ctx.shadowColor = "rgba(255, 255, 255, 0.48)";
  ctx.shadowBlur = 1;
  ctx.fillText(suit, 0, 0);
  ctx.restore();
}

function drawCourtFace(rank, suit, x, y, width, height, color) {
  const shortSide = Math.min(width, height);
  // Larger ornate frame (was 0.42×0.46) so the court face fills more of the bigger card.
  const frameWidth = width * 0.62;
  const frameHeight = height * 0.7;
  const frameX = x + (width - frameWidth) / 2;
  const frameY = y + (height - frameHeight) / 2;
  // Frame gradient = aged-gold tint, suggests an illuminated manuscript / heraldic shield.
  const frameGradient = ctx.createLinearGradient(frameX, frameY, frameX + frameWidth, frameY + frameHeight);
  frameGradient.addColorStop(0, "rgba(255, 250, 232, 0.9)");
  frameGradient.addColorStop(0.5, "rgba(244, 218, 158, 0.7)");
  frameGradient.addColorStop(1, "rgba(220, 184, 110, 0.78)");
  drawRoundedRect(frameX, frameY, frameWidth, frameHeight, shortSide * 0.08, frameGradient, "rgba(132, 88, 30, 0.46)", Math.max(1, shortSide * 0.02));

  // Decorative double-border inside the frame (gold band like real face cards).
  ctx.save();
  ctx.strokeStyle = "rgba(166, 112, 38, 0.5)";
  ctx.lineWidth = Math.max(0.7, shortSide * 0.012);
  drawRoundedRect(
    frameX + shortSide * 0.03,
    frameY + shortSide * 0.03,
    frameWidth - shortSide * 0.06,
    frameHeight - shortSide * 0.06,
    shortSide * 0.06,
    "rgba(255, 255, 255, 0)",
    "rgba(166, 112, 38, 0.55)",
    Math.max(0.7, shortSide * 0.012)
  );
  ctx.restore();

  // Top + bottom horizontal "register" bands — like the rank/suit strip on Bicycle-style cards.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = Math.max(1, shortSide * 0.022);
  ctx.beginPath();
  ctx.moveTo(frameX + frameWidth * 0.14, frameY + frameHeight * 0.2);
  ctx.lineTo(frameX + frameWidth * 0.86, frameY + frameHeight * 0.2);
  ctx.moveTo(frameX + frameWidth * 0.14, frameY + frameHeight * 0.8);
  ctx.lineTo(frameX + frameWidth * 0.86, frameY + frameHeight * 0.8);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Letter (J/Q/K) — large, centered, with a soft inner shadow for depth.
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
  ctx.shadowBlur = shortSide * 0.04;
  ctx.shadowOffsetY = shortSide * 0.015;
  ctx.font = `900 ${Math.max(18, shortSide * 0.52)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(rank, x + width / 2, y + height / 2 - shortSide * 0.025);
  ctx.shadowColor = "transparent";

  // Iconic chess-piece glyph above the letter — gives J/Q/K an instantly-readable
  // "this is a royal court card" signal that real face cards convey via their
  // illustration. Unicode chess pieces render in every system font so no external
  // assets needed. Same ink color as the rank for tonal consistency.
  const courtIcon = rank === "K" ? "♔" : rank === "Q" ? "♕" : "♘"; // ♔ ♕ ♘
  ctx.font = `${Math.max(14, shortSide * 0.32)}px "Segoe UI Symbol", "Apple Symbols", "Symbola", Georgia, serif`;
  ctx.fillText(courtIcon, x + width / 2, y + height / 2 - shortSide * 0.27);

  // Suit symbol below the letter — prominent, matching ink color.
  ctx.font = `900 ${Math.max(13, shortSide * 0.3)}px Georgia, "Times New Roman", serif`;
  ctx.fillText(suit, x + width / 2, y + height / 2 + shortSide * 0.26);
  ctx.restore();
}

export function drawCardFaceDetails(label, x, y, width, height = width) {
  const { rank, suit, isRed } = splitCardLabel(label);
  const ink = isRed ? "#aa273d" : "#292826";
  const shortSide = Math.min(width, height);
  const inset = shortSide * 0.06;

  ctx.save();
  // Subtle paper vignette — center slightly brighter, edges slightly aged.
  // Reads as "real card stock" rather than flat HTML rectangle.
  const paperGrad = ctx.createRadialGradient(
    x + width / 2, y + height / 2, shortSide * 0.1,
    x + width / 2, y + height / 2, shortSide * 0.78
  );
  paperGrad.addColorStop(0, "rgba(255, 252, 240, 0.42)");
  paperGrad.addColorStop(0.65, "rgba(241, 226, 192, 0.16)");
  paperGrad.addColorStop(1, "rgba(165, 130, 70, 0.18)");
  ctx.fillStyle = paperGrad;
  ctx.fillRect(x, y, width, height);

  // Inner decorative border (real playing cards have a thin frame inside the edge).
  // Slightly tinted with the rank ink so red-suit cards have a warm border, black ones cool.
  const borderColor = isRed
    ? "rgba(176, 60, 80, 0.32)"
    : "rgba(70, 48, 21, 0.28)";
  drawRoundedRect(
    x + inset,
    y + inset,
    width - inset * 2,
    height - inset * 2,
    shortSide * 0.06,
    "rgba(255, 255, 255, 0)",
    borderColor,
    Math.max(1, shortSide * 0.022)
  );
  // Second hairline border just inside the first — "double-line" decoration that real
  // bicycle-style playing cards use for hierarchy.
  drawRoundedRect(
    x + inset + shortSide * 0.025,
    y + inset + shortSide * 0.025,
    width - (inset + shortSide * 0.025) * 2,
    height - (inset + shortSide * 0.025) * 2,
    shortSide * 0.045,
    "rgba(255, 255, 255, 0)",
    isRed ? "rgba(176, 60, 80, 0.18)" : "rgba(70, 48, 21, 0.16)",
    Math.max(0.6, shortSide * 0.01)
  );

  drawCardCorner(rank, suit, x, y, width, height, ink, false);
  drawCardCorner(rank, suit, x, y, width, height, ink, true);

  if (COURT_RANKS.has(rank)) {
    drawCourtFace(rank, suit, x, y, width, height, ink);
    ctx.restore();
    return;
  }

  const layout = pipLayoutForRank(rank);
  // 2026-05-24 — pip art was also under-sized for board cells; bumped per-cell from
  // 0.19 to 0.24 (Ace from 0.4 to 0.48) so the suit pips read at-a-glance.
  const pipSize = Math.max(11, shortSide * (rank === "A" ? 0.48 : 0.24));
  for (const pip of layout) {
    drawFacePip(
      suit,
      x + width * (pip.x / 100),
      y + height * (pip.y / 100),
      pipSize * (pip.scale || 1),
      ink,
      Boolean(pip.flip)
    );
  }
  ctx.restore();
}

