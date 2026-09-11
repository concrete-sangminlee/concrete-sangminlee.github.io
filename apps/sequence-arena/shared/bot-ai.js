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

// Reusable internal: the best static score available to `player` in `game`.
export function bestStaticScore(game, player, difficulty = BOT_DIFFICULTIES.smart) {
  const scored = scoreAllCandidates(game, player, difficulty);
  return scored.length > 0 ? scored[0].score : Number.NEGATIVE_INFINITY;
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

export function chooseBotAction(game, player, difficultyValue = BOT_DIFFICULTIES.smart) {
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
