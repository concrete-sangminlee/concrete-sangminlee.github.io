import { BOARD_SIZE, TEAM_META, getLegalTargets } from "./shared/game-core.js";
import { LocalSoloRuntime } from "./shared/local-solo.js";
import { sanitizeName, ROOM_CODE_PATTERN, MAX_ROOM_CODE_LENGTH } from "./shared/validation.js";

const STORAGE_KEYS = {
  session: "sequence-arena-session",
  room: "sequence-arena-room",
  name: "sequence-arena-name",
  soundMuted: "sequence-arena-sound-muted",
  hapticsMuted: "sequence-arena-haptics-muted",
  soundVolume: "sequence-arena-sound-volume",
  hapticsIntensity: "sequence-arena-haptics-intensity",
  joinAsSpectator: "sequence-arena-join-as-spectator",
  turnNotifications: "sequence-arena-turn-notifications",
  preferredTeamSize: "sequence-arena-preferred-team-size",
  preferredBotDifficulty: "sequence-arena-preferred-bot-difficulty",
  theme: "sequence-arena-theme",
  welcomed: "sequence-arena-welcomed",
};

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const refs = {
  createForm: document.getElementById("create-form"),
  joinForm: document.getElementById("join-form"),
  createRoomBtn: document.getElementById("create-room-btn"),
  offlineSoloBtn: document.getElementById("offline-solo-btn"),
  joinRoomBtn: document.getElementById("join-room-btn"),
  gatewaySubtitle: document.getElementById("gateway-subtitle"),
  gatewayModeHint: document.getElementById("gateway-mode-hint"),
  joinAsSpectator: document.getElementById("join-as-spectator"),
  createName: document.getElementById("create-name"),
  joinName: document.getElementById("join-name"),
  createNameHint: document.getElementById("create-name-hint"),
  joinNameHint: document.getElementById("join-name-hint"),
  joinCode: document.getElementById("join-code"),
  joinCodeHint: document.getElementById("join-code-hint"),
  joinCodeLiveFeedback: document.getElementById("join-code-live-feedback"),
  joinCodePasteBtn: document.getElementById("join-code-paste-btn"),
  rubySeatLegend: document.getElementById("ruby-seat-legend"),
  cobaltSeatLegend: document.getElementById("cobalt-seat-legend"),
  currentOrigin: document.getElementById("current-origin"),
  copyCodeBtn: document.getElementById("copy-code-btn"),
  copyRoomBtn: document.getElementById("copy-room-btn"),
  copySpectatorLinkBtn: document.getElementById("copy-spectator-link-btn"),
  shareRoomBtn: document.getElementById("share-room-btn"),
  leaveRoomBtn: document.getElementById("leave-room-btn"),
  openRoomLink: document.getElementById("open-room-link"),
  installAppBtn: document.getElementById("install-app-btn"),
  notificationToggleBtn: document.getElementById("notification-toggle-btn"),
  soundToggleBtn: document.getElementById("sound-toggle-btn"),
  hapticsToggleBtn: document.getElementById("haptics-toggle-btn"),
  soundVolumeSlider: document.getElementById("sound-volume-slider"),
  soundVolumeValue: document.getElementById("sound-volume-value"),
  hapticIntensitySlider: document.getElementById("haptic-intensity-slider"),
  hapticIntensityValue: document.getElementById("haptic-intensity-value"),
  helpBtn: document.getElementById("help-btn"),
  helpModal: document.getElementById("help-modal"),
  helpCloseBtn: document.getElementById("help-close-btn"),
  helpShortcutCopy: document.getElementById("help-shortcut-copy"),
  welcomeCard: document.getElementById("welcome-card"),
  welcomeDismissBtn: document.getElementById("welcome-dismiss-btn"),
  welcomeCreateBtn: document.getElementById("welcome-create-btn"),
  welcomeRejoinBtn: document.getElementById("welcome-rejoin-btn"),
  welcomeHelpBtn: document.getElementById("welcome-help-btn"),
  welcomeModeBanner: document.getElementById("welcome-mode-banner"),
  welcomeModeSteps: document.getElementById("welcome-mode-steps"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  offlineBanner: document.getElementById("offline-banner"),
  offlineText: document.getElementById("offline-text"),
  offlineRetryBtn: document.getElementById("offline-retry-btn"),
  offlineFallbackSoloBtn: document.getElementById("offline-fallback-solo-btn"),
  updateBanner: document.getElementById("update-banner"),
  updateReloadBtn: document.getElementById("update-reload-btn"),
  startTestBtn: document.getElementById("start-test-btn"),
  hostSettingsLabel: document.getElementById("host-settings-label"),
  createTeamSizeLabel: document.getElementById("create-team-size-label"),
  createTeamSizeButtons: [...document.querySelectorAll("[data-create-team-size]")],
  teamSizeLabel: document.getElementById("team-size-label"),
  teamSizeButtons: [...document.querySelectorAll("[data-team-size]")],
  aiModeLabel: document.getElementById("ai-mode-label"),
  aiModeButtons: [...document.querySelectorAll("[data-ai-mode]")],
  allowSpectatorsToggle: document.getElementById("allow-spectators-toggle"),
  spectatorModeLabel: document.getElementById("spectator-mode-label"),
  rematchModeLabel: document.getElementById("rematch-mode-label"),
  rematchModeButtons: [...document.querySelectorAll("[data-rematch-mode]")],
  roomLinkPreview: document.getElementById("room-link-preview"),
  inviteProgressCard: document.getElementById("invite-progress-card"),
  inviteProgressCount: document.getElementById("invite-progress-count"),
  inviteProgressFill: document.getElementById("invite-progress-fill"),
  inviteProgressHint: document.getElementById("invite-progress-hint"),
  connectionIndicator: document.getElementById("connection-indicator"),
  activeRoomCode: document.getElementById("active-room-code"),
  roomLinkHint: document.getElementById("room-link-hint"),
  flashMessage: document.getElementById("flash-message"),
  seatGrid: document.getElementById("seat-grid"),
  roomSubtitle: document.getElementById("room-subtitle"),
  roomHint: document.getElementById("room-hint"),
  occupancyText: document.getElementById("occupancy-text"),
  occupancyFill: document.getElementById("occupancy-fill"),
  gameLayout: document.getElementById("game-layout"),
  turnSubtitle: document.getElementById("turn-subtitle"),
  turnPlayer: document.getElementById("turn-player"),
  turnTeam: document.getElementById("turn-team"),
  lobbyProgressCard: document.getElementById("lobby-progress-card"),
  lobbyProgressCount: document.getElementById("lobby-progress-count"),
  lobbyProgressFill: document.getElementById("lobby-progress-fill"),
  lobbyProgressHint: document.getElementById("lobby-progress-hint"),
  victoryCard: document.getElementById("victory-card"),
  victoryWinner: document.getElementById("victory-winner"),
  victoryScore: document.getElementById("victory-score"),
  rematchBtn: document.getElementById("rematch-btn"),
  rematchVoteStatus: document.getElementById("rematch-vote-status"),
  statusMessage: document.getElementById("status-message"),
  scoreRuby: document.getElementById("score-ruby"),
  scoreCobalt: document.getElementById("score-cobalt"),
  spectatorCount: document.getElementById("spectator-count"),
  deckCount: document.getElementById("deck-count"),
  discardCount: document.getElementById("discard-count"),
  discardTopCard: document.getElementById("discard-top-card"),
  discardPileBtn: document.getElementById("discard-pile-btn"),
  deckPileBtn: document.getElementById("deck-pile-btn"),
  handContainer: document.getElementById("hand-container"),
  handCaption: document.getElementById("hand-caption"),
  cancelSelectionBtn: document.getElementById("cancel-selection-btn"),
  discardDeadBtn: document.getElementById("discard-dead-btn"),
  selectionHint: document.getElementById("selection-hint"),
  logList: document.getElementById("log-list"),
  spectatorSummary: document.getElementById("spectator-summary"),
  spectatorList: document.getElementById("spectator-list"),
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSendBtn: document.getElementById("chat-send-btn"),
  chatCharCount: document.getElementById("chat-char-count"),
  chatFeedback: document.getElementById("chat-feedback"),
  emojiButtons: [...document.querySelectorAll("[data-chat-emoji]")],
  historySummary: document.getElementById("history-summary"),
  historyList: document.getElementById("history-list"),
  clearHistoryBtn: document.getElementById("clear-history-btn"),
  livePolite: document.getElementById("live-polite"),
  liveAssertive: document.getElementById("live-assertive"),
};

function announcePolite(message) {
  if (!refs.livePolite || !message) {
    return;
  }
  refs.livePolite.textContent = "";
  window.requestAnimationFrame(() => {
    refs.livePolite.textContent = message;
  });
}

function announceAssertive(message) {
  if (!refs.liveAssertive || !message) {
    return;
  }
  refs.liveAssertive.textContent = "";
  window.requestAnimationFrame(() => {
    refs.liveAssertive.textContent = message;
  });
}

const urlParams = new URLSearchParams(window.location.search);
const urlRoomCode = urlParams.get("room");
const URL_JOIN_ROLE = urlParams.get("role") === "spectator" ? "spectator" : null;
let joinRolePreference = URL_JOIN_ROLE;
let spectatorClosedRecoveryAttempted = false;

function sanitizeRoomCodeCandidate(value) {
  const normalized = normalizeRoomCode(value);
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : "";
}

function normalizeRoomCodeDraft(value = "") {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_ROOM_CODE_LENGTH);
}

const normalizedUrlRoomCode = sanitizeRoomCodeCandidate(urlRoomCode);
const hasMalformedRoomParam = Boolean(urlRoomCode && !normalizedUrlRoomCode);
if (urlRoomCode && !normalizedUrlRoomCode) {
  const cleanedUrl = new URL(window.location.href);
  cleanedUrl.searchParams.delete("room");
  window.history.replaceState({}, "", cleanedUrl);
  try {
    window.localStorage.removeItem(STORAGE_KEYS.room);
  } catch {
    // ignore: optional persistence only.
  }
}

// Safari private mode and lockdown browsers can throw on any localStorage access. Wrap the two ops
// the rest of the app uses so a denied storage API never turns into a blank-page boot failure.
const safeLocalStorage = {
  get(key) {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      // ignore: preferences simply won't persist for this session
    }
  },
  remove(key) {
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

function readPercentPreference(key, fallback, min = 0, max = 100) {
  const raw = safeLocalStorage.get(key);
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, n));
}

const STORAGE_JOIN_ROLE = safeLocalStorage.get(STORAGE_KEYS.joinAsSpectator);
if (URL_JOIN_ROLE) {
  safeLocalStorage.set(STORAGE_KEYS.joinAsSpectator, URL_JOIN_ROLE);
} else if (STORAGE_JOIN_ROLE === "player" || STORAGE_JOIN_ROLE === "spectator") {
  joinRolePreference = STORAGE_JOIN_ROLE;
}

const IS_IOS =
  /iphone|ipad|ipod/i.test(window.navigator.userAgent || "") ||
  (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

const persistedRoomCode = safeLocalStorage.get(STORAGE_KEYS.room);
const normalizedPersistedRoomCode = sanitizeRoomCodeCandidate(persistedRoomCode);
const initialFlashMessage = hasMalformedRoomParam
  ? "방 코드 링크 형식이 올바르지 않습니다. 새로 입장해서 시작해 주세요."
  : "방을 만들거나 받은 코드로 입장하세요.";
const startupFeedbackSettings = {
  soundVolume: readPercentPreference(STORAGE_KEYS.soundVolume, 70),
  hapticsIntensity: readPercentPreference(STORAGE_KEYS.hapticsIntensity, 70),
};

const HISTORY_RENDER_LIMIT = 8;
const DEFAULT_MAX_MATCH_HISTORY = 12;

const clientState = {
  socket: null,
  socketReady: false,
  localMode: false,
  sessionId: safeLocalStorage.get(STORAGE_KEYS.session) || "",
  roomCode: isOfflineOnlyRuntime() ? "" : sanitizeRoomCodeCandidate(normalizedUrlRoomCode || persistedRoomCode || ""),
  hostSessionId: null,
  lastName: safeLocalStorage.get(STORAGE_KEYS.name) || "",
  seats: [],
  roomPhase: "idle",
  yourRole: "none",
  yourSeatIndex: null,
  teamSize: 3,
  requiredPlayers: 6,
  occupiedSeats: 0,
  preferredTeamSize: normalizeTeamSize(
    safeLocalStorage.get(STORAGE_KEYS.preferredTeamSize) ||
      // First-time mobile visitors default to 1v1 because solo pair play is the dominant mobile scenario.
      (window.matchMedia?.("(max-width: 680px)").matches ? 1 : 3)
  ),
  spectatorCount: 0,
  spectators: [],
  allowSpectators: true,
  botThinkingSeatIndex: null,
  botDifficulty: normalizeBotDifficulty(safeLocalStorage.get(STORAGE_KEYS.preferredBotDifficulty)),
  rematchMode: "all",
  rematchVoteSeatIndexes: [],
  rematchRequiredVotes: 0,
  matchHistory: [],
  maxMatchHistory: DEFAULT_MAX_MATCH_HISTORY,
  chatMessages: [],
  game: null,
  pendingStep: null,
  selectedCardId: null,
  keyboardHandIndex: 0,
  legalTargets: [],
  keyboardBoardIndex: 0,
  chatLastSentAt: 0,
  chatLastMessage: "",
  chatCooldownUntil: 0,
  chatCooldownTimer: null,
  chatFeedbackTimer: null,
  flashMessage: initialFlashMessage,
  reconnectAttempted: false,
  autoJoinAttempted: false,
  sessionTakenOver: false,
  audioMuted: safeLocalStorage.get(STORAGE_KEYS.soundMuted) === "true",
  hapticsMuted: safeLocalStorage.get(STORAGE_KEYS.hapticsMuted) === "true",
  soundVolume: startupFeedbackSettings.soundVolume,
  hapticsIntensity: startupFeedbackSettings.hapticsIntensity,
  turnNotificationsEnabled: safeLocalStorage.get(STORAGE_KEYS.turnNotifications) === "true",
  deferredInstallPrompt: null,
  appInstalled: window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true,
  chipPlacementAnim: null,
  chipRemovalAnim: null,
  sequenceCascade: null,
  victoryWash: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  reconnectPaused: false,
  reconnectDelayMs: 0,
  reconnectCountdownTimer: null,
  reconnectCountdownDeadline: 0,
};

function pruneOfflineRuntimeRecoveredState() {
  if (!isOfflineOnlyRuntime()) {
    return;
  }
  if (!clientState.roomCode && !clientState.sessionId) {
    return;
  }
  clientState.roomCode = "";
  clientState.roomPhase = "idle";
  clientState.yourRole = "none";
  clientState.yourSeatIndex = null;
  clientState.sessionId = "";
  clientState.occupiedSeats = 0;
  clientState.spectatorCount = 0;
  clientState.spectators = [];
  clientState.allowSpectators = true;
  clientState.botThinkingSeatIndex = null;
  clientState.rematchMode = "all";
  clientState.rematchVoteSeatIndexes = [];
  clientState.rematchRequiredVotes = 0;
  clientState.matchHistory = [];
  clientState.maxMatchHistory = DEFAULT_MAX_MATCH_HISTORY;
  clientState.chatMessages = [];
  clientState.game = null;
  clientState.pendingStep = null;
  safeLocalStorage.remove(STORAGE_KEYS.room);
  safeLocalStorage.remove(STORAGE_KEYS.session);
  if (refs.createName) {
    refs.createName.value = normalizePlayerName(refs.createName.value || clientState.lastName || "");
  }
  if (refs.joinCode) {
    refs.joinCode.value = "";
  }
  if (refs.joinName) {
    refs.joinName.value = "";
  }
  clientState.reconnectAttempts = 0;
  clientState.reconnectPaused = false;
  clearReconnectCountdownTimer();
  hideOfflineBanner();
  setFlashMessage("정적판은 오프라인 모드라 기존 멀티 세션 정보를 초기화했습니다.");
}

const RECONNECT_BACKOFF_BASE_MS = 1500;
const RECONNECT_BACKOFF_MAX_MS = 30_000;
const RECONNECT_BACKOFF_JITTER_MS = 400;
const RECONNECT_MAX_ATTEMPTS = 8;
const CHAT_MAX_LENGTH = 140;
const CHAT_COOLDOWN_MS = 600;
const CHAT_REPEAT_COOLDOWN_MS = CHAT_COOLDOWN_MS * 2;
const CHAT_FEEDBACK_MS = 2800;

const CHIP_PLACE_ANIM_MS = 420;
const CHIP_REMOVE_ANIM_MS = 440;
// Sequence-completion cascade: cells light up progressively, line sweep travels c1→c5,
// board border pulses gold. Long enough that the player parses what just happened, short
// enough that play resumes within one breath of the bot/teammate's next move.
const SEQUENCE_CASCADE_MS = 1200;
// Victory wash: longer than the sequence cascade because match conclusion is a one-time
// climactic moment — the fan-out + sweep + fade-out reads better if it occupies a full
// breath instead of being clipped by the next UI state (rematch card appearing).
const VICTORY_WASH_MS = 2000;
const TARGET_PULSE_ANIM_MS = 1100;
const CARD_FLIGHT_MS = 760;
let chipAnimFrameId = null;
let targetPulseFrameId = null;
// Cached CanvasPattern for the woven-felt look on the board rail. Generated once on first
// use (per theme variant) — regenerating a 32px noise pattern every frame would burn ~ms.
let railFeltPattern = null;
let railFeltPatternTheme = null;
// Cached pattern for the inner playing surface — finer grain, lower contrast than the rail
// so the rank/suit text and chips read cleanly on top of it.
let boardSurfacePattern = null;
let boardSurfacePatternTheme = null;

let audioContext = null;
let lastJackFeedback = { key: "", at: 0 };
let localSoloRuntime = null;

const BOT_MODE_LABELS = {
  easy: "쉬움",
  smart: "전략",
  aggressive: "공격",
};

const REMATCH_MODE_LABELS = {
  all: "전원 동의",
  host: "방장 시작",
};

const TEAM_SIZE_LABELS = {
  1: "1대1",
  2: "2대2",
  3: "3대3",
};

const TEAM_LABELS = {
  A: "루비 팀",
  B: "코발트 팀",
};

if (clientState.lastName) {
  refs.createName.value = clientState.lastName;
  refs.joinName.value = clientState.lastName;
}
if (clientState.roomCode) {
  refs.joinCode.value = clientState.roomCode;
}
if (refs.joinAsSpectator) {
  refs.joinAsSpectator.checked = joinRolePreference === "spectator";
}

function resolveJoinRole() {
  return joinRolePreference === "spectator" ? "spectator" : "player";
}

function setJoinRolePreference(role) {
  joinRolePreference = role === "spectator" ? "spectator" : "player";
  if (refs.joinAsSpectator) {
    refs.joinAsSpectator.checked = joinRolePreference === "spectator";
  }
  safeLocalStorage.set(STORAGE_KEYS.joinAsSpectator, joinRolePreference);
}

function normalizeRoomCode(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .trim();
  if (!raw) {
    return "";
  }
  const inviteQuery = raw.match(/[?&](?:room|code)=([A-Za-z0-9]{4,6})/i);
  if (inviteQuery?.[1]) {
    return inviteQuery[1].toUpperCase();
  }
  const codeMatch = raw.match(/[A-Za-z0-9]{4,6}/g);
  if (codeMatch?.length) {
    return codeMatch[codeMatch.length - 1].toUpperCase();
  }
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function focusInviteJoinForm() {
  if (!refs.joinName) {
    return false;
  }
  if (refs.joinCode) {
    const joined = normalizeRoomCode(refs.joinCode.value || "");
    if (!joined) {
      refs.joinCode.value = clientState.roomCode || "";
    }
  }
  try {
    refs.joinName.focus();
    if (typeof refs.joinName.setSelectionRange === "function") {
      refs.joinName.setSelectionRange(0, refs.joinName.value.length);
    }
  } catch {
    return false;
  }
  return true;
}

function sanitizePlayerName(value) {
  return sanitizeName(value, 20).replace(/\s+/g, " ");
}

function normalizePlayerName(value) {
  const normalized = sanitizePlayerName(value);
  return normalized || "플레이어";
}

function normalizeTeamSize(value) {
  const teamSize = Number(value);
  return [1, 2, 3].includes(teamSize) ? teamSize : 3;
}

function normalizeBotDifficulty(value) {
  return value === "easy" || value === "aggressive" ? value : "smart";
}

function asSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function clampInt(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const integer = Math.trunc(numeric);
  if (integer < min || integer > max) {
    return fallback;
  }
  return integer;
}

function trimText(value, maxLength = 40) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}` : normalized;
}

function normalizeRematchMode(value) {
  return value === "host" ? "host" : "all";
}

function normalizeSeat(raw, fallbackSeatIndex = 0) {
  const source = asObject(raw) || {};
  const seatIndex = clampInt(source.seatIndex, fallbackSeatIndex, 0, 9999);
  const team = source.team === "B" ? "B" : seatIndex % 2 === 0 ? "A" : "B";
  return {
    seatIndex,
    team,
    teamName: trimText(source.teamName || TEAM_LABELS[team], 12),
    name: trimText(source.name || "", 20) || "",
    occupied: Boolean(source.occupied),
    connected: Boolean(source.connected),
    isBot: Boolean(source.isBot),
    handCount: Math.max(0, clampInt(source.handCount, 0, 0, 10_000)),
  };
}

function normalizeSeats(rawSeats, fallbackCount = 0) {
  const seats = asSafeArray(rawSeats);
  if (seats.length === 0) {
    return [];
  }
  return seats.slice(0, Math.max(fallbackCount, seats.length)).map((seat, index) => normalizeSeat(seat, index));
}

function normalizeSpectators(rawSpectators) {
  const spectators = asSafeArray(rawSpectators);
  return spectators.map((entry, index) => {
    const source = asObject(entry) || {};
    return {
      connected: source.connected !== false,
      name: trimText(source.name || `관전자${index + 1}`, 20) || `관전자${index + 1}`,
      joinedAt: typeof source.joinedAt === "string" ? source.joinedAt : "",
    };
  });
}

function normalizeChatMessages(rawMessages) {
  const messages = asSafeArray(rawMessages);
  return messages
    .map((entry, index) => {
      if (typeof entry === "string") {
        return { author: `관전자${index + 1}`, text: entry.slice(0, CHAT_MAX_LENGTH) };
      }
      if (!asObject(entry)) {
        return null;
      }
      return {
        author: trimText(entry.author || `관전자${index + 1}`, 20) || "관전자",
        text: trimText(entry.text || "", CHAT_MAX_LENGTH),
      };
    })
    .filter(Boolean);
}

function normalizeCard(rawCard) {
  if (!asObject(rawCard)) {
    return null;
  }
  const rawId = rawCard.id;
  const numericId = Number(rawId);
  return {
    id: Number.isFinite(numericId) ? Math.trunc(numericId) : String(rawId || ""),
    rank: trimText(rawCard.rank || "", 4),
    suit: trimText(rawCard.suit || "", 4),
    label: trimText(rawCard.label || "", 8),
    isRed: Boolean(rawCard.isRed),
    action: rawCard.action || "normal",
  };
}

function normalizeBoardCell(rawCell, fallbackId = 0) {
  const source = asObject(rawCell) || {};
  const id = clampInt(source.id, fallbackId, 0, BOARD_SIZE * BOARD_SIZE - 1);
  const row = Number.isFinite(Number(source.row))
    ? Math.min(Math.max(Math.trunc(Number(source.row)), 0), BOARD_SIZE - 1)
    : Math.floor(id / BOARD_SIZE);
  const col = Number.isFinite(Number(source.col))
    ? Math.min(Math.max(Math.trunc(Number(source.col)), 0), BOARD_SIZE - 1)
    : id % BOARD_SIZE;
  return {
    id,
    row,
    col,
    label:
      typeof source.label === "string" && source.label.trim().length > 0
        ? source.label.trim().slice(0, 12)
        : `${row + 1}-${col + 1}`,
    corner: Boolean(source.corner),
    chip: source.chip === "A" || source.chip === "B" ? source.chip : null,
    seqCount: clampInt(source.seqCount, 0, 0, 10),
    locked: Boolean(source.locked),
  };
}

function normalizeBoard(rawBoard) {
  const source = asSafeArray(rawBoard);
  const boardSize = BOARD_SIZE * BOARD_SIZE;
  const size = Math.min(Math.max(source.length, boardSize > 0 ? boardSize : 0), boardSize || source.length);
  const board = [];
  for (let id = 0; id < Math.max(boardSize, size); id += 1) {
    board.push(normalizeBoardCell(source[id], id));
  }
  return board;
}

function normalizeGamePlayer(rawPlayer, fallbackSeatIndex = 0) {
  const source = asObject(rawPlayer) || {};
  const seatIndex = clampInt(source.seatIndex, fallbackSeatIndex, 0, BOARD_SIZE * BOARD_SIZE - 1);
  const team = source.team === "B" ? "B" : seatIndex % 2 === 0 ? "A" : "B";
  return {
    seatIndex,
    name: trimText(source.name || `Player ${seatIndex + 1}`, 20),
    team,
    handCount: Math.max(0, clampInt(source.handCount, 0, 0, 52)),
  };
}

function normalizeSequences(rawSequences) {
  const source = asObject(rawSequences) || {};
  return {
    A: asSafeArray(source.A).map((sequence) => ({
      key: trimText(sequence?.key, 32),
      cells: asSafeArray(sequence?.cells).filter((cellId) => Number.isFinite(Number(cellId))),
    })),
    B: asSafeArray(source.B).map((sequence) => ({
      key: trimText(sequence?.key, 32),
      cells: asSafeArray(sequence?.cells).filter((cellId) => Number.isFinite(Number(cellId))),
    })),
  };
}

function normalizeGameSnapshot(rawGame) {
  const source = asObject(rawGame);
  if (!source) {
    return null;
  }
  const board = normalizeBoard(source.board);
  const players = asSafeArray(source.players).map((player, index) => normalizeGamePlayer(player, index));
  return {
    phase: trimText(source.phase, 20) || "lobby",
    winner: source.winner === "A" || source.winner === "B" ? source.winner : null,
    lastPlacedCellId: Number.isFinite(Number(source.lastPlacedCellId))
      ? Math.trunc(Number(source.lastPlacedCellId))
      : null,
    currentPlayerIndex: Number.isFinite(Number(source.currentPlayerIndex))
      ? Math.trunc(Number(source.currentPlayerIndex))
      : null,
    currentSeatIndex: Number.isFinite(Number(source.currentSeatIndex))
      ? Math.trunc(Number(source.currentSeatIndex))
      : null,
    scores: {
      A: Math.max(0, Math.round(Number(source.scores?.A) || 0)),
      B: Math.max(0, Math.round(Number(source.scores?.B) || 0)),
    },
    deckCount: Math.max(0, Math.trunc(Number(source.deckCount) || 0)),
    discardCount: Math.max(0, Math.trunc(Number(source.discardCount) || 0)),
    discardTopCard: normalizeCard(source.discardTopCard),
    pendingStep: asObject(source.pendingStep)
      ? { ...source.pendingStep }
      : null,
    logs: asSafeArray(source.logs)
      .map((entry) => (typeof entry === "string" ? entry.slice(0, 180) : ""))
      .filter(Boolean),
    board,
    players,
    sequences: normalizeSequences(source.sequences),
    yourHand: asSafeArray(source.yourHand).map((card, index) => normalizeCard(card) || { id: `fallback-card-${index}` }),
  };
}

function normalizeRematchVoteSeatIndexes(rawIndexes) {
  return asSafeArray(rawIndexes).map((index) => clampInt(index, -1, 0, 9999)).filter((index) => index >= 0);
}

function requiredPlayerCount() {
  return clientState.requiredPlayers || clientState.seats.length || clientState.teamSize * 2 || 6;
}

function occupiedSeatCount() {
  return clientState.occupiedSeats ?? clientState.seats.filter((seat) => seat.occupied).length;
}

function displayTeamSize() {
  return clientState.roomCode ? normalizeTeamSize(clientState.teamSize) : normalizeTeamSize(clientState.preferredTeamSize);
}

function displayRequiredPlayerCount() {
  return clientState.roomCode ? requiredPlayerCount() : displayTeamSize() * 2;
}

function seatIndexesForTeam(team, count = displayRequiredPlayerCount()) {
  const start = team === "A" ? 0 : 1;
  const indexes = [];
  for (let index = start; index < count; index += 2) {
    indexes.push(index + 1);
  }
  return indexes;
}

function saveSessionMeta() {
  if (clientState.sessionId) {
    safeLocalStorage.set(STORAGE_KEYS.session, clientState.sessionId);
  }
  if (clientState.roomCode && !clientState.localMode) {
    safeLocalStorage.set(STORAGE_KEYS.room, clientState.roomCode);
  } else {
    safeLocalStorage.remove(STORAGE_KEYS.room);
  }
  if (clientState.lastName) {
    safeLocalStorage.set(STORAGE_KEYS.name, clientState.lastName);
  }
  safeLocalStorage.set(STORAGE_KEYS.preferredTeamSize, String(clientState.preferredTeamSize));
  safeLocalStorage.set(STORAGE_KEYS.preferredBotDifficulty, String(clientState.botDifficulty || "smart"));
  safeLocalStorage.set(STORAGE_KEYS.soundVolume, String(clientState.soundVolume));
  safeLocalStorage.set(STORAGE_KEYS.hapticsIntensity, String(clientState.hapticsIntensity));
}

function setFlashMessage(message) {
  clientState.flashMessage = message;
  refs.flashMessage.textContent = message;
}

function updateSoundButton() {
  refs.soundToggleBtn.textContent = clientState.audioMuted ? "♪" : "♫";
  refs.soundToggleBtn.setAttribute("aria-pressed", String(!clientState.audioMuted));
  refs.soundToggleBtn.setAttribute("aria-label", clientState.audioMuted ? "사운드 켜기" : "사운드 끄기");
  refs.soundToggleBtn.title = clientState.audioMuted ? "사운드 켜기" : "사운드 끄기";
}

function updateFeedbackControls() {
  if (refs.soundVolumeSlider) {
    refs.soundVolumeSlider.value = String(clientState.soundVolume);
  }
  if (refs.soundVolumeValue) {
    refs.soundVolumeValue.textContent = `${clientState.soundVolume}%`;
  }
  if (refs.hapticIntensitySlider) {
    refs.hapticIntensitySlider.value = String(clientState.hapticsIntensity);
  }
  if (refs.hapticIntensityValue) {
    refs.hapticIntensityValue.textContent = `${clientState.hapticsIntensity}%`;
  }
}

function notificationsSupported() {
  return "Notification" in window;
}

// Watch for the user revoking notification permission via browser settings while the page
// is open. Without this, our toggle button would still display "active" until the next
// other render. The Permissions API is the standard way to subscribe.
let notificationPermissionStatus = null;
async function watchNotificationPermission() {
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") return;
  try {
    notificationPermissionStatus = await navigator.permissions.query({ name: "notifications" });
    notificationPermissionStatus.addEventListener("change", () => {
      // If the user revoked permission, also drop the local opt-in so the next render shows
      // the "off" state. They can re-enable from the button.
      if (notificationPermissionStatus.state !== "granted") {
        clientState.turnNotificationsEnabled = false;
        safeLocalStorage.set(STORAGE_KEYS.turnNotifications, "false");
      }
      updateNotificationButton();
    });
  } catch {
    // Some browsers reject the Notification permission name; fall back to button-on-render.
  }
}

function updateNotificationButton() {
  const supported = notificationsSupported();
  const permission = supported ? window.Notification.permission : "unsupported";
  const active = supported && permission === "granted" && clientState.turnNotificationsEnabled;
  refs.notificationToggleBtn.hidden = !supported;
  refs.notificationToggleBtn.disabled = !supported || permission === "denied";
  refs.notificationToggleBtn.textContent = active ? "●" : "!";
  refs.notificationToggleBtn.setAttribute("aria-pressed", String(active));
  refs.notificationToggleBtn.setAttribute(
    "aria-label",
    active ? "내 차례 브라우저 알림 끄기" : "내 차례 브라우저 알림 켜기"
  );
  refs.notificationToggleBtn.title = active ? "내 차례 알림 끄기" : "내 차례 알림 켜기";
}

async function toggleTurnNotifications() {
  if (!notificationsSupported()) {
    setFlashMessage("이 브라우저는 알림을 지원하지 않습니다.");
    updateNotificationButton();
    return;
  }

  if (clientState.turnNotificationsEnabled && window.Notification.permission === "granted") {
    clientState.turnNotificationsEnabled = false;
    safeLocalStorage.set(STORAGE_KEYS.turnNotifications, "false");
    setFlashMessage("내 차례 브라우저 알림을 껐습니다.");
    updateNotificationButton();
    return;
  }

  if (window.Notification.permission === "denied") {
    clientState.turnNotificationsEnabled = false;
    safeLocalStorage.set(STORAGE_KEYS.turnNotifications, "false");
    setFlashMessage("브라우저 알림 권한이 차단되어 있습니다. 사이트 설정에서 권한을 허용해야 합니다.");
    updateNotificationButton();
    return;
  }

  const permission =
    window.Notification.permission === "granted" ? "granted" : await window.Notification.requestPermission();
  clientState.turnNotificationsEnabled = permission === "granted";
  safeLocalStorage.set(STORAGE_KEYS.turnNotifications, String(clientState.turnNotificationsEnabled));
  setFlashMessage(
    clientState.turnNotificationsEnabled
      ? "내 차례가 되었을 때 브라우저 알림을 보냅니다."
      : "알림 권한이 허용되지 않았습니다."
  );
  updateNotificationButton();
}

function updateInstallButton() {
  const canPrompt = Boolean(clientState.deferredInstallPrompt) && !clientState.appInstalled;
  const canShowManualHelp = IS_IOS && !clientState.appInstalled;
  const canInstall = canPrompt || canShowManualHelp;
  refs.installAppBtn.hidden = !canInstall;
  refs.installAppBtn.disabled = !canInstall;
  refs.installAppBtn.title = canPrompt ? "앱 설치" : "홈 화면에 추가";
  refs.installAppBtn.setAttribute(
    "aria-label",
    canPrompt ? "앱 설치" : "Safari 홈 화면 추가 방법 보기"
  );
}

async function installApp() {
  if (!clientState.deferredInstallPrompt) {
    if (IS_IOS && !clientState.appInstalled) {
      setFlashMessage("iPhone/iPad는 Safari 공유 버튼 → 홈 화면에 추가로 설치하세요.");
      announcePolite("Safari 공유 버튼에서 홈 화면에 추가를 선택하면 앱처럼 설치됩니다.");
      render();
    }
    return;
  }

  const promptEvent = clientState.deferredInstallPrompt;
  clientState.deferredInstallPrompt = null;
  updateInstallButton();
  promptEvent.prompt();
  const choice = await promptEvent.userChoice.catch(() => null);
  if (choice?.outcome === "accepted") {
    clientState.appInstalled = true;
    setFlashMessage("Sequence Arena를 설치했습니다.");
    playSound("sequence");
  } else {
    setFlashMessage("앱 설치를 나중에 다시 진행할 수 있습니다.");
  }
  render();
}

function updateCreateTeamSizeButtons() {
  const activeSize = normalizeTeamSize(clientState.preferredTeamSize);
  refs.createTeamSizeLabel.textContent = TEAM_SIZE_LABELS[activeSize] || TEAM_SIZE_LABELS[3];
  for (const button of refs.createTeamSizeButtons) {
    const isActive = Number(button.dataset.createTeamSize) === activeSize;
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function updateTeamSizeButtons() {
  const activeSize = normalizeTeamSize(clientState.teamSize);
  refs.teamSizeLabel.textContent = TEAM_SIZE_LABELS[activeSize] || TEAM_SIZE_LABELS[3];
  const canEdit = isHost() && !clientState.localMode && clientState.roomPhase === "lobby";
  for (const button of refs.teamSizeButtons) {
    const isActive = Number(button.dataset.teamSize) === activeSize;
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = !canEdit;
  }
}

function updateAiModeButtons() {
  const activeMode = clientState.botDifficulty || "smart";
  refs.aiModeLabel.textContent = BOT_MODE_LABELS[activeMode] || BOT_MODE_LABELS.smart;
  for (const button of refs.aiModeButtons) {
    const isActive = button.dataset.aiMode === activeMode;
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = !isHost();
  }
}

function isHost() {
  return Boolean(
    clientState.roomCode &&
      clientState.hostSessionId &&
      clientState.sessionId &&
      clientState.hostSessionId === clientState.sessionId
  );
}

function updateHostSettingsControls() {
  const host = isHost() && !clientState.localMode;
  refs.hostSettingsLabel.textContent = clientState.localMode ? "솔로" : host ? "방장" : "잠김";
  updateTeamSizeButtons();
  refs.allowSpectatorsToggle.checked = clientState.allowSpectators !== false;
  refs.allowSpectatorsToggle.disabled = !host;
  refs.spectatorModeLabel.textContent = clientState.allowSpectators === false ? "닫힘" : "열림";
  refs.rematchModeLabel.textContent = REMATCH_MODE_LABELS[clientState.rematchMode] || REMATCH_MODE_LABELS.all;
  for (const button of refs.rematchModeButtons) {
    const isActive = button.dataset.rematchMode === clientState.rematchMode;
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = !host;
  }
  if (refs.clearHistoryBtn) {
    const hasHistory = clientState.matchHistory.length > 0;
    refs.clearHistoryBtn.hidden = !host;
    refs.clearHistoryBtn.disabled = !host || !hasHistory;
    refs.clearHistoryBtn.setAttribute("aria-disabled", String(refs.clearHistoryBtn.disabled));
    refs.clearHistoryBtn.textContent = hasHistory ? "경기 기록 지우기" : "경기 기록 없음";
  }
}

function setBotDifficulty(mode) {
  if (!mode || mode === clientState.botDifficulty) {
    return;
  }
  playSound("tap");
  sendSocket({
    type: "set_bot_difficulty",
    difficulty: mode,
  });
}

function setRoomSettings(settings) {
  if (!clientState.roomCode) {
    setFlashMessage("방 설정을 바꾸려면 먼저 방에 입장하세요.");
    render();
    return;
  }
  playSound("tap");
  sendSocket({
    type: "set_room_settings",
    ...settings,
  });
}

function clearMatchHistory() {
  if (!refs.clearHistoryBtn || refs.clearHistoryBtn.disabled) {
    return;
  }
  if (!isHost() || clientState.localMode) {
    setFlashMessage("방장만 경기 기록을 초기화할 수 있습니다.");
    return;
  }
  if (!clientState.matchHistory.length) {
    setFlashMessage("삭제할 경기 기록이 없습니다.");
    return;
  }
  const confirmed = window.confirm("해당 방의 경기 기록을 모두 삭제할까요?");
  if (!confirmed) {
    return;
  }
  playSound("tap");
  sendSocket({ type: "clear_match_history" });
}

function hasVotedForRematch() {
  return (
    clientState.yourSeatIndex != null &&
    clientState.rematchVoteSeatIndexes.includes(clientState.yourSeatIndex)
  );
}

function canLeaveRoom() {
  if (!clientState.roomCode || clientState.localMode) {
    return false;
  }
  // During active play, keeping the seat active is safer than forcing a mid-game vacancy.
  // Spectators can leave at any time because they don't block game flow.
  if (clientState.yourRole === "spectator") {
    return true;
  }
  return clientState.roomPhase !== "playing";
}

function ensureAudioContext() {
  if (clientState.audioMuted) {
    return null;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
    } catch {
      return null;
    }
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playSound(name) {
  // Expose for ui-regression before audio-device checks so diagnostics still capture
  // intended sound intent even when audio is effectively muted (volume 0/headless).
  window.__sequenceLastSound = name;
  window.__sequenceSoundHistory = window.__sequenceSoundHistory || [];
  window.__sequenceSoundHistory.push(name);
  if (window.__sequenceSoundHistory.length > 8) window.__sequenceSoundHistory.shift();

  const context = ensureAudioContext();
  if (!context) {
    return;
  }
  const volumeScale = clamp01(clientState.soundVolume / 100, 0);
  if (volumeScale <= 0) {
    return;
  }

  const patterns = {
    tap: [
      { frequency: 420, delay: 0, duration: 0.045, gain: 0.025, type: "triangle" },
      { frequency: 640, delay: 0.035, duration: 0.055, gain: 0.022, type: "triangle" },
    ],
    select: [{ frequency: 520, delay: 0, duration: 0.06, gain: 0.025, type: "sine" }],
    place: [
      { frequency: 190, delay: 0, duration: 0.075, gain: 0.04, type: "triangle" },
      { frequency: 310, delay: 0.04, duration: 0.08, gain: 0.028, type: "sine" },
    ],
    thinking: [
      { frequency: 330, delay: 0, duration: 0.05, gain: 0.02, type: "sine" },
      { frequency: 392, delay: 0.08, duration: 0.05, gain: 0.018, type: "sine" },
    ],
    sequence: [
      { frequency: 392, delay: 0, duration: 0.11, gain: 0.035, type: "triangle" },
      { frequency: 494, delay: 0.08, duration: 0.12, gain: 0.035, type: "triangle" },
      { frequency: 659, delay: 0.16, duration: 0.16, gain: 0.034, type: "triangle" },
    ],
    jackWild: [
      { frequency: 294, delay: 0, duration: 0.09, gain: 0.04, type: "triangle" },
      { frequency: 440, delay: 0.055, duration: 0.1, gain: 0.035, type: "sine" },
      { frequency: 740, delay: 0.13, duration: 0.16, gain: 0.03, type: "triangle" },
    ],
    jackCut: [
      { frequency: 196, delay: 0, duration: 0.08, gain: 0.04, type: "sawtooth" },
      { frequency: 147, delay: 0.075, duration: 0.11, gain: 0.034, type: "triangle" },
      { frequency: 392, delay: 0.16, duration: 0.1, gain: 0.025, type: "sine" },
    ],
    victory: [
      { frequency: 392, delay: 0, duration: 0.14, gain: 0.034, type: "triangle" },
      { frequency: 523, delay: 0.12, duration: 0.16, gain: 0.034, type: "triangle" },
      { frequency: 659, delay: 0.25, duration: 0.2, gain: 0.034, type: "triangle" },
      { frequency: 784, delay: 0.42, duration: 0.28, gain: 0.03, type: "sine" },
    ],
    error: [{ frequency: 130, delay: 0, duration: 0.14, gain: 0.035, type: "sawtooth" }],
    // High-frequency click attack + low sine thud body — felt-on-wood character for the
    // physics-driven chip drop. Distinct from `place` so the new drop animation has its
    // own voice and the original card-placement sound stays unchanged for other paths.
    chipDrop: [
      { frequency: 1800, delay: 0, duration: 0.018, gain: 0.024, type: "square" },
      { frequency: 150, delay: 0.012, duration: 0.07, gain: 0.044, type: "sine" },
      { frequency: 95, delay: 0.018, duration: 0.06, gain: 0.028, type: "sine" },
    ],
    // Descending minor-third for the losing side at match end — paired with `victory` so
    // both teams hear *something* at the conclusion. Without this the loser's client
    // emits only the polite announcement, which feels anticlimactic on a multi-minute match.
    defeat: [
      { frequency: 330, delay: 0, duration: 0.16, gain: 0.03, type: "sine" },
      { frequency: 277, delay: 0.13, duration: 0.18, gain: 0.028, type: "sine" },
      { frequency: 247, delay: 0.27, duration: 0.24, gain: 0.024, type: "sine" },
    ],
    // Two-tone rising chime for the "your turn" handoff. Distinct from `select` (which
    // fires on card pickup) so the player can tell at-a-glance whether the sound means
    // "your turn just started" or "you selected a card".
    turnStart: [
      { frequency: 523, delay: 0, duration: 0.07, gain: 0.028, type: "triangle" },
      { frequency: 784, delay: 0.05, duration: 0.1, gain: 0.026, type: "triangle" },
    ],
  };

  const notes = patterns[name] || patterns.tap;
  const startAt = context.currentTime + 0.01;
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, startAt + note.delay);
    gain.gain.setValueAtTime(0.0001, startAt + note.delay);
    gain.gain.exponentialRampToValueAtTime(note.gain * volumeScale, startAt + note.delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.delay + note.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt + note.delay);
    oscillator.stop(startAt + note.delay + note.duration + 0.03);
  }
}

// Named haptic patterns. Each action picks one of these instead of passing raw
// millisecond values, so the vocabulary stays consistent across the codebase and
// can be tuned in one place. Vibration API takes either a single ms number (one
// pulse) or an array alternating vibrate/pause/vibrate/pause.
const HAPTIC = Object.freeze({
  LIGHT: 8,                          // taps, card selects — nearly subliminal
  MEDIUM: 15,                        // card plays, board commits
  HEAVY: 30,                         // chip drop (PR-2)
  SEQUENCE: [25, 50, 25],            // sequence completion (PR-3) — double-tap pattern
  VICTORY: [50, 100, 50, 100, 50],   // match win — celebratory triple-tap
});

function triggerHaptic(pattern) {
  const normalized = Array.isArray(pattern) ? pattern : [pattern];
  const safePattern = normalized.map((v) => {
    const level = Number(v);
    return Number.isFinite(level) ? Math.max(1, Math.round(level)) : 1;
  });
  // Expose for ui-regression. `last` is overwritten on every call so race-adjacent
  // calls (e.g., jack-action haptic + chip-drop haptic fired ~300ms apart) clobber
  // each other. `history` keeps the last 8 patterns so tests can assert on a
  // *specific* haptic instead of being forced to read between two clobbers.
  window.__sequenceLastHaptic = safePattern;
  window.__sequenceHapticHistory = window.__sequenceHapticHistory || [];
  window.__sequenceHapticHistory.push(safePattern);
  if (window.__sequenceHapticHistory.length > 8) window.__sequenceHapticHistory.shift();
  if (clientState.hapticsMuted) {
    return;
  }
  const intensity = clamp01(clientState.hapticsIntensity / 100, 0);
  if (intensity <= 0) {
    return;
  }
  const scaled = safePattern.map((v) => Math.max(1, Math.round(v * intensity)));
  if (!("vibrate" in navigator)) {
    return;
  }
  try {
    navigator.vibrate(scaled);
  } catch {
    // Some browsers expose vibrate but block it; audio/visual feedback still runs.
  }
}

function playJackFeedback(card) {
  if (!card || card.rank !== "J") {
    return false;
  }

  const key = `${card.id || card.label}:${card.action}`;
  const now = Date.now();
  if (lastJackFeedback.key === key && now - lastJackFeedback.at < 1200) {
    return true;
  }
  lastJackFeedback = { key, at: now };

  if (card.action === "remove") {
    playSound("jackCut");
    triggerHaptic([24, 34, 34]);
    return true;
  }

  playSound("jackWild");
  triggerHaptic([18, 28, 18]);
  return true;
}

function getAudioSnapshot() {
  const boardChips = {};
  const board = clientState.game?.board || [];
  for (const cell of board) {
    if (cell.chip) {
      boardChips[cell.id] = cell.chip;
    }
  }
  return {
    roomCode: clientState.roomCode,
    phase: clientState.roomPhase,
    botThinkingSeatIndex: clientState.botThinkingSeatIndex,
    gamePhase: clientState.game?.phase || "",
    winner: clientState.game?.winner || "",
    lastPlacedCellId: clientState.game?.lastPlacedCellId ?? null,
    discardCount: clientState.game?.discardCount ?? 0,
    scores: {
      A: clientState.game?.scores?.A ?? 0,
      B: clientState.game?.scores?.B ?? 0,
    },
    isYourTurn: Boolean(isYourTurn()),
    boardChips,
  };
}

// Describe the most recently appended sequence for `team` so the score-change announcement
// gives SR users a spatial anchor — a sighted player sees the chip animation and a flash
// pulse on the highlighted line, but the canvas is opaque to assistive tech. Returns
// either an empty string (if sequence data is unavailable, e.g., the server snapshot omits
// it for some reason) or a leading-space delimited "라벨1부터 라벨5까지" suffix that slots
// into the existing announcement template without breaking its grammar. Cells are looked up
// by ID into the same board the placement announcement uses, so card labels stay consistent.
function describeNewSequence(team) {
  const sequences = clientState.game?.sequences?.[team];
  if (!Array.isArray(sequences) || sequences.length === 0) {
    return "";
  }
  const sequence = sequences[sequences.length - 1];
  if (!sequence?.cells || sequence.cells.length === 0) {
    return "";
  }
  const board = clientState.game?.board || [];
  const startCell = board[sequence.cells[0]];
  const endCell = board[sequence.cells[sequence.cells.length - 1]];
  if (!startCell || !endCell) {
    return "";
  }
  return ` — ${startCell.label} 부터 ${endCell.label} 까지`;
}

function resetMobileGameScroll() {
  if (!window.matchMedia?.("(max-width: 680px)").matches) {
    return;
  }
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function playSnapshotSound(previous) {
  if (!previous) {
    return;
  }

  if (!previous.roomCode && clientState.roomCode) {
    playSound("tap");
  }

  // Track game-start in this same cycle so the downstream turn-announcement doesn't
  // overwrite it with rAF (the live region only retains the last text written within a
  // frame). When seat 0 is the active seat at start, both game-start and isYourTurn
  // would fire; combining them here keeps the SR announcement informative without
  // dropping either signal.
  const startedNow = !previous.gamePhase && clientState.game?.phase === "playing";
  if (startedNow) {
    resetMobileGameScroll();
    playSound("sequence");
    const isFirstTurn = isYourTurn();
    // Sound-only feedback skips users who muted audio (we ship muted by default) or run a
    // screen reader. announcePolite here is non-interruptive and lets the SR user know the
    // lobby is now live. We append the turn cue if applicable so the active seat doesn't
    // miss its call to action (the standalone turn announcement is suppressed below for
    // this cycle to avoid the rAF-overwrite race).
    announcePolite(
      isFirstTurn
        ? "게임이 시작되었습니다. 당신 차례입니다. 카드를 선택하세요."
        : "게임이 시작되었습니다."
    );
  }

  if (previous.botThinkingSeatIndex == null && clientState.botThinkingSeatIndex != null) {
    playSound("thinking");
  }

  if (!previous.winner && clientState.game?.winner) {
    const winnerLabel = clientState.game.winner === "A" ? "루비 팀" : "코발트 팀";
    // Determine whether THIS client's player belongs to the winning team so we can pick the
    // right side of the audio/haptic story. Spectators get the neutral victory fanfare so
    // they hear *something*; otherwise the match ends in silence on their end.
    const yourPlayer = clientState.game.players?.find((p) => p.seatIndex === clientState.yourSeatIndex);
    const youWon = yourPlayer && yourPlayer.team === clientState.game.winner;
    const youLost = yourPlayer && yourPlayer.team !== clientState.game.winner;
    if (youWon) {
      playSound("victory");
      triggerHaptic(HAPTIC.VICTORY);
      registerVictoryWash(clientState.game.winner);
    } else if (youLost) {
      playSound("defeat");
      triggerHaptic(HAPTIC.MEDIUM);
    } else {
      // Spectator path — winning team's fanfare without the heavy haptic.
      playSound("victory");
    }
    announceAssertive(`${winnerLabel} 승리. 게임이 종료되었습니다.`);
    return;
  }

  const rubyScored = Boolean(clientState.game?.scores && clientState.game.scores.A > previous.scores.A);
  const cobaltScored = Boolean(clientState.game?.scores && clientState.game.scores.B > previous.scores.B);
  const scoreChanged = rubyScored || cobaltScored;
  if (rubyScored) {
    triggerScoreFlash("ruby");
    const newSeq = clientState.game?.sequences?.A?.at(-1);
    if (newSeq?.cells) {
      registerSequenceCascade(newSeq.cells, "A");
    }
    announcePolite(
      `루비 팀이 시퀀스를 완성했습니다${describeNewSequence("A")}. 현재 ${clientState.game.scores.A}/2.`
    );
  }
  if (cobaltScored) {
    triggerScoreFlash("cobalt");
    const newSeq = clientState.game?.sequences?.B?.at(-1);
    if (newSeq?.cells) {
      registerSequenceCascade(newSeq.cells, "B");
    }
    announcePolite(
      `코발트 팀이 시퀀스를 완성했습니다${describeNewSequence("B")}. 현재 ${clientState.game.scores.B}/2.`
    );
  }
  if (!previous.isYourTurn && isYourTurn() && !startedNow) {
    // startedNow already folded the turn cue into the game-start announcement so we'd be
    // overwriting it via rAF if we fired again here for the same cycle.
    announcePolite("당신 차례입니다. 카드를 선택하세요.");
    // Turn-handoff feedback: a rising two-tone chime + medium haptic + a one-shot CSS
    // animation on the turn banner & board panel. Previously the only signal that the
    // player's turn had arrived was a polite SR announcement and a steady-state border
    // color change — easy to miss if the player wasn't looking at the screen.
    playSound("turnStart");
    triggerHaptic(HAPTIC.MEDIUM);
    document.body.dataset.turnJustArrived = "true";
    window.setTimeout(() => {
      if (document.body.dataset.turnJustArrived === "true") {
        delete document.body.dataset.turnJustArrived;
      }
    }, 850);
  }
  const discardAdvanced = clientState.game && clientState.game.discardCount > previous.discardCount;
  const newLastPlacedCellId = clientState.game?.lastPlacedCellId ?? null;
  const lastMoveChanged =
    clientState.game && newLastPlacedCellId != null && newLastPlacedCellId !== previous.lastPlacedCellId;
  const targetCellAfter = lastMoveChanged ? clientState.game.board[newLastPlacedCellId] : null;
  const previousChipAtTargetCell = lastMoveChanged
    ? previous.boardChips?.[newLastPlacedCellId] ?? null
    : null;
  const placedChip = Boolean(lastMoveChanged && targetCellAfter?.chip);
  const removedChip = Boolean(lastMoveChanged && !targetCellAfter?.chip && previousChipAtTargetCell);
  const confirmedCard = clientState.game?.pendingStep?.card || clientState.game?.discardTopCard || null;
  const confirmedJack = discardAdvanced && confirmedCard?.rank === "J";

  if (placedChip) {
    registerChipPlacementAnim(newLastPlacedCellId);
  } else if (removedChip) {
    registerChipRemovalAnim(newLastPlacedCellId, previousChipAtTargetCell);
  }

  // Canvas-rendered moves are opaque to screen readers — they hear the score totals via
  // updateBoardSummary but never the "what just happened" stream that sighted players see
  // through chip animations. Announce each placement/removal with team + cell card label
  // so the SR experience matches what an aggregate updateBoardSummary alone cannot convey.
  // Suppressed when scoreChanged (the score-change announcement covers it more
  // informatively) and when startedNow (the start announcement is already in flight; rAF
  // would otherwise overwrite it). Announcement uses cell.label (e.g., "K♣") rather than
  // row/col because Sequence's board reads by card label in the rules.
  if (lastMoveChanged && !scoreChanged && !startedNow && targetCellAfter) {
    const team = placedChip ? targetCellAfter.chip : previousChipAtTargetCell;
    const teamName = team === "A" ? "루비" : "코발트";
    const action = placedChip ? "위치에 칩을 놓았습니다" : "칩이 제거되었습니다";
    announcePolite(`${teamName} 팀, ${targetCellAfter.label} ${action}.`);
  }

  if (confirmedJack) {
    playJackFeedback(confirmedCard);
    // Sequence sound + HAPTIC.SEQUENCE fire from registerSequenceCascade above
    // when scoreChanged. Jack-specific feedback still runs here for the jack
    // gesture itself (cut/wild visual + audio).
  } else if (scoreChanged) {
    // Sound + haptic fire from registerSequenceCascade above so the audio is
    // single-sourced with the visual cascade. No duplicate here.
  } else if (discardAdvanced && placedChip) {
    // chipDrop sound + HAPTIC.HEAVY fire at impact via registerChipPlacementAnim
    // above, synced to the landing frame instead of the network event.
  } else if (discardAdvanced) {
    playSound("select");
  }
}

function maybeSendTurnNotification(previous) {
  if (
    !previous ||
    previous.isYourTurn ||
    !isYourTurn() ||
    !clientState.turnNotificationsEnabled ||
    !notificationsSupported() ||
    window.Notification.permission !== "granted" ||
    !document.hidden
  ) {
    return;
  }

  const player = yourPlayer();
  const title = "Sequence Arena";
  const body = player ? `${player.name}님 차례입니다. 보드에서 다음 수를 선택하세요.` : "내 차례입니다.";
  new window.Notification(title, {
    body,
    icon: "./assets/icon.svg",
    tag: `sequence-turn-${clientState.roomCode}`,
  });
}

function updateUrlRoom() {
  const url = new URL(window.location.href);
  if (clientState.roomCode) {
    url.searchParams.set("room", clientState.roomCode);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url);
}

function buildInviteUrl(roomCode = clientState.roomCode, role = "player") {
  // Start from origin + path so utm_*, source=pwa (manifest start_url), or any other query
  // params the current visitor accumulated do not leak into invite links shared with others.
  // Only the two parameters the recipient actually needs (room, role) are appended.
  const inviteUrl = new URL(`${window.location.origin}${window.location.pathname}`);
  if (roomCode) {
    inviteUrl.searchParams.set("room", roomCode);
  }
  if (role === "spectator") {
    inviteUrl.searchParams.set("role", "spectator");
  }
  return inviteUrl.toString();
}

function getInviteRole() {
  return clientState.yourRole === "spectator" ? "spectator" : "player";
}

function isStaticPagesHost() {
  const runtimeMode =
    document.body?.dataset?.runtimeMode || document.documentElement?.dataset?.runtimeMode || "";
  if (runtimeMode === "github-pages") {
    return true;
  }
  if (window.location.hostname.endsWith(".github.io")) {
    return true;
  }
  if (
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    window.location.pathname.startsWith("/sequence-arena/")
  ) {
    return true;
  }
  return false;
}

function isOfflineOnlyRuntime() {
  return !window.location.host || window.location.protocol === "file:" || isStaticPagesHost();
}

function isSoloContext() {
  return isOfflineOnlyRuntime() || clientState.localMode;
}

function formatRetryDelay(ms) {
  if (!ms || ms <= 0) {
    return "곧";
  }
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}초 뒤`;
}

function clearReconnectCountdownTimer() {
  if (clientState.reconnectCountdownTimer) {
    window.clearInterval(clientState.reconnectCountdownTimer);
  }
  clientState.reconnectCountdownTimer = null;
  clientState.reconnectCountdownDeadline = 0;
}

function updateReconnectCountdownUi() {
  if (!refs.offlineText || !refs.offlineBanner || refs.offlineBanner.hidden) {
    clearReconnectCountdownTimer();
    clientState.reconnectDelayMs = 0;
    return;
  }
  if (clientState.socketReady || clientState.reconnectPaused) {
    clearReconnectCountdownTimer();
    return;
  }
  const remaining = Math.max(0, clientState.reconnectCountdownDeadline - Date.now());
  clientState.reconnectDelayMs = remaining;
  const delayLabel = formatRetryDelay(remaining);
  const attempts = clientState.reconnectAttempts || 1;
  const maxAttempts = RECONNECT_MAX_ATTEMPTS;
  refs.connectionIndicator.textContent = `연결 복구 중${
    clientState.reconnectAttempts ? ` (${clientState.reconnectAttempts}회)` : ""
  } · ${delayLabel} 재시도`;
  refs.offlineText.textContent = `연결이 끊겨 재접속을 시도 중입니다 (${attempts}/${maxAttempts}번째). ${delayLabel} 자동 재시도됩니다.`;
  if (remaining <= 0) {
    clearReconnectCountdownTimer();
  }
}

function scheduleReconnectCountdown(delayMs) {
  clearReconnectCountdownTimer();
  clientState.reconnectDelayMs = Number(delayMs) > 0 ? Math.max(0, Number(delayMs)) : 0;
  if (clientState.reconnectDelayMs <= 0) {
    return;
  }
  clientState.reconnectCountdownDeadline = Date.now() + clientState.reconnectDelayMs;
  clientState.reconnectCountdownTimer = window.setInterval(updateReconnectCountdownUi, 1000);
  updateReconnectCountdownUi();
}

function shouldReconnectSavedRoom() {
  const savedRoomCode = normalizeRoomCode(safeLocalStorage.get(STORAGE_KEYS.room) || "");
  return Boolean(savedRoomCode && savedRoomCode === clientState.roomCode && clientState.sessionId);
}

function currentPlayer() {
  if (!clientState.game) {
    return null;
  }
  return clientState.game.players?.find((player) => player.seatIndex === clientState.game.currentSeatIndex) || null;
}

function yourPlayer() {
  if (!clientState.game || clientState.yourSeatIndex == null) {
    return null;
  }
  return clientState.game.players?.find((player) => player.seatIndex === clientState.yourSeatIndex) || null;
}

function yourHand() {
  return clientState.game?.yourHand || [];
}

function selectedCard() {
  return yourHand().find((card) => card.id === clientState.selectedCardId) || null;
}

function isYourTurn() {
  return (
    clientState.game &&
    clientState.game.phase === "playing" &&
    clientState.game.currentSeatIndex === clientState.yourSeatIndex
  );
}

function isPendingForMe(type = "") {
  return Boolean(
    clientState.pendingStep &&
      clientState.pendingStep.seatIndex === clientState.yourSeatIndex &&
      (!type || clientState.pendingStep.type === type)
  );
}

function hasActionTransport() {
  return clientState.localMode || clientState.socketReady;
}

function canChooseCard() {
  return Boolean(hasActionTransport() && isYourTurn() && !clientState.pendingStep);
}

function canUseDiscardPile() {
  return hasActionTransport() && isPendingForMe("discard");
}

function canUseDeckPile() {
  return hasActionTransport() && isPendingForMe("draw");
}

function computeSelectionState() {
  const card = selectedCard();
  const player = yourPlayer();
  if (!card || !player || !canChooseCard()) {
    clientState.legalTargets = [];
    clientState.keyboardBoardIndex = 0;
    stopTargetPulseFrame();
    return;
  }
  const targets = getLegalTargets(clientState.game, card, player.team);
  clientState.legalTargets = targets;
  if (clientState.keyboardBoardIndex >= targets.length) {
    clientState.keyboardBoardIndex = 0;
  }
  if (targets.length > 0) {
    scheduleTargetPulseFrame();
  } else {
    stopTargetPulseFrame();
  }
}

function clearSelection() {
  clientState.selectedCardId = null;
  clientState.legalTargets = [];
  clientState.keyboardBoardIndex = 0;
  stopTargetPulseFrame();
}

function sendSocket(payload) {
  if (clientState.localMode) {
    localSoloRuntime?.handle(payload);
    return;
  }
  if (!clientState.socketReady || !clientState.socket) {
    setFlashMessage("서버 연결을 기다리는 중입니다.");
    return;
  }
  // socketReady can briefly be true while the socket is already in the CLOSING state (the
  // close event fires on the next tick), and ws.send() in that window throws or silently
  // drops the frame depending on the browser. Wrap so a stray click during disconnect does
  // not bubble into the click handler with an unhandled exception.
  try {
    clientState.socket.send(JSON.stringify(payload));
  } catch {
    setFlashMessage("연결이 종료 중입니다. 잠시 후 자동으로 재연결됩니다.");
  }
}

function applyRoomSnapshot(payload) {
  spectatorClosedRecoveryAttempted = false;
  const previousAudioSnapshot = getAudioSnapshot();
  const source = asObject(payload);
  if (!source) {
    return;
  }
  clientState.localMode = Boolean(source.localMode);
  clientState.roomCode = sanitizeRoomCodeCandidate(source.roomCode || "");
  clientState.roomPhase = source.phase || "lobby";
  const seats = normalizeSeats(source.seats);
  clientState.seats = seats;
  const requestedTeamSize = normalizeTeamSize(source.teamSize || 3);
  const requiredPlayers = Number.isFinite(Number(source.requiredPlayers))
    ? Math.max(requestedTeamSize * 2, Math.trunc(Number(source.requiredPlayers)))
    : requestedTeamSize * 2;
  const snapshotYourRole = source.yourRole === "spectator" ? "spectator" : source.yourRole === "player" ? "player" : source.yourSeatIndex == null ? "none" : "player";
  clientState.yourRole = snapshotYourRole;
  clientState.yourSeatIndex =
    snapshotYourRole === "spectator" ? null : clampInt(source.yourSeatIndex, null, 0, Math.max(0, seats.length - 1));
  clientState.teamSize = requestedTeamSize;
  clientState.requiredPlayers = Math.max(requestedTeamSize * 2, Math.max(requiredPlayers, seats.length || requestedTeamSize * 2));
  clientState.occupiedSeats =
    Number.isFinite(Number(source.occupiedSeats)) && source.occupiedSeats >= 0
      ? Math.trunc(Number(source.occupiedSeats))
      : seats.filter((seat) => seat.occupied).length;
  clientState.preferredTeamSize = clientState.teamSize;
  clientState.spectatorCount = Math.max(0, Math.trunc(Number(source.spectatorCount) || 0));
  clientState.spectators = normalizeSpectators(source.spectators);
  clientState.allowSpectators = source.allowSpectators !== false;
  const normalizedBotThinkingSeatIndex = Number.isFinite(Number(source.botThinkingSeatIndex))
    ? Math.trunc(Number(source.botThinkingSeatIndex))
    : null;
  clientState.botDifficulty = normalizeBotDifficulty(source.botDifficulty);
  clientState.rematchMode = normalizeRematchMode(source.rematchMode);
  clientState.rematchVoteSeatIndexes = normalizeRematchVoteSeatIndexes(source.rematchVoteSeatIndexes);
  clientState.rematchRequiredVotes = Math.max(0, Math.trunc(Number(source.rematchRequiredVotes) || 0));
  clientState.maxMatchHistory = normalizeMaxMatchHistory(source.maxMatchHistory);
  clientState.matchHistory = normalizeMatchHistory(source.matchHistory);
  clientState.chatMessages = normalizeChatMessages(source.chatMessages);
  clientState.hostSessionId = source.hostSessionId || null;
  clientState.game = normalizeGameSnapshot(source.game);
  clientState.pendingStep = clientState.game?.pendingStep || null;

  const currentSeat = clientState.game?.currentSeatIndex;
  const activeSeat = Number.isFinite(currentSeat) ? seats.find((seat) => seat.seatIndex === currentSeat) : null;
  clientState.botThinkingSeatIndex =
    clientState.game?.phase === "playing" &&
    clientState.pendingStep == null &&
    (currentSeat == null || normalizedBotThinkingSeatIndex !== currentSeat || !activeSeat?.isBot)
      ? null
      : normalizedBotThinkingSeatIndex;

  clientState.sessionId = source.yourSessionId || clientState.sessionId;
  if (source.systemMessage) {
    setFlashMessage(source.systemMessage);
  }

  saveSessionMeta();
  if (!clientState.localMode) {
    updateUrlRoom();
  }

  const activeHand = yourHand();
  if (!activeHand.some((card) => card.id === clientState.selectedCardId) || !isYourTurn()) {
    clearSelection();
  } else {
    computeSelectionState();
  }
  playSnapshotSound(previousAudioSnapshot);
  render();
  maybeSendTurnNotification(previousAudioSnapshot);
}

function reconnectToSavedRoom() {
  if (!clientState.roomCode || !clientState.sessionId || clientState.reconnectAttempted) {
    return;
  }
  clientState.reconnectAttempted = true;
  sendSocket({
    type: "reconnect_room",
    roomCode: clientState.roomCode,
    sessionId: clientState.sessionId,
  });
}

function maybeAutoJoinSharedRoom() {
  const sharedRoomCode = sanitizeRoomCodeCandidate(urlRoomCode || "");
  const isSpectatorRole = resolveJoinRole() === "spectator";
  const enteredJoinName = String(refs.joinName?.value || "").trim();
  const enteredCreateName = String(refs.createName?.value || "").trim();
  const storedName = safeLocalStorage.get(STORAGE_KEYS.name) || "";
  const hasStoredName = typeof storedName === "string" && storedName.trim().length > 0;
  const rawJoinName = enteredJoinName || enteredCreateName || (hasStoredName ? storedName : "");
  const joinName = rawJoinName ? normalizePlayerName(rawJoinName) : "";
  if (
    !sharedRoomCode ||
    clientState.autoJoinAttempted ||
    !clientState.socketReady ||
    clientState.game ||
    clientState.yourSeatIndex != null
  ) {
    return;
  }

  if (!rawJoinName) {
    clientState.autoJoinAttempted = true;
    if (refs.joinName) {
      refs.joinName.value = "";
    }
    if (refs.joinCode) {
      refs.joinCode.value = sharedRoomCode;
    }
    setFlashMessage(
      isSpectatorRole
        ? `${sharedRoomCode} 방 관전으로 입장하려면 먼저 이름을 입력하세요.`
        : `${sharedRoomCode} 방으로 입장하려면 먼저 이름을 입력하세요.`
    );
    focusInviteJoinForm();
    render();
    return;
  }

  clientState.autoJoinAttempted = true;
  clientState.lastName = joinName;
  if (refs.createName) {
    refs.createName.value = joinName;
  }
  if (refs.joinName) {
    refs.joinName.value = joinName;
  }
  safeLocalStorage.set(STORAGE_KEYS.name, joinName);
  sendSocket({
    type: "join_room",
    name: joinName,
    roomCode: sharedRoomCode,
    sessionId: clientState.sessionId,
    role: resolveJoinRole(),
  });
  setFlashMessage(
    isSpectatorRole
      ? `${sharedRoomCode} 방 관전 입장 시도 중입니다.`
      : `${sharedRoomCode} 방으로 자동 입장 시도 중입니다.`
  );
  render();
}

function getWebSocketCloseLabel(event = {}) {
  const code = typeof event.code === "number" ? event.code : null;
  const reason = typeof event.reason === "string" ? event.reason.trim() : "";
  if (!code) {
    return reason ? `연결이 끊겼습니다. ${reason}` : "연결이 끊겼습니다.";
  }
  if (code === 1000) {
    return "연결이 정상 종료되었습니다. 새로고침으로 다시 시작하세요.";
  }
  if (code === 1001) {
    return "서버가 연결을 종료했습니다. 네트워크를 확인한 뒤 다시 시도하세요.";
  }
  if (code === 1006) {
    return "네트워크 연결이 예기치 않게 끊어졌습니다. 재연결을 시도합니다.";
  }
  if (code === 1011) {
    return "서버 내부 오류로 연결이 종료되었습니다. 잠시 후 다시 시도하세요.";
  }
  return `연결이 예기치 않게 종료되었습니다 (코드 ${code}).${reason ? ` 사유: ${reason}` : ""}`;
}

function connectSocket() {
  if (clientState.localMode) {
    return;
  }
  clientState.reconnectPaused = false;
  clientState.reconnectDelayMs = 0;
  clearReconnectCountdownTimer();
  if (isOfflineOnlyRuntime()) {
    refs.connectionIndicator.textContent = "서버 없음 · 오프라인 솔로 가능";
    setFlashMessage("서버가 없는 정적 실행 환경입니다. 오프라인 솔로로 바로 플레이할 수 있습니다.");
    render();
    return;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  try {
    clientState.socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  } catch {
    clientState.reconnectDelayMs = 0;
    clearReconnectCountdownTimer();
    refs.connectionIndicator.textContent = "서버 없음 · 오프라인 솔로 가능";
    setFlashMessage("실시간 서버에 연결할 수 없습니다. 오프라인 솔로를 사용할 수 있습니다.");
    showOfflineBanner("실시간 서버에 연결할 수 없습니다. 오프라인 솔로로 계속 진행할 수 있습니다.", {
      offline: true,
      buttonLabel: "지금 다시 시도",
      showOfflineFallback: canFallbackToOfflineSolo(),
    });
    render();
    return;
  }

  clientState.socket.addEventListener("open", () => {
    clientState.socketReady = true;
    clientState.reconnectAttempts = 0;
    clientState.reconnectDelayMs = 0;
    clearReconnectCountdownTimer();
    refs.connectionIndicator.textContent = "실시간 연결됨";
    clientState.reconnectPaused = false;
    hideOfflineBanner();
    render();
  });

  clientState.socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      // Corrupted frames can happen with buggy middleboxes or proxies; drop them and keep playing.
      reportClientError("ws-parse-error", error?.message || "invalid server frame", {
        stack: typeof event.data === "string" ? event.data.slice(0, 200) : undefined,
      });
      return;
    }
    if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
      reportClientError("ws-shape-error", "non-object server frame");
      return;
    }

    if (payload.type === "hello") {
      if (!clientState.sessionId) {
        clientState.sessionId = payload.sessionId;
        saveSessionMeta();
      }
      if (payload.protocolVersion != null && payload.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
        warnProtocolMismatch(payload.protocolVersion);
      }
      if (shouldReconnectSavedRoom()) {
        reconnectToSavedRoom();
      } else {
        maybeAutoJoinSharedRoom();
      }
      return;
    }

    if (payload.type === "session_taken_over") {
      // Another tab of this browser claimed the same seat. Show the message but do NOT
      // attempt to reconnect — that would just claim the seat back from the active tab and
      // start a ping-pong. The close handler honours sessionTakenOver to skip backoff.
      setFlashMessage(payload.message || "다른 탭이 좌석을 이어받았습니다.");
      announceAssertive("이 탭의 세션이 다른 탭에 이전되었습니다.");
      clientState.sessionTakenOver = true;
      return;
    }
    if (payload.type === "error") {
      const message = payload.message || "요청을 처리하지 못했습니다.";
      if (message.includes("관전 입장이 닫혀 있습니다") || message.includes("방이 가득 찼고 관전 입장이 닫혀 있습니다")) {
        setJoinRolePreference("player");
        const recoveredRoomCode = normalizeRoomCode(
          refs.joinCode?.value || clientState.roomCode || urlRoomCode || ""
        );
        const recoveredName = normalizePlayerName(
          refs.joinName?.value || safeLocalStorage.get(STORAGE_KEYS.name) || clientState.lastName || ""
        );
        if (
          !spectatorClosedRecoveryAttempted &&
          recoveredRoomCode &&
          recoveredName &&
          clientState.socketReady &&
          clientState.roomCode === "" &&
          clientState.game == null &&
          refs.joinRoomBtn
        ) {
          spectatorClosedRecoveryAttempted = true;
          refs.joinRoomBtn.disabled = true;
          window.setTimeout(() => {
            if (clientState.roomCode === "" && clientState.yourSeatIndex == null) {
              refs.joinRoomBtn.disabled = false;
            }
          }, 1500);
          if (refs.joinName) {
            refs.joinName.value = recoveredName;
          }
          if (refs.joinCode) {
            refs.joinCode.value = recoveredRoomCode;
          }
          setFlashMessage(`${recoveredRoomCode} 방으로 플레이어 재입장 시도 중입니다.`);
          clientState.lastName = recoveredName;
          clientState.roomCode = recoveredRoomCode;
          sendSocket({
            type: "join_room",
            name: recoveredName,
            roomCode: recoveredRoomCode,
            sessionId: clientState.sessionId,
            role: "player",
          });
          render();
          return;
        }
        setFlashMessage("관전 입장이 닫혀 있습니다. 플레이어로 전환해 다시 입장해 주세요.");
        return;
      }
      setFlashMessage(message);
      if (message.includes("채팅")) {
        setChatFeedback(message, "error");
      }
      playSound("error");
      // A non-existent room code in the URL would otherwise auto-rejoin and fail again on
      // every reload — drop the ?room= param so the user lands on the lobby clean.
      if (message.includes("존재하지 않는 방")) {
        clientState.roomCode = "";
        updateUrlRoom();
        render();
        return;
      }
      if (message.includes("재접속")) {
        clientState.roomCode = "";
        clientState.roomPhase = "idle";
        clientState.yourRole = "none";
        clientState.yourSeatIndex = null;
        clientState.teamSize = 3;
        clientState.requiredPlayers = 6;
        clientState.occupiedSeats = 0;
        clientState.spectatorCount = 0;
        clientState.spectators = [];
        clientState.allowSpectators = true;
        clientState.botThinkingSeatIndex = null;
      clientState.rematchMode = "all";
      clientState.rematchVoteSeatIndexes = [];
      clientState.rematchRequiredVotes = 0;
      clientState.matchHistory = [];
      clientState.maxMatchHistory = DEFAULT_MAX_MATCH_HISTORY;
      clientState.game = null;
      clientState.pendingStep = null;
      saveSessionMeta();
        updateUrlRoom();
      }
      render();
      return;
    }

    if (payload.type === "room_snapshot") {
      applyRoomSnapshot(payload);
    }
  });

  clientState.socket.addEventListener("close", (event) => {
    if (clientState.localMode) {
      return;
    }
    clientState.socketReady = false;
    if (clientState.sessionTakenOver) {
      // Another tab took over this seat — do not reconnect, that would just take it back
      // and start a ping-pong. Show a quiet "this tab is dormant" banner state.
      clearReconnectCountdownTimer();
      refs.connectionIndicator.textContent = "다른 탭에서 이어받음";
      showOfflineBanner("이 탭은 현재 비활성 상태입니다. 새로 연결하려면 화면을 새로고침하세요.", {
        reconnectsPaused: true,
        buttonLabel: "재연결",
      });
      render();
      return;
    }
    clientState.reconnectAttempts = Math.min(clientState.reconnectAttempts + 1, 10);
    if (clientState.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      clientState.reconnectPaused = true;
      clientState.reconnectDelayMs = 0;
      clearReconnectCountdownTimer();
      refs.connectionIndicator.textContent = "연결 실패 · 수동 재연결 필요";
      setFlashMessage("연결이 자주 끊겨서 자동 재연결이 중단되었습니다. 지금 다시 시도 버튼을 눌러 수동으로 재연결하세요.");
      const closeMessage = getWebSocketCloseLabel(event);
      showOfflineBanner(`${closeMessage} 지금 다시 시도 버튼으로 한 번 직접 시도해 주세요.`, {
        reconnectsPaused: true,
        buttonLabel: "수동 재연결",
        showOfflineFallback: canFallbackToOfflineSolo(),
      });
      render();
      return;
    }
    // Surface the attempt count so the user has a progress signal — without it, a permanently
    // broken network looks identical to a healthy retry loop and the user can't tell whether
    // to wait or click "지금 다시 시도". `aria-live="polite"` on the indicator means the
    // screen reader announces each attempt change.
    const exponential = RECONNECT_BACKOFF_BASE_MS * Math.pow(2, clientState.reconnectAttempts - 1);
    const capped = Math.min(exponential, RECONNECT_BACKOFF_MAX_MS);
    const jitter = Math.floor(Math.random() * RECONNECT_BACKOFF_JITTER_MS);
    const nextDelay = capped + jitter;
    clientState.reconnectDelayMs = nextDelay;
    refs.connectionIndicator.textContent = `연결 끊김 · 재시도 중 (${clientState.reconnectAttempts}번째)`;
    const closeMessage = getWebSocketCloseLabel(event);
    showOfflineBanner(
      `${closeMessage} 재접속을 시도 중입니다 (${clientState.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS}번째). ${
        formatRetryDelay(nextDelay)
      } 자동 재시도됩니다.`,
      { reconnectsPaused: false, buttonLabel: "지금 다시 시도" }
    );
    scheduleReconnectCountdown(nextDelay);
    render();
    clientState.reconnectTimer = window.setTimeout(connectSocket, nextDelay);
  });
}

function startOfflineSolo() {
  const name = normalizePlayerName(refs.createName?.value || clientState.lastName || "플레이어");
  if (typeof dismissWelcome === "function") {
    dismissWelcome();
  }
  clientState.lastName = name;
  if (refs.createName) {
    refs.createName.value = name;
  }
  safeLocalStorage.set(STORAGE_KEYS.name, name);
  clientState.localMode = true;
  clientState.socketReady = false;
  clientState.reconnectAttempted = false;
  clientState.reconnectAttempts = 0;
  if (clientState.reconnectTimer) {
    window.clearTimeout(clientState.reconnectTimer);
    clientState.reconnectTimer = null;
  }
  if (clientState.socket && clientState.socket.readyState !== WebSocket.CLOSED) {
    try {
      clientState.socket.close();
    } catch {
      // ignore
    }
  }
  clientState.roomCode = "";
  updateUrlRoom();
  localSoloRuntime = new LocalSoloRuntime({
    onSnapshot: applyRoomSnapshot,
  });
  localSoloRuntime.start({
    name,
    sessionId: clientState.sessionId,
    difficulty: clientState.botDifficulty,
  });
  setFlashMessage("오프라인 솔로를 시작했습니다.");
  playSound("tap");
}

function canFallbackToOfflineSolo() {
  if (clientState.localMode) {
    return false;
  }
  if (!clientState.roomCode) {
    return true;
  }
  return clientState.roomPhase !== "playing";
}

function showOfflineBanner(message, options = {}) {
  if (!refs.offlineBanner) return;
  refs.offlineBanner.hidden = false;
  const buttonLabel = typeof options.buttonLabel === "string" ? options.buttonLabel : null;
  const fallbackLabel =
    typeof options.fallbackLabel === "string" ? options.fallbackLabel : "오프라인 솔로로 계속";
  if (buttonLabel && refs.offlineRetryBtn) {
    refs.offlineRetryBtn.textContent = buttonLabel;
  } else if (refs.offlineRetryBtn) {
    refs.offlineRetryBtn.textContent = "지금 다시 시도";
  }
  if (refs.offlineText && typeof message === "string") {
    refs.offlineText.textContent = message;
  } else if (!message && options.message) {
    refs.offlineText.textContent = options.message;
  }
  const isOffline = Boolean(options.offline);
  const isPaused = Boolean(options.reconnectsPaused);
  const state = isOffline ? "offline" : isPaused ? "stalled" : "retrying";
  refs.offlineBanner.setAttribute("data-reconnect-state", state);
  if (refs.offlineFallbackSoloBtn) {
    if (Boolean(options.showOfflineFallback)) {
      refs.offlineFallbackSoloBtn.hidden = false;
      refs.offlineFallbackSoloBtn.textContent = fallbackLabel;
    } else {
      refs.offlineFallbackSoloBtn.hidden = true;
    }
  }
  if (typeof announcePolite === "function") {
    announcePolite(message || "연결이 끊겨 재접속을 시도하고 있습니다.");
  }
}

function hideOfflineBanner() {
  if (!refs.offlineBanner) return;
  refs.offlineBanner.hidden = true;
  refs.offlineBanner.removeAttribute("data-reconnect-state");
  if (refs.offlineFallbackSoloBtn) {
    refs.offlineFallbackSoloBtn.hidden = true;
  }
}

function forceReconnectNow() {
  if (clientState.localMode) {
    return;
  }
  clientState.reconnectPaused = false;
  if (clientState.reconnectTimer) {
    window.clearTimeout(clientState.reconnectTimer);
    clientState.reconnectTimer = null;
  }
  clearReconnectCountdownTimer();
  // User-initiated retry resets the backoff so the next attempt is fast.
  clientState.reconnectDelayMs = 0;
  clientState.reconnectAttempts = 0;
  if (clientState.socket && clientState.socket.readyState !== WebSocket.CLOSED) {
    try {
      clientState.socket.close();
    } catch {
      // ignore
    }
  }
  connectSocket();
}

function handleCreateRoom(event) {
  event.preventDefault();
  if (refs.createRoomBtn?.disabled) return;
  if (typeof dismissWelcome === "function") {
    dismissWelcome();
  }
  if (isOfflineOnlyRuntime()) {
    setFlashMessage("현재 공개 URL은 오프라인 솔로로 바로 플레이할 수 있습니다.");
    render();
    return;
  }
  // Refuse the click outright when the WS is not ready, so the user gets a clear hint
  // instead of clicking an apparently-active button that produces no result.
  if (!clientState.socketReady) {
    setFlashMessage("서버 연결이 끊겼습니다. 잠시 후 자동으로 재연결됩니다.");
    render();
    return;
  }
  const name = sanitizePlayerName(refs.createName?.value || "");
  if (!name) {
    if (refs.createNameHint) {
      refs.createNameHint.textContent = CREATE_NAME_HINT_ERROR;
    }
    refs.createName?.setAttribute("aria-invalid", "true");
    if (refs.createName && typeof refs.createName.focus === "function") {
      refs.createName.focus();
      if (typeof refs.createName.setSelectionRange === "function") {
        refs.createName.setSelectionRange(0, refs.createName.value.length);
      }
    }
    setFlashMessage("방을 만들려면 이름을 입력하세요.");
    render();
    return;
  }
  if (refs.createName) {
    refs.createName.removeAttribute("aria-invalid");
  }
  if (refs.createNameHint) {
    refs.createNameHint.textContent = CREATE_NAME_HINT_DEFAULT;
  }
  if (refs.createRoomBtn) {
    refs.createRoomBtn.disabled = true;
    window.setTimeout(() => {
      if (!clientState.roomCode) {
        refs.createRoomBtn.disabled = false;
      }
    }, 1500);
  }

  clientState.lastName = name;
  safeLocalStorage.set(STORAGE_KEYS.name, name);
  clientState.roomCode = "";
  clientState.roomPhase = "idle";
  clientState.yourRole = "none";
  clientState.yourSeatIndex = null;
  clientState.teamSize = normalizeTeamSize(clientState.preferredTeamSize);
  clientState.requiredPlayers = clientState.teamSize * 2;
  clientState.occupiedSeats = 0;
  clientState.spectatorCount = 0;
  clientState.spectators = [];
  clientState.allowSpectators = true;
  clientState.rematchMode = "all";
  clientState.matchHistory = [];
  clientState.maxMatchHistory = DEFAULT_MAX_MATCH_HISTORY;
  clientState.game = null;
  clientState.pendingStep = null;
  clientState.reconnectAttempted = false;
  saveSessionMeta();
  sendSocket({
    type: "create_room",
    name,
    sessionId: clientState.sessionId,
    teamSize: clientState.preferredTeamSize,
  });
}

function handleJoinRoom(event) {
  event.preventDefault();
  if (refs.joinRoomBtn?.disabled) return;
  if (typeof dismissWelcome === "function") {
    dismissWelcome();
  }
  if (isOfflineOnlyRuntime()) {
    setFlashMessage("멀티플레이 방 입장은 WebSocket 서버가 켜진 주소에서 사용할 수 있습니다.");
    render();
    return;
  }
  if (!clientState.socketReady) {
    setFlashMessage("서버 연결이 끊겼습니다. 잠시 후 자동으로 재연결됩니다.");
    render();
    return;
  }
  const name = sanitizePlayerName(refs.joinName.value);
  const roomCode = normalizeRoomCode(refs.joinCode.value);

  const isNameValid = hasValidJoinName();
  const isCodeValid = hasValidJoinCode();

  if (!isNameValid || !isCodeValid) {
    if (!name && refs.joinName) {
      refs.joinName.setAttribute("aria-invalid", "true");
      if (refs.joinNameHint) {
        refs.joinNameHint.textContent = JOIN_NAME_HINT_ERROR;
      }
      refs.joinName.focus();
      if (typeof refs.joinName.setSelectionRange === "function") {
        refs.joinName.setSelectionRange(0, refs.joinName.value.length);
      }
    } else if (!roomCode && refs.joinCode) {
      refs.joinCode.setAttribute("aria-invalid", "true");
      if (refs.joinCodeHint) {
        refs.joinCodeHint.textContent = JOIN_CODE_HINT_ERROR;
      }
      refs.joinCode.focus();
      if (typeof refs.joinCode.setSelectionRange === "function") {
        refs.joinCode.setSelectionRange(0, refs.joinCode.value.length);
      }
    }
    setFlashMessage("이름과 방 코드를 모두 입력하세요.");
    render();
    return;
  }
  // The input has pattern="[A-Za-z0-9]{4,6}" but our preventDefault() bypasses native form
  // validation, so a short code like "AB" survives normalizeRoomCode (which only caps max
  // length). Catch it here so the user gets immediate feedback matching the hint text
  // instead of a server round-trip + a generic "방 코드 형식이 올바르지 않습니다." error.
  if (roomCode.length < 4) {
    if (refs.joinCode) {
      refs.joinCode.focus();
      if (typeof refs.joinCode.setSelectionRange === "function") {
        refs.joinCode.setSelectionRange(0, refs.joinCode.value.length);
      }
    }
    setFlashMessage("방 코드는 4~6자 영문/숫자여야 합니다.");
    render();
    return;
  }
  if (refs.joinName) {
    refs.joinName.removeAttribute("aria-invalid");
  }
  if (refs.joinNameHint) {
    refs.joinNameHint.textContent = JOIN_NAME_HINT_DEFAULT;
  }

  if (refs.joinRoomBtn) {
    refs.joinRoomBtn.disabled = true;
    window.setTimeout(() => {
      if (clientState.yourRole === "none") {
        refs.joinRoomBtn.disabled = false;
      }
    }, 1500);
  }

  clientState.lastName = name;
  clientState.roomCode = roomCode;
  clientState.yourRole = "none";
  clientState.yourSeatIndex = null;
  clientState.teamSize = 3;
  clientState.requiredPlayers = 6;
  clientState.occupiedSeats = 0;
  clientState.spectatorCount = 0;
  clientState.spectators = [];
  clientState.allowSpectators = true;
  clientState.rematchMode = "all";
  clientState.matchHistory = [];
  clientState.maxMatchHistory = DEFAULT_MAX_MATCH_HISTORY;
  clientState.game = null;
  clientState.pendingStep = null;
  clientState.reconnectAttempted = false;
  saveSessionMeta();
  sendSocket({
    type: "join_room",
    name,
    roomCode,
    sessionId: clientState.sessionId,
    role: resolveJoinRole(),
  });
}

function leaveCurrentRoom() {
  if (!canLeaveRoom()) {
    setFlashMessage(
      clientState.roomPhase === "playing"
        ? "게임 진행 중에는 나가기 버튼을 사용할 수 없습니다. 게임이 끝난 뒤 시도해 주세요."
        : "방을 먼저 입장해야 방 나가기가 가능합니다."
    );
    return;
  }
  if (!clientState.roomCode) {
    return;
  }
  const confirmed = window.confirm("현재 방을 나가서 다시 입장/재입장할 수 있도록 좌석을 비웁니다. 진행할까요?");
  if (!confirmed) {
    return;
  }
  if (refs.leaveRoomBtn) {
    refs.leaveRoomBtn.disabled = true;
  }
  sendSocket({ type: "leave_room" });
  setFlashMessage("방 나가기를 처리하고 있습니다.");
  playSound("tap");
  window.setTimeout(() => {
    if (!clientState.roomCode) {
      return;
    }
    if (refs.leaveRoomBtn) {
      refs.leaveRoomBtn.disabled = !canLeaveRoom();
    }
    if (!canLeaveRoom() && !clientState.game) {
      render();
    }
  }, 1200);
}

function flashCopiedButton(button) {
  if (!button || prefersReducedMotion()) return;
  button.classList.remove("copy-flash");
  button.getBoundingClientRect();
  button.classList.add("copy-flash");
  // Cancel any earlier teardown timer so a rapid second click does not get its flash cut
  // short when an older 1200ms timer fires partway through the new visual.
  if (button.dataset.copyFlashTimer) {
    window.clearTimeout(Number(button.dataset.copyFlashTimer));
  }
  const timerId = window.setTimeout(() => {
    button.classList.remove("copy-flash");
    delete button.dataset.copyFlashTimer;
  }, 1200);
  button.dataset.copyFlashTimer = String(timerId);
}

async function writeToClipboard(text) {
  // Prefer the modern async Clipboard API when available and the page runs on a secure context.
  // The Promise can reject if the browser denies permission (focus lost, in-app webview that
  // blocks clipboard, user cancelled the prompt) — without try/catch the rejection bubbles out
  // of the click handler and the user sees neither success nor a polite fallback.
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Drop through to the execCommand fallback below; many in-app browsers throw here.
    }
  }
  // Fallback: use a hidden textarea + document.execCommand("copy"). Works on http://127.0.0.1 dev
  // and on older Safari / in-app browsers where Clipboard API is blocked.
  let scratch = null;
  try {
    scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "absolute";
    scratch.style.left = "-9999px";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand?.("copy");
    return Boolean(ok);
  } catch {
    return false;
  } finally {
    if (scratch) {
      try {
        document.body.removeChild(scratch);
      } catch {
        // ignore
      }
    }
  }
}

async function copyRoomLink(role = getInviteRole()) {
  if (!clientState.roomCode) {
    setFlashMessage("복사할 방 코드가 아직 없습니다.");
    render();
    return;
  }

  const isSpectatorInvite = role === "spectator";
  const ok = await writeToClipboard(buildInviteUrl(clientState.roomCode, role));
  if (ok) {
    setFlashMessage(isSpectatorInvite ? `관전 전용 링크를 복사했습니다: ${clientState.roomCode}` : `초대 링크를 복사했습니다: ${clientState.roomCode}`);
    flashCopiedButton(refs.copyRoomBtn);
    flashCopiedButton(refs.roomLinkPreview);
    flashCopiedButton(refs.shareRoomBtn);
    playSound("tap");
  } else {
    setFlashMessage(`초대 링크 복사를 지원하지 않는 환경입니다. 방 코드 ${clientState.roomCode}를 직접 공유해 주세요.`);
  }
  render();
}

async function copySpectatorLink() {
  if (!clientState.roomCode) {
    setFlashMessage("복사할 관전 링크가 아직 없습니다.");
    render();
    return;
  }

  const ok = await writeToClipboard(buildInviteUrl(clientState.roomCode, "spectator"));
  if (ok) {
    setFlashMessage(`관전 전용 링크를 복사했습니다: ${clientState.roomCode}`);
    flashCopiedButton(refs.copySpectatorLinkBtn);
    playSound("tap");
  } else {
    setFlashMessage(`관전 링크 복사를 지원하지 않는 환경입니다. 방 코드 ${clientState.roomCode}를 공유해 주세요.`);
  }
  render();
}

async function copyRoomCode(button = null) {
  if (!clientState.roomCode) {
    setFlashMessage("복사할 방 코드가 아직 없습니다.");
    render();
    return;
  }

  const ok = await writeToClipboard(clientState.roomCode);
  if (ok) {
    setFlashMessage(`방 코드 ${clientState.roomCode}를 복사했습니다.`);
    flashCopiedButton(button || refs.copyCodeBtn);
    playSound("tap");
  } else {
    setFlashMessage(`방 코드 ${clientState.roomCode} 복사를 지원하지 않는 환경입니다. 직접 적어주세요.`);
  }
  render();
}

async function shareRoom() {
  if (!clientState.roomCode) {
    setFlashMessage("공유할 방이 아직 없습니다.");
    render();
    return;
  }

  const sharePayload = {
    title: "Sequence Arena 초대",
    text: `방 코드 ${clientState.roomCode}로 들어오세요.`,
    url: buildInviteUrl(undefined, getInviteRole()),
  };

  if (navigator.share) {
    try {
      await navigator.share(sharePayload);
      setFlashMessage(`공유 시트를 열었습니다: ${clientState.roomCode}`);
      flashCopiedButton(refs.shareRoomBtn);
      playSound("tap");
      render();
      return;
    } catch (error) {
      // AbortError = the user dismissed the sheet on purpose; treat as success and skip
      // the clipboard fallback so we do not surprise them with a paste-buffer change.
      if (error && (error.name === "AbortError" || /cancel/i.test(error.message || ""))) {
        return;
      }
      // Anything else (NotAllowedError on permission-blocked share, in-app webview that
      // throws on share, transient platform glitch) — fall through to the clipboard path so
      // the user still gets the invite text instead of a silent failure.
    }
  }

  await copyRoomLink();
}

function toggleSound() {
  clientState.audioMuted = !clientState.audioMuted;
  safeLocalStorage.set(STORAGE_KEYS.soundMuted, String(clientState.audioMuted));
  if (!clientState.audioMuted && clientState.soundVolume === 0) {
    setSoundVolume(70);
    return;
  }
  updateSoundButton();
  updateFeedbackControls();
  if (!clientState.audioMuted) {
    playSound("tap");
  }
}

function setSoundVolume(percent) {
  const next = clamp01(Number(percent) / 100, clientState.soundVolume / 100);
  if (next === (clientState.soundVolume / 100)) {
    return;
  }
  clientState.soundVolume = Math.round(next * 100);
  safeLocalStorage.set(STORAGE_KEYS.soundVolume, String(clientState.soundVolume));
  if (clientState.soundVolume === 0 && !clientState.audioMuted) {
    clientState.audioMuted = true;
    safeLocalStorage.set(STORAGE_KEYS.soundMuted, "true");
    announcePolite("사운드를 껐습니다.");
  } else if (clientState.soundVolume > 0 && clientState.audioMuted) {
    clientState.audioMuted = false;
    safeLocalStorage.set(STORAGE_KEYS.soundMuted, "false");
    announcePolite("사운드를 켰습니다.");
  }
  updateSoundButton();
  updateFeedbackControls();
}

function toggleHaptics() {
  clientState.hapticsMuted = !clientState.hapticsMuted;
  safeLocalStorage.set(STORAGE_KEYS.hapticsMuted, String(clientState.hapticsMuted));
  if (!clientState.hapticsMuted && clientState.hapticsIntensity === 0) {
    setHapticsIntensity(70);
    return;
  }
  updateHapticsButton();
  updateFeedbackControls();
  if (!clientState.hapticsMuted) {
    triggerHaptic([18]);
  }
  announcePolite(clientState.hapticsMuted ? "진동 피드백을 껐습니다." : "진동 피드백을 켰습니다.");
}

function updateHapticsButton() {
  if (!refs.hapticsToggleBtn) return;
  const muted = clientState.hapticsMuted;
  refs.hapticsToggleBtn.textContent = muted ? "◌" : "◉";
  refs.hapticsToggleBtn.setAttribute("aria-pressed", String(!muted));
  refs.hapticsToggleBtn.setAttribute("aria-label", muted ? "진동 피드백 켜기" : "진동 피드백 끄기");
  refs.hapticsToggleBtn.title = muted ? "진동 켜기" : "진동 끄기";
}

function setHapticsIntensity(percent) {
  const next = clamp01(Number(percent) / 100, clientState.hapticsIntensity / 100);
  if (next === clientState.hapticsIntensity / 100) {
    return;
  }
  clientState.hapticsIntensity = Math.round(next * 100);
  safeLocalStorage.set(STORAGE_KEYS.hapticsIntensity, String(clientState.hapticsIntensity));
  if (clientState.hapticsIntensity === 0 && !clientState.hapticsMuted) {
    clientState.hapticsMuted = true;
    safeLocalStorage.set(STORAGE_KEYS.hapticsMuted, "true");
    announcePolite("진동 피드백을 껐습니다.");
  } else if (clientState.hapticsIntensity > 0 && clientState.hapticsMuted) {
    clientState.hapticsMuted = false;
    safeLocalStorage.set(STORAGE_KEYS.hapticsMuted, "false");
    announcePolite("진동 피드백을 켰습니다.");
  }
  updateHapticsButton();
  updateFeedbackControls();
}

function setSelectedCard(cardId) {
  if (!canChooseCard()) {
    return;
  }
  clientState.selectedCardId = clientState.selectedCardId === cardId ? null : cardId;
  playSound(clientState.selectedCardId ? "select" : "tap");
  triggerHaptic(clientState.selectedCardId ? [8] : [5]);
  const index = yourHand().findIndex((card) => card.id === cardId);
  if (index >= 0) {
    clientState.keyboardHandIndex = index;
  }
  computeSelectionState();
  render();
}

function selectFirstUsefulCard() {
  if (!canChooseCard()) {
    return;
  }

  const hand = yourHand();
  if (hand.length === 0) {
    return;
  }

  const team = yourPlayer()?.team;
  let index = hand.findIndex((card) => getLegalTargets(clientState.game, card, team).length > 0);
  if (index === -1) {
    index = 0;
  }
  clientState.keyboardHandIndex = index;
  clientState.selectedCardId = hand[index].id;
  computeSelectionState();
  playSound("select");
  triggerHaptic([8]);
  render();
}

function playFirstAvailableTarget() {
  if (!canChooseCard()) {
    return;
  }

  const card = selectedCard();
  if (!card) {
    selectFirstUsefulCard();
    return;
  }

  if (clientState.legalTargets.length > 0) {
    animateCardToPoint(card.id, pointForBoardCell(clientState.legalTargets[0]), "board");
    if (!playJackFeedback(card)) {
      playSound("tap");
    }
    sendSocket({
      type: "play_card",
      cardId: card.id,
      targetCellId: clientState.legalTargets[0],
    });
    return;
  }

  if (card.action === "normal") {
    animateCardToElement(card.id, refs.discardPileBtn, "discard");
    playSound("tap");
    sendSocket({
      type: "discard_dead",
      cardId: card.id,
    });
  }
}

function discardToPile() {
  if (!canUseDiscardPile()) {
    return;
  }
  triggerPileMotion(refs.discardPileBtn);
  playSound("place");
  triggerHaptic([10, 18]);
  sendSocket({ type: "discard_to_pile" });
}

function drawFromDeck() {
  if (!canUseDeckPile()) {
    return;
  }
  triggerPileMotion(refs.deckPileBtn);
  playSound("select");
  triggerHaptic([8, 18, 8]);
  sendSocket({ type: "draw_from_deck" });
}

function cardButtonById(cardId) {
  return refs.handContainer.querySelector(`[data-card-id="${cardId}"]`);
}

function pointForElementCenter(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function pointForBoardCell(cellId) {
  const box = canvas.getBoundingClientRect();
  const cellSize = box.width / BOARD_SIZE;
  const row = Math.floor(cellId / BOARD_SIZE);
  const col = cellId % BOARD_SIZE;
  return {
    x: box.left + col * cellSize + cellSize / 2,
    y: box.top + row * cellSize + cellSize / 2,
  };
}

function triggerPileMotion(element) {
  if (!element || prefersReducedMotion()) {
    return;
  }
  element.classList.remove("stack-motion");
  element.getBoundingClientRect();
  element.classList.add("stack-motion");
  window.setTimeout(() => element.classList.remove("stack-motion"), 520);
}

function animateCardToPoint(cardId, targetPoint, mode = "board") {
  const source = cardButtonById(cardId);
  if (!source || !targetPoint || prefersReducedMotion()) {
    return;
  }

  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true);
  const deltaX = targetPoint.x - (rect.left + rect.width / 2);
  const deltaY = targetPoint.y - (rect.top + rect.height / 2);
  clone.classList.add("card-flight", `to-${mode}`);
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.setProperty("--flight-x", `${deltaX}px`);
  clone.style.setProperty("--flight-y", `${deltaY}px`);
  clone.style.setProperty("--flight-mid-x", `${deltaX * 0.46}px`);
  clone.style.setProperty("--flight-mid-y", `${deltaY * 0.46 - 96}px`);
  clone.style.setProperty("--flight-touch-x", `${deltaX * 0.9}px`);
  clone.style.setProperty("--flight-touch-y", `${deltaY * 0.9 - 12}px`);
  document.body.appendChild(clone);

  window.setTimeout(() => clone.remove(), CARD_FLIGHT_MS + 80);
}

function animateCardToElement(cardId, element, mode = "pile") {
  if (!element) {
    return;
  }
  animateCardToPoint(cardId, pointForElementCenter(element), mode);
  triggerPileMotion(element);
}

// Cache the MediaQueryList rather than re-querying each call. matchMedia is cheap (~µs) but
// the cached form lets every motion site funnel through one signal — easier to grep, easier
// to swap to an event-driven model later if a feature ever needs to react to a live OS-level
// reduced-motion toggle. The stale-fallback branch returns a synthetic { matches: false } so
// the helper still works in non-browser test runners that lack matchMedia.
const REDUCED_MOTION_QUERY =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

function prefersReducedMotion() {
  return REDUCED_MOTION_QUERY.matches === true;
}

function triggerScoreFlash(teamClass) {
  const row = document.querySelector(`.score-row.${teamClass}`);
  if (!row || prefersReducedMotion()) {
    return;
  }
  row.classList.remove("score-flash");
  row.getBoundingClientRect();
  row.classList.add("score-flash");
  window.setTimeout(() => row.classList.remove("score-flash"), 1200);
}

function registerChipPlacementAnim(cellId) {
  if (cellId == null) return;
  // Sound + haptic fire at the IMPACT moment (~70% into the animation, when the
  // chip lands on the board), not at click time. This decouples the audible
  // "thud" from the network round-trip and makes the chip feel like it weighs
  // something — the player hears it land, not click. For reduced-motion users
  // the animation is skipped but the audio/haptic still play immediately.
  const reducedMotion = prefersReducedMotion();
  const impactDelay = reducedMotion ? 0 : CHIP_PLACE_ANIM_MS * 0.7;
  window.setTimeout(() => {
    playSound("chipDrop");
    triggerHaptic(HAPTIC.HEAVY);
  }, impactDelay);
  if (reducedMotion) {
    return;
  }
  clientState.chipPlacementAnim = {
    cellId,
    startedAt: performance.now(),
  };
  scheduleChipAnimFrame();
}

function registerChipRemovalAnim(cellId, team) {
  if (cellId == null || !team || prefersReducedMotion()) {
    return;
  }
  clientState.chipRemovalAnim = {
    cellId,
    team,
    startedAt: performance.now(),
  };
  scheduleChipAnimFrame();
}

function scheduleChipAnimFrame() {
  if (chipAnimFrameId != null) {
    return;
  }
  chipAnimFrameId = window.requestAnimationFrame(() => {
    chipAnimFrameId = null;
    const place = clientState.chipPlacementAnim;
    const remove = clientState.chipRemovalAnim;
    const cascade = clientState.sequenceCascade;
    const wash = clientState.victoryWash;
    if (!place && !remove && !cascade && !wash) {
      return;
    }
    const now = performance.now();
    if (place && now - place.startedAt >= CHIP_PLACE_ANIM_MS) {
      clientState.chipPlacementAnim = null;
    }
    if (remove && now - remove.startedAt >= CHIP_REMOVE_ANIM_MS) {
      clientState.chipRemovalAnim = null;
    }
    if (cascade && now - cascade.startedAt >= SEQUENCE_CASCADE_MS) {
      clientState.sequenceCascade = null;
    }
    if (wash && now - wash.startedAt >= VICTORY_WASH_MS) {
      clientState.victoryWash = null;
    }
    drawBoard();
    if (
      clientState.chipPlacementAnim ||
      clientState.chipRemovalAnim ||
      clientState.sequenceCascade ||
      clientState.victoryWash
    ) {
      scheduleChipAnimFrame();
    }
  });
}

function registerSequenceCascade(cells, team) {
  if (!Array.isArray(cells) || cells.length === 0 || !team) {
    return;
  }
  // Sound + haptic fire regardless of reduced-motion (they're not visually disturbing
  // and they're the most-important game audio cue). Visual cascade is the part that
  // skips for reduced-motion users — score-row flash already covers that branch.
  playSound("sequence");
  triggerHaptic(HAPTIC.SEQUENCE);
  if (prefersReducedMotion()) {
    return;
  }
  clientState.sequenceCascade = {
    cells: [...cells],
    team,
    startedAt: performance.now(),
  };
  scheduleChipAnimFrame();
}

function registerVictoryWash(team) {
  if (!team) return;
  // Sound + haptic are fired by the caller (playSnapshotSound branch) so they always run
  // even under reduced-motion. This function is purely the canvas wash visual.
  if (prefersReducedMotion()) return;
  clientState.victoryWash = {
    team,
    startedAt: performance.now(),
  };
  scheduleChipAnimFrame();
}

function scheduleTargetPulseFrame() {
  if (prefersReducedMotion() || targetPulseFrameId != null || !clientState.selectedCardId || clientState.legalTargets.length === 0) {
    return;
  }
  targetPulseFrameId = window.requestAnimationFrame(() => {
    targetPulseFrameId = null;
    if (clientState.selectedCardId && clientState.legalTargets.length > 0) {
      drawBoard();
      scheduleTargetPulseFrame();
    }
  });
}

function stopTargetPulseFrame() {
  if (targetPulseFrameId != null) {
    window.cancelAnimationFrame(targetPulseFrameId);
    targetPulseFrameId = null;
  }
}

function renderSeatCards() {
  refs.seatGrid.replaceChildren();
  const totalSeats = displayRequiredPlayerCount();
  const seats = clientState.seats.length
    ? clientState.seats
    : Array.from({ length: totalSeats }, (_, seatIndex) => ({
        seatIndex,
        team: seatIndex % 2 === 0 ? "A" : "B",
        teamName: TEAM_META[seatIndex % 2 === 0 ? "A" : "B"].name,
        occupied: false,
        connected: false,
        name: "",
      }));

  const currentSeatIndex = clientState.game?.currentSeatIndex;
  const isPlayingPhase = clientState.game?.phase === "playing" && !clientState.game?.winner;
  for (const seat of seats) {
    const teamName = TEAM_LABELS[seat.team] || seat.teamName;
    const article = document.createElement("article");
    article.className = `seat-card ${seat.team === "A" ? "ruby" : "cobalt"}`;
    if (seat.seatIndex === clientState.yourSeatIndex) {
      article.classList.add("you");
    }
    if (seat.seatIndex === clientState.botThinkingSeatIndex) {
      article.classList.add("thinking");
    }
    // aria-current="true" exposes "this seat is taking its turn right now" to assistive
    // tech without forcing a focus change. The visual ".thinking" / board-canvas highlight
    // covers sighted users; this covers everyone else. Only set during the playing phase
    // (lobby/finished have no meaningful "current" seat).
    if (isPlayingPhase && seat.seatIndex === currentSeatIndex) {
      article.setAttribute("aria-current", "true");
    }

    const isThinking = seat.seatIndex === clientState.botThinkingSeatIndex;
    const statusClass = isThinking ? "thinking" : seat.isBot ? "bot" : seat.connected ? "online" : seat.occupied ? "offline" : "";
    const statusLabel = isThinking ? "생각 중" : seat.isBot ? "자동 플레이" : seat.connected ? "온라인" : seat.occupied ? "오프라인" : "빈 좌석";

    const title = document.createElement("div");
    title.className = "seat-title";
    const seatLabel = document.createElement("span");
    seatLabel.textContent = `${seat.seatIndex + 1}번 좌석`;
    const teamLabelEl = document.createElement("span");
    teamLabelEl.textContent = teamName;
    title.append(seatLabel, teamLabelEl);

    const nameEl = document.createElement("strong");
    nameEl.textContent = seat.name || "대기 중";

    const statusEl = document.createElement("span");
    statusEl.className = `seat-status ${statusClass}`;
    statusEl.textContent = statusLabel;

    article.append(title, nameEl, statusEl);
    refs.seatGrid.appendChild(article);
  }
}

function cardActionLabel(card) {
  if (card.action === "placeWild") {
    return "와일드 잭";
  }
  if (card.action === "remove") {
    return "제거 잭";
  }
  return "일반 카드";
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

const COURT_RANKS = new Set(["J", "Q", "K"]);

function pipLayoutForRank(rank) {
  return CARD_PIP_LAYOUTS[rank] || [];
}

// Build the card face as a DOM element rather than an HTML string. Every textual field uses
// textContent so a future change that lets a card label flow from user input cannot smuggle
// HTML, and the inline pip positioning that used to live in a `style="..."` attribute is now
// applied via style.setProperty() — both safer under strict CSP/Trusted Types.
function buildCardFace(card, colorClass) {
  const face = document.createElement("span");
  face.setAttribute("aria-hidden", "true");

  if (card.rank === "J") {
    const isWild = card.action === "placeWild";
    face.className = `card-face jack ${colorClass}`;
    const frame = document.createElement("span");
    frame.className = "jack-frame";
    const crown = document.createElement("span");
    crown.className = "jack-crown";
    crown.textContent = card.suit;
    const j = document.createElement("strong");
    j.textContent = "J";
    const sigil = document.createElement("span");
    sigil.className = "jack-sigil";
    sigil.textContent = isWild ? "★" : "✕";
    const title = document.createElement("small");
    title.textContent = isWild ? "WILD" : "CUT";
    frame.append(crown, j, sigil, title);
    face.appendChild(frame);
    return face;
  }

  if (COURT_RANKS.has(card.rank)) {
    face.className = `card-face court ${colorClass}`;
    const frame = document.createElement("span");
    frame.className = "court-frame";
    // Iconic chess-piece glyph — matches the canvas board's court face so the hand
    // and the board share the same "this is a royal" visual cue (K=♔ Q=♕ J=♘).
    const icon = document.createElement("span");
    icon.className = "court-icon";
    icon.textContent = card.rank === "K" ? "♔" : card.rank === "Q" ? "♕" : "♘";
    const rank = document.createElement("strong");
    rank.textContent = card.rank;
    const bottom = document.createElement("span");
    bottom.className = "court-band bottom";
    bottom.textContent = card.suit;
    frame.append(icon, rank, bottom);
    face.appendChild(frame);
    return face;
  }

  face.className = `card-face ${colorClass}`;
  for (const pip of pipLayoutForRank(card.rank)) {
    const span = document.createElement("span");
    span.className = "face-pip";
    span.textContent = card.suit;
    span.style.setProperty("--pip-x", `${pip.x}%`);
    span.style.setProperty("--pip-y", `${pip.y}%`);
    span.style.setProperty("--pip-rotate", pip.flip ? "180deg" : "0deg");
    span.style.setProperty("--pip-scale", String(pip.scale || 1));
    face.appendChild(span);
  }
  return face;
}

// Build a hand placeholder card via DOM API instead of innerHTML — keeps the strict CSP
// (require-trusted-types-for 'script') boundary clean and removes any chance of HTML
// interpolation accidentally embedding user-derived strings.
function buildHandPlaceholder(className, title, body) {
  const div = document.createElement("div");
  div.className = className;
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = body;
  div.appendChild(strong);
  div.appendChild(span);
  return div;
}

function renderHand() {
  refs.handContainer.replaceChildren();
  const hand = yourHand();

  if (!clientState.roomCode) {
    refs.handContainer.appendChild(buildHandPlaceholder("card-hidden", "방 미접속", "먼저 방을 만들거나 입장하세요."));
    return;
  }

  if (!clientState.game) {
    refs.handContainer.appendChild(
      buildHandPlaceholder("card-hidden", "게임 대기", `${requiredPlayerCount()}명이 모두 입장하면 손패가 배분됩니다.`)
    );
    return;
  }

  if (clientState.yourRole === "spectator") {
    refs.handContainer.appendChild(
      buildHandPlaceholder(
        "card-hidden spectator-hand",
        "관전 모드",
        "플레이어 손패는 비공개이며 보드와 로그만 실시간으로 볼 수 있습니다."
      )
    );
    return;
  }

  if (hand.length === 0) {
    refs.handContainer.appendChild(
      buildHandPlaceholder("card-hidden", "손패 없음", "당신 좌석의 패 정보가 아직 준비되지 않았습니다.")
    );
    return;
  }

  hand.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-button";
    button.dataset.action = card.action;
    button.dataset.cardId = String(card.id);
    button.dataset.rank = card.rank;
    button.dataset.suit = card.suit;
    if (clientState.selectedCardId === card.id) {
      button.classList.add("selected");
    }
    if (index === clientState.keyboardHandIndex) {
      button.classList.add("focused");
    }
    button.disabled = !canChooseCard();
    button.addEventListener("click", () => setSelectedCard(card.id));

    const targets = getLegalTargets(clientState.game, card, yourPlayer()?.team);
    const deadBadge = card.action === "normal" && targets.length === 0 ? " · 죽은 카드" : "";
    const colorClass = card.isRed ? "red" : "black";
    button.append(
      buildCardCorner("card-corner top", colorClass, card.rank, card.suit),
      buildCardFace(card, colorClass),
      buildCardCorner("card-corner bottom", colorClass, card.rank, card.suit),
      buildCardLabel("card-targets", String(targets.length)),
      buildCardLabel("card-action", `${cardActionLabel(card)}${deadBadge}`),
      buildCardLabel("card-note", card.note)
    );
    refs.handContainer.appendChild(button);
  });
}

// Build a card corner badge (rank + suit) via DOM API. Same shape as the previous template
// literal — every text field goes through textContent so even a typo in the data structure
// cannot inject markup.
function buildCardCorner(baseClass, colorClass, rank, suit) {
  const span = document.createElement("span");
  span.className = `${baseClass} ${colorClass}`;
  const rankEl = document.createElement("strong");
  rankEl.textContent = rank;
  const suitEl = document.createElement("small");
  suitEl.textContent = suit;
  span.append(rankEl, suitEl);
  return span;
}

function buildCardLabel(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function formatHistoryTime(value) {
  if (!value) {
    return "방금";
  }
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "방금";
  }
}

function formatMatchDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
}

function normalizeMatchHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }
  return rawHistory
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const winner = entry.winner === "A" || entry.winner === "B" ? entry.winner : null;
      if (!winner) {
        return null;
      }
      const scoreA = Number(entry.scores?.A);
      const scoreB = Number(entry.scores?.B);
      const winnerName = typeof entry.winnerName === "string" ? entry.winnerName.trim() : "";
      const rawMode = typeof entry.mode === "string" ? entry.mode.trim() : "";
      const finishedAt = typeof entry.finishedAt === "string" ? entry.finishedAt : "";
      const durationMs = Number(entry.durationMs);
      const matchNumber = Number(entry.matchNumber);
      return {
        winner,
        winnerName,
        matchNumber: Number.isFinite(matchNumber) ? matchNumber : index + 1,
        scores: {
          A: Number.isFinite(scoreA) ? Math.max(0, Math.round(scoreA)) : 0,
          B: Number.isFinite(scoreB) ? Math.max(0, Math.round(scoreB)) : 0,
        },
        mode: rawMode || "multiplayer",
        finishedAt,
        durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.max(0, Math.round(durationMs)) : 0,
      };
    })
    .filter(Boolean);
}

function normalizeMaxMatchHistory(rawMaxMatchHistory) {
  const parsed = Number(rawMaxMatchHistory);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_MATCH_HISTORY;
  }
  const normalized = Math.max(1, Math.trunc(parsed));
  return Math.min(normalized, 200);
}

function getHistoryStreak(history) {
  const firstWinner = history[0]?.winner;
  if (!firstWinner) return { winner: null, count: 0 };
  let count = 0;
  for (const record of history) {
    if (record.winner !== firstWinner) break;
    count += 1;
  }
  return { winner: firstWinner, count };
}

function buildHistoryStat(label, value, className = "") {
  const stat = document.createElement("span");
  stat.className = `history-stat ${className}`.trim();
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.textContent = value;
  stat.append(labelEl, valueEl);
  return stat;
}

function buildHistoryMeta(text, className = "") {
  const meta = document.createElement("span");
  meta.className = `history-meta-chip ${className}`.trim();
  meta.textContent = text;
  return meta;
}

function buildEmptyState(tagName, className, icon, title, body, action = null) {
  const empty = document.createElement(tagName);
  empty.className = `empty-state ${className}`.trim();
  const mark = document.createElement("span");
  mark.className = "empty-state-mark";
  mark.textContent = icon;
  const copy = document.createElement("span");
  copy.className = "empty-state-copy";
  const heading = document.createElement("strong");
  heading.className = "empty-state-title";
  heading.textContent = title;
  const detail = document.createElement("span");
  detail.className = "empty-state-body";
  detail.textContent = body;
  copy.append(heading, detail);
  const actions = Array.isArray(action) ? action : action ? [action] : [];
  const visibleActions = actions.filter((entry) => entry && typeof entry.label === "string");
  if (visibleActions.length > 0) {
    const actionGroup = document.createElement("div");
    actionGroup.className = "empty-state-actions";
    for (const currentAction of visibleActions) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = currentAction.className || "ghost-button empty-state-action";
      actionButton.textContent = currentAction.label;
      actionButton.disabled = Boolean(currentAction.disabled);
      if (currentAction.title) {
        actionButton.title = currentAction.title;
      }
      if (typeof currentAction.onAction === "function") {
        actionButton.addEventListener("click", () => {
          if (actionButton.disabled) {
            return;
          }
          try {
            void Promise.resolve(currentAction.onAction(actionButton));
          } catch {
            setFlashMessage("실행할 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
            render();
          }
        });
      }
      actionGroup.append(actionButton);
    }
    copy.append(actionGroup);
  }
  empty.append(mark, copy);
  return empty;
}

function renderHistory() {
  refs.historyList.replaceChildren();
  const total = clientState.matchHistory.length;
  const visibleHistory = clientState.matchHistory.slice(0, HISTORY_RENDER_LIMIT);
  const visibleCount = visibleHistory.length;
  const maxMatchHistory = clientState.maxMatchHistory || DEFAULT_MAX_MATCH_HISTORY;
  const rubyWins = clientState.matchHistory.filter((record) => record.winner === "A").length;
  const cobaltWins = clientState.matchHistory.filter((record) => record.winner === "B").length;
  const rubyRate = total ? Math.round((rubyWins / total) * 100) : 0;
  const cobaltRate = total ? Math.round((cobaltWins / total) * 100) : 0;
  refs.historySummary.replaceChildren();

  if (clientState.matchHistory.length === 0) {
    const soloHintContext = isSoloContext();
    const historyAction = soloHintContext
      ? {
          label: "바로 솔로 시작",
          title: "오프라인에서 바로 솔로 게임을 시작합니다.",
          onAction: () => startOfflineSolo(),
        }
      : clientState.roomCode
        ? {
            label: "승리 규칙 보기",
            title: "승리 조건과 규칙을 확인해 다음 액션을 이해하세요.",
            onAction: () => openHelpModal(),
          }
        : {
            label: "방 입장하기",
            title: "방을 만들거나 코드로 입장하면 기록이 쌓이기 시작합니다.",
            onAction: () => {
              focusGatewayPrimaryInput();
            },
          };
    refs.historySummary.append(
      buildHistoryStat("최근", "0경기"),
      buildHistoryStat("승률", "대기 중"),
      buildHistoryStat("흐름", "첫 판 전")
    );
    refs.historySummary.setAttribute("aria-label", "아직 완료된 경기 기록이 없습니다.");
    refs.historyList.appendChild(
      buildEmptyState(
        "li",
        "history-empty",
        "★",
        "완료된 경기 없음",
        "첫 경기가 끝나면 승리 팀, 점수, 소요 시간이 여기에 남습니다.",
        historyAction
      )
    );
    return;
  }

  const streak = getHistoryStreak(clientState.matchHistory);
  const streakLabel =
    streak.count >= 2 && streak.winner
      ? `${TEAM_LABELS[streak.winner] || "승리 팀"} ${streak.count}연승`
      : "접전";
  refs.historySummary.append(
    buildHistoryStat("최근", `${total}경기`),
    buildHistoryStat("루비", `${rubyRate}%`, "ruby"),
    buildHistoryStat("코발트", `${cobaltRate}%`, "cobalt"),
    buildHistoryStat("흐름", streakLabel, streak.winner === "A" ? "ruby" : streak.winner === "B" ? "cobalt" : "")
  );
  refs.historySummary.setAttribute(
    "aria-label",
    `최근 ${total}경기, 루비 ${rubyRate}퍼센트, 코발트 ${cobaltRate}퍼센트, ${streakLabel}`
  );

  for (const [index, record] of visibleHistory.entries()) {
    const item = document.createElement("li");
    item.className = `history-item ${record.winner === "A" ? "ruby" : "cobalt"}${index === 0 ? " latest" : ""}`;

    const head = document.createElement("div");
    head.className = "history-item-head";
    const headline = document.createElement("strong");
    headline.textContent = `${TEAM_LABELS[record.winner] || record.winnerName || "승리 팀"} 승리`;
    const score = document.createElement("span");
    score.className = "history-score";
    score.textContent = `${record.scores?.A ?? 0} : ${record.scores?.B ?? 0}`;
    head.append(headline, score);

    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    const mode =
      record.testMode === "solo" ? `혼자 테스트 · ${BOT_MODE_LABELS[record.botDifficulty] || "전략"}` : "멀티플레이";
    meta.append(
      buildHistoryMeta(index === 0 ? "최근 경기" : `#${record.matchNumber}`, index === 0 ? "latest" : ""),
      buildHistoryMeta(formatHistoryTime(record.finishedAt)),
      buildHistoryMeta(mode)
    );
    const duration = formatMatchDuration(record.durationMs);
    if (duration) {
      meta.appendChild(buildHistoryMeta(duration, "duration"));
    }

    item.append(head, meta);
    refs.historyList.appendChild(item);
  }

  if (total > HISTORY_RENDER_LIMIT) {
    const trimNotice = document.createElement("li");
    trimNotice.className = "history-trim-notice";
    trimNotice.textContent = `총 ${total}경기 중 최근 ${Math.min(total, visibleCount)}개만 표시됩니다 · 보존 정책: 최대 ${maxMatchHistory}경기`;
    refs.historyList.appendChild(trimNotice);
  }
}

function renderSpectators() {
  refs.spectatorList.replaceChildren();
  refs.spectatorSummary.textContent =
    clientState.spectatorCount > 0
      ? `${clientState.spectatorCount}명 관전 중 · ${clientState.allowSpectators ? "입장 열림" : "입장 닫힘"}`
      : clientState.allowSpectators
        ? "현재 관전자 없음"
        : "관전 입장 닫힘";

  if (clientState.spectators.length === 0) {
    const spectatorCount = occupiedSeatCount();
    const canCopySpectatorInvite = Boolean(clientState.roomCode && !clientState.localMode);
    const spectatorAction =
      !clientState.allowSpectators || !canCopySpectatorInvite
        ? {
            label: isHost() ? "관전 입장 열기" : "관전 입장 닫힘",
            disabled: !isHost() || !canCopySpectatorInvite,
            title: isHost()
              ? "관전 입장을 다시 열어 관전자를 받을 수 있습니다."
              : "방장만 관전 입장을 열 수 있습니다.",
            onAction: async () => {
              if (!isHost()) {
                setFlashMessage("방장만 관전 입장을 열 수 있습니다.");
                return;
              }
              setRoomSettings({ allowSpectators: true });
            },
          }
        : {
            label: "관전 링크 복사",
            title: `${clientState.roomCode} 방 관전 링크를 복사합니다`,
            disabled: !clientState.roomCode || clientState.localMode || !clientState.allowSpectators,
            onAction: async () => {
              await copySpectatorLink();
            },
          };
    refs.spectatorList.appendChild(
      clientState.allowSpectators
        ? buildEmptyState(
            "div",
            "spectator-empty",
            "◎",
            "관전자 없음",
            spectatorCount >= (displayRequiredPlayerCount() || 6)
              ? "관전 링크를 공유하면 친구도 실시간으로 보드를 볼 수 있습니다."
              : "방 인원이 더 들어오면 관전자도 동시에 볼 수 있습니다.",
            spectatorAction
          )
        : buildEmptyState(
            "div",
            "spectator-empty",
            "×",
            "관전 입장 닫힘",
            "방장 설정에서 관전 입장을 다시 열면 친구가 즉시 볼 수 있습니다.",
            spectatorAction
          )
    );
    return;
  }

  for (const spectator of clientState.spectators) {
    const item = document.createElement("article");
    item.className = `spectator-item ${spectator.connected ? "online" : "offline"}`;

    const name = document.createElement("strong");
    name.textContent = spectator.name || "관전자";

    const meta = document.createElement("span");
    meta.className = "spectator-meta";
    meta.textContent = `${spectator.connected ? "온라인" : "오프라인"} · 입장 ${formatHistoryTime(spectator.joinedAt)}`;

    item.append(name, meta);
    refs.spectatorList.appendChild(item);
  }
}

function renderChat() {
  if (!refs.chatLog) return;
  refs.chatLog.replaceChildren();
  if (!clientState.chatMessages.length) {
    const hasGateway = Boolean(refs.createName || refs.joinName);
    const chatOfflineContext = isSoloContext();
    const chatAction = clientState.roomCode && !clientState.localMode
      ? {
          label: "첫 메시지 쓰기",
          title: "채팅 입력창으로 이동해 첫 메시지를 남겨보세요.",
          onAction: () => {
            if (!refs.chatInput) return;
            refs.chatInput.focus();
            refs.chatInput.value = "";
          },
        }
      : {
          label: chatOfflineContext ? "채팅은 멀티에서만 가능" : "방 입장하기",
          disabled: chatOfflineContext || !hasGateway,
          title: chatOfflineContext
            ? "솔로 진행 중에는 채팅이 비활성입니다."
            : "방에 입장하면 채팅이 활성화됩니다.",
          onAction: () => {
            if (chatOfflineContext || !hasGateway) {
              return;
            }
            focusGatewayPrimaryInput();
          },
        };
    refs.chatLog.appendChild(
      buildEmptyState(
        "div",
        "chat-empty",
        "!",
        "첫 메시지 대기 중",
        "이모지나 짧은 응원으로 같은 방 사람들과 흐름을 공유하세요.",
        chatAction
      )
    );
    return;
  }
  for (const entry of clientState.chatMessages) {
    const item = document.createElement("p");
    item.className = "chat-line";
    const author = document.createElement("strong");
    author.textContent = `${entry.author || "익명"}:`;
    const text = document.createElement("span");
    text.textContent = entry.text || "";
    item.append(author, text);
    refs.chatLog.appendChild(item);
  }
  refs.chatLog.scrollTop = refs.chatLog.scrollHeight;
}

function getChatSendCooldownMs() {
  return Math.max(0, clientState.chatCooldownUntil - Date.now());
}

function normalizeChatText(rawText) {
  return String(rawText || "").slice(0, CHAT_MAX_LENGTH).trim().replace(/\s+/g, " ");
}

function setChatFeedback(message, status = "info") {
  if (!refs.chatFeedback) return;
  const safe = typeof message === "string" ? message : "";
  const text = safe.trim();
  if (!text) {
    refs.chatFeedback.textContent = "";
    refs.chatFeedback.dataset.status = "hidden";
    return;
  }
  if (clientState.chatFeedbackTimer) {
    window.clearTimeout(clientState.chatFeedbackTimer);
    clientState.chatFeedbackTimer = null;
  }
  refs.chatFeedback.textContent = text;
  refs.chatFeedback.dataset.status = status;
  clientState.chatFeedbackTimer = window.setTimeout(() => {
    if (!refs.chatFeedback) return;
    refs.chatFeedback.textContent = "";
    refs.chatFeedback.dataset.status = "hidden";
    clientState.chatFeedbackTimer = null;
  }, CHAT_FEEDBACK_MS);
}

function updateChatUi() {
  if (!refs.chatInput || !refs.chatSendBtn || !refs.chatCharCount) return;
  const text = refs.chatInput.value || "";
  const length = text.length;
  const cooldownMs = getChatSendCooldownMs();
  const hasRoom = Boolean(clientState.roomCode && !clientState.localMode);
  const hasText = text.trim().length > 0;
  refs.chatCharCount.textContent = `${length} / ${CHAT_MAX_LENGTH}`;
  refs.chatSendBtn.disabled = !hasRoom || !hasText || cooldownMs > 0;
  if (!hasRoom) {
    setChatFeedback("채팅은 멀티 방에서만 가능합니다.", "info");
  } else if (hasText) {
    setChatFeedback("", "hidden");
  }
  refs.chatCharCount.setAttribute(
    "data-status",
    cooldownMs > 0 ? `cooldown-${Math.max(1, Math.ceil(cooldownMs / 100))}` : "ready"
  );
  if (clientState.chatCooldownTimer) {
    window.clearTimeout(clientState.chatCooldownTimer);
    clientState.chatCooldownTimer = null;
  }
  if (cooldownMs > 0) {
    const timerId = window.setTimeout(() => {
      clientState.chatCooldownTimer = null;
      updateChatUi();
    }, 100);
    clientState.chatCooldownTimer = timerId;
  }
}

function renderPileActions() {
  const topCard = clientState.game?.discardTopCard;
  refs.discardTopCard.textContent = topCard ? topCard.label : "비어 있음";
  refs.discardPileBtn.classList.toggle("has-card", Boolean(topCard));
  refs.discardPileBtn.classList.toggle("red-card", Boolean(topCard?.isRed));
  refs.discardPileBtn.classList.toggle("black-card", Boolean(topCard && !topCard.isRed));
  refs.discardPileBtn.dataset.cardRank = topCard?.rank || "";
  refs.discardPileBtn.dataset.cardSuit = topCard?.suit || "";
  refs.discardPileBtn.dataset.cardLabel = topCard?.label || "";
  refs.deckPileBtn.dataset.deckCount = String(clientState.game?.deckCount ?? 0);
  refs.discardPileBtn.disabled = !canUseDiscardPile();
  refs.deckPileBtn.disabled = !canUseDeckPile();
  refs.discardPileBtn.classList.toggle("active", canUseDiscardPile());
  refs.deckPileBtn.classList.toggle("active", canUseDeckPile());
  refs.discardPileBtn.setAttribute("aria-pressed", String(canUseDiscardPile()));
  refs.deckPileBtn.setAttribute("aria-pressed", String(canUseDeckPile()));
}

function renderStatus() {
  const offlineOnlyRuntime = isOfflineOnlyRuntime();
  document.body.dataset.phase = clientState.roomPhase;
  document.body.dataset.game = clientState.game?.phase || "none";
  document.body.dataset.hasRoom = clientState.roomCode ? "true" : "false";
  document.body.dataset.staticHost = offlineOnlyRuntime ? "true" : "false";
  document.body.dataset.turn = isYourTurn() ? "yours" : "waiting";
  document.body.dataset.team = yourPlayer()?.team || "";
  document.body.dataset.role = clientState.yourRole || "none";
  document.body.dataset.selected = clientState.selectedCardId ? "true" : "false";
  document.body.dataset.ai = clientState.botThinkingSeatIndex == null ? "idle" : "thinking";
  document.body.dataset.winner = clientState.game?.winner || "";
  document.body.dataset.botMode = clientState.botDifficulty || "smart";
  document.body.dataset.spectatorsAllowed = clientState.allowSpectators ? "true" : "false";
  document.body.dataset.rematchMode = clientState.rematchMode || "all";
  document.body.dataset.pendingStep = clientState.pendingStep?.type || "none";
  const isReconnecting = Boolean(
    !clientState.localMode &&
      !offlineOnlyRuntime &&
      !clientState.socketReady &&
      !clientState.reconnectPaused &&
      !clientState.sessionTakenOver
  );
  refs.connectionIndicator.textContent = clientState.localMode
    ? "오프라인 솔로"
      : offlineOnlyRuntime
        ? "GitHub Pages 정적판"
        : clientState.socketReady
          ? "실시간 연결됨"
          : clientState.reconnectPaused
            ? "연결이 중단됨"
            : isReconnecting
              ? `연결 복구 중${
                clientState.reconnectAttempts ? ` (${clientState.reconnectAttempts}회)` : ""
              }${clientState.reconnectDelayMs > 0 ? ` · ${formatRetryDelay(clientState.reconnectDelayMs)} 재시도` : ""}`
              : "연결 복구 대기";
  refs.currentOrigin.textContent = window.location.origin;
  if (refs.gatewaySubtitle) {
    refs.gatewaySubtitle.textContent = offlineOnlyRuntime
      ? "바로 솔로 플레이하세요."
      : "방을 만들거나 받은 코드로 입장하세요. 같은 브라우저에서는 좌석이 복구됩니다.";
  }
  if (refs.createRoomBtn) {
    if (offlineOnlyRuntime) {
      refs.createRoomBtn.disabled = true;
      refs.createRoomBtn.dataset.staticDisabled = "true";
    } else if (refs.createRoomBtn.dataset.staticDisabled === "true") {
      refs.createRoomBtn.disabled = false;
      delete refs.createRoomBtn.dataset.staticDisabled;
    }
    refs.createRoomBtn.textContent = offlineOnlyRuntime ? "멀티 서버 필요" : "방 만들기";
    refs.createRoomBtn.title = offlineOnlyRuntime ? "현재 공개 URL은 오프라인 솔로 전용입니다." : "새 멀티플레이 방 만들기";
  }
  refreshCreateFormState();
  if (refs.joinRoomBtn) {
    if (offlineOnlyRuntime) {
      refs.joinRoomBtn.disabled = true;
      refs.joinRoomBtn.dataset.staticDisabled = "true";
    } else if (refs.joinRoomBtn.dataset.staticDisabled === "true") {
      refs.joinRoomBtn.disabled = false;
      delete refs.joinRoomBtn.dataset.staticDisabled;
    }
    refs.joinRoomBtn.textContent = offlineOnlyRuntime ? "멀티 서버 필요" : "방 입장";
    refs.joinRoomBtn.title = offlineOnlyRuntime ? "WebSocket 서버가 켜진 주소에서 사용할 수 있습니다." : "방 코드로 입장";
  }
  if (refs.joinAsSpectator) {
    refs.joinAsSpectator.disabled = offlineOnlyRuntime;
    refs.joinAsSpectator.title = offlineOnlyRuntime
      ? "오프라인 모드에서는 관전 입장을 사용할 수 없습니다"
      : "";
  }
  if (refs.joinCode) {
    if (offlineOnlyRuntime) {
      refs.joinCode.disabled = true;
      refs.joinCode.dataset.staticDisabled = "true";
    } else if (refs.joinCode.dataset.staticDisabled === "true") {
      refs.joinCode.disabled = false;
      delete refs.joinCode.dataset.staticDisabled;
    }
  }
  refreshJoinFormState();
  if (typeof updateWelcomeModePanel === "function") {
    updateWelcomeModePanel();
  }
  const inviteUrl = clientState.roomCode ? buildInviteUrl(clientState.roomCode, getInviteRole()) : "";
  refs.activeRoomCode.textContent = clientState.roomCode || "미접속";
  if (clientState.localMode) {
    refs.roomLinkPreview.textContent = "오프라인 솔로는 이 브라우저에서만 진행됩니다.";
  } else if (clientState.roomCode) {
    refs.roomLinkPreview.textContent = inviteUrl;
  } else {
    refs.roomLinkPreview.textContent = "방을 만들면 초대 링크가 여기에 표시됩니다.";
  }
  const canShareRoom = Boolean(clientState.roomCode && !clientState.localMode);
  const canCopyRoomCode = canShareRoom;
  refs.activeRoomCode.disabled = !canCopyRoomCode;
  refs.activeRoomCode.classList.toggle("copyable", canCopyRoomCode);
  refs.activeRoomCode.setAttribute("aria-label", canCopyRoomCode ? `${clientState.roomCode} 방 코드 복사` : "방 코드가 없습니다");
  refs.activeRoomCode.title = canCopyRoomCode ? "현재 방 코드를 복사하려면 클릭하세요" : "방 코드를 만들면 복사 버튼이 활성화됩니다.";
  refs.roomLinkPreview.disabled = !canShareRoom;
  refs.roomLinkPreview.classList.toggle("copyable", canShareRoom);
  refs.roomLinkPreview.setAttribute("aria-label", canShareRoom ? "초대 링크 복사" : "방을 만든 뒤 링크를 복사하세요");
  refs.roomLinkPreview.title = canShareRoom ? "클릭하면 초대 링크를 복사합니다" : "방을 만든 뒤 링크를 복사할 수 있습니다.";
  refs.roomLinkPreview.setAttribute("aria-describedby", canShareRoom ? "room-link-preview-desc" : "");
  if (refs.roomLinkHint) {
  refs.roomLinkHint.hidden = !canShareRoom;
  }
  const roleAwareInviteUrl = canShareRoom ? buildInviteUrl(clientState.roomCode, getInviteRole()) : window.location.origin;
  refs.openRoomLink.href = roleAwareInviteUrl;
  refs.openRoomLink.tabIndex = canShareRoom ? 0 : -1;
  refs.openRoomLink.setAttribute("aria-disabled", canShareRoom ? "false" : "true");
  refs.openRoomLink.setAttribute(
    "aria-label",
    canShareRoom ? `${clientState.roomCode} 링크 열기` : "방을 만든 뒤 링크를 열 수 있습니다"
  );
  refs.openRoomLink.title = canShareRoom ? "새 탭에서 방 링크 열기" : "방을 만든 뒤 사용할 수 있습니다";
  refs.copyCodeBtn.disabled = !canShareRoom;
  refs.copyRoomBtn.disabled = !canShareRoom;
  refs.copySpectatorLinkBtn.disabled = !canShareRoom || !clientState.allowSpectators;
  refs.shareRoomBtn.disabled = !canShareRoom;
  refs.openRoomLink.classList.toggle("disabled", !canShareRoom);
  refs.leaveRoomBtn.disabled = !canLeaveRoom();
  refs.leaveRoomBtn.hidden = clientState.localMode || !clientState.roomCode;
  refs.leaveRoomBtn.title = canLeaveRoom()
    ? "현재 방에서 나가기"
    : clientState.roomPhase === "playing"
      ? "게임 진행 중에는 방 나가기가 제한됩니다"
      : "방에 입장해야 사용할 수 있습니다";
  refs.startTestBtn.disabled = !(clientState.roomCode && clientState.roomPhase === "lobby" && isHost());
  updateInstallButton();
  updateNotificationButton();
  updateCreateTeamSizeButtons();
  updateAiModeButtons();
  updateHostSettingsControls();

  renderSeatCards();
  renderHand();
  renderSpectators();
  renderChat();
  updateChatUi();
  renderPileActions();

  const requiredPlayers = displayRequiredPlayerCount();
  const filledSeats = clientState.roomCode ? occupiedSeatCount() : 0;
  const remainingSeats = Math.max(0, requiredPlayers - filledSeats);
  const progressPercent = requiredPlayers > 0 ? Math.min(100, (filledSeats / requiredPlayers) * 100) : 0;
  const teamSize = displayTeamSize();
  const matchLabel = TEAM_SIZE_LABELS[teamSize] || TEAM_SIZE_LABELS[3];
  refs.rubySeatLegend.textContent = `루비 ${seatIndexesForTeam("A", requiredPlayers).join(" · ")}`;
  refs.cobaltSeatLegend.textContent = `코발트 ${seatIndexesForTeam("B", requiredPlayers).join(" · ")}`;
  refs.occupancyText.textContent = `${filledSeats} / ${requiredPlayers}`;
  refs.occupancyFill.style.width = `${progressPercent}%`;
  refs.inviteProgressCard.hidden = !clientState.roomCode || clientState.localMode;
  refs.inviteProgressCount.textContent = `${filledSeats} / ${requiredPlayers}`;
  refs.inviteProgressFill.style.width = `${progressPercent}%`;
  refs.inviteProgressHint.textContent =
    clientState.roomCode && remainingSeats > 0
      ? `${matchLabel} 방입니다. 친구 ${remainingSeats}명이 더 들어오면 자동 시작됩니다.`
      : clientState.roomCode
        ? "필요 인원이 모두 들어왔습니다. 곧 게임이 시작됩니다."
        : "친구가 들어오면 여기에서 바로 보입니다.";
  refs.lobbyProgressCard.hidden = !clientState.roomCode || Boolean(clientState.game);
  refs.lobbyProgressCount.textContent = `${filledSeats} / ${requiredPlayers}`;
  refs.lobbyProgressFill.style.width = `${progressPercent}%`;
  refs.lobbyProgressHint.textContent =
    remainingSeats > 0 ? `${matchLabel} 시작까지 ${remainingSeats}명 남았습니다.` : "필요 인원이 모두 들어왔습니다.";
  refs.roomSubtitle.textContent = clientState.localMode
    ? "오프라인 솔로 · 루비 플레이어 vs 코발트 봇"
    : clientState.roomCode
    ? `방 코드 ${clientState.roomCode} · ${matchLabel} · ${filledSeats}/${requiredPlayers} 입장 · 관전 ${clientState.spectatorCount}명 · ${
        clientState.allowSpectators ? "관전 열림" : "관전 닫힘"
      }`
    : "방에 입장하면 좌석 현황이 표시됩니다.";
  refs.roomHint.textContent = clientState.localMode
    ? "서버와 초대 링크 없이 이 브라우저 안에서만 진행됩니다. 멀티플레이 비용 없이 규칙과 UX를 확인할 수 있습니다."
    : clientState.roomCode
    ? clientState.yourRole === "spectator"
      ? `관전 모드입니다. ${clientState.spectatorCount}명이 함께 보드를 보고 있습니다.`
      : clientState.roomPhase === "lobby" && isHost()
      ? `${matchLabel}로 친구를 기다리거나, 방장이면 혼자 테스트 시작 버튼으로 남은 좌석을 자동 플레이 봇으로 채울 수 있습니다.`
      : `${requiredPlayers}명이 모두 들어오면 자동 시작됩니다. 접속이 끊겨도 같은 브라우저면 원래 좌석으로 복구됩니다.`
    : "방을 만들거나 코드로 입장해 좌석을 확보하세요.";
  refs.spectatorCount.textContent = `${clientState.spectatorCount}명`;

  if (!clientState.game) {
    refs.victoryCard.hidden = true;
    refs.rematchBtn.disabled = true;
    refs.rematchVoteStatus.textContent = "0 / 0 동의";
    refs.turnSubtitle.textContent = clientState.localMode
      ? "솔로 대기"
      : clientState.roomCode
        ? `로비 대기 중 · ${matchLabel}`
        : "방 미접속";
    refs.turnPlayer.textContent = clientState.localMode ? "솔로" : clientState.roomCode ? "플레이어 대기" : "대기 중";
    refs.turnTeam.textContent = "-";
    refs.turnTeam.className = "";
    const lobbyReadyText =
      remainingSeats > 0
        ? `친구 ${remainingSeats}명이 더 들어오면 자동 시작됩니다.`
        : "필요 인원이 모두 들어왔습니다. 곧 게임이 시작됩니다.";
    refs.statusMessage.textContent = clientState.localMode
      ? "시작 버튼으로 솔로 게임을 시작하세요."
      : clientState.roomCode
          ? clientState.yourRole === "spectator"
            ? "관전자로 입장했습니다. 게임이 시작되면 보드와 로그를 실시간으로 볼 수 있습니다."
            : isHost()
          ? `${filledSeats}/${requiredPlayers}명이 입장했습니다. ${lobbyReadyText} 방장이면 혼자 테스트를 시작해 바로 플레이할 수 있습니다.`
          : `${filledSeats}/${requiredPlayers}명이 입장했습니다. ${lobbyReadyText}`
        : "방을 만들거나 받은 코드로 입장하세요.";
    refs.scoreRuby.textContent = `0 / 2 시퀀스`;
    refs.scoreCobalt.textContent = `0 / 2 시퀀스`;
    refs.deckCount.textContent = "0장";
    refs.discardCount.textContent = "0장";
    refs.handCaption.textContent = "게임이 시작되면 이 칸에 내 손패가 보입니다.";
    refs.selectionHint.textContent = clientState.localMode
      ? "시작 버튼으로 시작하세요. 조작법은 도움말(?)에서 확인할 수 있습니다."
      : "멀티플레이 대기 중입니다. 도움말에서 키보드 조작도 확인하세요.";
    refs.cancelSelectionBtn.disabled = true;
    refs.discardDeadBtn.disabled = true;
    refs.logList.replaceChildren();
    const soloHintContext = isSoloContext();
    const pregameAction = soloHintContext
      ? {
          label: "솔로 테스트 시작",
          title: "오프라인에서 바로 솔로 게임을 시작해 플레이를 시작하세요.",
          onAction: () => {
            if (refs.startTestBtn) {
              refs.startTestBtn.focus();
              refs.startTestBtn.click();
            }
          },
        }
      : {
          label: clientState.roomCode ? "방으로 이동" : "방 입장하기",
          title: clientState.roomCode ? "현재 로비에서 준비 중인 좌석/상태를 확인하세요." : "방을 만들거나 코드로 입장하세요.",
          onAction: () => {
            if (clientState.roomCode) {
              document.getElementById("game-canvas")?.scrollIntoView({ behavior: "smooth", block: "center" });
            } else {
              focusGatewayPrimaryInput();
            }
          },
        };
    const reconnectHint = !clientState.localMode && !isOfflineOnlyRuntime() && !clientState.socketReady;
    const pregameActions = Array.isArray(pregameAction) ? pregameAction : [pregameAction];
    if (reconnectHint) {
      pregameActions.push({
        label: "재연결 시도",
        title: "오프라인 상태가 해제되면 자동 복구됩니다. 지금 즉시 재접속을 시도합니다.",
        onAction: () => {
          forceReconnectNow();
        },
      });
    }
    refs.logList.appendChild(
      buildEmptyState(
        "li",
        "log-empty",
        "•",
        "아직 액션 없음",
        "게임이 시작되면 카드 배치와 시퀀스가 여기에 쌓입니다.",
        pregameActions
      )
    );
    renderHistory();
    return;
  }

  const player = currentPlayer();
  const thinkingSeat = clientState.seats.find((seat) => seat.seatIndex === clientState.botThinkingSeatIndex);
  const winnerMeta = clientState.game.winner ? TEAM_META[clientState.game.winner] : null;
  const pendingStep = clientState.pendingStep;
  refs.turnSubtitle.textContent =
    clientState.game.phase === "finished"
      ? "게임 종료"
      : pendingStep?.type === "discard"
        ? "카드 내려놓기"
      : pendingStep?.type === "draw"
        ? "덱에서 뽑기"
      : thinkingSeat
        ? "AI 계산 중"
      : `${player?.seatIndex + 1 || "-"}번 좌석 차례`;
  refs.turnPlayer.textContent = player?.name || "알 수 없음";
  const turnTeamLabel = player ? TEAM_LABELS[player.team] || TEAM_META[player.team].name : "-";
  refs.turnTeam.className = player?.team === "A" ? "team-ruby" : "team-cobalt";
  refs.turnTeam.replaceChildren(document.createTextNode(turnTeamLabel));
  if (thinkingSeat) {
    refs.turnTeam.classList.add("turn-thinking");
    const dots = document.createElement("span");
    dots.className = "thinking-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    refs.turnTeam.appendChild(dots);
  }

  refs.victoryCard.hidden = !winnerMeta;
  if (winnerMeta) {
    const voteCount = clientState.rematchVoteSeatIndexes.length;
    const requiredVotes = clientState.rematchRequiredVotes || 0;
    const alreadyVoted = hasVotedForRematch();
    refs.victoryWinner.textContent = `${TEAM_LABELS[clientState.game.winner] || winnerMeta.name} 승리`;
    refs.victoryScore.textContent = `Ruby ${clientState.game.scores.A} : ${clientState.game.scores.B} Cobalt`;
  if (clientState.rematchMode === "host") {
      refs.rematchVoteStatus.textContent = isHost() ? "방장 시작 가능" : "방장 시작 대기";
      refs.rematchBtn.disabled = clientState.roomPhase !== "finished" || !isHost();
      refs.rematchBtn.textContent = isHost() ? "리매치 시작" : "방장 대기";
      refs.rematchBtn.setAttribute("aria-label", isHost() ? "방장만 리매치 시작 (R)" : "방장 대기 (R)");
    } else {
      refs.rematchVoteStatus.textContent = `${voteCount} / ${requiredVotes} 동의`;
      // Toggle UX: a player who already voted can click again to retract, so we keep the
      // button enabled and re-label it. Spectators and pre-finish phase stay disabled.
      refs.rematchBtn.disabled = clientState.roomPhase !== "finished" || clientState.yourRole !== "player";
      refs.rematchBtn.textContent = alreadyVoted ? "동의 취소" : "리매치 동의";
      refs.rematchBtn.setAttribute("aria-label", `${refs.rematchBtn.textContent} (R)`);
    }
  } else {
    refs.rematchBtn.disabled = true;
    refs.rematchBtn.textContent = "리매치 동의";
    refs.rematchVoteStatus.textContent = "0 / 0 동의";
    refs.rematchBtn.setAttribute("aria-label", "리매치 동의 (R)");
  }

  if (clientState.game.winner) {
    const winnerName = TEAM_LABELS[clientState.game.winner] || TEAM_META[clientState.game.winner].name;
    refs.statusMessage.textContent =
      clientState.rematchMode === "host"
        ? `${winnerName} 승리. 방장이 같은 좌석으로 리매치를 시작할 수 있습니다.`
        : `${winnerName} 승리. 모든 접속 플레이어가 동의하면 같은 좌석으로 리매치가 시작됩니다.`;
  } else if (pendingStep?.type === "discard") {
    const cardLabel = pendingStep.card?.label || "사용한 카드";
    refs.statusMessage.textContent = isPendingForMe("discard")
      ? `${cardLabel}를 버림 더미에 내려놓아야 합니다. 버림 더미를 클릭하세요.`
      : `${player?.name || "플레이어"}님이 사용한 카드를 버림 더미에 내려놓는 중입니다.`;
  } else if (pendingStep?.type === "draw") {
    refs.statusMessage.textContent = isPendingForMe("draw")
      ? "덱을 클릭해 새 카드를 뽑으면 턴이 끝납니다."
      : `${player?.name || "플레이어"}님이 덱에서 새 카드를 뽑는 중입니다.`;
  } else if (thinkingSeat) {
    refs.statusMessage.textContent = `${thinkingSeat.name}이 보드와 손패를 살피며 다음 수를 고르고 있습니다.`;
  } else if (clientState.yourRole === "spectator") {
    refs.statusMessage.textContent = `${player?.name || "플레이어"}님의 턴을 관전 중입니다. 보드의 흐름과 최근 로그를 확인하세요.`;
  } else if (isYourTurn()) {
    if (clientState.selectedCardId) {
      const card = selectedCard();
      if (card && clientState.legalTargets.length === 0 && card.action === "normal") {
        refs.statusMessage.textContent = `${card.label}는 놓을 칸이 없습니다. 죽은 카드 버리기를 사용할 수 있습니다.`;
      } else if (card) {
        refs.statusMessage.textContent = `${card.label} 선택됨. 보드의 강조 칸을 클릭해 액션을 완료하세요.`;
      }
    } else {
      refs.statusMessage.textContent = "당신 차례입니다. 손패에서 카드를 선택하세요.";
    }
  } else {
    refs.statusMessage.textContent = `${player?.name || "다른 플레이어"}님의 턴입니다. 실시간으로 보드를 지켜보세요.`;
  }

  refs.scoreRuby.textContent = `${clientState.game.scores.A} / 2 시퀀스`;
  refs.scoreCobalt.textContent = `${clientState.game.scores.B} / 2 시퀀스`;
  refs.deckCount.textContent = `${clientState.game.deckCount}장`;
  refs.discardCount.textContent = `${clientState.game.discardCount}장`;

  const me = yourPlayer();
  refs.handCaption.textContent = clientState.yourRole === "spectator"
    ? "관전 모드 · 플레이어 손패는 비공개입니다."
    : me
      ? `${me.name} · ${TEAM_LABELS[me.team] || TEAM_META[me.team].name} · ${isYourTurn() ? "내 차례" : "대기 중"}`
    : "내 좌석 정보가 아직 없습니다.";

  refs.selectionHint.textContent =
    clientState.yourRole === "spectator"
      ? "관전자는 마우스 클릭으로 보드/점수/로그를 관전할 수 있습니다. 도움말(?)에서 조작법을 확인하세요."
      : isPendingForMe("discard")
      ? "버림 더미를 클릭해서 사용한 카드를 내려놓으세요."
      : isPendingForMe("draw")
      ? "덱을 클릭해서 새 카드를 뽑으세요."
      : thinkingSeat
      ? "AI가 생각하는 동안 보드 변화를 지켜보세요."
      : clientState.selectedCardId && clientState.legalTargets.length > 0
        ? `가능한 칸 ${clientState.legalTargets.length}곳이 표시됩니다. 방향키로 이동하고 Enter/Space로 놓으세요.`
        : "카드를 선택하면 가능한 칸이 보드에 초록색으로 표시됩니다. A/B 또는 화살표 키로 카드/위치를 선택하세요.";

  refs.cancelSelectionBtn.disabled = !clientState.selectedCardId || Boolean(clientState.pendingStep);
  const card = selectedCard();
  refs.discardDeadBtn.disabled =
    !canChooseCard() ||
    !card ||
    card.action !== "normal" ||
    clientState.legalTargets.length > 0;

  refs.logList.replaceChildren();
  const logs = clientState.game?.logs || [];
  if (logs.length === 0) {
    const soloHintContext = isSoloContext();
    const logAction = soloHintContext
      ? {
          label: "솔로 테스트 시작",
          title: "오프라인 솔로 시작 버튼으로 즉시 플레이를 시작해보세요.",
          onAction: () => {
            if (refs.startTestBtn) {
              refs.startTestBtn.focus();
              refs.startTestBtn.click();
            }
          },
        }
      : {
          label: "첫 동작 보기",
          title: "첫 카드 배치 이후 움직임이 바로 여기에 기록됩니다.",
          onAction: () => {
            setFlashMessage("보드의 카드를 선택해 첫 동작을 실행해 보세요.");
          },
        };
    refs.logList.appendChild(
      buildEmptyState(
        "li",
        "log-empty",
        "•",
        "아직 액션 없음",
        "첫 카드가 놓이면 방 전체 로그가 여기에서 시작됩니다.",
        logAction
      )
    );
  }
  for (const entry of logs) {
    const item = document.createElement("li");
    item.textContent = entry;
    refs.logList.appendChild(item);
  }
  renderHistory();
}

function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle, lineWidth = 1) {
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

function drawChip(x, y, radius, team, locked) {
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

function drawBoardTargetMarker(centerX, centerY, radius, pulse, focused) {
  const card = selectedCard();
  if (!card) return;
  const isRemove = card.action === "remove";
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

function drawCardFaceDetails(label, x, y, width, height = width) {
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

function drawPlaceholderBoard() {
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

function drawBoard() {
  if (!clientState.game) {
    drawPlaceholderBoard();
    return;
  }

  const size = canvas.width;
  const cellSize = size / BOARD_SIZE;
  const targetPulse = (performance.now() % TARGET_PULSE_ANIM_MS) / TARGET_PULSE_ANIM_MS;
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
        const t = Math.min(1, Math.max(0, (performance.now() - anim.startedAt) / CHIP_PLACE_ANIM_MS));
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
          const nudgeStart = CHIP_PLACE_ANIM_MS * 0.72;
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

    if (highlighted) {
      drawBoardTargetMarker(
        cardX + cardWidth / 2,
        cardY + cardHeight / 2 + cardHeight * 0.07,
        cardWidth * 0.3,
        targetPulse,
        isKeyboardCursor
      );
    }

    const removal = clientState.chipRemovalAnim;
    if (!cell.chip && removal && removal.cellId === cell.id) {
      const t = Math.min(1, Math.max(0, (performance.now() - removal.startedAt) / CHIP_REMOVE_ANIM_MS));
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
function drawSequenceCascade() {
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
function drawVictoryWash() {
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

const BASE_TITLE = "Sequence Arena · 실시간 시퀀스 팀전";

function updatePageTitle() {
  const game = clientState.game;
  if (game?.winner) {
    const label = game.winner === "A" ? "루비 팀" : "코발트 팀";
    document.title = `${label} 승리 · Sequence Arena`;
    return;
  }
  if (game?.phase === "playing" && clientState.yourRole === "player" && isYourTurn()) {
    document.title = `🔔 당신 차례 · Sequence Arena`;
    return;
  }
  if (document.title !== BASE_TITLE) {
    document.title = BASE_TITLE;
  }
}

function updateAppBadge() {
  if (!("setAppBadge" in navigator)) return;
  const game = clientState.game;
  const wantBadge =
    game?.phase === "playing" && clientState.yourRole === "player" && isYourTurn();
  try {
    if (wantBadge) {
      navigator.setAppBadge(1).catch(() => {});
    } else if ("clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch {
    // Badge API is best-effort; swallow unsupported browser errors.
  }
}

// Rate-limit render-error beacons rather than firing them once per session: a transient
// error early in the run used to permanently silence reports for the rest of the play
// session, and any later (potentially worse) failure was invisible to the operator.
const RENDER_ERROR_REPORT_COOLDOWN_MS = 10_000;
let lastRenderErrorReportAt = 0;

// Screen Wake Lock keeps the device awake while the user is mid-match. Without it, mobile
// users on a long thinking turn lose the display and have to wake the phone again — bad UX
// for a multiplayer turn-based game. The lock is released when the page is hidden (browser
// auto-releases it) and re-requested on visibilitychange. Permissions-Policy already allows
// `screen-wake-lock=(self)`.
let wakeLockSentinel = null;
async function acquireWakeLock() {
  if (!("wakeLock" in navigator) || typeof navigator.wakeLock?.request !== "function") return;
  if (wakeLockSentinel) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    // request can throw on user activation policy or if the OS denies; safe to ignore.
  }
}
async function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch {
    // already released
  }
  wakeLockSentinel = null;
}
function syncWakeLock() {
  // Active match + tab visible + this tab owns the seat → lock; otherwise release.
  const active =
    clientState.roomPhase === "playing" &&
    clientState.yourRole === "player" &&
    !document.hidden &&
    !clientState.sessionTakenOver;
  if (active) {
    acquireWakeLock();
  } else {
    releaseWakeLock();
  }
}
document.addEventListener("visibilitychange", syncWakeLock);

function render() {
  try {
    refs.activeRoomCode.textContent = clientState.roomCode || "미접속";
    refs.flashMessage.textContent = clientState.flashMessage;
    updateSoundButton();
    updateHapticsButton();
    updateFeedbackControls();
    updateWelcomeCreateLabel();
    if (typeof maybeShowWelcome === "function") maybeShowWelcome();
    drawBoard();
    renderStatus();
    updateBoardSummary();
    updatePageTitle();
    updateAppBadge();
    syncWakeLock();
  } catch (error) {
    // Never let a single broken render wedge the entire game loop. Beacon at most once per
    // RENDER_ERROR_REPORT_COOLDOWN_MS so a transient error does not silence late-session
    // reports, but a render that fails on every tick does not flood the endpoint either.
    const now = Date.now();
    if (now - lastRenderErrorReportAt >= RENDER_ERROR_REPORT_COOLDOWN_MS) {
      lastRenderErrorReportAt = now;
      try {
        reportClientError("render-error", error?.message || "render failure", { stack: error?.stack });
      } catch {
        // swallow: telemetry must never rethrow
      }
    }
  }
}

function updateBoardSummary() {
  const summary = document.getElementById("board-state-summary");
  if (!summary) return;
  const game = clientState.game;
  if (!game) {
    summary.textContent = "아직 게임이 시작되지 않았습니다.";
    return;
  }
  const board = game.board || [];
  const rubyChips = board.filter((cell) => cell?.chip === "A").length;
  const cobaltChips = board.filter((cell) => cell?.chip === "B").length;
  const rubyScore = game.scores?.A ?? 0;
  const cobaltScore = game.scores?.B ?? 0;
  const currentPlayer = game.players?.find((player) => player.seatIndex === game.currentSeatIndex);
  const turnText = currentPlayer ? `${currentPlayer.name}님 차례 (${currentPlayer.team === "A" ? "루비" : "코발트"} 팀).` : "";
  const winnerText = game.winner ? (game.winner === "A" ? "루비 팀 승리." : "코발트 팀 승리.") : "";
  summary.textContent = `${winnerText} ${turnText} 루비 칩 ${rubyChips}개 · 시퀀스 ${rubyScore}/2. 코발트 칩 ${cobaltChips}개 · 시퀀스 ${cobaltScore}/2. 덱 ${game.deckCount}장, 버림 ${game.discardCount}장.`.trim();
}

function handleBoardClick(event) {
  if (!canChooseCard()) {
    return;
  }

  const card = selectedCard();
  if (!card) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const cellSize = canvas.width / BOARD_SIZE;
  const col = Math.min(BOARD_SIZE - 1, Math.max(0, Math.floor(x / cellSize)));
  const row = Math.min(BOARD_SIZE - 1, Math.max(0, Math.floor(y / cellSize)));
  const targetCellId = row * BOARD_SIZE + col;

  if (!clientState.legalTargets.includes(targetCellId)) {
    playSound("error");
    return;
  }

  animateCardToPoint(card.id, pointForBoardCell(targetCellId), "board");
  if (!playJackFeedback(card)) {
    playSound("tap");
  }
  sendSocket({
    type: "play_card",
    cardId: card.id,
    targetCellId,
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    return;
  }
  document.exitFullscreen().catch(() => {});
}

function serializeState() {
  return JSON.stringify({
    roomCode: clientState.roomCode,
    phase: clientState.roomPhase,
    yourRole: clientState.yourRole,
    inviteUrl: clientState.roomCode ? buildInviteUrl() : "",
    spectatorInviteUrl: clientState.roomCode ? buildInviteUrl(clientState.roomCode, "spectator") : "",
    yourSeatIndex: clientState.yourSeatIndex,
    teamSize: clientState.teamSize,
    requiredPlayers: requiredPlayerCount(),
    occupiedSeats: occupiedSeatCount(),
    preferredTeamSize: clientState.preferredTeamSize,
    spectatorCount: clientState.spectatorCount,
    spectators: clientState.spectators,
    allowSpectators: clientState.allowSpectators,
    botThinkingSeatIndex: clientState.botThinkingSeatIndex,
    botDifficulty: clientState.botDifficulty,
    rematchMode: clientState.rematchMode,
    rematchVotes: clientState.rematchVoteSeatIndexes,
    rematchRequiredVotes: clientState.rematchRequiredVotes,
    pendingStep: clientState.pendingStep,
    discardTopCard: clientState.game?.discardTopCard?.label ?? null,
    currentTurnSeat: clientState.game?.currentSeatIndex ?? null,
    currentTurnPlayer: currentPlayer()?.name ?? null,
    winner: clientState.game?.winner ?? null,
    matchHistory: clientState.matchHistory,
    selectedCard: selectedCard()?.label ?? null,
    legalTargets: clientState.legalTargets,
    scores: clientState.game?.scores ?? { A: 0, B: 0 },
    yourHand: yourHand().map((card) => card.label),
    board: clientState.game?.board ?? [],
  });
}

refs.createForm.addEventListener("submit", handleCreateRoom);
if (refs.createRoomBtn) {
  refs.createRoomBtn.setAttribute("aria-describedby", "welcome-mode-banner");
}
refs.offlineSoloBtn?.addEventListener("click", startOfflineSolo);
refs.joinForm.addEventListener("submit", handleJoinRoom);
if (refs.joinRoomBtn) {
  refs.joinRoomBtn.setAttribute("aria-describedby", "welcome-mode-banner");
}

function sendChatMessage(rawText) {
  const text = normalizeChatText(rawText);
  if (!text) return;
  if (!clientState.roomCode || clientState.localMode) {
    setChatFeedback("채팅은 멀티 방에서만 사용할 수 있습니다.", "error");
    render();
    return;
  }

  const now = Date.now();
  const repeatWindow = now - clientState.chatLastSentAt;
  if (repeatWindow < CHAT_REPEAT_COOLDOWN_MS && text === clientState.chatLastMessage) {
    setChatFeedback("같은 메시지를 연속으로 보내지 마세요.", "error");
    render();
    return;
  }
  const remainingCooldown = getChatSendCooldownMs();
  if (remainingCooldown > 0) {
    const seconds = Math.max(1, Math.ceil(remainingCooldown / 1000));
    setChatFeedback(`채팅이 너무 빠릅니다. ${seconds}초 뒤 전송 가능합니다.`, "error");
    render();
    return;
  }

  sendSocket({ type: "send_chat", text });
  clientState.chatLastSentAt = now;
  clientState.chatLastMessage = text;
  clientState.chatCooldownUntil = now + CHAT_COOLDOWN_MS;
  refs.chatInput.value = "";
  if (refs.chatCharCount) {
    refs.chatCharCount.textContent = `0 / ${CHAT_MAX_LENGTH}`;
  }
  updateChatUi();
  setChatFeedback("전송됨", "info");
  render();
}

refs.chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage(refs.chatInput?.value || "");
});
for (const button of refs.emojiButtons || []) {
  button.addEventListener("click", () => {
    const text = button.dataset.chatEmoji;
    if (!text) return;
    sendChatMessage(text);
  });
}
refs.chatInput?.addEventListener("input", updateChatUi);
refs.copyRoomBtn.addEventListener("click", () => {
  copyRoomLink().catch(() => {
    setFlashMessage("초대 링크 복사에 실패했습니다.");
    render();
  });
});
refs.copySpectatorLinkBtn.addEventListener("click", () => {
  copySpectatorLink().catch(() => {
    setFlashMessage("관전 링크 복사에 실패했습니다.");
    render();
  });
});
refs.copyCodeBtn.addEventListener("click", () => {
  copyRoomCode().catch(() => {
    setFlashMessage("방 코드 복사에 실패했습니다.");
    render();
  });
});
refs.activeRoomCode?.addEventListener("click", () => {
  if (!clientState.roomCode || clientState.localMode) return;
  copyRoomCode(refs.activeRoomCode).catch(() => {
    setFlashMessage("방 코드 복사에 실패했습니다.");
    render();
  });
});
refs.openRoomLink?.addEventListener("click", (event) => {
  if (!clientState.roomCode || clientState.localMode) {
    event.preventDefault();
    setFlashMessage("방을 만든 뒤에 링크를 열 수 있습니다.");
    return;
  }
});
refs.roomLinkPreview?.addEventListener("click", () => {
  if (!clientState.roomCode || clientState.localMode) return;
  copyRoomLink().catch(() => {
    setFlashMessage("초대 링크 복사에 실패했습니다.");
    render();
  });
});
refs.leaveRoomBtn?.addEventListener("click", leaveCurrentRoom);
refs.shareRoomBtn.addEventListener("click", () => {
  shareRoom().catch((error) => {
    // User-cancelled share sheets are now swallowed inside shareRoom(), so any error here is a real failure.
    setFlashMessage("공유 시트를 열지 못했습니다. 초대 링크를 대신 복사했습니다.");
    void error;
    copyRoomLink().catch(() => render());
  });
});
refs.installAppBtn.addEventListener("click", () => {
  installApp().catch(() => {
    setFlashMessage("앱 설치를 시작하지 못했습니다.");
    render();
  });
});
refs.notificationToggleBtn.addEventListener("click", () => {
  toggleTurnNotifications()
    .then(() => render())
    .catch(() => {
      setFlashMessage("알림 설정을 변경하지 못했습니다.");
      render();
    });
});
refs.soundToggleBtn.addEventListener("click", toggleSound);
refs.hapticsToggleBtn?.addEventListener("click", toggleHaptics);
refs.soundVolumeSlider?.addEventListener("input", (event) => {
  setSoundVolume(event.currentTarget?.value ?? event.target?.value);
});
refs.soundVolumeSlider?.addEventListener("change", () => {
  saveSessionMeta();
});
refs.hapticIntensitySlider?.addEventListener("input", (event) => {
  setHapticsIntensity(event.currentTarget?.value ?? event.target?.value);
});
refs.hapticIntensitySlider?.addEventListener("change", () => {
  saveSessionMeta();
});
updateHapticsButton();

function resolveInitialTheme() {
  const stored = safeLocalStorage.get(STORAGE_KEYS.theme);
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  if (refs.themeToggleBtn) {
    const isDark = theme === "dark";
    refs.themeToggleBtn.textContent = isDark ? "☀" : "☾";
    refs.themeToggleBtn.setAttribute("aria-pressed", String(isDark));
    refs.themeToggleBtn.setAttribute("aria-label", isDark ? "라이트 모드 켜기" : "다크 모드 켜기");
    refs.themeToggleBtn.title = isDark ? "라이트 모드 켜기" : "다크 모드 켜기";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  safeLocalStorage.set(STORAGE_KEYS.theme, next);
  applyTheme(next);
  drawBoard();
  announcePolite(next === "dark" ? "다크 모드로 전환했습니다." : "라이트 모드로 전환했습니다.");
}

applyTheme(resolveInitialTheme());
refs.themeToggleBtn?.addEventListener("click", toggleTheme);

// Room code inputs are ASCII-only and should visually feel uppercase as the user types.
// The hint element doubles as the error surface. Cache the original neutral copy at boot
// so the validation flow can swap to error text on bad input and restore on recovery —
// without a cached copy, an upstream string change would silently desync.
const JOIN_CODE_HINT_DEFAULT = refs.joinCodeHint?.textContent || "4~6자리 영문/숫자";
const JOIN_CODE_HINT_ERROR = "방 코드는 4~6자 영문/숫자여야 합니다.";
const JOIN_CODE_HINT_INVALID_CHARS = "영문/숫자만 입력하세요. (하이픈, 공백은 제거됩니다)";
const CREATE_NAME_HINT_DEFAULT = "이름은 1~20자 이내여야 합니다.";
const CREATE_NAME_HINT_ERROR = "이름을 1~20자로 입력하세요.";
const JOIN_NAME_HINT_DEFAULT = "이름을 입력하세요.";
const JOIN_NAME_HINT_ERROR = "이름을 1~20자로 입력하세요.";
let lastJoinCodeLiveMessage = "";

function announceJoinCodeHint(message) {
  const nextMessage = message || "";
  if (!refs.joinCodeLiveFeedback || nextMessage === lastJoinCodeLiveMessage) {
    return;
  }
  lastJoinCodeLiveMessage = nextMessage;
  if (refs.joinCodeLiveFeedback) {
    refs.joinCodeLiveFeedback.textContent = nextMessage;
  }
}

function updateJoinCodeValidity(hasInvalidCharacters = false) {
  if (!refs.joinCode) return;
  const rawValue = refs.joinCode.value || "";
  const value = normalizeRoomCodeDraft(rawValue);
  const hasInputCharacters =
    hasInvalidCharacters || /[^A-Za-z0-9]/.test(rawValue);
  const hint = refs.joinCodeHint;
  // Empty stays neutral — pre-typing aria-invalid would set off SR alerts before the user
  // has had a chance to do anything, which is hostile UX. Only flip to invalid once the
  // user has committed at least one character that doesn't yet meet the 4-6 length range.
  if (value.length === 0) {
    refs.joinCode.removeAttribute("aria-invalid");
    if (hint) hint.textContent = JOIN_CODE_HINT_DEFAULT;
    announceJoinCodeHint("");
    return;
  }
  if (value.length < 4) {
    refs.joinCode.setAttribute("aria-invalid", "true");
    const message = hasInputCharacters ? JOIN_CODE_HINT_INVALID_CHARS : JOIN_CODE_HINT_ERROR;
    if (hint) hint.textContent = message;
    announceJoinCodeHint(message);
    return;
  }
  if (hasInputCharacters) {
    refs.joinCode.setAttribute("aria-invalid", "true");
    if (hint) hint.textContent = JOIN_CODE_HINT_INVALID_CHARS;
    announceJoinCodeHint(JOIN_CODE_HINT_INVALID_CHARS);
    return;
  }
  refs.joinCode.removeAttribute("aria-invalid");
  if (hint) hint.textContent = JOIN_CODE_HINT_DEFAULT;
  announceJoinCodeHint(JOIN_CODE_HINT_DEFAULT);
}

function hasValidJoinName() {
  return sanitizePlayerName(refs.joinName?.value || "").length > 0;
}

function hasValidCreateName() {
  return sanitizePlayerName(refs.createName?.value || "").length > 0;
}

function hasValidJoinCode() {
  if (!refs.joinCode) return false;
  const code = normalizeRoomCodeDraft(refs.joinCode.value);
  return code.length >= 4 && code.length <= 6;
}

function refreshCreateFormState() {
  if (!refs.createRoomBtn) return;
  if (refs.createRoomBtn.dataset.staticDisabled === "true") {
    refs.createRoomBtn.disabled = true;
    return;
  }
  const canCreate = !isOfflineOnlyRuntime() && clientState.socketReady && hasValidCreateName();
  refs.createRoomBtn.disabled = !canCreate;
  if (!canCreate && !isOfflineOnlyRuntime() && clientState.socketReady) {
    refs.createRoomBtn.title = hasValidCreateName()
      ? "이름을 입력하면 방을 만들 수 있습니다."
      : CREATE_NAME_HINT_ERROR;
    return;
  }
  if (!clientState.socketReady) {
    refs.createRoomBtn.title = "서버 연결이 끊겼습니다. 다시 연결 후 시도해 주세요.";
  }
}

function refreshJoinFormState() {
  if (!refs.joinRoomBtn) return;
  if (refs.joinRoomBtn.dataset.staticDisabled === "true") {
    refs.joinRoomBtn.disabled = true;
    return;
  }
  const canJoin =
    !isOfflineOnlyRuntime() &&
    clientState.socketReady &&
    hasValidJoinCode() &&
    hasValidJoinName();
  refs.joinRoomBtn.disabled = !canJoin;
  if (!canJoin && !isOfflineOnlyRuntime() && clientState.socketReady) {
    refs.joinRoomBtn.title = hasValidJoinCode()
      ? "이름을 입력하면 방에 입장할 수 있습니다."
      : "방 코드는 4~6자 영문/숫자로 입력해야 합니다.";
    return;
  }
  if (!clientState.socketReady) {
    refs.joinRoomBtn.title = "서버 연결이 끊겼습니다. 다시 연결 후 시도해 주세요.";
  }
}

function handleCreateNameInput() {
  if (!refs.createName || !refs.createNameHint) {
    refreshCreateFormState();
    return;
  }
  const isValid = hasValidCreateName();
  if (isValid) {
    refs.createName.removeAttribute("aria-invalid");
    refs.createNameHint.textContent = CREATE_NAME_HINT_DEFAULT;
    return;
  }
  refs.createName.setAttribute("aria-invalid", "true");
  refs.createNameHint.textContent = CREATE_NAME_HINT_ERROR;
  refreshCreateFormState();
}

function handleJoinNameInput() {
  if (!refs.joinName || !refs.joinNameHint) {
    refreshJoinFormState();
    return;
  }
  const isValid = hasValidJoinName();
  if (isValid) {
    refs.joinName.removeAttribute("aria-invalid");
    refs.joinNameHint.textContent = JOIN_NAME_HINT_DEFAULT;
    refreshJoinFormState();
    return;
  }
  refs.joinName.setAttribute("aria-invalid", "true");
  refs.joinNameHint.textContent = JOIN_NAME_HINT_ERROR;
  refreshJoinFormState();
}

function handleJoinCodeInput() {
  if (!refs.joinCode) return;
  const hasInvalidCharacters = /[^A-Za-z0-9]/.test(refs.joinCode.value || "");
  const caret = refs.joinCode.selectionStart;
  const normalized = normalizeJoinCodeInput(refs.joinCode.value);
  if (refs.joinCode.value !== normalized) {
    refs.joinCode.value = normalized;
    if (caret != null) {
      try {
        const nextCaret = Math.min(caret, refs.joinCode.value.length);
        refs.joinCode.setSelectionRange(nextCaret, nextCaret);
      } catch {
        // Some mobile browsers disallow setSelectionRange during input; ignore.
      }
    }
  }
  updateJoinCodeValidity(hasInvalidCharacters);
  refreshJoinFormState();
}
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (event) => {
  // Respect explicit user choice; only follow the OS when the user has not picked.
  if (safeLocalStorage.get(STORAGE_KEYS.theme)) return;
  applyTheme(event.matches ? "dark" : "light");
  drawBoard();
});

let helpPreviousFocus = null;

function focusableWithinHelp() {
  if (!refs.helpModal) return [];
  return [...refs.helpModal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
    (node) => !node.hasAttribute("disabled") && node.offsetParent !== null
  );
}

function setBackgroundInert(inert) {
  // Mark non-modal siblings of <body> as inert so screen readers and Tab skip them.
  for (const child of document.body.children) {
    if (child === refs.helpModal) continue;
    if (child.id === "live-polite" || child.id === "live-assertive") continue;
    if (inert) {
      child.setAttribute("inert", "");
      child.setAttribute("aria-hidden", "true");
    } else {
      child.removeAttribute("inert");
      child.removeAttribute("aria-hidden");
    }
  }
}

function updateHelpShortcutHints() {
  if (!refs.helpShortcutCopy) return;
  if (isSoloContext()) {
    refs.helpShortcutCopy.textContent =
      "C는 방 초대 링크가 생성되지 않은 상태에서는 비활성입니다. 멀티플레이 로비에서만 링크를 복사할 수 있습니다.";
    return;
  }
  if (!clientState.roomCode) {
    refs.helpShortcutCopy.textContent =
      "C는 방에 입장한 뒤 사용 가능합니다(현재는 복사할 링크가 없음). F: 전체화면 전환, R: 리매치(동의/시작).";
    return;
  }
  refs.helpShortcutCopy.textContent =
    "C: 현재 방 초대 링크 복사, F: 전체화면 전환, R: 리매치(동의/시작).";
}

function openHelpModal() {
  if (!refs.helpModal) return;
  helpPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  updateHelpShortcutHints();
  refs.helpModal.hidden = false;
  document.body.classList.add("help-open");
  // Mirror the dialog's open state on the launcher so screen readers announce the
  // expanded/collapsed transition without duplicating the click event.
  refs.helpBtn?.setAttribute("aria-expanded", "true");
  setBackgroundInert(true);
  refs.helpCloseBtn?.focus();
}

function closeHelpModal() {
  if (!refs.helpModal) return;
  refs.helpModal.hidden = true;
  document.body.classList.remove("help-open");
  refs.helpBtn?.setAttribute("aria-expanded", "false");
  setBackgroundInert(false);
  if (helpPreviousFocus && helpPreviousFocus.isConnected) {
    helpPreviousFocus.focus();
  } else {
    refs.helpBtn?.focus();
  }
}

function trapHelpFocus(event) {
  if (!refs.helpModal || refs.helpModal.hidden || event.key !== "Tab") {
    return;
  }
  const focusables = focusableWithinHelp();
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !refs.helpModal.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || !refs.helpModal.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

refs.helpBtn?.addEventListener("click", openHelpModal);
refs.helpCloseBtn?.addEventListener("click", closeHelpModal);

function shouldShowWelcome() {
  if (!refs.welcomeCard) return false;
  if (safeLocalStorage.get(STORAGE_KEYS.welcomed) === "true") return false;
  if (clientState.localMode) return false;
  if (clientState.roomCode) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("room")) return false;
  return true;
}

function getWelcomeRejoinRoomCode() {
  if (isOfflineOnlyRuntime()) {
    return "";
  }
  if (clientState.roomCode) {
    return "";
  }
  const inviteRoomCode = sanitizeRoomCodeCandidate(new URLSearchParams(window.location.search).get("room") || "");
  if (inviteRoomCode) {
    return "";
  }
  return normalizedPersistedRoomCode;
}

function normalizeJoinCodeInput(value = "") {
  return normalizeRoomCodeDraft(value);
}

function extractJoinCodeFromText(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const direct = sanitizeRoomCodeCandidate(raw);
  if (direct) return direct;

  try {
    const pastedUrl = new URL(raw);
    const fromQuery = sanitizeRoomCodeCandidate(pastedUrl.searchParams.get("room") || "");
    if (fromQuery) return fromQuery;
  } catch {
    // Not a URL-like string; continue with token fallback.
  }

  const match = raw.match(/[A-Za-z0-9]{4,6}/gi)?.at(0);
  return match ? sanitizeRoomCodeCandidate(match) : "";
}

async function handleJoinCodePaste() {
  if (!refs.joinCode) return;
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
    setFlashMessage("이 브라우저는 클립보드 읽기를 지원하지 않습니다.");
    return;
  }

  let pasted = "";
  try {
    pasted = await navigator.clipboard.readText();
  } catch {
    setFlashMessage("클립보드 권한이 없어 붙여넣기를 불러올 수 없습니다.");
    return;
  }

  const next = extractJoinCodeFromText(pasted);
  if (!next) {
    setFlashMessage("클립보드에 유효한 방 코드(4~6자리 영문/숫자)가 없습니다.");
    return;
  }
  refs.joinCode.value = next;
  handleJoinCodeInput();
  setFlashMessage(`방 코드를 붙여넣었습니다: ${next}`);
  if (typeof refs.joinCode.focus === "function") {
    refs.joinCode.focus();
  }
  if (typeof refs.joinCode.setSelectionRange === "function") {
    refs.joinCode.setSelectionRange(0, refs.joinCode.value.length);
  }
}

function handleJoinCodePasteFromClipboard(event) {
  const text = event.clipboardData?.getData?.("text");
  if (!text || !refs.joinCode) return;
  const next = extractJoinCodeFromText(text);
  if (!next) return;
  event.preventDefault();
  refs.joinCode.value = next;
  handleJoinCodeInput();
  setFlashMessage(`방 코드를 붙여넣었습니다: ${next}`);
  if (typeof refs.joinCode.focus === "function") {
    refs.joinCode.focus();
  }
  if (typeof refs.joinCode.setSelectionRange === "function") {
    refs.joinCode.setSelectionRange(0, refs.joinCode.value.length);
  }
}

function dismissWelcome() {
  if (!refs.welcomeCard) return;
  refs.welcomeCard.hidden = true;
  safeLocalStorage.set(STORAGE_KEYS.welcomed, "true");
  focusGatewayPrimaryInput();
}

function focusGatewayPrimaryInput() {
  const focusTarget = refs.createName && refs.createName.offsetParent != null ? refs.createName : refs.joinName;
  if (!focusTarget) {
    return;
  }
  focusTarget.focus();
  if (typeof focusTarget.setSelectionRange === "function") {
    focusTarget.setSelectionRange(0, focusTarget.value.length);
  }
  const formTarget = focusTarget === refs.createName ? refs.createForm : refs.joinForm;
  if (formTarget && typeof formTarget.scrollIntoView === "function") {
    formTarget.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function maybeShowWelcome() {
  if (!refs.welcomeCard) return;
  const shouldShow = shouldShowWelcome();
  refs.welcomeCard.hidden = !shouldShow;
}

function updateWelcomeCreateLabel() {
  if (!refs.welcomeCreateBtn) return;
  refs.welcomeCreateBtn.textContent = isOfflineOnlyRuntime() ? "바로 솔로 플레이" : "바로 방 만들기";
}

function updateWelcomeModePanel() {
  if (!refs.welcomeModeBanner || !refs.welcomeModeSteps) return;
  const isStatic = isOfflineOnlyRuntime();
  refs.welcomeModeBanner.textContent = isStatic
    ? "정적판: 오프라인 솔로만 (멀티 서버 없이 즉시 시작)"
    : "실시간 멀티플레이: 서버에 연결해 방/초대로 함께 플레이";
  const stepA = isStatic ? "내 이름 입력" : "방 만들기";
  const stepB = isStatic ? "바로 솔로 플레이 시작" : "코드/링크 공유 후 친구 초대";
  refs.welcomeModeSteps.replaceChildren(
    ...[stepA, stepB, "도움말 확인"].map((text, index) => {
      const node = document.createElement("li");
      node.textContent = `${index + 1}단계: ${text}`;
      return node;
    })
  );
  if (refs.gatewayModeHint) {
    refs.gatewayModeHint.textContent = isStatic
      ? "게임 모드: 오프라인 솔로 (서버 연결 없이 즉시 플레이)"
      : "게임 모드: 실시간 멀티플레이 (초대/입장 시 동시 대전 가능)";
  }
  if (refs.welcomeRejoinBtn) {
    const rejoinCode = getWelcomeRejoinRoomCode();
    refs.welcomeRejoinBtn.hidden = !rejoinCode;
    refs.welcomeRejoinBtn.textContent = rejoinCode
      ? `직전 방 ${rejoinCode} 이어하기`
      : "직전 방으로 이어하기";
  }
}

refs.welcomeDismissBtn?.addEventListener("click", dismissWelcome);
refs.welcomeCreateBtn?.addEventListener("click", () => {
  if (isOfflineOnlyRuntime()) {
    startOfflineSolo();
    return;
  }

  if (clientState.socketReady) {
    dismissWelcome();
  }
  // Keep welcome card visible when socket is unavailable so users keep the onboarding
  // context and can retry with a new state hint from the flash message.
  handleCreateRoom({ preventDefault() {} });
});
refs.welcomeRejoinBtn?.addEventListener("click", () => {
  const rejoinCode = getWelcomeRejoinRoomCode();
  if (!rejoinCode || isOfflineOnlyRuntime()) {
    setFlashMessage("직전 방 이어보기는 실시간 멀티플레이에서만 가능합니다.");
    render();
    return;
  }
  if (!clientState.socketReady) {
    setFlashMessage("서버 연결이 끊겼습니다. 잠시 후 자동으로 재연결됩니다.");
    render();
    return;
  }
  if (refs.joinCode) {
    refs.joinCode.value = rejoinCode;
  }
  const fallbackName =
    sanitizePlayerName(safeLocalStorage.get(STORAGE_KEYS.name) || clientState.lastName || "") ||
    "플레이어";
  if (refs.joinName && !refs.joinName.value) {
    refs.joinName.value = fallbackName;
  }
  handleJoinNameInput();
  handleJoinCodeInput();
  handleJoinRoom({ preventDefault() {} });
});
refs.welcomeHelpBtn?.addEventListener("click", () => {
  dismissWelcome();
  openHelpModal();
});
refs.joinName?.addEventListener("input", () => {
  handleJoinNameInput();
});
refs.joinName?.addEventListener("blur", handleJoinNameInput);
refs.createName?.addEventListener("input", handleCreateNameInput);
refs.createName?.addEventListener("blur", handleCreateNameInput);
refs.joinCode?.addEventListener("input", handleJoinCodeInput);
refs.joinCode?.addEventListener("blur", handleJoinCodeInput);
refs.joinCode?.addEventListener("paste", handleJoinCodePasteFromClipboard);
refs.joinCodePasteBtn?.addEventListener("click", () => {
  void handleJoinCodePaste();
});
refs.joinAsSpectator?.addEventListener("change", (event) => {
  setJoinRolePreference(event.currentTarget?.checked ? "spectator" : "player");
});

handleCreateNameInput();
handleJoinNameInput();
handleJoinCodeInput();

maybeShowWelcome();
refs.helpModal?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.helpDismiss != null) {
    closeHelpModal();
  }
});
document.addEventListener("keydown", trapHelpFocus, true);
refs.offlineRetryBtn?.addEventListener("click", forceReconnectNow);
refs.offlineFallbackSoloBtn?.addEventListener("click", () => {
  if (!canFallbackToOfflineSolo()) {
    setFlashMessage("현재 진행 중인 게임에서는 바로 오프라인 솔로로 전환할 수 없습니다.");
    return;
  }
  startOfflineSolo();
  hideOfflineBanner();
});
// Direct user opt-in to load the new SW's freshly cached assets. We don't auto-reload because
// it would interrupt an in-progress game; the banner stays visible until the user agrees.
refs.updateReloadBtn?.addEventListener("click", () => {
  hideUpdateBanner();
  window.location.reload();
});

// Browser-level network transitions should reflect in the WS layer immediately instead of waiting for backoff.
window.addEventListener("online", () => {
  if (!clientState.socketReady) {
    forceReconnectNow();
  }
});

// 'offline' fires when the OS reports the network is gone. Without this, the user keeps
// staring at "실시간 연결됨" until the WS heartbeat (30s in production) finally catches the
// drop. We both surface an explicit offline state and preempt the socket close event.
window.addEventListener("offline", () => {
  clientState.reconnectPaused = false;
  clientState.reconnectDelayMs = 0;
  clearReconnectCountdownTimer();
  refs.connectionIndicator.textContent = "오프라인 · 네트워크 확인 중";
  showOfflineBanner("네트워크가 일시적으로 끊겼습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", {
    offline: true,
    buttonLabel: "지금 다시 시도",
    showOfflineFallback: canFallbackToOfflineSolo(),
  });
  if (clientState.socket && clientState.socket.readyState === WebSocket.OPEN) {
    try {
      clientState.socket.close();
    } catch {
      // ignore
    }
  }
});

// When the user re-focuses a background tab whose WS has gone dormant, reset the exponential backoff and retry now.
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.visibilityState !== "visible") return;
    if (clientState.socketReady) return;
    if (!navigator.onLine) return;
    forceReconnectNow();
  },
  { passive: true }
);

// bfcache restore: when the user navigates away then uses the back button, modern browsers
// can resume the page from disk without re-running module init. Our WebSocket was closed
// during navigation, so we must explicitly reconnect — otherwise the user is stuck on a
// stale "connected" UI that never receives updates. event.persisted=true marks bfcache.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  if (clientState.sessionTakenOver) return;
  if (clientState.socketReady) return;
  forceReconnectNow();
});

// Warn before closing the tab mid-game so teammates do not lose a player to an accidental tab dismissal.
window.addEventListener("beforeunload", (event) => {
  const activeGame = clientState.game && clientState.game.phase === "playing" && clientState.yourRole === "player";
  if (!activeGame) return;
  // Modern browsers ignore the custom string and show their own warning; returnValue must be set to trigger it.
  event.preventDefault();
  event.returnValue = "";
});

for (const button of refs.createTeamSizeButtons) {
  button.addEventListener("click", () => {
    const nextSize = normalizeTeamSize(button.dataset.createTeamSize);
    clientState.preferredTeamSize = nextSize;
    if (!clientState.roomCode) {
      clientState.teamSize = nextSize;
      clientState.requiredPlayers = nextSize * 2;
    }
    saveSessionMeta();
    playSound("tap");
    render();
  });
}
for (const button of refs.teamSizeButtons) {
  button.addEventListener("click", () => {
    setRoomSettings({ teamSize: normalizeTeamSize(button.dataset.teamSize) });
  });
}
for (const button of refs.aiModeButtons) {
  button.addEventListener("click", () => setBotDifficulty(button.dataset.aiMode));
}
refs.allowSpectatorsToggle.addEventListener("change", () => {
  setRoomSettings({ allowSpectators: refs.allowSpectatorsToggle.checked });
});
for (const button of refs.rematchModeButtons) {
  button.addEventListener("click", () => setRoomSettings({ rematchMode: button.dataset.rematchMode }));
}
refs.clearHistoryBtn?.addEventListener("click", clearMatchHistory);
refs.startTestBtn.addEventListener("click", () => {
  if (refs.startTestBtn.disabled) return;
  refs.startTestBtn.disabled = true;
  playSound("tap");
  sendSocket({ type: "start_test_room" });
  // Re-evaluate disabled state once the room transitions; guard against stuck UI if server stalls.
  window.setTimeout(() => render(), 1200);
});
refs.discardPileBtn.addEventListener("click", discardToPile);
refs.deckPileBtn.addEventListener("click", drawFromDeck);
refs.cancelSelectionBtn.addEventListener("click", () => {
  clearSelection();
  playSound("tap");
  render();
});
refs.discardDeadBtn.addEventListener("click", () => {
  const card = selectedCard();
  if (!card) {
    return;
  }
  animateCardToElement(card.id, refs.discardPileBtn, "discard");
  playSound("tap");
  sendSocket({
    type: "discard_dead",
    cardId: card.id,
  });
});
refs.rematchBtn.addEventListener("click", () => {
  if (refs.rematchBtn.disabled) return;
  // Prevent double-click spam that would fire the WS message twice and briefly confuse the vote counter.
  refs.rematchBtn.disabled = true;
  sendSocket({ type: "rematch" });
  playSound("tap");
  // The server's next room_snapshot flips disabled back via render(); if the round-trip stalls, re-enable after 1.2s.
  window.setTimeout(() => {
    if (clientState.roomPhase === "finished") {
      render();
    }
  }, 1200);
});
canvas.addEventListener("click", handleBoardClick);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  clientState.deferredInstallPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  clientState.appInstalled = true;
  clientState.deferredInstallPrompt = null;
  updateInstallButton();
  setFlashMessage("Sequence Arena가 설치되었습니다.");
  render();
});

document.addEventListener(
  "pointerdown",
  () => {
    ensureAudioContext();
  },
  { passive: true }
);

function navigateBoardCursor(direction) {
  const targets = clientState.legalTargets;
  if (targets.length === 0) {
    return;
  }
  const currentCellId = targets[clientState.keyboardBoardIndex] ?? targets[0];
  const currentRow = Math.floor(currentCellId / BOARD_SIZE);
  const currentCol = currentCellId % BOARD_SIZE;

  if (direction === "left" || direction === "right") {
    const step = direction === "right" ? 1 : -1;
    clientState.keyboardBoardIndex =
      (clientState.keyboardBoardIndex + step + targets.length) % targets.length;
    return;
  }

  const step = direction === "down" ? 1 : -1;
  let bestIndex = -1;
  let bestScore = Infinity;
  for (let i = 0; i < targets.length; i += 1) {
    const cell = targets[i];
    const row = Math.floor(cell / BOARD_SIZE);
    const col = cell % BOARD_SIZE;
    const rowDelta = (row - currentRow) * step;
    if (rowDelta <= 0) {
      continue;
    }
    const score = rowDelta * BOARD_SIZE + Math.abs(col - currentCol);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) {
    // wrap around: find closest row in opposite direction
    bestScore = Infinity;
    for (let i = 0; i < targets.length; i += 1) {
      const cell = targets[i];
      const row = Math.floor(cell / BOARD_SIZE);
      const col = cell % BOARD_SIZE;
      const score = (step > 0 ? row : BOARD_SIZE - row) * BOARD_SIZE + Math.abs(col - currentCol);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
  }
  if (bestIndex >= 0) {
    clientState.keyboardBoardIndex = bestIndex;
  }
}

function confirmBoardCursorPlay() {
  const card = selectedCard();
  const targets = clientState.legalTargets;
  if (!card || targets.length === 0) {
    return;
  }
  const targetCellId = targets[clientState.keyboardBoardIndex] ?? targets[0];
  animateCardToPoint(card.id, pointForBoardCell(targetCellId), "board");
  playSound("tap");
  sendSocket({
    type: "play_card",
    cardId: card.id,
    targetCellId,
  });
}

document.addEventListener("keydown", (event) => {
  ensureAudioContext();
  const key = event.key.toLowerCase();
  const activeElement = document.activeElement;
  const isTypingTarget =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement && activeElement.isContentEditable);

  if (isTypingTarget) {
    return;
  }

  if (refs.helpModal && !refs.helpModal.hidden && key === "escape") {
    event.preventDefault();
    closeHelpModal();
    return;
  }
  if (key === "?" || (event.shiftKey && key === "/")) {
    event.preventDefault();
    if (refs.helpModal?.hidden) {
      openHelpModal();
    } else {
      closeHelpModal();
    }
    return;
  }

  if (key === "f") {
    toggleFullscreen();
    return;
  }

  if (key === "r") {
    if (!refs.rematchBtn || refs.rematchBtn.disabled || refs.rematchBtn.hidden) {
      return;
    }
    event.preventDefault();
    refs.rematchBtn.click();
    return;
  }

  if (key === "c" && !event.ctrlKey && !event.metaKey && !event.altKey && clientState.roomCode && !clientState.localMode) {
    event.preventDefault();
    copyRoomLink().catch(() => {
      setFlashMessage("초대 링크 복사에 실패했습니다.");
      render();
    });
    return;
  }

  if (key === "escape") {
    event.preventDefault();
    if (!refs.welcomeCard?.hidden) {
      dismissWelcome();
    } else if (clientState.selectedCardId != null) {
      clearSelection();
      render();
    }
    return;
  }

  if (!canChooseCard()) {
    return;
  }

  const inBoardNav = clientState.selectedCardId != null && clientState.legalTargets.length > 0;
  if (inBoardNav) {
    if (key === "arrowright") {
      event.preventDefault();
      navigateBoardCursor("right");
      render();
      return;
    }
    if (key === "arrowleft") {
      event.preventDefault();
      navigateBoardCursor("left");
      render();
      return;
    }
    if (key === "arrowdown") {
      event.preventDefault();
      navigateBoardCursor("down");
      render();
      return;
    }
    if (key === "arrowup") {
      event.preventDefault();
      navigateBoardCursor("up");
      render();
      return;
    }
    if (key === "enter" || key === " ") {
      event.preventDefault();
      confirmBoardCursorPlay();
      return;
    }
  }

  const hand = yourHand();
  if (hand.length === 0) {
    return;
  }

  if (key === "arrowright" || key === "arrowdown") {
    event.preventDefault();
    clientState.keyboardHandIndex = (clientState.keyboardHandIndex + 1) % hand.length;
    render();
    return;
  }

  if (key === "arrowleft" || key === "arrowup") {
    event.preventDefault();
    clientState.keyboardHandIndex = (clientState.keyboardHandIndex - 1 + hand.length) % hand.length;
    render();
    return;
  }

  if (key === "enter") {
    event.preventDefault();
    setSelectedCard(hand[clientState.keyboardHandIndex].id);
    return;
  }

  if (key === "a") {
    event.preventDefault();
    selectFirstUsefulCard();
    return;
  }

  if (key === "b") {
    event.preventDefault();
    playFirstAvailableTarget();
  }
});

window.render_game_to_text = serializeState;
window.advanceTime = () => {
  render();
};
window.sequenceTest = {
  send(payload) {
    sendSocket(payload);
  },
  // Test-only: lets ui-regression simulate a server protocol bump without spinning up a
  // separate server build. Only sets UI state (banner + flash); a malicious caller could
  // self-inflict the banner but would damage no one else, so the surface is acceptable.
  triggerProtocolMismatch(serverVersion) {
    warnProtocolMismatch(serverVersion);
  },
  // Audio/haptic introspection for ui-regression. Headless Chromium has no audio device,
  // so visual/canvas assertions can confirm the *intent* to play a sound by reading the
  // last-requested name. Haptic intent is similarly mirrored at window.__sequenceLastHaptic.
  audio: {
    get lastSoundPlayed() { return window.__sequenceLastSound || null; },
    get soundHistory() { return [...(window.__sequenceSoundHistory || [])]; },
    get lastHapticPattern() { return window.__sequenceLastHaptic || null; },
    get hapticHistory() { return [...(window.__sequenceHapticHistory || [])]; },
    get audioMuted() { return clientState.audioMuted; },
    get hapticsMuted() { return clientState.hapticsMuted; },
    get soundVolumePercent() { return clientState.soundVolume; },
    get hapticsIntensityPercent() { return clientState.hapticsIntensity; },
    reset() {
      window.__sequenceLastSound = null;
      window.__sequenceLastHaptic = null;
      window.__sequenceSoundHistory = [];
      window.__sequenceHapticHistory = [];
    },
  },
  // Sequence-cascade visual state for ui-regression. Returns a snapshot of the active
  // cascade (cells, team, elapsedMs) or null if no cascade is currently animating.
  get sequenceCascade() {
    const c = clientState.sequenceCascade;
    if (!c) return null;
    return { cells: [...c.cells], team: c.team, elapsedMs: performance.now() - c.startedAt };
  },
  // Victory-wash visual state, same shape — null when no wash is animating.
  get victoryWash() {
    const w = clientState.victoryWash;
    if (!w) return null;
    return { team: w.team, elapsedMs: performance.now() - w.startedAt };
  },
};

if ("serviceWorker" in navigator) {
  // Pinned policy for the SW URL specifically — even though the default policy would accept
  // any string, having this named policy means the explicit register() call site can only
  // ever target ./service-worker.js, blocking a future XSS that tries to redirect SW
  // registration to an attacker-controlled URL.
  const SW_URL = "./service-worker.js";
  let swScriptUrl = SW_URL;
  if (window.trustedTypes && typeof window.trustedTypes.createPolicy === "function") {
    try {
      const swPolicy = window.trustedTypes.createPolicy("sequence-arena-sw-url", {
        createScriptURL: (input) => {
          if (input !== SW_URL) {
            throw new TypeError(`Disallowed Trusted Types script URL: ${input}`);
          }
          return input;
        },
      });
      swScriptUrl = swPolicy.createScriptURL(SW_URL);
    } catch {
      // If the browser refuses the policy (duplicate name in dev hot reload, etc.), fall
      // back to the raw string. CSP either doesn't have require-trusted-types-for here or
      // accepts the existing equivalent policy.
    }
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swScriptUrl)
      .then((registration) => {
        // Long-lived tabs (gameplay sessions running for hours) used to miss new deploys
        // until the user manually refreshed because the browser only checks for SW updates
        // on navigation. Polling registration.update() once an hour catches a fresh
        // service-worker.js (already served with no-cache + must-revalidate) and triggers
        // the existing controllerchange flash + reload prompt.
        if (registration && typeof registration.update === "function") {
          const updateInterval = setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);
          // Stop polling if the page is hidden long enough that the OS suspends the tab —
          // the next visibility change re-fires this register flow.
          window.addEventListener("pagehide", () => clearInterval(updateInterval), { once: true });
        }
      })
      .catch(() => {});
  });
  const swHadInitialController = !!navigator.serviceWorker.controller;
  let swReloadPrompted = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloadPrompted) return;
    // 페이지가 controller 없이 로드된 경우의 controllerchange는 첫 SW 설치(clients.claim)
    // 이지 진짜 업데이트가 아님. 첫 방문자에게 "새 버전 있음" 배너를 띄우면 안 된다.
    if (!swHadInitialController) {
      return;
    }
    swReloadPrompted = true;
    showUpdateBanner();
    // The flash message stays as a visible secondary signal for users who dismiss the banner
    // by tabbing away — the banner is the primary CTA but a single mechanism risks missing
    // users on screen readers that announce only one polite live region at a time.
    const message = "새 버전이 설치되었습니다. 새로고침하면 최신 기능을 사용할 수 있습니다.";
    setFlashMessage(message);
    announceAssertive(message);
  });
}

function showUpdateBanner() {
  if (!refs.updateBanner) return;
  refs.updateBanner.hidden = false;
}

function hideUpdateBanner() {
  if (!refs.updateBanner) return;
  refs.updateBanner.hidden = true;
}

const CLIENT_ERROR_APP_VERSION = "sequence-arena-client-1";
const CLIENT_PROTOCOL_VERSION = 1;
let protocolWarningShown = false;

function warnProtocolMismatch(serverVersion) {
  if (protocolWarningShown) return;
  protocolWarningShown = true;
  setFlashMessage(
    `새 버전이 배포되었습니다(서버 프로토콜 ${serverVersion}, 현재 ${CLIENT_PROTOCOL_VERSION}). 페이지를 새로고침하면 최신 기능을 사용할 수 있습니다.`
  );
  // Reuse the SW update banner — protocol mismatch and "new SW installed" both mean
  // "client code is stale, please refresh", so showing two competing UX surfaces would
  // dilute the signal. The persistent banner with a "지금 새로고침" button is the
  // strongest call to action we have; flash text alone is easy to miss in long-lived
  // game sessions where the player is focused on the board.
  try {
    showUpdateBanner();
  } catch {
    // showUpdateBanner is declared after this function in the source order — defensive
    // try/catch covers the rare path where this fires during module init.
  }
  try {
    announceAssertive("서버가 업데이트되었습니다. 페이지를 새로고침하세요.");
  } catch {
    // announcePolite/Assertive may not be ready in very early boot; ignore.
  }
  render();
}
let recentErrorBeaconCount = 0;
const MAX_ERROR_BEACONS_PER_SESSION = 20;
const ERROR_BEACON_DEDUPE_MS = 30_000;
const recentErrorBeaconKeys = new Map();

function reportClientError(kind, message, details = {}) {
  if (isStaticPagesHost()) {
    return;
  }
  if (recentErrorBeaconCount >= MAX_ERROR_BEACONS_PER_SESSION) {
    return;
  }
  if (!message || typeof message !== "string") {
    return;
  }
  if (kind !== "web-vitals") {
    const now = Date.now();
    const key = `${kind}|${message.slice(0, 160)}|${details.source || ""}|${details.line || ""}|${details.column || ""}`;
    if (recentErrorBeaconKeys.get(key) > now - ERROR_BEACON_DEDUPE_MS) {
      return;
    }
    recentErrorBeaconKeys.set(key, now);
    if (recentErrorBeaconKeys.size > MAX_ERROR_BEACONS_PER_SESSION * 2) {
      recentErrorBeaconKeys.delete(recentErrorBeaconKeys.keys().next().value);
    }
  }
  recentErrorBeaconCount += 1;
  const payload = JSON.stringify({
    kind,
    message: message.slice(0, 500),
    source: typeof details.source === "string" ? details.source : undefined,
    line: typeof details.line === "number" ? details.line : undefined,
    column: typeof details.column === "number" ? details.column : undefined,
    stack: typeof details.stack === "string" ? details.stack.slice(0, 1200) : undefined,
    vitals: details.vitals && typeof details.vitals === "object" ? details.vitals : undefined,
    userAgent: navigator.userAgent?.slice(0, 300),
    appVersion: CLIENT_ERROR_APP_VERSION,
  });
  try {
    if (navigator.sendBeacon?.("/client-error", new Blob([payload], { type: "application/json" }))) {
      return;
    }
  } catch {
    // sendBeacon may not be supported or may throw for unusual payloads; fall back to fetch keepalive.
  }
  try {
    fetch("/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Swallow: error reporting must never crash the app.
  }
}

window.addEventListener("error", (event) => {
  reportClientError("error", event.message || "Unknown client error", {
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  reportClientError("unhandledrejection", message || "Unhandled promise rejection", { stack });
});

function observeWebVitals() {
  if (typeof PerformanceObserver !== "function") {
    return;
  }
  let lcp = null;
  let clsTotal = 0;
  let maxInp = 0;
  const trySend = () => {
    if (lcp == null && clsTotal === 0 && maxInp === 0) return;
    // navigator.connection is Chrome/Edge/Android-WebView-only — Safari and Firefox don't
    // expose it. Feature-detect and pass null so the server can distinguish "we don't know"
    // from "user is on slow-2g". The signal lets ops correlate p95 LCP spikes with a flood
    // of cellular sessions vs an actual app regression.
    const connection =
      typeof navigator !== "undefined"
        ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
        : null;
    const effectiveType = typeof connection?.effectiveType === "string" ? connection.effectiveType : null;
    const saveData = typeof connection?.saveData === "boolean" ? connection.saveData : null;
    reportClientError("web-vitals", "web-vitals-sample", {
      vitals: {
        lcpMs: lcp != null ? Math.round(lcp) : null,
        cls: Math.round(clsTotal * 1000) / 1000,
        inpMs: Math.round(maxInp),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        effectiveType,
        saveData,
      },
    });
  };

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        lcp = entries[entries.length - 1].renderTime || entries[entries.length - 1].startTime;
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // LCP not supported
  }

  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsTotal += entry.value;
        }
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch {
    // CLS not supported
  }

  try {
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > maxInp) {
          maxInp = entry.duration;
        }
      }
    });
    eventObserver.observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch {
    // Event timing not supported
  }

  // Send once after the page has stabilised (10s) and again when the tab becomes hidden.
  window.setTimeout(trySend, 10_000);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        trySend();
      }
    },
    { passive: true }
  );
}

function printConsoleBanner() {
  // Suppress the banner for headless Playwright (which sets webdriver) so regression logs stay focused.
  if (navigator.webdriver) return;
  const brand = "%cSequence Arena";
  const brandStyle =
    "font: 900 28px/1 'Trebuchet MS', sans-serif; color: #fff8e9; background: linear-gradient(135deg, #10372e, #c99a3c); padding: 10px 18px; border-radius: 8px;";
  const info = "%cGitHub Pages 정적판 · https://concrete-sangminlee.github.io/sequence-arena/";
  const infoStyle = "color: #68766e; font: 600 12px 'Inter', sans-serif; padding-left: 4px;";
  const warnStyle = "color: #b01d3c; font: 900 16px 'Inter', sans-serif;";
  const detailStyle = "color: #68766e; font: 500 12px 'Inter', sans-serif; padding-left: 4px;";
  try {
    console.log(brand + "\n" + info, brandStyle, infoStyle);
    console.log(
      "%c주의: Self-XSS 경고",
      warnStyle
    );
    console.log(
      "%c누가 콘솔에 코드를 붙여넣으라고 하면 절대 붙여넣지 마세요. 방 코드·세션·계정이 탈취될 수 있습니다. 보안 제보는 https://github.com/concrete-sangminlee/sequence-arena/security/advisories/new 로 보내주세요.",
      detailStyle
    );
  } catch {
    // Some environments (strict Safari, embedded WebViews) restrict %c styling; swallow silently.
  }
}

printConsoleBanner();

observeWebVitals();

async function fetchBuildVersion() {
  const target = document.getElementById("help-build-version");
  if (!target) return;
  if (isStaticPagesHost()) {
    target.textContent = "GitHub Pages 정적판";
    target.setAttribute("data-build-version", "github-pages-static");
    return;
  }
  try {
    // Cap the fetch so a slow or hung /healthz never leaves the help-modal label stuck at
    // "버전 확인 중…". 5s is generous compared to typical Render p95 (<200ms) but tolerates
    // cellular jitter; AbortError lands in the catch and shows the friendly fallback.
    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5000) : undefined;
    const response = await fetch("/healthz", { cache: "no-store", signal });
    if (!response.ok) throw new Error(`healthz ${response.status}`);
    const payload = await response.json();
    const version = typeof payload.version === "string" ? payload.version : "unknown";
    target.textContent = `빌드 ${version.slice(0, 8)}`;
    target.setAttribute("data-build-version", version);
  } catch {
    target.textContent = "빌드 정보를 가져오지 못했습니다.";
  }
}

fetchBuildVersion();
watchNotificationPermission();
pruneOfflineRuntimeRecoveredState();

connectSocket();
render();
