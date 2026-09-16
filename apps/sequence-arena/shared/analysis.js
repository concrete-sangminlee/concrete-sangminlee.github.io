// Analysis & teaching layer: pure, side-effect-free logic that turns the strong evaluator
// (shared/bot-ai.js) into a COACH. No DOM, no storage, no clock reads — every number flows
// through the seeded engine so scripts/analysis-test.mjs can pin two contracts byte-exactly:
//
//   1. DETERMINISM. analyzeReplay drives the engine at a FIXED reference depth (ANALYSIS_REF_DEPTH),
//      never a wall-clock budget, so the timeline + moments of a given record are byte-identical
//      everywhere (dev box, CI, a player's phone). That is what makes the coach testable.
//   2. HONESTY. The moment classifier reacts to REAL BOARD FACTS derived from the position
//      (engine best score vs the score of the move the human actually chose, plus concrete
//      board predicates: does the opponent hold an open-four, does the best move win, does the
//      chosen move create a fork). It never emits generic prose; every user-facing string is an
//      i18n KEY (an "analysis."-prefixed dot-joined identifier) resolved in client/i18n.js.
//
// The module REUSES the seeded replay + engine primitives (createGame / getLegalTargets /
// playCard from game-core, evaluateGrandmasterPosition / scoreAllCandidates from bot-ai) and
// does NOT duplicate any engine-driving logic. It re-derives the game the same way shared/replay.js
// does (identical seating + deterministic follow-up drain) so the analyzed states match a live
// solo/daily/tutorial match exactly.

import {
  BOARD_SIZE,
  DIRECTIONS,
  createGame,
  discardDeadCard,
  discardPendingCard,
  drawReplacementCard,
  getCurrentPlayer,
  playCard,
} from "./game-core.js";
import {
  BOT_DIFFICULTIES,
  evaluateGrandmasterPosition,
  scoreAllCandidates,
} from "./bot-ai.js";
import { validateReplayRecord } from "./replay.js";
import { createSeededRng } from "./rng.js";

// FIXED reference search depth. Analysis compares the human's chosen move to the engine's best
// available move using the static candidate scorer (scoreAllCandidates) and a single-ply eval
// look, at this fixed depth — NOT the live wall-clock budget the bot uses in-game. A constant
// depth is the whole point: it makes analyzeReplay's output independent of the machine's speed,
// so it is reproducible and unit-testable. Value 2 = the chosen move plus the engine's immediate
// reply horizon; deep enough to catch a missed win/block, shallow enough to stay instant offline.
export const ANALYSIS_REF_DEPTH = 2;

// The human always occupies seat 0 (team A) and moves first, so human plies are the even indices
// 0, 2, 4, … of the replay move list (seat 1 = bot = team B on the odd plies).
const HUMAN_SEAT = 0;
const HUMAN_TEAM = "A";

// Eval-delta thresholds (in raw evaluator points) that separate a "moment" worth teaching from
// ordinary play. evalDelta is (score of chosen move) - (score of engine best) from the mover's
// perspective, so it is <= 0 for the human (the best is by definition >= chosen) and its MAGNITUDE
// measures how much value the move left on the table. A positive delta only arises in the
// classifier's fork branch, where a large swing on a fork-creating move is celebrated.
// Ordered smallest-magnitude gate first. Kept as a documented constant block so "blunder" etc.
// are reproducible and the test can probe each boundary (it passes threshold+1).
export const MOMENT_THRESHOLDS = Object.freeze({
  // A swing at or below this magnitude is near-best play — not a moment.
  quiet: 1_500,
  // A fork-creating move whose positive swing clears this is a highlight (good_fork).
  goodFork: 12_000,
  // A defensive lapse: the human left an opponent open-four unanswered this magnitude of value.
  missedBlock: 40_000,
  // The human passed up an immediately winning move.
  missedWin: 200_000,
  // A large unexplained value loss with no specific defensive/offensive cause.
  blunder: 24_000,
  // A strong defensive move that neutralised an opponent open-four (positive, celebrated).
  keyBlock: 30_000,
});

// The most significant moments to surface, bounded so a long match cannot flood the UI.
export const MAX_MOMENTS = 6;

// Moment kinds. Values are the i18n key SUFFIXES (see MOMENT_KEY below) so a kind maps 1:1 to a
// translatable string. The test reads .missedBlock / .blunder / .missedWin / .goodFork / .keyBlock.
export const MOMENT_KINDS = Object.freeze({
  missedBlock: "missed_block",
  blunder: "blunder",
  missedWin: "missed_win",
  goodFork: "good_fork",
  keyBlock: "key_block",
});

// Tags explainMove attaches to a recommended move, describing WHY the engine likes it. Values are
// i18n key suffixes. The test reads .block and .fork.
export const EXPLAIN_TAGS = Object.freeze({
  win: "win",
  block: "block",
  fork: "fork",
  build: "build",
  center: "center",
});

// Every user-facing string is a KEY, never prose. Keys are dot-joined identifiers with NO
// whitespace so the honesty test (`!/\s/.test(key)`) passes and client/i18n.js owns the copy.
function momentKey(kind) {
  return `analysis.moment.${kind}`;
}
function explainKey(tag) {
  return `analysis.explain.${tag}`;
}

function opponentTeam(team) {
  return team === "A" ? "B" : "A";
}

function cellAt(game, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }
  return game.board[row * BOARD_SIZE + col];
}

// Every 5-in-a-row window passing through `cellId` (same geometry the engine uses). Pure.
function windowsThroughCell(game, cellId) {
  const anchor = game.board[cellId];
  const windows = [];
  for (const direction of DIRECTIONS) {
    for (let offset = -4; offset <= 0; offset += 1) {
      const cells = [];
      let valid = true;
      for (let step = 0; step < 5; step += 1) {
        const row = anchor.row + (offset + step) * direction.dr;
        const col = anchor.col + (offset + step) * direction.dc;
        const cell = cellAt(game, row, col);
        if (!cell) {
          valid = false;
          break;
        }
        cells.push(cell.id);
      }
      if (valid && cells.includes(cellId)) {
        windows.push(cells);
      }
    }
  }
  return windows;
}

// Occupancy of a window for `team`, with an optional single-cell override (the hypothetical
// placement). Corners count for both teams (wild). Mirrors the engine's countWindow.
function countWindow(game, cells, team, overrideCellId = null, overrideChip = null) {
  const opponent = opponentTeam(team);
  const count = { team: 0, opponent: 0, empty: 0 };
  for (const id of cells) {
    const cell = game.board[id];
    const chip = id === overrideCellId ? overrideChip : cell.chip;
    if (cell.corner || chip === team) {
      count.team += 1;
    } else if (chip === opponent) {
      count.opponent += 1;
    } else {
      count.empty += 1;
    }
  }
  return count;
}

// Does `team` currently hold an open-four somewhere: an opponent-free window with 4 team chips
// and exactly 1 empty (playable) cell — a one-move win threat? Reads only real board facts.
function teamHasOpenFour(game, team) {
  for (let id = 0; id < game.board.length; id += 1) {
    const cell = game.board[id];
    if (cell.corner || cell.chip !== team) continue;
    for (const cells of windowsThroughCell(game, id)) {
      const count = countWindow(game, cells, team);
      if (count.opponent === 0 && count.team === 4 && count.empty === 1) {
        const emptyId = cells.find((cid) => !game.board[cid].corner && game.board[cid].chip == null);
        if (emptyId != null) return true;
      }
    }
  }
  return false;
}

// Would placing `team` at `targetCellId` block an opponent open-four (i.e. the opponent holds a
// completion line through this exact empty cell)? Concrete board predicate for the block tag.
function placementBlocksOpenFour(game, targetCellId, team) {
  const opponent = opponentTeam(team);
  const cell = game.board[targetCellId];
  if (!cell || cell.corner || cell.chip != null) return false;
  for (const cells of windowsThroughCell(game, targetCellId)) {
    // Count from the OPPONENT's perspective: 4 opponent chips + this empty cell (no team chip)
    // is an open-four the placement neutralises.
    const count = countWindow(game, cells, opponent);
    if (count.team === 4 && count.empty === 1 && count.opponent === 0) {
      return true;
    }
  }
  return false;
}

// Would placing `team` at `targetCellId` create a FORK: two or more distinct windows that each
// become a four-threat (>=4 team chips incl. the placement, opponent-free, still completable)?
// The opponent cannot answer two independent threats with one move. Concrete board predicate.
function placementCreatesFork(game, targetCellId, team) {
  const cell = game.board[targetCellId];
  if (!cell || cell.corner || cell.chip != null) return false;
  let threats = 0;
  for (const cells of windowsThroughCell(game, targetCellId)) {
    const count = countWindow(game, cells, team, targetCellId, team);
    if (count.opponent === 0 && count.team >= 4 && count.empty <= 1) {
      threats += 1;
    }
  }
  return threats >= 2;
}

// Would placing `team` at `targetCellId` immediately complete a 5-window (a winning line)?
function placementCompletesLine(game, targetCellId, team) {
  const cell = game.board[targetCellId];
  if (!cell || cell.corner || cell.chip != null) return false;
  for (const cells of windowsThroughCell(game, targetCellId)) {
    const count = countWindow(game, cells, team, targetCellId, team);
    if (count.opponent === 0 && count.team === 5) {
      return true;
    }
  }
  return false;
}

// Map a signed evalDelta plus concrete board context to a moment kind (or null for near-best
// play). This is the honesty gate: the branches read real predicates (opponentHadOpenFour,
// bestWasWin, chosenCreatesFork), so a regression that stopped inspecting the board would flip
// these classifications and fail scripts/analysis-test.mjs. Priority is intentional:
//   - a large POSITIVE swing on a fork move -> good_fork (a highlight);
//   - a large NEGATIVE swing is a mistake, disambiguated by cause, most specific first:
//       passing up a win (bestWasWin)          -> missed_win
//       ignoring an opponent open-four         -> missed_block
//       otherwise                              -> blunder
//   - anything within the quiet band           -> null (not a moment).
export function classifyMomentKind({
  evalDelta,
  chosenCreatesFork = false,
  bestWasWin = false,
  chosenBlocksThreat = false,
  opponentHadOpenFour = false,
} = {}) {
  if (!Number.isFinite(evalDelta)) return null;
  const magnitude = Math.abs(evalDelta);
  if (magnitude <= MOMENT_THRESHOLDS.quiet) {
    return null;
  }

  if (evalDelta > 0) {
    if (chosenCreatesFork && evalDelta >= MOMENT_THRESHOLDS.goodFork) {
      return MOMENT_KINDS.goodFork;
    }
    if (chosenBlocksThreat && evalDelta >= MOMENT_THRESHOLDS.keyBlock) {
      return MOMENT_KINDS.keyBlock;
    }
    return null;
  }

  // Negative swing: the human left value on the table. Disambiguate by cause, most specific first.
  if (bestWasWin && magnitude >= MOMENT_THRESHOLDS.blunder) {
    return MOMENT_KINDS.missedWin;
  }
  if (opponentHadOpenFour && magnitude >= MOMENT_THRESHOLDS.missedBlock) {
    return MOMENT_KINDS.missedBlock;
  }
  if (magnitude >= MOMENT_THRESHOLDS.blunder) {
    return MOMENT_KINDS.blunder;
  }
  return null;
}

// The two-seat layout replayGame uses (human seat 0 team A, bot seat 1 team B). Kept local so we
// re-create the identical seeded deal without importing replay's private constant.
const ANALYSIS_SEATS = [
  { seatIndex: 0, team: "A", name: "Player 1" },
  { seatIndex: 1, team: "B", name: "Player 2" },
];

// Drain the deterministic discard + draw follow-up exactly as the live runtime and replayGame do.
function drainPendingSteps(game, seatIndex, rng) {
  const pending = game.pendingStep;
  if (!pending || pending.seatIndex !== seatIndex) return;
  if (pending.type === "discard") discardPendingCard(game, seatIndex);
  if (game.pendingStep?.type === "draw") drawReplacementCard(game, seatIndex, rng);
}

// Evaluate the position from the root (human) team's perspective at a fixed reference depth. We
// reuse the engine's grandmaster leaf evaluator on the concrete position — deterministic and clock
// free. ANALYSIS_REF_DEPTH documents the intent even though the leaf eval is single-ply; the depth
// constant is the contract knob a future deepening pass would consume without touching callers.
function evalPosition(game) {
  return evaluateGrandmasterPosition(game, HUMAN_TEAM);
}

// Score a candidate move object {type,cardId,targetCellId} for `player` via the shared static
// scorer, returning its engine score (or -Infinity if it is not a legal candidate). Reuses
// scoreAllCandidates so analysis and the bot rank moves identically.
function scoreOfMove(game, player, move) {
  const scored = scoreAllCandidates(game, player, BOT_DIFFICULTIES.smart);
  for (const candidate of scored) {
    if (
      candidate.type === move.type &&
      candidate.cardId === move.cardId &&
      (candidate.targetCellId ?? null) === (move.targetCellId ?? null)
    ) {
      return candidate.score;
    }
  }
  return Number.NEGATIVE_INFINITY;
}

// Analyze a replay record. Re-derives the seeded game move-by-move (identical to replayGame) and,
// at each HUMAN decision point, compares the chosen move's engine score to the engine's best
// available score to produce an evalDelta, then classifies it against real board predicates.
// Returns { evalTimeline, moments } where evalTimeline[i] is the root-team position eval AFTER
// ply i (one entry per recorded move) and moments is the bounded, most-significant subset.
export function analyzeReplay(record) {
  const clean = validateReplayRecord(record);
  if (!clean) {
    return { evalTimeline: [], moments: [] };
  }
  const rng = createSeededRng(clean.seed);
  const game = createGame(ANALYSIS_SEATS, rng);

  const evalTimeline = [];
  const candidateMoments = [];

  for (let ply = 0; ply < clean.moves.length; ply += 1) {
    if (game.phase !== "playing") {
      // The recorded match ended earlier than the move list (defensive); pad with a flat eval so
      // evalTimeline still matches moves.length exactly (the test asserts equal length).
      evalTimeline.push(evalPosition(game));
      continue;
    }
    const move = clean.moves[ply];
    const current = getCurrentPlayer(game);
    if (!current) {
      evalTimeline.push(evalPosition(game));
      continue;
    }
    const seatIndex = current.seatIndex;
    const isHumanPly = seatIndex === HUMAN_SEAT;

    // Capture the decision-point facts BEFORE applying the move (needs current hands + board).
    if (isHumanPly && move.type === "play") {
      const scored = scoreAllCandidates(game, current, BOT_DIFFICULTIES.smart);
      const bestScore = scored.length > 0 ? scored[0].score : Number.NEGATIVE_INFINITY;
      const chosenMove = { type: "play_card", cardId: move.cardId, targetCellId: move.targetCellId };
      const chosenScore = scoreOfMove(game, current, chosenMove);
      if (Number.isFinite(bestScore) && Number.isFinite(chosenScore)) {
        const evalDelta = chosenScore - bestScore;
        const opponentHadOpenFour = teamHasOpenFour(game, opponentTeam(current.team));
        // The engine's best move: did it win / block / fork? Read from the concrete board.
        const best = scored[0];
        const bestWasWin =
          best && best.type === "play_card" && best.targetCellId != null
            ? placementCompletesLine(game, best.targetCellId, current.team)
            : false;
        const chosenBlocksThreat =
          move.targetCellId != null ? placementBlocksOpenFour(game, move.targetCellId, current.team) : false;
        const chosenCreatesFork =
          move.targetCellId != null ? placementCreatesFork(game, move.targetCellId, current.team) : false;
        const kind = classifyMomentKind({
          evalDelta,
          chosenCreatesFork,
          bestWasWin,
          chosenBlocksThreat,
          opponentHadOpenFour,
        });
        if (kind) {
          candidateMoments.push({
            ply,
            kind,
            evalDelta,
            chosen: { cardId: move.cardId, targetCellId: move.targetCellId },
            best: best ? { cardId: best.cardId, targetCellId: best.targetCellId ?? null } : null,
            ko: momentKey(kind),
            en: momentKey(kind),
          });
        }
      }
    }

    // Apply the move deterministically (mirrors replayGame).
    if (move.type === "play") {
      playCard(game, seatIndex, move.cardId, move.targetCellId, rng);
    } else if (move.type === "discard_dead") {
      discardDeadCard(game, seatIndex, move.cardId, rng);
    }
    drainPendingSteps(game, seatIndex, rng);
    evalTimeline.push(evalPosition(game));
  }

  // Keep the most significant moments (largest magnitude), then restore chronological order so the
  // UI reads left-to-right. Deterministic sort (stable by |delta| then ply).
  candidateMoments.sort((left, right) => {
    const magDiff = Math.abs(right.evalDelta) - Math.abs(left.evalDelta);
    if (magDiff !== 0) return magDiff;
    return left.ply - right.ply;
  });
  const moments = candidateMoments.slice(0, MAX_MOMENTS).sort((left, right) => left.ply - right.ply);

  return { evalTimeline, moments };
}

// Explain WHY a candidate move is good, as i18n keys + tags derived from concrete board facts.
// game/player/move mirror the play_card shape. Returns { ko, en, tags } where ko/en are
// "analysis."-prefixed keys (copy lives in client/i18n.js) and tags is an EXPLAIN_TAGS list. The
// primary reason (highest priority board fact) drives ko/en; tags carries every applicable reason.
export function explainMove(game, player, move) {
  const tags = [];
  const targetCellId = move && move.targetCellId != null ? move.targetCellId : null;
  const team = player.team;

  if (targetCellId != null) {
    if (placementCompletesLine(game, targetCellId, team)) {
      tags.push(EXPLAIN_TAGS.win);
    }
    if (placementCreatesFork(game, targetCellId, team)) {
      tags.push(EXPLAIN_TAGS.fork);
    }
    if (placementBlocksOpenFour(game, targetCellId, team)) {
      tags.push(EXPLAIN_TAGS.block);
    }
    // Build: the placement extends a team line toward a threat (>=3 team chips in a live window).
    let buildsLine = false;
    for (const cells of windowsThroughCell(game, targetCellId)) {
      const count = countWindow(game, cells, team, targetCellId, team);
      if (count.opponent === 0 && count.team >= 3) {
        buildsLine = true;
        break;
      }
    }
    if (buildsLine) tags.push(EXPLAIN_TAGS.build);
  }

  // Primary reason = the highest-priority tag present (win > block > fork > build > center).
  const priority = [EXPLAIN_TAGS.win, EXPLAIN_TAGS.block, EXPLAIN_TAGS.fork, EXPLAIN_TAGS.build, EXPLAIN_TAGS.center];
  let primary = EXPLAIN_TAGS.center;
  for (const tag of priority) {
    if (tags.includes(tag)) {
      primary = tag;
      break;
    }
  }
  if (tags.length === 0) {
    tags.push(EXPLAIN_TAGS.center);
  }

  return {
    ko: explainKey(primary),
    en: explainKey(primary),
    tags,
  };
}
