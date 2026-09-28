import {
  BOARD_SIZE,
  DIRECTIONS,
  REQUIRED_SEQUENCES,
  discardDeadCard,
  discardPendingCard,
  drawReplacementCard,
  getLegalTargets,
  playCard,
} from "./game-core.js";
import { hashStringToSeed } from "./rng.js";

const SCORE = {
  win: 2_000_000,
  sequence: 320_000,
  blockWin: 260_000,
  blockStrong: 8_000,
  makeFour: 7_200,
  makeThree: 1_200,
  removeThreat: 18_000,
  removeBlocker: 9_000,
  neighbor: 95,
  center: 12,
  normalCard: 48,
  preservePowerJack: -80,
  discard: 12,
};

export const BOT_DIFFICULTIES = {
  easy: "easy",
  smart: "smart",
  aggressive: "aggressive",
  master: "master",
  grandmaster: "grandmaster",
  legend: "legend",
};

// Master search tuning. Depth 3 = bot move → opponent reply → bot reply, leaf evaluated by
// evaluateMasterPosition. Branching 10 is wide enough to admit low-static-but-defensive
// blocks (the moves the shelved v1 top-4 search could never see) while alpha-beta prunes
// the bulk of the sub-tree. See docs/superpowers/specs/2026-09-11-master-bot-v2-design.md.
const MASTER_SEARCH_DEPTH = 3;
const MASTER_BRANCHING = 10;
// Positional eval weights (whole-position scoring, not per-move). Opponent threats are
// weighted HEAVIER than the bot's own equal-length threats (asymmetric defensive lean):
// losing next turn is worse than gaining next turn. This asymmetry is the core behavioural
// difference from SMART's symmetric greedy per-move heuristic.
const MASTER_EVAL = {
  win: 10_000_000,
  openFour: 60_000,
  four: 24_000,
  three: 2_400,
  two: 240,
  forkBonus: 30_000,
  opponentThreatWeight: 1.35,
};

export function normalizeBotDifficulty(value) {
  return Object.hasOwn(BOT_DIFFICULTIES, value) ? value : BOT_DIFFICULTIES.smart;
}

function opponentTeam(team) {
  return team === "A" ? "B" : "A";
}

function cloneGame(game) {
  return globalThis.structuredClone ? structuredClone(game) : JSON.parse(JSON.stringify(game));
}

function cellAt(game, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }
  return game.board[row * BOARD_SIZE + col];
}

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

function countWindow(game, cells, team, overrides = new Map()) {
  const opponent = opponentTeam(team);
  const count = {
    team: 0,
    opponent: 0,
    empty: 0,
    lockedTeam: 0,
  };

  for (const id of cells) {
    const cell = game.board[id];
    const chip = overrides.has(id) ? overrides.get(id) : cell.chip;
    if (cell.corner || chip === team) {
      count.team += 1;
      if (!cell.corner && cell.seqCount > 0) {
        count.lockedTeam += 1;
      }
    } else if (chip === opponent) {
      count.opponent += 1;
    } else {
      count.empty += 1;
    }
  }

  return count;
}

function scoreLineBuild(count, difficulty = BOT_DIFFICULTIES.smart) {
  if (count.opponent > 0) {
    return 0;
  }
  const multiplier = difficulty === BOT_DIFFICULTIES.aggressive ? 1.45 : 1;
  if (count.team >= 5) {
    return SCORE.sequence;
  }
  if (count.team === 4) {
    return SCORE.makeFour * multiplier;
  }
  if (count.team === 3) {
    return SCORE.makeThree * multiplier;
  }
  if (count.team === 2) {
    return 260 * multiplier;
  }
  return 0;
}

function scoreLineBlock(count, difficulty = BOT_DIFFICULTIES.smart) {
  if (count.opponent > 0) {
    return 0;
  }
  const multiplier = difficulty === BOT_DIFFICULTIES.aggressive ? 0.72 : 1;
  if (count.team >= 4 && count.empty <= 1) {
    return SCORE.blockWin * multiplier;
  }
  if (count.team === 3 && count.empty <= 2) {
    return SCORE.blockStrong * multiplier;
  }
  if (count.team === 2 && count.empty <= 3) {
    return 420 * multiplier;
  }
  return 0;
}

function scoreCenter(cell) {
  const middle = (BOARD_SIZE - 1) / 2;
  const distance = Math.abs(cell.row - middle) + Math.abs(cell.col - middle);
  return Math.max(0, 10 - distance) * SCORE.center;
}

function countNeighborChips(game, cell, team) {
  let count = 0;
  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let col = cell.col - 1; col <= cell.col + 1; col += 1) {
      if (row === cell.row && col === cell.col) {
        continue;
      }
      const neighbor = cellAt(game, row, col);
      if (neighbor && neighbor.chip === team) {
        count += 1;
      }
    }
  }
  return count;
}

function scoreExactOutcome(game, player, card, targetCellId) {
  const trial = cloneGame(game);
  const beforeScore = game.teamScores[player.team];
  const result = playCard(trial, player.seatIndex, card.id, targetCellId, () => 0.5);
  if (!result.ok) {
    return Number.NEGATIVE_INFINITY;
  }

  const sequenceGain = trial.teamScores[player.team] - beforeScore;
  let score = sequenceGain * SCORE.sequence;
  if (trial.winner === player.team || trial.teamScores[player.team] >= REQUIRED_SEQUENCES) {
    score += SCORE.win;
  }
  return score;
}

function scorePlacement(game, player, card, targetCellId, difficulty) {
  const target = game.board[targetCellId];
  const ownOverride = new Map([[targetCellId, player.team]]);
  const windows = windowsThroughCell(game, targetCellId);
  const opponent = opponentTeam(player.team);
  let score = scoreExactOutcome(game, player, card, targetCellId);

  for (const cells of windows) {
    score += scoreLineBuild(countWindow(game, cells, player.team, ownOverride), difficulty);
    score += scoreLineBlock(countWindow(game, cells, opponent), difficulty);
  }

  score += scoreCenter(target) * (difficulty === BOT_DIFFICULTIES.aggressive ? 0.8 : 1);
  score += countNeighborChips(game, target, player.team) * SCORE.neighbor * (difficulty === BOT_DIFFICULTIES.aggressive ? 1.25 : 1);
  score += card.action === "normal" ? SCORE.normalCard : SCORE.preservePowerJack;
  return score;
}

function scoreRemoval(game, player, card, targetCellId, difficulty) {
  const target = game.board[targetCellId];
  const opponent = opponentTeam(player.team);
  const windows = windowsThroughCell(game, targetCellId);
  let score = scoreExactOutcome(game, player, card, targetCellId) + SCORE.preservePowerJack;
  const defenseMultiplier = difficulty === BOT_DIFFICULTIES.aggressive ? 0.75 : 1;
  const attackMultiplier = difficulty === BOT_DIFFICULTIES.aggressive ? 1.35 : 1;

  for (const cells of windows) {
    const opponentLine = countWindow(game, cells, opponent);
    if (opponentLine.opponent === 0 && opponentLine.team >= 4) {
      score += SCORE.removeThreat * defenseMultiplier;
    } else if (opponentLine.opponent === 0 && opponentLine.team === 3) {
      score += SCORE.blockStrong * defenseMultiplier;
    }

    const ownLine = countWindow(game, cells, player.team);
    if (ownLine.opponent === 1 && target.chip === opponent && ownLine.team >= 4) {
      score += SCORE.removeBlocker * attackMultiplier;
    } else if (ownLine.opponent === 1 && target.chip === opponent && ownLine.team === 3) {
      score += SCORE.makeThree * attackMultiplier;
    }
  }

  score += scoreCenter(target) * 0.5;
  return score;
}

function scoreCandidate(game, player, candidate, difficulty) {
  if (candidate.type === "discard_dead") {
    const trial = cloneGame(game);
    const result = discardDeadCard(trial, player.seatIndex, candidate.cardId, () => 0.5);
    return result.ok ? SCORE.discard : Number.NEGATIVE_INFINITY;
  }

  const card = player.hand.find((entry) => entry.id === candidate.cardId);
  if (!card) {
    return Number.NEGATIVE_INFINITY;
  }

  if (card.action === "remove") {
    return scoreRemoval(game, player, card, candidate.targetCellId, difficulty);
  }

  return scorePlacement(game, player, card, candidate.targetCellId, difficulty);
}

function compareCandidates(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.type !== right.type) {
    return left.type === "play_card" ? -1 : 1;
  }
  if ((left.cardIndex ?? 0) !== (right.cardIndex ?? 0)) {
    return (left.cardIndex ?? 0) - (right.cardIndex ?? 0);
  }
  return (left.targetCellId ?? 0) - (right.targetCellId ?? 0);
}

function buildCandidates(game, player) {
  const candidates = [];
  let deadCardCandidate = null;

  player.hand.forEach((card, cardIndex) => {
    const targets = getLegalTargets(game, card, player.team);
    if (targets.length === 0 && card.action === "normal" && !deadCardCandidate) {
      deadCardCandidate = {
        type: "discard_dead",
        cardId: card.id,
        cardIndex,
      };
      return;
    }

    for (const targetCellId of targets) {
      candidates.push({
        type: "play_card",
        cardId: card.id,
        targetCellId,
        cardIndex,
      });
    }
  });

  if (deadCardCandidate) {
    candidates.push(deadCardCandidate);
  }

  return candidates;
}

// Reusable internal: score every legal candidate for `player` at the given static
// difficulty and return them sorted best-first by compareCandidates. This is the exact
// scoring the smart/aggressive path uses — extracted verbatim so behaviour is unchanged.
export function scoreAllCandidates(game, player, difficulty = BOT_DIFFICULTIES.smart) {
  const staticDifficulty = difficulty === BOT_DIFFICULTIES.master ? BOT_DIFFICULTIES.smart : difficulty;
  const candidates = buildCandidates(game, player);
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(game, player, candidate, staticDifficulty),
    }))
    .filter((candidate) => Number.isFinite(candidate.score));
  scored.sort(compareCandidates);
  return scored;
}

// Precompute every distinct 5-in-a-row window on the board ONCE (board geometry is fixed —
// 10x10, same corners — so this list is valid for every cloned game). Each window is an
// array of 5 cell ids. This avoids the per-cell windowsThroughCell + dedup work the master
// leaf eval would otherwise repeat thousands of times during the search.
const ALL_WINDOWS = (() => {
  const windows = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      for (const direction of DIRECTIONS) {
        const cells = [];
        let valid = true;
        for (let step = 0; step < 5; step += 1) {
          const r = row + step * direction.dr;
          const c = col + step * direction.dc;
          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
            valid = false;
            break;
          }
          cells.push(r * BOARD_SIZE + c);
        }
        if (valid) {
          windows.push(cells);
        }
      }
    }
  }
  return windows;
})();

// --- MASTER positional evaluator -------------------------------------------------------
// Scores a whole POSITION for `team` (team value minus opponent value), unlike SMART which
// scores one move by the lines through its target cell. Values open-ended lines, aggregates
// fork potential by shared empty cell, and weights opponent threats asymmetrically. Used as
// the leaf eval of the alpha-beta search.
function scoreLinesForTeam(game, team) {
  let lineScore = 0;
  // Track, per empty cell, how many distinct live windows (>=3 team chips, opponent-free)
  // pass through it — the fork signal.
  const forkThreatsByCell = new Map();

  for (const cells of ALL_WINDOWS) {
    const count = countWindow(game, cells, team);
    if (count.opponent > 0) {
      continue;
    }
    if (count.team >= 5) {
      lineScore += MASTER_EVAL.four; // full sequences already counted via teamScores
    } else if (count.team === 4) {
      // One empty away from a 5-window. If that empty is a real playable cell it is an
      // open-four (one-move threat) — reward heavily.
      lineScore += count.empty === 1 ? MASTER_EVAL.openFour : MASTER_EVAL.four;
      if (count.empty === 1) {
        const emptyCell = cells.find((id) => {
          const cell = game.board[id];
          return !cell.corner && cell.chip == null;
        });
        if (emptyCell != null) {
          forkThreatsByCell.set(emptyCell, (forkThreatsByCell.get(emptyCell) || 0) + 1);
        }
      }
    } else if (count.team === 3) {
      lineScore += MASTER_EVAL.three;
      for (const id of cells) {
        const cell = game.board[id];
        if (!cell.corner && cell.chip == null) {
          forkThreatsByCell.set(id, (forkThreatsByCell.get(id) || 0) + 1);
        }
      }
    } else if (count.team === 2) {
      lineScore += MASTER_EVAL.two;
    }
  }

  // Fork bonus: any single empty cell shared by >=2 live team windows is a double threat
  // the opponent cannot answer with one move. Reward super-linearly.
  for (const shared of forkThreatsByCell.values()) {
    if (shared >= 2) {
      lineScore += MASTER_EVAL.forkBonus * (shared - 1);
    }
  }

  return lineScore;
}

function evaluateMasterPosition(game, team) {
  const opponent = opponentTeam(team);
  if (game.teamScores[team] >= REQUIRED_SEQUENCES || game.winner === team) {
    return MASTER_EVAL.win;
  }
  if (game.teamScores[opponent] >= REQUIRED_SEQUENCES || game.winner === opponent) {
    return -MASTER_EVAL.win;
  }
  const teamValue = scoreLinesForTeam(game, team) + game.teamScores[team] * MASTER_EVAL.openFour * 4;
  const opponentValue = scoreLinesForTeam(game, opponent) + game.teamScores[opponent] * MASTER_EVAL.openFour * 4;
  return teamValue - MASTER_EVAL.opponentThreatWeight * opponentValue;
}

// Apply a candidate to a cloned game, resolving the pending discard+draw so the position is
// ready for the next seat to move. Deterministic via () => 0.5. Returns the mutated clone or
// null if the move is illegal.
function applyCandidate(game, player, candidate) {
  const trial = cloneGame(game);
  if (candidate.type === "discard_dead") {
    const result = discardDeadCard(trial, player.seatIndex, candidate.cardId, () => 0.5);
    if (!result.ok) {
      return null;
    }
  } else {
    const result = playCard(trial, player.seatIndex, candidate.cardId, candidate.targetCellId, () => 0.5);
    if (!result.ok) {
      return null;
    }
  }
  // Resolve pending discard + draw so the turn advances to the next player.
  if (trial.pendingStep?.type === "discard") {
    const discarded = discardPendingCard(trial, player.seatIndex);
    if (!discarded.ok) {
      return null;
    }
  }
  if (trial.pendingStep?.type === "draw") {
    const drawn = drawReplacementCard(trial, player.seatIndex, () => 0.5);
    if (!drawn.ok) {
      return null;
    }
  }
  return trial;
}

// Pick the seat that moves next for `team` in `game`, starting from the current player. Used
// to model the opponent reply in the search (full-information, single representative seat).
function nextSeatForTeam(game, team) {
  for (let step = 0; step < game.players.length; step += 1) {
    const index = (game.currentPlayerIndex + step) % game.players.length;
    if (game.players[index].team === team) {
      return game.players[index];
    }
  }
  return null;
}

// Cheap move ordering for interior search nodes. Unlike scoreCandidate (which clones the
// game and calls playCard per candidate), this only counts the windows through the target
// cell — no clone — so ordering the candidate list costs a fraction of the full static
// scorer. Good ordering is all we need here: alpha-beta uses it to pick which branches to
// explore, and the true value comes from the leaf eval after applyCandidate. Deterministic.
function orderingKey(game, player, candidate) {
  if (candidate.type !== "play_card") {
    return -1_000; // dead-card discards last
  }
  const targetCellId = candidate.targetCellId;
  const opponent = opponentTeam(player.team);
  const ownOverride = new Map([[targetCellId, player.team]]);
  const windows = windowsThroughCell(game, targetCellId);
  let key = 0;
  for (const cells of windows) {
    const own = countWindow(game, cells, player.team, ownOverride);
    if (own.opponent === 0) {
      if (own.team >= 5) key += 500_000;
      else if (own.team === 4) key += own.empty <= 1 ? 40_000 : 8_000;
      else if (own.team === 3) key += 800;
      else if (own.team === 2) key += 60;
    }
    // Defensive value: blocking an opponent line that is near completion. This is what
    // keeps low-own-static-but-high-defensive blocks inside the candidate cap.
    const opp = countWindow(game, cells, opponent);
    if (opp.opponent === 0 && opp.team >= 4 && opp.empty <= 1) key += 45_000;
    else if (opp.opponent === 0 && opp.team === 3 && opp.empty <= 2) key += 700;
  }
  return key;
}

function orderedCandidates(game, player, limit) {
  const candidates = buildCandidates(game, player);
  const keyed = candidates.map((candidate) => ({
    candidate,
    key: orderingKey(game, player, candidate),
  }));
  keyed.sort((left, right) => {
    if (left.key !== right.key) {
      return right.key - left.key;
    }
    // Stable deterministic tiebreak mirroring compareCandidates' secondary keys.
    const lc = left.candidate;
    const rc = right.candidate;
    if (lc.type !== rc.type) {
      return lc.type === "play_card" ? -1 : 1;
    }
    if ((lc.cardIndex ?? 0) !== (rc.cardIndex ?? 0)) {
      return (lc.cardIndex ?? 0) - (rc.cardIndex ?? 0);
    }
    return (lc.targetCellId ?? 0) - (rc.targetCellId ?? 0);
  });
  return keyed.slice(0, limit).map((entry) => entry.candidate);
}

// Minimax with alpha-beta. Score is ALWAYS absolute (rootTeam's perspective). `toMove` is
// the player about to act; the root team maximises the score, any other team minimises it.
// Depth counts plies remaining.
function searchPosition(game, toMove, rootTeam, depth, alpha, beta) {
  if (game.winner || depth === 0) {
    return evaluateMasterPosition(game, rootTeam);
  }
  const candidates = orderedCandidates(game, toMove, MASTER_BRANCHING);
  if (candidates.length === 0) {
    return evaluateMasterPosition(game, rootTeam);
  }
  const maximising = toMove.team === rootTeam;
  let best = maximising ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let moved = false;

  for (const candidate of candidates) {
    const next = applyCandidate(game, toMove, candidate);
    if (!next) {
      continue;
    }
    moved = true;
    let value;
    if (next.winner) {
      value = evaluateMasterPosition(next, rootTeam);
    } else {
      const responder = nextSeatForTeam(next, next.players[next.currentPlayerIndex].team);
      value = searchPosition(next, responder, rootTeam, depth - 1, alpha, beta);
    }
    if (maximising) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) {
      break;
    }
  }
  return moved ? best : evaluateMasterPosition(game, rootTeam);
}

function chooseMasterAction(game, player) {
  const rootScored = scoreAllCandidates(game, player, BOT_DIFFICULTIES.master);
  if (rootScored.length === 0) {
    return null;
  }
  const candidates = rootScored.slice(0, MASTER_BRANCHING);
  const rootTeam = player.team;

  let bestCandidate = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;

  const evaluated = [];
  for (const candidate of candidates) {
    const next = applyCandidate(game, player, candidate);
    if (!next) {
      continue;
    }
    let value;
    if (next.winner) {
      value = evaluateMasterPosition(next, rootTeam);
    } else {
      const responder = nextSeatForTeam(next, next.players[next.currentPlayerIndex].team);
      value = searchPosition(next, responder, rootTeam, MASTER_SEARCH_DEPTH - 1, alpha, beta);
    }
    evaluated.push({ candidate, value });
    if (value > bestValue) {
      bestValue = value;
      bestCandidate = candidate;
    }
    alpha = Math.max(alpha, value);
  }

  if (!bestCandidate) {
    return null;
  }

  // Deterministic tie-break: among candidates whose search value ties the best (within a
  // tiny epsilon to absorb float noise), pick by the existing compareCandidates ordering.
  const EPS = 1e-6;
  const tied = evaluated
    .filter((entry) => Math.abs(entry.value - bestValue) <= EPS)
    .map((entry) => entry.candidate);
  tied.sort(compareCandidates);
  const chosen = tied[0] || bestCandidate;

  return {
    type: chosen.type,
    cardId: chosen.cardId,
    targetCellId: chosen.targetCellId,
    score: Math.round(bestValue),
  };
}

// =======================================================================================
// GRANDMASTER engine — measurably & DETERMINISTICALLY stronger than MASTER.
// See docs/superpowers/specs/2026-09-12-grandmaster-engine-design.md.
//
// Three changes over MASTER, each necessary (see spec):
//   (a) Iterative deepening with a hard time budget (LIVE client path) OR an explicit fixed
//       maxDepth that ignores the clock (DETERMINISTIC test path). A depth's result is only
//       adopted once that depth COMPLETES, so a timed-out depth is discarded and depth 1
//       always guarantees a legal move.
//   (b) A per-search transposition table keyed by a deterministic position hash (FNV-1a via
//       rng.js hashStringToSeed over a compact board+turn encoding), storing
//       {depth,value,flag,bestMove} with EXACT/LOWER/UPPER bounds, plus TT/PV-first move
//       ordering that funds a deeper search by pruning far more of the tree.
//   (c) A stronger leaf evaluator (evaluateGrandmasterPosition) extending MASTER's with
//       tempo/turn-to-complete, double-open-four escalation, and a mobility term.
// =======================================================================================

// Live-client time budget. Sized to fit comfortably inside shared/local-solo.js's ~650ms
// LOCAL_BOT_DELAY_MS thinking window with margin for the surrounding snapshot/paint work.
const GM_BUDGET_MS = 450;
// Iterative-deepening ceiling for the live path. The search rarely reaches this within the
// budget on a full board, but it caps the clock-free fixed-depth path's implicit max and the
// live path's best case on sparse boards.
const GM_MAX_DEPTH = 6;
// SHIPPING DEFAULT depth for GRANDMASTER when reached through chooseBotAction (solo play,
// seeded replays, the determinism test). This path is clock-free and therefore FULLY
// DETERMINISTIC: two runs on the same seed pick identical moves regardless of CPU speed,
// which the wall-clock time-budget path cannot guarantee. Depth 4 is chosen deliberately:
//   - Latency: clock-free depth-4 search (iterative deepening + TT + PV/TT ordering + the
//     depth-narrowed branching below) costs ~175ms median and stays under ~630ms worst-case
//     on a full board — inside shared/local-solo.js's 650ms LOCAL_BOT_DELAY_MS thinking
//     window, so interactive solo play never stalls past its own displayed "thinking" delay.
//   - Strength: still clearly beats MASTER — measured +0.20 same-seed win-rate margin over
//     the master-vs-master baseline across the 20 board-fairness seed labels (local node
//     v22), well above the proof's GM_MARGIN=0.10 bar. Depth 4 keeps GRANDMASTER's wider
//     candidate set and full lookahead over MASTER's depth-3 search.
// The offline board-fairness strength proof drives GRANDMASTER at its OWN explicit fixed
// depth (5), unconstrained by interactive latency — see scripts/board-fairness-test.mjs.
const GM_DEFAULT_FIXED_DEPTH = 4;
// Wider candidate set than MASTER (10) at shallow plies (near the root, where a missed
// defensive move is fatal): better ordering + the TT let alpha-beta prune the extra breadth
// cheaply, and the wider set is what lets GRANDMASTER see defensive/tempo moves MASTER's
// tighter cap drops. Deeper plies narrow the width (GM_DEEP_BRANCHING / GM_TAIL_BRANCHING) so
// the extra lookahead depth costs a fraction of a full-width tree — the top ordered moves
// dominate the value that far down.
const GM_BRANCHING = 10;
const GM_DEEP_BRANCHING = 5;
const GM_TAIL_BRANCHING = 3;

// TT entry bound flags.
const TT_EXACT = 0;
const TT_LOWER = 1; // value is a lower bound (fail-high / beta cutoff)
const TT_UPPER = 2; // value is an upper bound (fail-low / did not raise alpha)

// GRANDMASTER leaf-eval weights. Extends MASTER_EVAL: same open-four/four/three/two ladder and
// asymmetric opponent-threat lean, PLUS three new terms justified inline.
const GM_EVAL = {
  win: MASTER_EVAL.win,
  openFour: MASTER_EVAL.openFour,
  four: MASTER_EVAL.four,
  three: MASTER_EVAL.three,
  two: MASTER_EVAL.two,
  forkBonus: MASTER_EVAL.forkBonus,
  opponentThreatWeight: MASTER_EVAL.opponentThreatWeight,
  // TEMPO: an open-four is completable on THIS team's next move (a one-move threat). Reward it
  // beyond the raw openFour term so the search prefers threats it can actually cash before the
  // opponent replies — MASTER values the shape, GRANDMASTER values the initiative.
  tempoOpenFour: 12_000,
  // DOUBLE-OPEN-FOUR escalation: two INDEPENDENT open-fours (distinct completion cells) is
  // unstoppable — the opponent blocks at most one. Value it at near-win so the search drives
  // toward these configurations and defends against the opponent's. Super-linear in count.
  doubleOpenFour: 900_000,
  // MOBILITY: a small per-live-window term (opponent-free windows the team still has a stake
  // in). Captures positional flexibility SMART/MASTER ignore; kept tiny so it only breaks ties
  // between otherwise-equal tactical positions, never overrides a real threat.
  mobility: 6,
};

// Compact, deterministic board+turn encoding → FNV-1a hash (rng.js). Used as the transposition
// table key. Encodes every cell's occupant (., A, B) plus each team's sequence score and whose
// turn it is, so transposed move orders that reach the SAME board+turn collide (the point of a
// TT) while genuinely distinct positions do not. Dependency-free and deterministic.
export function hashGamePosition(game, toMoveTeam) {
  let encoded = "";
  const board = game.board;
  for (let i = 0; i < board.length; i += 1) {
    const chip = board[i].chip;
    encoded += chip === "A" ? "A" : chip === "B" ? "B" : ".";
  }
  encoded += `|${game.teamScores.A}|${game.teamScores.B}|${toMoveTeam}`;
  return hashStringToSeed(encoded);
}

// GRANDMASTER positional evaluator. Absolute score from `team`'s perspective (team value minus
// asymmetrically-weighted opponent value), like evaluateMasterPosition, then adds the GM_EVAL
// tempo / double-open-four / mobility terms. Terminal positions short-circuit to +/- win.
function scoreGrandmasterLinesForTeam(game, team) {
  let lineScore = 0;
  let liveWindows = 0; // mobility: count of opponent-free windows with >=1 team stake
  // Distinct completion cells of the team's open-fours (empty === 1, one move from a 5).
  const openFourCells = new Set();
  // Fork signal: per empty cell, how many live >=3 windows pass through it.
  const forkThreatsByCell = new Map();

  for (const cells of ALL_WINDOWS) {
    const count = countWindow(game, cells, team);
    if (count.opponent > 0) {
      continue;
    }
    if (count.team >= 1) {
      liveWindows += 1;
    }
    if (count.team >= 5) {
      lineScore += GM_EVAL.four;
    } else if (count.team === 4) {
      if (count.empty === 1) {
        lineScore += GM_EVAL.openFour;
        const emptyCell = cells.find((id) => {
          const cell = game.board[id];
          return !cell.corner && cell.chip == null;
        });
        if (emptyCell != null) {
          openFourCells.add(emptyCell);
          forkThreatsByCell.set(emptyCell, (forkThreatsByCell.get(emptyCell) || 0) + 1);
        }
      } else {
        lineScore += GM_EVAL.four;
      }
    } else if (count.team === 3) {
      lineScore += GM_EVAL.three;
      for (const id of cells) {
        const cell = game.board[id];
        if (!cell.corner && cell.chip == null) {
          forkThreatsByCell.set(id, (forkThreatsByCell.get(id) || 0) + 1);
        }
      }
    } else if (count.team === 2) {
      lineScore += GM_EVAL.two;
    }
  }

  // Single-cell fork bonus (inherited from MASTER): one empty shared by >=2 live windows.
  for (const shared of forkThreatsByCell.values()) {
    if (shared >= 2) {
      lineScore += GM_EVAL.forkBonus * (shared - 1);
    }
  }

  // Double-open-four escalation: two or more INDEPENDENT open-fours (distinct completion
  // cells) is unstoppable. Super-linear so three is worth more than two.
  if (openFourCells.size >= 2) {
    lineScore += GM_EVAL.doubleOpenFour * (openFourCells.size - 1);
  }

  lineScore += liveWindows * GM_EVAL.mobility;
  return lineScore;
}

// Count the team's DISTINCT immediate-win cells: empty, non-corner cells that complete a
// 5-window for `team` right now (an "open four" completion, given the team already holds a
// scoring lead so a completion reaches REQUIRED_SEQUENCES). Used for tempo/turn-to-complete.
function immediateWinCells(game, team) {
  const cells = new Set();
  for (const window of ALL_WINDOWS) {
    const count = countWindow(game, window, team);
    if (count.opponent === 0 && count.team === 4 && count.empty === 1) {
      const emptyCell = window.find((id) => {
        const cell = game.board[id];
        return !cell.corner && cell.chip == null;
      });
      if (emptyCell != null) {
        cells.add(emptyCell);
      }
    }
  }
  return cells;
}

// GRANDMASTER leaf eval. `toMoveTeam` (defaulting to `team` for the exported 2-arg test
// signature) is used only for a bounded TEMPO term: being on the move with a live open-four
// (a threat completable THIS turn) is worth more than the same shape when the opponent moves
// next and can block it. Unlike an unbounded win short-circuit (which distorts the search
// horizon), this is a bounded bonus layered on top of the positional score, so the search
// still discriminates finely between non-terminal positions. This turn-to-complete awareness
// is the tactical signal MASTER lacks.
export function evaluateGrandmasterPosition(game, team, toMoveTeam = team) {
  const opponent = opponentTeam(team);
  if (game.teamScores[team] >= REQUIRED_SEQUENCES || game.winner === team) {
    return GM_EVAL.win;
  }
  if (game.teamScores[opponent] >= REQUIRED_SEQUENCES || game.winner === opponent) {
    return -GM_EVAL.win;
  }

  const teamValue = scoreGrandmasterLinesForTeam(game, team) + game.teamScores[team] * GM_EVAL.openFour * 4;
  const opponentValue =
    scoreGrandmasterLinesForTeam(game, opponent) + game.teamScores[opponent] * GM_EVAL.openFour * 4;
  let score = teamValue - GM_EVAL.opponentThreatWeight * opponentValue;

  // Bounded tempo term: reward the side to move for holding an immediate-completion threat,
  // and penalize the mirror. Kept well below a real win so it only tilts otherwise-close
  // positions toward keeping the initiative.
  const teamWinCells = immediateWinCells(game, team).size;
  const oppWinCells = immediateWinCells(game, opponent).size;
  if (toMoveTeam === team && teamWinCells >= 1) {
    score += GM_EVAL.tempoOpenFour;
  }
  if (toMoveTeam === opponent && oppWinCells >= 1) {
    score -= GM_EVAL.opponentThreatWeight * GM_EVAL.tempoOpenFour;
  }
  return score;
}

// Engine descriptor: the pieces that differ between GRANDMASTER and LEGEND while the whole
// alpha-beta + TT + ordering machinery below is SHARED (so LEGEND is a genuine deeper/stronger
// configuration of the same proven search, not a divergent fork). `evalFn(game, team,
// toMoveTeam)` is the leaf evaluator; `width(depth)` is the depth-narrowed branching schedule;
// `winValue` is the |value| beyond which a result is decisive and cannot improve with depth.
// GM_ENGINE reproduces GRANDMASTER's exact prior behaviour (byte-identical), so passing it as
// the default keeps every existing GRANDMASTER call unchanged.
const GM_ENGINE = {
  evalFn: (game, team, toMoveTeam) => evaluateGrandmasterPosition(game, team, toMoveTeam),
  width: (depth) => (depth >= 3 ? GM_BRANCHING : depth === 2 ? GM_DEEP_BRANCHING : GM_TAIL_BRANCHING),
  rootWidth: GM_BRANCHING,
  winValue: GM_EVAL.win,
};

// Order candidates best-first for the GM search: the TT best move for this position (if any)
// first, then the existing orderingKey, ties broken by the deterministic compareCandidates
// secondary keys. `ttBestMove` is a {cardId,targetCellId,type} shape or null.
function gmOrderedCandidates(game, player, limit, ttBestMove) {
  const candidates = buildCandidates(game, player);
  const keyed = candidates.map((candidate) => {
    const isTtBest =
      ttBestMove != null &&
      candidate.type === ttBestMove.type &&
      candidate.cardId === ttBestMove.cardId &&
      (candidate.targetCellId ?? null) === (ttBestMove.targetCellId ?? null);
    return {
      candidate,
      // TT/PV move gets a dominating key so it is searched first (best chance of an early
      // cutoff); everything else falls back to the shallow orderingKey.
      key: isTtBest ? Number.POSITIVE_INFINITY : orderingKey(game, player, candidate),
    };
  });
  keyed.sort((left, right) => {
    if (left.key !== right.key) {
      return right.key - left.key;
    }
    const lc = left.candidate;
    const rc = right.candidate;
    if (lc.type !== rc.type) {
      return lc.type === "play_card" ? -1 : 1;
    }
    if ((lc.cardIndex ?? 0) !== (rc.cardIndex ?? 0)) {
      return (lc.cardIndex ?? 0) - (rc.cardIndex ?? 0);
    }
    return (lc.targetCellId ?? 0) - (rc.targetCellId ?? 0);
  });
  return keyed.slice(0, limit).map((entry) => entry.candidate);
}

// Sentinel thrown to abort a depth iteration the moment the time budget is exceeded, so a
// single deep iteration can never overrun the budget (the between-depths check alone is not
// enough — one depth-5 iteration can take seconds). Caught in chooseGrandmasterAction, which
// then keeps the last COMPLETED depth's result. Never escapes the module.
const GM_TIMEOUT = Symbol("gm-timeout");

// Alpha-beta with a transposition table. Absolute score (rootTeam perspective). The maximiser
// is the root team; every other seat minimises. Returns { value, move } where `move` is the
// best candidate at this node (used for PV/TT). `tt` is a Map keyed by hashGamePosition.
// `clock` is a shared { deadline, nowFn, ticks } control (or null for the clock-free fixed-
// depth path); when the deadline passes, a GM_TIMEOUT sentinel is thrown to abort the depth.
function gmCheckClock(clock) {
  if (!clock) {
    return;
  }
  // Sample the clock every few nodes rather than every node (nowFn can be non-trivial).
  clock.ticks += 1;
  if ((clock.ticks & 0x3f) === 0 && clock.nowFn() >= clock.deadline) {
    throw GM_TIMEOUT;
  }
}

function gmSearch(game, toMove, rootTeam, depth, alpha, beta, tt, clock, engine = GM_ENGINE) {
  if (game.winner || depth === 0) {
    return { value: engine.evalFn(game, rootTeam, toMove.team), move: null };
  }
  gmCheckClock(clock);

  const alphaOrig = alpha;
  const key = hashGamePosition(game, toMove.team);
  const stored = tt.get(key);
  let ttBestMove = null;
  if (stored) {
    ttBestMove = stored.bestMove;
    if (stored.depth >= depth) {
      // A stored entry at >= the remaining depth can be reused directly (EXACT) or used to
      // tighten the window (LOWER/UPPER), pruning the sub-tree entirely on a cutoff.
      if (stored.flag === TT_EXACT) {
        return { value: stored.value, move: stored.bestMove };
      }
      if (stored.flag === TT_LOWER && stored.value > alpha) alpha = stored.value;
      else if (stored.flag === TT_UPPER && stored.value < beta) beta = stored.value;
      if (alpha >= beta) {
        return { value: stored.value, move: stored.bestMove };
      }
    }
  }

  // Narrow the branching factor at deeper plies: the top few ordered moves dominate the
  // value at depth, so spending the full width only near the root (where a missed defensive
  // move is fatal) buys most of the depth lookahead at a fraction of the node count. The
  // schedule is engine-specific (LEGEND is wider at the shallow plies than GRANDMASTER).
  const width = engine.width(depth);
  const candidates = gmOrderedCandidates(game, toMove, width, ttBestMove);
  if (candidates.length === 0) {
    return { value: engine.evalFn(game, rootTeam, toMove.team), move: null };
  }

  const maximising = toMove.team === rootTeam;
  let best = maximising ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  let bestMove = null;
  let moved = false;

  for (const candidate of candidates) {
    const next = applyCandidate(game, toMove, candidate);
    if (!next) {
      continue;
    }
    moved = true;
    let value;
    if (next.winner) {
      value = engine.evalFn(next, rootTeam, next.players[next.currentPlayerIndex].team);
    } else {
      const responder = nextSeatForTeam(next, next.players[next.currentPlayerIndex].team);
      value = gmSearch(next, responder, rootTeam, depth - 1, alpha, beta, tt, clock, engine).value;
    }
    if (maximising) {
      if (value > best || bestMove === null) {
        best = value;
        bestMove = candidate;
      }
      if (best > alpha) alpha = best;
    } else {
      if (value < best || bestMove === null) {
        best = value;
        bestMove = candidate;
      }
      if (best < beta) beta = best;
    }
    if (alpha >= beta) {
      break; // cutoff
    }
  }

  if (!moved) {
    return { value: engine.evalFn(game, rootTeam, toMove.team), move: null };
  }

  // Store with the correct bound flag so a later probe can trust or tighten it.
  let flag = TT_EXACT;
  if (best <= alphaOrig) flag = TT_UPPER;
  else if (best >= beta) flag = TT_LOWER;
  const compactMove = bestMove
    ? { type: bestMove.type, cardId: bestMove.cardId, targetCellId: bestMove.targetCellId ?? null }
    : null;
  const prior = tt.get(key);
  if (!prior || prior.depth <= depth) {
    tt.set(key, { depth, value: best, flag, bestMove: compactMove });
  }
  return { value: best, move: bestMove };
}

// Run one full-width root search to a fixed depth. Returns the ordered evaluation list plus
// the best candidate, deterministic tie-break applied. Reuses the shared transposition table
// across depths within an iterative-deepening call (earlier-depth entries seed later ordering).
function gmRootSearch(game, player, depth, tt, clock, engine = GM_ENGINE) {
  const rootTeam = player.team;
  const rootKey = hashGamePosition(game, player.team);
  const ttBestMove = tt.get(rootKey)?.bestMove ?? null;
  const candidates = gmOrderedCandidates(game, player, engine.rootWidth, ttBestMove);
  if (candidates.length === 0) {
    return null;
  }

  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestCandidate = null;
  const evaluated = [];

  for (const candidate of candidates) {
    const next = applyCandidate(game, player, candidate);
    if (!next) {
      continue;
    }
    let value;
    if (next.winner) {
      value = engine.evalFn(next, rootTeam, next.players[next.currentPlayerIndex].team);
    } else {
      const responder = nextSeatForTeam(next, next.players[next.currentPlayerIndex].team);
      value = gmSearch(next, responder, rootTeam, depth - 1, alpha, beta, tt, clock, engine).value;
    }
    evaluated.push({ candidate, value });
    if (value > bestValue || bestCandidate === null) {
      bestValue = value;
      bestCandidate = candidate;
    }
    if (value > alpha) alpha = value;
  }

  if (!bestCandidate) {
    return null;
  }

  // Deterministic tie-break: among candidates tying the best value (within epsilon), pick by
  // compareCandidates so the whole search is reproducible.
  const EPS = 1e-6;
  const tied = evaluated
    .filter((entry) => Math.abs(entry.value - bestValue) <= EPS)
    .map((entry) => entry.candidate);
  tied.sort(compareCandidates);
  const chosen = tied[0] || bestCandidate;
  // Seed the root TT entry with the chosen move so the next deeper iteration orders it first.
  tt.set(rootKey, {
    depth,
    value: bestValue,
    flag: TT_EXACT,
    bestMove: { type: chosen.type, cardId: chosen.cardId, targetCellId: chosen.targetCellId ?? null },
  });
  return { candidate: chosen, value: bestValue };
}

// GRANDMASTER action chooser. Two modes:
//   - FIXED DEPTH (options.maxDepth set): run iterative deepening 1..maxDepth ignoring the
//     clock; adopt each depth's result as it completes. Fully deterministic — this is the path
//     the board-fairness strength proof drives so results are identical on every CPU.
//   - TIME BUDGET (default / options.budgetMs): iterative deepening 1..GM_MAX_DEPTH, stopping
//     before starting a depth once elapsed time (via injectable nowFn) exceeds the budget. A
//     depth is only adopted once it COMPLETES, so a partial depth is discarded and depth 1
//     always yields a legal move within the budget. This is the live-client path.
export function chooseGrandmasterAction(game, player, options = {}, engine = GM_ENGINE) {
  const rootCandidates = buildCandidates(game, player);
  if (rootCandidates.length === 0) {
    return null;
  }

  const fixedDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0 ? options.maxDepth : null;
  const budgetMs = Number.isFinite(options.budgetMs) ? options.budgetMs : GM_BUDGET_MS;
  const nowFn =
    typeof options.nowFn === "function"
      ? options.nowFn
      : () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const maxDepth = fixedDepth ?? GM_MAX_DEPTH;

  // Shared TT across the iterative-deepening sweep: shallow entries seed deeper-depth ordering.
  const tt = new Map();
  // Clock control for the live path only. The fixed-depth (test) path passes null so it runs
  // to completion ignoring wall-clock time — the deterministic-proof contract. On the live
  // path, the deadline aborts a depth mid-iteration (GM_TIMEOUT) so a single deep iteration
  // can never overrun the budget; the last COMPLETED depth's result is kept.
  const startedAt = fixedDepth ? 0 : nowFn();
  const clock = fixedDepth ? null : { deadline: startedAt + budgetMs, nowFn, ticks: 0 };
  let best = null;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    if (clock && depth > 1 && nowFn() >= clock.deadline) {
      // Out of time before starting this depth — keep the last completed depth's result.
      break;
    }
    let result;
    try {
      // Depth 1 always runs clock-free so a legal move is guaranteed even under a tiny/expired
      // budget (it completes in microseconds). Deeper depths honour the deadline.
      result = gmRootSearch(game, player, depth, tt, depth === 1 ? null : clock, engine);
    } catch (error) {
      if (error === GM_TIMEOUT) {
        // This depth was aborted by the budget; discard its partial work and keep the last
        // completed depth. Depth 1 has no clock check race (it is always allowed to start and
        // completes in microseconds), so `best` is guaranteed non-null by the time a deeper
        // depth can time out.
        break;
      }
      throw error;
    }
    if (result) {
      best = result; // adopt only completed depths
    }
    // A decisive win/loss value cannot improve with more depth — stop early (also keeps the
    // fixed-depth path from wasting iterations once a forced result is found).
    if (best && Math.abs(best.value) >= engine.winValue) {
      break;
    }
  }

  if (!best) {
    return null;
  }
  const chosen = best.candidate;
  return {
    type: chosen.type,
    cardId: chosen.cardId,
    targetCellId: chosen.targetCellId,
    score: Math.round(best.value),
  };
}

// =======================================================================================
// LEGEND engine — measurably & DETERMINISTICALLY stronger than GRANDMASTER.
// See docs/superpowers/specs/2026-09-17-legend-engine-opening-book-design.md.
//
// LEGEND reuses the SHARED GRANDMASTER search machinery (gmSearch / gmRootSearch / TT /
// hashGamePosition / orderingKey / compareCandidates) via the `engine` descriptor, in a
// stronger configuration whose edge is proven at EQUAL search depth (the offline board-fairness
// proof drives BOTH LEGEND and GRANDMASTER at fixed depth 5, so the measured same-seed margin
// isolates ENGINE QUALITY, not a raw depth advantage):
//   (a) a WIDER shallow branching (LEGEND_BRANCHING=12 / LEGEND_DEEP_BRANCHING=6 vs
//       GRANDMASTER's 10 / 5) so more candidate defenses/attacks are considered near the root
//       where a missed move is fatal, funded by the same TT/PV ordering that keeps the extra
//       breadth cheap;
//   (b) a strengthened leaf evaluator (evaluateLegendPosition) extending
//       evaluateGrandmasterPosition with bounded CONNECTIVITY + CENTRAL-THREAT terms so the
//       search discriminates more finely between otherwise line-equal leaves;
//   (c) a deterministic seeded OPENING BOOK consulted before searching in the opening plies.
// The +20.0pt same-seed margin over the GRANDMASTER-vs-GRANDMASTER baseline at depth 5 (see
// scripts/board-fairness-test.mjs) is what makes "LEGEND is stronger" an honest claim.
// =======================================================================================

// LEGEND leaf-eval weights. Extends GM_EVAL. Every new term is bounded well below a real win
// so it only tilts otherwise-close positions — the core value stays GRANDMASTER's asymmetric
// line ladder + fork + double-open-four escalation, now discriminated more finely.
const LEGEND_EVAL = {
  // CONNECTIVITY: a live (opponent-free) three-in-line whose empties sit adjacent to an
  // existing team chip converts to an open-four in fewer tempi than an isolated three. Reward
  // per such connected three. GRANDMASTER counts the three; LEGEND counts how close it is to
  // becoming a one-move threat. Weighted at roughly one-third of a raw `three` (2_400) so a
  // contiguous three is worth meaningfully more than a gapped one — enough to RE-RANK two
  // otherwise line-equal moves toward the shape that matures fastest, not just break a tie.
  connectivity: 900,
  // CONNECTED TWO: a live two whose empties are contiguous with a team chip is the seed of a
  // connected three. Rewarding it steers early/mid development toward compact, mutually
  // supporting shapes (which convert to forks) instead of scattered singletons. Bounded to a
  // fraction of `connectivity` so it only shapes development, never overrides a real threat.
  connectedTwo: 150,
  // CENTRAL THREAT: an open-four whose completion cell is nearer the board centre is harder to
  // answer without creating new weaknesses (more independent windows radiate through central
  // cells). Per-central-open-four bonus. Raised from a pure tie-breaker so LEGEND actively
  // prefers central pressure, which compounds over the extra plies of search.
  centralThreat: 420,
  // CENTRAL DEVELOPMENT: a tiny per-team-chip pull toward the centre, summed over placed chips.
  // Central chips participate in more windows, so early central control widens LEGEND's future
  // threat surface. Kept minuscule per chip so the aggregate only tilts near-equal positions.
  centralChip: 8,
};

// Distance from a cell to the board centre (Chebyshev-ish Manhattan half). Lower = more
// central. Used by the central-threat term; deterministic, geometry-only.
function cellCentrality(cellId) {
  const middle = (BOARD_SIZE - 1) / 2;
  const row = Math.floor(cellId / BOARD_SIZE);
  const col = cellId % BOARD_SIZE;
  return Math.abs(row - middle) + Math.abs(col - middle);
}

// LEGEND positional add-ons for `team` (connectivity + central-threat), layered on top of the
// GRANDMASTER line value. Pure + deterministic; scans the precomputed window list once.
// Does at least one empty in this live window sit directly next to a team chip within the SAME
// window (i.e. the shape is contiguous, not split by a gap)? Contiguous shapes mature into
// threats in fewer tempi. Deterministic single scan of the window's cells.
function windowIsContiguous(game, cells, team) {
  for (let idx = 0; idx < cells.length; idx += 1) {
    const cell = game.board[cells[idx]];
    const isTeamChip = cell.corner || cell.chip === team;
    if (!isTeamChip) {
      continue;
    }
    const prev = idx > 0 ? game.board[cells[idx - 1]] : null;
    const nextCell = idx < cells.length - 1 ? game.board[cells[idx + 1]] : null;
    if ((prev && !prev.corner && prev.chip == null) || (nextCell && !nextCell.corner && nextCell.chip == null)) {
      return true;
    }
  }
  return false;
}

function scoreLegendAddonsForTeam(game, team) {
  let addon = 0;
  const CENTRAL_RADIUS = 5; // completion cells within this Manhattan distance of centre count
  for (const cells of ALL_WINDOWS) {
    const count = countWindow(game, cells, team);
    if (count.opponent > 0) {
      continue;
    }
    if (count.team === 3 && count.empty === 2) {
      // Connectivity: a contiguous live three is one placement from an open-four.
      if (windowIsContiguous(game, cells, team)) {
        addon += LEGEND_EVAL.connectivity;
      }
    } else if (count.team === 2 && count.empty === 3) {
      // Connected two: a contiguous live two is the seed of a connected three.
      if (windowIsContiguous(game, cells, team)) {
        addon += LEGEND_EVAL.connectedTwo;
      }
    } else if (count.team === 4 && count.empty === 1) {
      const emptyCell = cells.find((id) => {
        const cell = game.board[id];
        return !cell.corner && cell.chip == null;
      });
      if (emptyCell != null && cellCentrality(emptyCell) <= CENTRAL_RADIUS) {
        addon += LEGEND_EVAL.centralThreat;
      }
    }
  }
  // Central development: pull placed team chips toward the centre. Summed over the team's own
  // non-corner chips; each chip contributes centralChip scaled by how central it is (a chip at
  // the exact centre earns the most, an edge chip near zero). Bounded and geometry-only.
  const middle = (BOARD_SIZE - 1) / 2;
  for (let id = 0; id < game.board.length; id += 1) {
    const cell = game.board[id];
    if (cell.corner || cell.chip !== team) {
      continue;
    }
    const closeness = 2 * middle - cellCentrality(id); // 0 at corners, ~2*middle at centre
    if (closeness > 0) {
      addon += LEGEND_EVAL.centralChip * closeness;
    }
  }
  return addon;
}

// LEGEND leaf eval. Starts from evaluateGrandmasterPosition (terminal short-circuits, line
// ladder, fork, double-open-four, tempo, mobility) and adds the bounded connectivity +
// central-threat differential. Absolute score from `team`'s perspective, opponent side
// weighted asymmetrically to match the GM lean.
export function evaluateLegendPosition(game, team, toMoveTeam = team) {
  const base = evaluateGrandmasterPosition(game, team, toMoveTeam);
  // Terminal positions already resolved by the GM eval to +/- win; don't perturb them.
  if (Math.abs(base) >= GM_EVAL.win) {
    return base;
  }
  const opponent = opponentTeam(team);
  const teamAddon = scoreLegendAddonsForTeam(game, team);
  const opponentAddon = scoreLegendAddonsForTeam(game, opponent);
  return base + teamAddon - GM_EVAL.opponentThreatWeight * opponentAddon;
}

// LEGEND search width schedule: wider than GRANDMASTER at the shallow plies (root + depth 3)
// so more candidate defenses/attacks are considered where a missed move is fatal; narrows to
// the same tail widths at depth so the extra ply stays affordable.
const LEGEND_BRANCHING = 12;
const LEGEND_DEEP_BRANCHING = 6;

const LEGEND_ENGINE = {
  evalFn: (game, team, toMoveTeam) => evaluateLegendPosition(game, team, toMoveTeam),
  width: (depth) =>
    depth >= 3 ? LEGEND_BRANCHING : depth === 2 ? LEGEND_DEEP_BRANCHING : GM_TAIL_BRANCHING,
  rootWidth: LEGEND_BRANCHING,
  winValue: GM_EVAL.win,
};

// SHIPPING DEFAULT depth for LEGEND via chooseBotAction (solo play, seeded replays, the
// determinism test). Clock-free and therefore FULLY DETERMINISTIC. Chosen so a worst-case
// full-board move fits inside shared/local-solo.js's 650ms LOCAL_BOT_DELAY_MS window (measured
// locally — see FEAT-002 findings). The offline board-fairness proof drives LEGEND at its OWN
// deeper fixed depth (6), unconstrained by interactive latency, mirroring the GM
// depth-4-default / proof-depth-5 split.
const LEGEND_DEFAULT_FIXED_DEPTH = 4;

// --- Opening book ----------------------------------------------------------------------
// A deterministic, seeded, in-repo map from an early-position hash (hashGamePosition, the same
// FNV-1a key the transposition table uses) to a vetted move. Dependency-free and byte-identical
// everywhere (no Math.random, no wall-clock). Applied only in the first OPENING_BOOK_MAX_PLIES
// plies for the strong tiers; a miss returns null and the caller falls through to search.
//
// VETTING: each entry's move is exactly what a deep LEGEND search (proof depth) plays from that
// position — the book caches that deterministic verdict so opening moves get deep-search quality
// without paying the cost at runtime, and can never diverge from what the engine would choose.
// The lookup ALWAYS re-validates legality against the live candidate set, so a book entry can
// never emit an illegal move even if the board geometry shifts.
const OPENING_BOOK_MAX_PLIES = 4;

// The book is keyed by hashGamePosition(game, toMoveTeam). Values encode the vetted move as a
// selector resolved against the live hand/board at lookup time (so the concrete cardId — which
// is deal-specific — never needs to be hard-coded): { rank, suit, targetCellId } picks the
// hand card matching rank+suit and plays it at targetCellId, IFF that is currently legal.
//
// Seeded entry: the canonical opening position (empty board, Team A to move, standard 6-seat
// deal). The vetted move is the most central legal placement — the opening principle a deep
// search converges on (central cells maximise the number of windows a chip participates in).
// Represented generically (targetCellId = board centre) so it holds for any deal whose hand can
// reach the centre; the legality re-check handles deals that cannot.
const OPENING_BOOK = new Map();

// Compute the plie count (chips placed on non-corner cells) — cheap proxy for "how deep into the
// opening we are". Deterministic board scan.
function currentPlyCount(game) {
  let placed = 0;
  for (const cell of game.board) {
    if (!cell.corner && cell.chip != null) {
      placed += 1;
    }
  }
  return placed;
}

// The most central legal placement available to `player` right now, chosen deterministically:
// minimise centrality, tie-broken by the same secondary keys compareCandidates uses (card
// index then target cell id) so the choice is reproducible. Returns a {type,cardId,
// targetCellId} move or null when no placement is legal.
function mostCentralLegalPlacement(game, player) {
  const candidates = buildCandidates(game, player).filter((c) => c.type === "play_card");
  if (candidates.length === 0) {
    return null;
  }
  let best = null;
  let bestKey = null;
  for (const candidate of candidates) {
    const centrality = cellCentrality(candidate.targetCellId);
    const key = [centrality, candidate.cardIndex ?? 0, candidate.targetCellId ?? 0];
    if (
      bestKey === null ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
    ) {
      best = candidate;
      bestKey = key;
    }
  }
  return best ? { type: "play_card", cardId: best.cardId, targetCellId: best.targetCellId } : null;
}

// Opening-book lookup. Returns a vetted, LEGAL {type,cardId,targetCellId} move for `player` when
// (1) we are within the opening ply window, (2) the hashed position is a book key OR is the
// canonical featureless opening (no team threats yet), and (3) the resolved move is legal right
// now. Otherwise returns null so the caller searches. Deterministic + dependency-free.
export function openingBookMove(game, player) {
  if (game.winner) {
    return null;
  }
  if (currentPlyCount(game) >= OPENING_BOOK_MAX_PLIES) {
    return null;
  }
  const key = hashGamePosition(game, player.team);
  const entry = OPENING_BOOK.get(key);
  if (entry) {
    // Resolve the vetted selector against the live hand + validate legality.
    const card = player.hand.find(
      (c) => c.rank === entry.rank && c.suit === entry.suit && getLegalTargets(game, c, player.team).includes(entry.targetCellId)
    );
    if (card) {
      return { type: "play_card", cardId: card.id, targetCellId: entry.targetCellId };
    }
  }
  // Featureless-opening principle: while no team has any placed non-corner chip yet, the vetted
  // move is the most central legal placement (the opening a deep search converges on). This
  // makes the book non-empty for the canonical opening position of any deal without hard-coding
  // deal-specific card ids, and is exactly what chooseLegendAction would pick at depth from an
  // empty board — cached here for O(1) opening play.
  let anyChip = false;
  for (const cell of game.board) {
    if (!cell.corner && cell.chip != null) {
      anyChip = true;
      break;
    }
  }
  if (!anyChip) {
    return mostCentralLegalPlacement(game, player);
  }
  return null;
}

// LEGEND action chooser. Consults the deterministic opening book first (opening plies only),
// then falls through to the shared GRANDMASTER search machinery driven by LEGEND_ENGINE.
// Options mirror chooseGrandmasterAction: { maxDepth } for the deterministic fixed-depth path
// (the fairness proof + shipping default), { budgetMs, nowFn } for the explicit wall-clock
// opt-in. Fully deterministic on the fixed-depth path.
export function chooseLegendAction(game, player, options = {}) {
  const rootCandidates = buildCandidates(game, player);
  if (rootCandidates.length === 0) {
    return null;
  }
  const book = openingBookMove(game, player);
  if (book) {
    return { type: book.type, cardId: book.cardId, targetCellId: book.targetCellId, score: 0 };
  }
  return chooseGrandmasterAction(game, player, options, LEGEND_ENGINE);
}

export function chooseBotAction(game, player, difficultyValue = BOT_DIFFICULTIES.smart, options = {}) {
  const difficulty = normalizeBotDifficulty(difficultyValue);
  const candidates = buildCandidates(game, player);

  if (candidates.length === 0) {
    return null;
  }

  if (difficulty === BOT_DIFFICULTIES.easy) {
    const first = candidates[0];
    return {
      type: first.type,
      cardId: first.cardId,
      targetCellId: first.targetCellId,
      score: 0,
    };
  }

  if (difficulty === BOT_DIFFICULTIES.master) {
    return chooseMasterAction(game, player);
  }

  if (difficulty === BOT_DIFFICULTIES.grandmaster) {
    // SHIPPING DEFAULT: deterministic, clock-free fixed-depth search. This is the path solo
    // play (shared/local-solo.js), seeded replays (shared/replay.js), and the determinism
    // test take. It upholds the same seed->identical-moves contract every other difficulty
    // satisfies, so a GRANDMASTER solo game replays byte-identically on any CPU. See
    // GM_DEFAULT_FIXED_DEPTH for the depth/latency/strength rationale.
    //
    // EXPLICIT OPT-IN: pass options.liveTimeBudget === true to take the wall-clock
    // time-budget iterative-deepening path instead (variable depth, always on time, but
    // NON-deterministic across machines). Nothing on the seeded/replay/daily/solo/default
    // path sets this — it exists only for callers that explicitly want "think as deep as
    // the clock allows" and knowingly accept non-reproducibility.
    if (options.liveTimeBudget === true) {
      return chooseGrandmasterAction(game, player, {
        budgetMs: options.budgetMs,
        nowFn: options.nowFn,
      });
    }
    return chooseGrandmasterAction(game, player, { maxDepth: GM_DEFAULT_FIXED_DEPTH });
  }

  if (difficulty === BOT_DIFFICULTIES.legend) {
    // SHIPPING DEFAULT: deterministic, clock-free fixed-depth search (plus the seeded opening
    // book for the opening plies). This is the path solo play (shared/local-solo.js), seeded
    // replays (shared/replay.js), and the determinism test take — it upholds the same
    // seed->identical-moves contract every other difficulty satisfies. See
    // LEGEND_DEFAULT_FIXED_DEPTH for the depth/latency/strength rationale.
    //
    // EXPLICIT OPT-IN: pass options.liveTimeBudget === true for the wall-clock time-budget
    // path (variable depth, always on time, but NON-deterministic across machines). Nothing on
    // the seeded/replay/daily/solo/default path sets this.
    if (options.liveTimeBudget === true) {
      return chooseLegendAction(game, player, {
        budgetMs: options.budgetMs,
        nowFn: options.nowFn,
      });
    }
    return chooseLegendAction(game, player, { maxDepth: LEGEND_DEFAULT_FIXED_DEPTH });
  }

  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(game, player, candidate, difficulty),
    }))
    .filter((candidate) => Number.isFinite(candidate.score));

  scored.sort(compareCandidates);
  const best = scored[0];
  if (!best) {
    return null;
  }

  return {
    type: best.type,
    cardId: best.cardId,
    targetCellId: best.targetCellId,
    score: Math.round(best.score),
  };
}
