// Replay core: pure, side-effect-free logic for capturing and replaying a deterministic
// solo/daily/tutorial match. No DOM, no storage, no clock reads — everything flows through
// the seeded engine so scripts/replay-test.mjs can pin the "same seed + same moves →
// identical final game" contract byte-exactly. Mirrors the purity style of shared/daily.js.
//
// A replay is just a seed plus the ordered list of the *initiating* move each turn made.
// The follow-up discard/draw steps are deterministic consequences of the seeded draw pile,
// so replayGame re-derives them rather than storing them.

import {
  createGame,
  discardDeadCard,
  discardPendingCard,
  drawReplacementCard,
  getCurrentPlayer,
  playCard,
  serializeViewerGame,
} from "./game-core.js";
import { normalizeBotDifficulty } from "./bot-ai.js";
import { createSeededRng } from "./rng.js";

export const REPLAY_VERSION = 1;
// A Sequence match resolves well under a couple hundred turns; 400 is a generous ceiling
// that keeps a decoded share string bounded (defends against a hostile giant paste).
export const MAX_REPLAY_MOVES = 400;
const MAX_SEED_LENGTH = 200;

// The two-seat layout the local solo runtime always uses: seat 0 = human (team A),
// seat 1 = bot (team B). Replay re-creates the identical seating so createGame deals the
// same hands from the same seeded deck.
const REPLAY_SEATS = [
  { seatIndex: 0, team: "A", name: "Player 1" },
  { seatIndex: 1, team: "B", name: "Player 2" },
];

const MOVE_TYPES = new Set(["play", "discard_dead"]);

function isFiniteInteger(value) {
  return Number.isFinite(value) && Math.trunc(value) === value;
}

// Normalize a single move entry, returning null when it is malformed so validation can
// reject the whole record. targetCellId is null for discard_dead moves.
function normalizeMove(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const type = raw.type;
  if (!MOVE_TYPES.has(type)) return null;
  const cardId = Number(raw.cardId);
  if (!isFiniteInteger(cardId)) return null;
  if (type === "discard_dead") {
    return { type, cardId, targetCellId: null };
  }
  const targetCellId = Number(raw.targetCellId);
  if (!isFiniteInteger(targetCellId)) return null;
  return { type, cardId, targetCellId };
}

// Build a clean, self-contained replay record from raw match data. Copies the move list so
// later mutation of the caller's array cannot alias into the record.
export function buildReplayRecord({ seed, difficulty, daily = null, tutorial = false, moves = [], winner = null, finishedAt = "" } = {}) {
  const cleanMoves = [];
  if (Array.isArray(moves)) {
    for (const move of moves) {
      const normalized = normalizeMove(move);
      if (normalized) cleanMoves.push(normalized);
      if (cleanMoves.length >= MAX_REPLAY_MOVES) break;
    }
  }
  const cleanDaily =
    daily && typeof daily === "object" && typeof daily.dateKey === "string" && Number.isFinite(Number(daily.number))
      ? { dateKey: daily.dateKey, number: Math.max(1, Math.trunc(Number(daily.number))) }
      : null;
  return {
    version: REPLAY_VERSION,
    seed: String(seed ?? "").slice(0, MAX_SEED_LENGTH),
    difficulty: normalizeBotDifficulty(difficulty),
    daily: cleanDaily,
    tutorial: tutorial === true,
    moves: cleanMoves,
    winner: winner === "A" || winner === "B" ? winner : null,
    finishedAt: typeof finishedAt === "string" ? finishedAt.slice(0, 40) : "",
  };
}

// Validate + normalize an untrusted record (e.g. decoded from a shared string). Returns a
// clean record on success or null on any structural problem — never throws.
export function validateReplayRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.version !== REPLAY_VERSION) return null;
  const seed = typeof raw.seed === "string" ? raw.seed : "";
  if (!seed || seed.length > MAX_SEED_LENGTH) return null;
  if (!Array.isArray(raw.moves) || raw.moves.length > MAX_REPLAY_MOVES) return null;
  const moves = [];
  for (const move of raw.moves) {
    const normalized = normalizeMove(move);
    if (!normalized) return null;
    moves.push(normalized);
  }
  return buildReplayRecord({
    seed,
    difficulty: raw.difficulty,
    daily: raw.daily,
    tutorial: raw.tutorial,
    moves,
    winner: raw.winner,
    finishedAt: raw.finishedAt,
  });
}

function toBase64(text) {
  if (typeof globalThis.btoa === "function") {
    // btoa is latin1-only; percent-encode UTF-8 first so Korean seeds/labels survive.
    return globalThis.btoa(unescape(encodeURIComponent(text)));
  }
  return Buffer.from(text, "utf8").toString("base64");
}

function fromBase64(encoded) {
  if (typeof globalThis.atob === "function") {
    return decodeURIComponent(escape(globalThis.atob(encoded)));
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

// Compact, copy-pasteable share string: base64 of the JSON record. No eval anywhere — pure
// JSON + base64. Returns "" for an unusable record.
export function encodeReplayString(record) {
  const clean = validateReplayRecord(record);
  if (!clean) return "";
  try {
    return toBase64(JSON.stringify(clean));
  } catch {
    return "";
  }
}

// Reverse of encodeReplayString. Everything runs inside try/catch and through
// validateReplayRecord, so a garbage or hostile string yields null rather than throwing.
export function decodeReplayString(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  // Bound the input so a hostile megabyte paste cannot blow up JSON.parse.
  if (encoded.length > MAX_REPLAY_MOVES * 64 + 4096) return null;
  let parsed;
  try {
    parsed = JSON.parse(fromBase64(encoded.trim()));
  } catch {
    return null;
  }
  return validateReplayRecord(parsed);
}

// Drain the deterministic follow-up steps (discard the played card, draw a replacement)
// exactly as the live runtime does after an initiating action.
function drainPendingSteps(game, seatIndex, rng) {
  const pending = game.pendingStep;
  if (!pending || pending.seatIndex !== seatIndex) return;
  if (pending.type === "discard") discardPendingCard(game, seatIndex);
  if (game.pendingStep?.type === "draw") drawReplacementCard(game, seatIndex, rng);
}

// Re-create the seeded game and re-apply the recorded moves, reproducing the identical
// final state. Returns { game, snapshots } where snapshots[0] is the initial deal and each
// subsequent entry is the state after applying that move (so the UI can step through it).
export function replayGame(record) {
  const clean = validateReplayRecord(record);
  if (!clean) {
    throw new Error("replayGame: invalid replay record");
  }
  const rng = createSeededRng(clean.seed);
  const game = createGame(REPLAY_SEATS, rng);
  const snapshots = [serializeViewerGame(game, 0)];

  for (const move of clean.moves) {
    if (game.phase !== "playing") break;
    const current = getCurrentPlayer(game);
    if (!current) break;
    const seatIndex = current.seatIndex;
    if (move.type === "play") {
      playCard(game, seatIndex, move.cardId, move.targetCellId, rng);
    } else if (move.type === "discard_dead") {
      discardDeadCard(game, seatIndex, move.cardId, rng);
    }
    drainPendingSteps(game, seatIndex, rng);
    snapshots.push(serializeViewerGame(game, 0));
  }

  return { game, snapshots };
}
