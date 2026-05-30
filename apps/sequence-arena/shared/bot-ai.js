import {
  BOARD_SIZE,
  DIRECTIONS,
  REQUIRED_SEQUENCES,
  discardDeadCard,
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
