import {
  TEAM_META,
  createGame,
  discardDeadCard,
  discardPendingCard,
  drawReplacementCard,
  getCurrentPlayer,
  playCard,
  serializeViewerGame,
} from "./game-core.js";
import { BOT_DIFFICULTIES, chooseBotAction, normalizeBotDifficulty } from "./bot-ai.js";
import { createSeededRng } from "./rng.js";
import { buildReplayRecord } from "./replay.js";

const LOCAL_ROOM_CODE = "SOLO";
const LOCAL_BOT_SESSION_ID = "local-cobalt-bot";
const LOCAL_BOT_NAME = "코발트 봇";
const LOCAL_BOT_DELAY_MS = 650;
const BOT_TIMER_PENDING = Symbol("bot-timer-pending");

function randomSessionId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Every local match needs a seed so it is replayable. Callers that do not pass one (plain
// offline solo) get an ephemeral seed generated here; daily/tutorial/rematch pass explicit
// seeds, so their reproducible-puzzle contract is unaffected.
function randomReplaySeed() {
  return `solo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeSeatSummary(seats) {
  return seats.map((seat) => ({
    seatIndex: seat.seatIndex,
    team: seat.team,
    teamName: TEAM_META[seat.team].name,
    occupied: true,
    connected: seat.connected,
    isBot: Boolean(seat.isBot),
    name: seat.name,
  }));
}

function makeSeats(sessionId, name) {
  return [
    {
      seatIndex: 0,
      team: "A",
      sessionId,
      name,
      connected: true,
      isBot: false,
    },
    {
      seatIndex: 1,
      team: "B",
      sessionId: LOCAL_BOT_SESSION_ID,
      name: LOCAL_BOT_NAME,
      connected: true,
      isBot: true,
    },
  ];
}

export class LocalSoloRuntime {
  constructor({ onSnapshot = null, timerApi = globalThis, botDelayMs = LOCAL_BOT_DELAY_MS } = {}) {
    this.onSnapshot = onSnapshot;
    this.timerApi = timerApi;
    this.botDelayMs = botDelayMs;
    this.room = null;
    this.botTimer = null;
    this.matchNumber = 0;
    this.lastRecordedMatchNumber = 0;
    this.matchHistory = [];
    this.seed = "";
    this.daily = null;
    this.rng = Math.random;
    // Ordered list of the initiating move each turn made (human + bot), keyed to the
    // current seed/matchNumber; replayed by shared/replay.js to reproduce the match.
    this.replayMoves = [];
  }

  clearBotTimer() {
    if (this.botTimer != null && this.botTimer !== BOT_TIMER_PENDING) {
      this.timerApi.clearTimeout?.(this.botTimer);
    }
    this.botTimer = null;
    if (this.room) {
      this.room.botThinkingSeatIndex = null;
    }
  }

  start({ name = "플레이어", sessionId = "", difficulty = BOT_DIFFICULTIES.smart, seed = "", daily = null, tutorial = false } = {}) {
    this.clearBotTimer();
    const cleanName = String(name || "플레이어").trim().slice(0, 40) || "플레이어";
    const cleanSessionId = sessionId || randomSessionId();
    const seats = makeSeats(cleanSessionId, cleanName);
    this.matchNumber += 1;
    // A seed makes the whole match deterministic: board layout, deck order, both hands,
    // and every reshuffle/draw flow through one PRNG stream (bot decisions are already
    // deterministic). The daily challenge relies on this to hand every player the same
    // puzzle. Every local game now gets a seed so it is replayable: a seedless caller
    // gets an ephemeral seed generated here (the previous seedless Math.random path was
    // not reproducible), while explicit seeds (daily/tutorial/rematch) are used verbatim,
    // preserving their shared-puzzle contract.
    this.seed = typeof seed === "string" && seed ? seed : randomReplaySeed();
    this.rng = createSeededRng(this.seed);
    this.replayMoves = [];
    this.daily =
      daily && typeof daily === "object" && typeof daily.dateKey === "string" && Number.isFinite(Number(daily.number))
        ? { dateKey: daily.dateKey, number: Math.max(1, Math.trunc(Number(daily.number))) }
        : null;
    this.tutorial = tutorial === true;
    this.room = {
      code: LOCAL_ROOM_CODE,
      phase: "playing",
      teamSize: 1,
      seats,
      game: createGame(seats, this.rng),
      // One shared daily puzzle must mean one shared opponent, so daily locks the bot
      // to the standard difficulty regardless of the caller's solo preference. The guided
      // tutorial game locks to easy instead — a first-timer should not lose their very
      // first game to the strategic bot mid-lesson.
      botDifficulty: this.tutorial
        ? BOT_DIFFICULTIES.easy
        : this.daily
          ? BOT_DIFFICULTIES.smart
          : normalizeBotDifficulty(difficulty),
      botThinkingSeatIndex: null,
      rematchMode: "host",
      rematchVotes: [],
      chatMessages: [],
      matchStartedAt: Date.now(),
      matchNumber: this.matchNumber,
      dailyChallenge: this.daily,
      tutorialMode: this.tutorial,
    };
    this.room.game.matchNumber = this.matchNumber;
    return this.emit(
      this.tutorial
        ? "가이드 플레이가 시작되었습니다. 안내를 따라 첫 턴을 진행해 보세요."
        : this.daily
          ? `오늘의 챌린지 #${this.daily.number}이 시작되었습니다. 모두에게 같은 보드와 손패가 주어집니다.`
          : "오프라인 솔로 모드가 시작되었습니다. 서버 없이 이 브라우저에서 봇과 1대1로 진행합니다."
    );
  }

  // Strategic hint for the human seat: the SMART bot's recommended action from the real
  // local game state (full board + the player's actual hand). Read-only — it never mutates
  // the game. Returns null off the player's turn or when no move exists. The client only
  // surfaces this in local solo/daily/tutorial, where it holds the full state the bot needs.
  suggestMove() {
    if (!this.room || this.room.phase !== "playing" || this.room.game?.phase !== "playing") {
      return null;
    }
    const current = getCurrentPlayer(this.room.game);
    if (!current || current.seatIndex !== 0) {
      return null;
    }
    const action = chooseBotAction(this.room.game, current, BOT_DIFFICULTIES.smart);
    if (!action) {
      return null;
    }
    return { type: action.type, cardId: action.cardId, targetCellId: action.targetCellId };
  }

  snapshot(systemMessage = "") {
    const room = this.room;
    if (!room) return null;
    return {
      type: "room_snapshot",
      localMode: true,
      roomCode: room.code,
      phase: room.phase,
      systemMessage,
      yourSessionId: room.seats[0].sessionId,
      yourRole: "player",
      yourSeatIndex: 0,
      allSeatsFilled: true,
      teamSize: 1,
      requiredPlayers: 2,
      occupiedSeats: 2,
      spectatorCount: 0,
      spectators: [],
      allowSpectators: false,
      botThinkingSeatIndex: room.botThinkingSeatIndex,
      botDifficulty: room.botDifficulty,
      dailyChallenge: room.dailyChallenge ?? null,
      rematchMode: room.rematchMode,
      rematchVoteSeatIndexes: [],
      rematchRequiredVotes: 1,
      matchHistory: this.matchHistory,
      chatMessages: room.chatMessages,
      seats: makeSeatSummary(room.seats),
      game: room.game ? serializeViewerGame(room.game, 0) : null,
    };
  }

  emit(systemMessage = "") {
    const snapshot = this.snapshot(systemMessage);
    if (snapshot && this.onSnapshot) {
      this.onSnapshot(snapshot);
    }
    return snapshot;
  }

  handle(payload) {
    if (!this.room) {
      return this.start();
    }
    switch (payload?.type) {
      case "play_card":
        return this.playCard(payload);
      case "discard_dead":
        return this.discardDead(payload);
      case "discard_to_pile":
        return this.discardToPile();
      case "draw_from_deck":
        return this.drawFromDeck();
      case "rematch":
        return this.rematch();
      case "set_bot_difficulty":
        return this.setBotDifficulty(payload.difficulty);
      case "send_chat":
        return this.sendChat(payload.text);
      default:
        return this.emit("오프라인 솔로 모드에서는 이 작업을 사용할 수 없습니다.");
    }
  }

  recordReplayMove(move) {
    // Cap defensively so a pathological game can never grow the list without bound.
    if (this.replayMoves.length >= 400) return;
    this.replayMoves.push(move);
  }

  playCard(payload) {
    const result = playCard(this.room.game, 0, payload.cardId, payload.targetCellId, this.rng);
    if (!result.ok) return this.emit(result.error);
    this.recordReplayMove({ type: "play", cardId: payload.cardId, targetCellId: payload.targetCellId });
    return this.emit();
  }

  discardDead(payload) {
    const result = discardDeadCard(this.room.game, 0, payload.cardId, this.rng);
    if (!result.ok) return this.emit(result.error);
    this.recordReplayMove({ type: "discard_dead", cardId: payload.cardId, targetCellId: null });
    return this.emit();
  }

  discardToPile() {
    const result = discardPendingCard(this.room.game, 0);
    if (!result.ok) return this.emit(result.error);
    return this.emit();
  }

  drawFromDeck() {
    const result = drawReplacementCard(this.room.game, 0, this.rng);
    if (!result.ok) return this.emit(result.error);
    this.markFinishedIfNeeded();
    const snapshot = this.emit();
    this.processBotTurn();
    return snapshot;
  }

  rematch() {
    if (this.room.game?.phase !== "finished") {
      return this.emit("게임이 끝난 뒤에 리매치를 시작할 수 있습니다.");
    }
    const name = this.room.seats[0].name;
    const sessionId = this.room.seats[0].sessionId;
    const difficulty = this.room.botDifficulty;
    // A daily rematch is a retry of the same dated puzzle (same seed → same board and
    // hands), not a fresh random game; the result freeze in shared/daily.js keeps the
    // first completion as the record. A tutorial rematch stays a stats-excluded practice
    // run on the same scripted board.
    return this.start({ name, sessionId, difficulty, seed: this.seed, daily: this.daily, tutorial: this.tutorial });
  }

  setBotDifficulty(difficulty) {
    if (this.room.dailyChallenge) {
      return this.emit("데일리 챌린지에서는 모두가 같은 조건으로 플레이하도록 AI 난이도가 SMART로 고정됩니다.");
    }
    this.room.botDifficulty = normalizeBotDifficulty(difficulty);
    return this.emit(`AI 모드를 ${this.room.botDifficulty.toUpperCase()}로 변경했습니다.`);
  }

  sendChat(text) {
    const cleanText = String(text || "").trim().slice(0, 140);
    if (!cleanText) return this.snapshot();
    this.room.chatMessages = [
      ...this.room.chatMessages,
      { author: this.room.seats[0].name, text: cleanText, createdAt: new Date().toISOString() },
    ].slice(-50);
    return this.emit();
  }

  processBotTurn() {
    if (!this.room || this.room.phase !== "playing" || this.room.game?.phase !== "playing" || this.botTimer != null) return;
    const current = getCurrentPlayer(this.room.game);
    const seat = this.room.seats.find((entry) => entry.seatIndex === current?.seatIndex);
    if (!seat?.isBot) {
      this.room.botThinkingSeatIndex = null;
      return;
    }
    this.room.botThinkingSeatIndex = seat.seatIndex;
    this.emit(`${seat.name}이 다음 수를 고르는 중입니다.`);
    this.botTimer = BOT_TIMER_PENDING;
    const timerId = this.timerApi.setTimeout?.(() => this.takeBotTurn(seat.seatIndex), this.botDelayMs);
    if (this.botTimer === BOT_TIMER_PENDING) {
      this.botTimer = timerId ?? null;
    }
  }

  takeBotTurn(seatIndex) {
    this.botTimer = null;
    if (!this.room || this.room.phase !== "playing" || this.room.game?.phase !== "playing") return;
    const current = getCurrentPlayer(this.room.game);
    if (!current || current.seatIndex !== seatIndex) return;
    const action = chooseBotAction(this.room.game, current, this.room.botDifficulty);
    let moved = false;
    if (action?.type === "play_card") {
      moved = playCard(this.room.game, current.seatIndex, action.cardId, action.targetCellId, this.rng).ok;
      if (moved) this.recordReplayMove({ type: "play", cardId: action.cardId, targetCellId: action.targetCellId });
    } else if (action?.type === "discard_dead") {
      moved = discardDeadCard(this.room.game, current.seatIndex, action.cardId, this.rng).ok;
      if (moved) this.recordReplayMove({ type: "discard_dead", cardId: action.cardId, targetCellId: null });
    }
    if (moved) {
      moved = this.finishPendingTurn(seatIndex);
    }
    this.room.botThinkingSeatIndex = null;
    this.markFinishedIfNeeded();
    const next = getCurrentPlayer(this.room.game);
    const message =
      this.room.game?.phase === "finished" && this.room.game.winner
        ? `${TEAM_META[this.room.game.winner].name} 승리! 리매치를 시작할 수 있습니다.`
        : next?.seatIndex === 0
          ? `${this.room.seats[0].name}님 차례입니다.`
          : "";
    this.emit(message);
    this.processBotTurn();
  }

  finishPendingTurn(seatIndex) {
    const pending = this.room.game?.pendingStep;
    if (!pending || pending.seatIndex !== seatIndex) return true;
    if (pending.type === "discard" && !discardPendingCard(this.room.game, seatIndex).ok) return false;
    if (this.room.game.pendingStep?.type === "draw" && !drawReplacementCard(this.room.game, seatIndex, this.rng).ok) return false;
    return true;
  }

  markFinishedIfNeeded() {
    if (this.room.game?.phase !== "finished") return false;
    const wasFinished = this.room.phase === "finished";
    this.room.phase = "finished";
    if (!wasFinished && this.room.game.winner) {
      const matchNumber = this.room.game.matchNumber || this.room.matchNumber;
      if (this.lastRecordedMatchNumber !== matchNumber) {
        const finishedAt = new Date().toISOString();
        // A completed match carries its full replay record so the client can offer to save
        // it without re-deriving anything. Reproducible offline via shared/replay.js.
        const replay = buildReplayRecord({
          seed: this.seed,
          difficulty: this.room.botDifficulty,
          daily: this.room.dailyChallenge ?? null,
          tutorial: this.room.tutorialMode === true,
          moves: this.replayMoves,
          winner: this.room.game.winner,
          finishedAt,
        });
        this.matchHistory = [
          {
            matchNumber,
            winner: this.room.game.winner,
            winnerName: TEAM_META[this.room.game.winner].name,
            scores: { A: this.room.game.teamScores.A, B: this.room.game.teamScores.B },
            finishedAt,
            durationMs: Date.now() - this.room.matchStartedAt,
            testMode: "local-solo",
            botDifficulty: this.room.botDifficulty,
            daily: this.room.dailyChallenge ?? null,
            tutorial: this.room.tutorialMode === true,
            replay,
          },
          ...this.matchHistory,
        ].slice(0, 12);
        this.lastRecordedMatchNumber = matchNumber;
      }
    }
    return true;
  }
}
