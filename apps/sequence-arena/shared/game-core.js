export const BOARD_SIZE = 10;
export const HAND_SIZE = 5;
export const REQUIRED_SEQUENCES = 2;
export const SUITS = ["♠", "♥", "♦", "♣"];
export const FULL_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const BOARD_RANKS = FULL_RANKS.filter((rank) => rank !== "J");
export const TURN_ORDER = [0, 1, 2, 3, 4, 5];
export const DIRECTIONS = [
  { dr: 1, dc: 0, key: "vertical" },
  { dr: 0, dc: 1, key: "horizontal" },
  { dr: 1, dc: 1, key: "diag-down" },
  { dr: 1, dc: -1, key: "diag-up" },
];
export const TEAM_META = {
  A: { name: "Team Ruby", color: "#d44e63", soft: "#f8d7de", text: "#7f1831" },
  B: { name: "Team Cobalt", color: "#3d68d6", soft: "#d8e5ff", text: "#183c94" },
};

const CORNER_SET = new Set(["0,0", "0,9", "9,0", "9,9"]);

export function shuffle(list, rng = Math.random) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function cellId(row, col) {
  return row * BOARD_SIZE + col;
}

export function isCorner(row, col) {
  return CORNER_SET.has(`${row},${col}`);
}

export function boardCell(board, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }
  return board[cellId(row, col)];
}

export function suitIsRed(suit) {
  return suit === "♥" || suit === "♦";
}

export function makeCard(rank, suit, id) {
  const label = `${rank}${suit}`;
  let action = "normal";
  let note = "같은 카드 칸에 칩 놓기";
  if (rank === "J" && (suit === "♣" || suit === "♦")) {
    action = "placeWild";
    note = "빈 칸 어디든 배치";
  } else if (rank === "J") {
    action = "remove";
    note = "상대의 잠기지 않은 칩 제거";
  }

  return {
    id,
    rank,
    suit,
    label,
    action,
    note,
    isRed: suitIsRed(suit),
  };
}

export function buildDeck(rng = Math.random) {
  let nextId = 1;
  const cards = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const suit of SUITS) {
      for (const rank of FULL_RANKS) {
        cards.push(makeCard(rank, suit, nextId));
        nextId += 1;
      }
    }
  }
  return shuffle(cards, rng);
}

export function buildBoard(rng = Math.random) {
  const nonJackCards = [];
  for (const suit of SUITS) {
    for (const rank of BOARD_RANKS) {
      const label = `${rank}${suit}`;
      nonJackCards.push(label);
      nonJackCards.push(label);
    }
  }

  const shuffled = shuffle(nonJackCards, rng);
  let pointer = 0;
  const board = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (isCorner(row, col)) {
        board.push({
          id: cellId(row, col),
          row,
          col,
          label: "★",
          chip: null,
          seqCount: 0,
          corner: true,
        });
        continue;
      }

      board.push({
        id: cellId(row, col),
        row,
        col,
        label: shuffled[pointer],
        chip: null,
        seqCount: 0,
        corner: false,
      });
      pointer += 1;
    }
  }

  return board;
}

export function createPlayers(seatEntries) {
  return seatEntries.map((source, turnIndex) => {
    const seatIndex = source?.seatIndex ?? turnIndex;
    const team = source?.team || (seatIndex % 2 === 0 ? "A" : "B");
    return {
      seatIndex,
      name: source?.name || `Player ${seatIndex + 1}`,
      team,
      hand: [],
    };
  });
}

function addLog(game, entry) {
  const timestamp = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  game.logs.unshift(`[${timestamp}] ${entry}`);
  game.logs = game.logs.slice(0, 12);
}

function drawCard(game, rng = Math.random) {
  if (game.drawPile.length === 0 && game.discardPile.length > 0) {
    game.drawPile = shuffle(game.discardPile, rng);
    game.discardPile = [];
    addLog(game, "버림 더미를 섞어 새 덱을 만들었습니다.");
  }
  return game.drawPile.pop() || null;
}

function dealHands(game, rng = Math.random) {
  for (let drawRound = 0; drawRound < HAND_SIZE; drawRound += 1) {
    for (const player of game.players) {
      const card = drawCard(game, rng);
      if (card) {
        player.hand.push(card);
      }
    }
  }
}

export function createGame(seatEntries, rng = Math.random) {
  const game = {
    phase: "playing",
    board: buildBoard(rng),
    players: createPlayers(seatEntries),
    drawPile: buildDeck(rng),
    discardPile: [],
    currentPlayerIndex: 0,
    teamScores: { A: 0, B: 0 },
    sequences: { A: [], B: [] },
    logs: [],
    winner: null,
    lastPlacedCellId: null,
    pendingStep: null,
  };

  dealHands(game, rng);
  addLog(game, "새 멀티플레이 게임을 시작했습니다. 플레이어 1부터 진행합니다.");
  return game;
}

export function getCurrentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

export function getPlayer(game, seatIndex) {
  return game.players.find((player) => player.seatIndex === seatIndex) || null;
}

export function getCardById(game, seatIndex, cardId) {
  const player = getPlayer(game, seatIndex);
  if (!player) {
    return null;
  }
  return player.hand.find((card) => card.id === cardId) || null;
}

function isPlayableForTeam(cell, team) {
  return cell.corner || cell.chip === team;
}

export function getLegalTargets(game, card, team) {
  if (!card) {
    return [];
  }

  if (card.action === "placeWild") {
    return game.board
      .filter((cell) => !cell.corner && cell.chip === null)
      .map((cell) => cell.id);
  }

  if (card.action === "remove") {
    return game.board
      .filter((cell) => !cell.corner && cell.chip !== null && cell.chip !== team && cell.seqCount === 0)
      .map((cell) => cell.id);
  }

  return game.board
    .filter((cell) => !cell.corner && cell.label === card.label && cell.chip === null)
    .map((cell) => cell.id);
}

export function getLegalTargetsByCardId(game, seatIndex, cardId) {
  const player = getPlayer(game, seatIndex);
  const card = getCardById(game, seatIndex, cardId);
  if (!player || !card) {
    return [];
  }
  return getLegalTargets(game, card, player.team);
}

function removeCardFromHand(game, seatIndex, cardId) {
  const player = getPlayer(game, seatIndex);
  if (!player) {
    return null;
  }

  const handIndex = player.hand.findIndex((card) => card.id === cardId);
  if (handIndex === -1) {
    return null;
  }

  const [removed] = player.hand.splice(handIndex, 1);
  game.discardPile.push(removed);
  return removed;
}

function advanceTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
}

function countNonCornerOverlap(game, candidateCells, existingCells) {
  const existingSet = new Set(existingCells.filter((id) => !game.board[id].corner));
  return candidateCells.filter((id) => !game.board[id].corner && existingSet.has(id)).length;
}

function getNewSequences(game, team, anchorCellId) {
  const anchor = game.board[anchorCellId];
  const existingKeys = new Set(game.sequences[team].map((sequence) => sequence.key));
  const candidates = [];

  for (const direction of DIRECTIONS) {
    for (let offset = -4; offset <= 0; offset += 1) {
      const cells = [];
      let valid = true;

      for (let step = 0; step < 5; step += 1) {
        const row = anchor.row + (offset + step) * direction.dr;
        const col = anchor.col + (offset + step) * direction.dc;
        const cell = boardCell(game.board, row, col);
        if (!cell) {
          valid = false;
          break;
        }
        cells.push(cell.id);
      }

      if (!valid || !cells.includes(anchorCellId)) {
        continue;
      }

      if (!cells.every((id) => isPlayableForTeam(game.board[id], team))) {
        continue;
      }

      const key = cells.join("-");
      if (existingKeys.has(key)) {
        continue;
      }

      const overlapExisting = cells.filter((id) => !game.board[id].corner && game.board[id].seqCount > 0).length;
      if (overlapExisting > 1) {
        continue;
      }

      candidates.push({
        key,
        direction: direction.key,
        cells,
        overlapExisting,
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.overlapExisting !== right.overlapExisting) {
      return left.overlapExisting - right.overlapExisting;
    }
    const leftFresh = left.cells.filter((id) => game.board[id].seqCount === 0).length;
    const rightFresh = right.cells.filter((id) => game.board[id].seqCount === 0).length;
    return rightFresh - leftFresh;
  });

  const accepted = [];
  const maxAdditional = REQUIRED_SEQUENCES - game.teamScores[team];
  for (const candidate of candidates) {
    if (accepted.length >= maxAdditional) {
      break;
    }
    const conflicts = accepted.some((sequence) => countNonCornerOverlap(game, candidate.cells, sequence.cells) > 1);
    if (!conflicts) {
      accepted.push(candidate);
    }
  }

  return accepted;
}

function registerSequences(game, team, anchorCellId) {
  const newSequences = getNewSequences(game, team, anchorCellId);
  if (newSequences.length === 0) {
    return 0;
  }

  for (const sequence of newSequences) {
    game.sequences[team].push(sequence);
    for (const id of sequence.cells) {
      if (!game.board[id].corner) {
        game.board[id].seqCount += 1;
      }
    }
  }

  game.teamScores[team] += newSequences.length;
  return newSequences.length;
}

function beginPendingCardStep(game, seatIndex, card, description) {
  game.pendingStep = {
    type: "discard",
    seatIndex,
    cardId: card.id,
    card: { ...card },
    description,
  };
  return { ok: true, pendingStep: game.pendingStep };
}

function finishTurnAfterDraw(game, player, description) {
  addLog(game, description);
  if (game.teamScores[player.team] >= REQUIRED_SEQUENCES) {
    game.winner = player.team;
    game.phase = "finished";
    addLog(game, `${TEAM_META[player.team].name} 승리! ${REQUIRED_SEQUENCES}개의 시퀀스를 완성했습니다.`);
    return;
  }

  advanceTurn(game);
}

export function discardPendingCard(game, seatIndex) {
  if (game.phase !== "playing") {
    return { ok: false, error: "게임이 진행 중이 아닙니다." };
  }

  const pending = game.pendingStep;
  if (!pending || pending.type !== "discard") {
    return { ok: false, error: "버림 더미에 내려놓을 카드가 없습니다." };
  }

  if (pending.seatIndex !== seatIndex) {
    return { ok: false, error: "현재 차례 플레이어만 카드를 내려놓을 수 있습니다." };
  }

  const player = getPlayer(game, seatIndex);
  const card = getCardById(game, seatIndex, pending.cardId);
  if (!player || !card) {
    return { ok: false, error: "손패에서 내려놓을 카드를 찾을 수 없습니다." };
  }

  const removed = removeCardFromHand(game, seatIndex, card.id);
  if (!removed) {
    return { ok: false, error: "카드를 버림 더미에 내려놓지 못했습니다." };
  }

  game.pendingStep = {
    type: "draw",
    seatIndex,
    cardId: card.id,
    card: { ...card },
    description: pending.description,
  };
  addLog(game, `${player.name}님이 ${card.label} 카드를 버림 더미에 내려놓았습니다. 덱에서 새 카드를 뽑으세요.`);
  return { ok: true, pendingStep: game.pendingStep };
}

export function drawReplacementCard(game, seatIndex, rng = Math.random) {
  if (game.phase !== "playing") {
    return { ok: false, error: "게임이 진행 중이 아닙니다." };
  }

  const pending = game.pendingStep;
  if (!pending || pending.type !== "draw") {
    return { ok: false, error: "덱에서 뽑을 순서가 아닙니다." };
  }

  if (pending.seatIndex !== seatIndex) {
    return { ok: false, error: "현재 차례 플레이어만 덱에서 카드를 뽑을 수 있습니다." };
  }

  const player = getPlayer(game, seatIndex);
  if (!player) {
    return { ok: false, error: "플레이어 정보를 찾을 수 없습니다." };
  }

  const replacement = drawCard(game, rng);
  if (replacement) {
    player.hand.push(replacement);
  }

  game.pendingStep = null;
  addLog(game, replacement ? `${player.name}님이 덱에서 새 카드를 뽑았습니다.` : `${player.name}님이 뽑을 카드 없이 턴을 마쳤습니다.`);
  finishTurnAfterDraw(game, player, pending.description);
  return { ok: true, drawnCard: replacement ? { ...replacement } : null };
}

function pendingStepError(game) {
  return game.pendingStep ? "먼저 버림 더미와 덱을 클릭해 현재 턴을 정리하세요." : "";
}

export function discardDeadCard(game, seatIndex, cardId, rng = Math.random) {
  if (game.phase !== "playing") {
    return { ok: false, error: "게임이 진행 중이 아닙니다." };
  }

  if (getCurrentPlayer(game).seatIndex !== seatIndex) {
    return { ok: false, error: "현재 차례 플레이어만 행동할 수 있습니다." };
  }

  const pendingError = pendingStepError(game);
  if (pendingError) {
    return { ok: false, error: pendingError };
  }

  const player = getPlayer(game, seatIndex);
  const card = getCardById(game, seatIndex, cardId);
  if (!player || !card) {
    return { ok: false, error: "손패에서 카드를 찾을 수 없습니다." };
  }

  if (card.action !== "normal") {
    return { ok: false, error: "일반 카드만 죽은 카드 버리기를 사용할 수 있습니다." };
  }

  const targets = getLegalTargets(game, card, player.team);
  if (targets.length > 0) {
    return { ok: false, error: "놓을 수 있는 칸이 있어 죽은 카드로 버릴 수 없습니다." };
  }

  return beginPendingCardStep(game, seatIndex, card, `${player.name}님이 죽은 카드 ${card.label}를 정리했습니다.`);
}

export function playCard(game, seatIndex, cardId, targetCellId, rng = Math.random) {
  if (game.phase !== "playing") {
    return { ok: false, error: "게임이 진행 중이 아닙니다." };
  }

  const currentPlayer = getCurrentPlayer(game);
  if (currentPlayer.seatIndex !== seatIndex) {
    return { ok: false, error: "현재 차례 플레이어만 행동할 수 있습니다." };
  }

  const pendingError = pendingStepError(game);
  if (pendingError) {
    return { ok: false, error: pendingError };
  }

  const player = getPlayer(game, seatIndex);
  const card = getCardById(game, seatIndex, cardId);
  if (!player || !card) {
    return { ok: false, error: "손패에서 카드를 찾을 수 없습니다." };
  }

  const legalTargets = getLegalTargets(game, card, player.team);
  if (!legalTargets.includes(targetCellId)) {
    return { ok: false, error: "그 칸에는 해당 카드를 사용할 수 없습니다." };
  }

  const target = game.board[targetCellId];
  game.lastPlacedCellId = targetCellId;

  if (card.action === "remove") {
    const removedTeam = target.chip;
    target.chip = null;
    target.seqCount = 0;
    return beginPendingCardStep(
      game,
      seatIndex,
      card,
      `${player.name}님이 ${card.label}로 ${TEAM_META[removedTeam].name} 칩을 제거했습니다.`
    );
  }

  target.chip = player.team;
  const createdSequences = registerSequences(game, player.team, targetCellId);
  let message = `${player.name}님이 ${card.label}로 ${target.label} (${target.row + 1},${target.col + 1}) 칸에 칩을 놓았습니다.`;
  if (createdSequences > 0) {
    message += ` ${TEAM_META[player.team].name}이 시퀀스 ${createdSequences}개를 완성했습니다.`;
  }
  return beginPendingCardStep(game, seatIndex, card, message);
}

export function serializeViewerGame(game, viewerSeatIndex) {
  const viewer = getPlayer(game, viewerSeatIndex);
  const current = getCurrentPlayer(game);

  return {
    phase: game.phase,
    winner: game.winner,
    lastPlacedCellId: game.lastPlacedCellId,
    currentPlayerIndex: game.currentPlayerIndex,
    currentSeatIndex: current ? current.seatIndex : null,
    scores: game.teamScores,
    deckCount: game.drawPile.length,
    discardCount: game.discardPile.length,
    discardTopCard: game.discardPile.length ? { ...game.discardPile[game.discardPile.length - 1] } : null,
    pendingStep: game.pendingStep
      ? {
          type: game.pendingStep.type,
          seatIndex: game.pendingStep.seatIndex,
          cardId: game.pendingStep.cardId,
          card: game.pendingStep.card ? { ...game.pendingStep.card } : null,
        }
      : null,
    logs: [...game.logs],
    board: game.board.map((cell) => ({
      id: cell.id,
      row: cell.row,
      col: cell.col,
      label: cell.label,
      corner: cell.corner,
      chip: cell.chip,
      seqCount: cell.seqCount,
      locked: cell.seqCount,
    })),
    players: game.players.map((player) => ({
      seatIndex: player.seatIndex,
      name: player.name,
      team: player.team,
      handCount: player.hand.length,
    })),
    // Per-team completed sequences expose the cells that made up each scoring line so the
    // viewer can describe them spatially (chip animations cover sighted players, but the
    // canvas is opaque to assistive tech — the SR announcement needs the cell labels to
    // anchor the celebration). 5 cell IDs per sequence × at most ~8 sequences per match
    // is a few-dozen-byte payload bump per snapshot, negligible against the existing
    // board (100 cells) and yourHand fields.
    sequences: {
      A: game.sequences.A.map((sequence) => ({ key: sequence.key, cells: [...sequence.cells] })),
      B: game.sequences.B.map((sequence) => ({ key: sequence.key, cells: [...sequence.cells] })),
    },
    yourSeatIndex: viewerSeatIndex,
    yourHand: viewer ? viewer.hand.map((card) => ({ ...card })) : [],
  };
}
