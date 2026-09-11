// Client-side i18n for the Korean-first UI. Korean is the product default (and the shipped
// rendered default in index.html); English is a persisted, opt-in toggle. Comments/logs stay
// English per CONTRIBUTING; only USER-FACING copy lives in the catalog.
//
// SAST: this module is a shipped client file, so it must not use innerHTML / eval / Function /
// string timers. applyStaticTranslations() uses textContent + setAttribute only.
//
// Node-testable: the catalog is plain data and every function is pure w.r.t. an injected
// storage stub (or the module-level currentLocale), so scripts/i18n-test.mjs can exercise it
// without a DOM.

export const LOCALES = ["ko", "en"];
export const DEFAULT_LOCALE = "ko";
export const LOCALE_STORAGE_KEY = "sequence-arena-locale";

// Stable, semantic keys — never the Korean text itself, so a copy edit does not churn keys.
// Every key MUST exist in BOTH ko and en (scripts/i18n-test.mjs enforces parity + non-empty).
export const catalog = {
  ko: {
    // Topbar / chrome
    "app.tagline": "실시간 팀전 보드게임",
    "topbar.legend.aria": "팀별 좌석 안내",
    "topbar.themeToggle.toDark": "다크 모드 켜기",
    "topbar.themeToggle.toLight": "라이트 모드 켜기",
    "topbar.stats.aria": "내 기록 보기",
    "topbar.stats.title": "내 기록 (데일리 캘린더 · 전적)",
    "topbar.help.aria": "게임 규칙과 단축키 보기",
    "topbar.help.title": "게임 규칙 · 단축키 (?)",
    "topbar.install.aria": "앱 설치",
    "topbar.install.title": "앱 설치",
    "topbar.notification.aria": "내 차례 브라우저 알림 켜기",
    "topbar.notification.title": "내 차례 알림 켜기",
    "topbar.sound.aria": "사운드 켜기",
    "topbar.sound.title": "사운드 켜기",
    "topbar.haptics.aria": "진동 피드백 끄기",
    "topbar.haptics.title": "진동 끄기",
    "topbar.locale.toEnglish.aria": "영어로 전환",
    "topbar.locale.toEnglish.title": "English",
    "topbar.locale.toKorean.aria": "한국어로 전환",
    "topbar.locale.toKorean.title": "한국어",
    "topbar.locale.switchedToEnglish": "Switched to English.",
    "topbar.locale.switchedToKorean": "한국어로 전환했습니다.",
    // Skip link / noscript
    "skip.toContent": "본문으로 바로가기",
    // Gateway panel
    "gateway.heading": "방",
    "gateway.subtitle": "방을 만들거나 받은 코드로 입장하세요. 같은 브라우저에서는 좌석이 복구됩니다.",
    "gateway.createHeading": "새 방 만들기",
    "gateway.joinHeading": "기존 방 입장",
    "gateway.myName": "내 이름",
    "gateway.nameHint": "이름을 입력하세요.",
    "gateway.roomCode": "방 코드",
    "gateway.roomCodeHint": "4~6자리 영문/숫자",
    "gateway.pasteClipboard": "클립보드 붙여넣기",
    "gateway.spectatorJoin": "관전 입장",
    "gateway.createRoom": "방 만들기",
    "gateway.offlineSolo": "오프라인 솔로",
    "gateway.dailyChallenge": "오늘의 챌린지",
    "gateway.joinRoom": "방 입장",
    "gateway.matchFormat": "대결 방식",
    // Share / connection
    "share.connectionStatus": "연결 상태",
    "share.currentOrigin": "현재 접속 주소",
    "share.currentRoomCode": "현재 방 코드",
    "share.notConnected": "미접속",
    "share.copyCode": "코드 복사",
    "share.copyLink": "링크 복사",
    "share.spectatorLink": "관전 링크",
    "share.share": "공유",
    "share.leaveRoom": "방 나가기",
    "share.openLink": "링크 열기",
    "share.startTest": "혼자 테스트 시작",
    "share.enterCount": "입장 인원",
    // Host settings
    "host.settings": "방장 설정",
    "host.locked": "잠김",
    "host.aiDifficulty": "AI 난이도",
    "host.aiEasy": "쉬움",
    "host.aiSmart": "전략",
    "host.aiAggressive": "공격",
    "host.aiMaster": "마스터",
    "host.spectatorOpen": "열림",
    "host.rematch": "리매치",
    "host.rematchAll": "전원 동의",
    "host.rematchHost": "방장 시작",
    // Room / seats
    "room.heading": "좌석",
    "room.subtitle": "방에 입장하면 좌석 현황이 표시됩니다.",
    "room.enterProgress": "입장 진행도",
    // Status panel
    "status.heading": "현재 상태",
    "status.subtitle": "게임 시작 전입니다.",
    "status.waiting": "대기 중",
    "status.finalResult": "최종 결과",
    "status.rematchVote": "리매치 투표",
    "status.shareDaily": "데일리 결과 공유",
    "status.saveReplay": "리플레이 저장",
    "status.rubyTeam": "루비 팀",
    "status.cobaltTeam": "코발트 팀",
    "status.spectate": "관전",
    "status.discardPile": "버림 더미",
    "status.deck": "덱",
    "status.drawNew": "새 카드 뽑기",
    "status.empty": "비어 있음",
    // Chat
    "chat.heading": "채팅",
    "chat.subtitle": "같은 방 사람들과 대화하세요.",
    "chat.emojiRow.aria": "이모지 빠른 전송",
    "chat.inputPlaceholder": "메시지 입력",
    "chat.inputAria": "메시지 입력",
    "chat.send": "전송",
    // Hand / log / history
    "hand.heading": "내 손패",
    "hand.caption": "내 차례가 되면 카드를 선택해 보드를 클릭하세요.",
    "hand.hint": "💡 힌트",
    "hand.cancelSelection": "선택 취소",
    "hand.discardDead": "죽은 카드 버리기",
    "log.heading": "게임 로그",
    "log.subtitle": "방 전체에 공유되는 최근 액션입니다.",
    "history.heading": "경기 기록",
    "history.subtitle": "이 방에서 끝난 최근 결과입니다.",
    // Welcome card
    "welcome.dismiss.aria": "환영 카드 닫기",
    "welcome.title": "Sequence Arena에 오신 걸 환영합니다",
    "welcome.rejoin": "직전 방으로 이어하기",
    "welcome.soloPlay": "바로 솔로 플레이",
    "welcome.guidePlay": "가이드 플레이",
    "welcome.viewRules": "자세한 규칙 보기",
    // Tutorial bubble
    "tutorial.next": "다음",
    "tutorial.skip": "건너뛰기",
    // Stats modal
    "stats.title": "내 기록",
    "stats.close.aria": "내 기록 닫기",
    "stats.startDaily": "오늘의 챌린지 시작",
    // Help modal
    "help.title": "게임 규칙 · 단축키",
    "help.close.aria": "도움말 닫기",
    "help.goal": "목표",
    "help.turnFlow": "턴 진행",
    "help.jackRules": "잭(J) 특수 규칙",
    "help.dailyChallenge": "오늘의 챌린지",
    "help.deadCard": "죽은 카드",
    "help.keyboard": "키보드 · 접근성",
    "help.audioHaptics": "오디오 · 햅틱 설정",
    "help.sound": "효과음",
    "help.hapticStrength": "햅틱 세기",
    "help.privacy": "개인정보 처리방침",
    // Bot difficulty labels (dynamic, app.js)
    "bot.easy": "쉬움",
    "bot.smart": "전략",
    "bot.aggressive": "공격",
    "bot.master": "마스터",
    // Stats difficulty labels (dynamic, app.js)
    "statsDiff.easy": "쉬움",
    "statsDiff.smart": "전략",
    "statsDiff.aggressive": "공격",
    "statsDiff.master": "마스터",
    // Common close
    "common.close": "닫기",
    // --- Dynamic runtime copy (app.js renderStatus / flash / share) ---
    // History mode labels (fixes mixed ko/en: build the whole string via t()).
    "history.soloTest": "혼자 테스트 · {mode}",
    "history.offlineSolo": "오프라인 솔로 · {mode}",
    "history.multiplayer": "멀티플레이",
    // Connection indicator
    "conn.offlineSolo": "오프라인 솔로",
    "conn.staticBuild": "GitHub Pages 정적판",
    "conn.live": "실시간 연결됨",
    "conn.paused": "연결이 중단됨",
    "conn.recovering": "연결 복구 중{attempts}{delay}",
    "conn.recoveringAttempts": " ({count}회)",
    "conn.recoveringDelay": " · {delay} 재시도",
    "conn.waiting": "연결 복구 대기",
    // Turn subtitle / player / team
    "turn.finished": "게임 종료",
    "turn.discard": "카드 내려놓기",
    "turn.draw": "덱에서 뽑기",
    "turn.aiThinking": "AI 계산 중",
    "turn.seatTurn": "{seat}번 좌석 차례",
    "turn.soloWaiting": "솔로 대기",
    "turn.lobbyWaiting": "로비 대기 중 · {match}",
    "turn.notInRoom": "방 미접속",
    "turn.solo": "솔로",
    "turn.playerWaiting": "플레이어 대기",
    "turn.waiting": "대기 중",
    "turn.unknownPlayer": "알 수 없음",
    // Rematch button + vote status
    "rematch.voteStatus": "{votes} / {required} 동의",
    "rematch.recordsFirstGame": "기록은 첫 판 기준",
    "rematch.canRestart": "바로 재시작 가능",
    "rematch.hostCanStart": "방장 시작 가능",
    "rematch.hostWaiting": "방장 시작 대기",
    "rematch.retryPuzzle": "같은 퍼즐 재도전",
    "rematch.start": "리매치 시작",
    "rematch.hostWait": "방장 대기",
    "rematch.retryPuzzleAria": "{label} (R)",
    "rematch.hostOnlyAria": "방장만 리매치 시작 (R)",
    "rematch.hostWaitAria": "방장 대기 (R)",
    "rematch.retractVote": "동의 취소",
    "rematch.agree": "리매치 동의",
    "rematch.agreeAria": "{label} (R)",
    "rematch.defaultAria": "리매치 동의 (R)",
    // Winner status messages
    "status.winnerHost": "{winner} 승리. 방장이 같은 좌석으로 리매치를 시작할 수 있습니다.",
    "status.winnerVote": "{winner} 승리. 모든 접속 플레이어가 동의하면 같은 좌석으로 리매치가 시작됩니다.",
    // Hand caption
    "hand.captionSpectator": "관전 모드 · 플레이어 손패는 비공개입니다.",
    "hand.captionMine": "{name} · {team} · {turn}",
    "hand.captionMyTurn": "내 차례",
    "hand.captionWaiting": "대기 중",
    "hand.captionNoSeat": "내 좌석 정보가 아직 없습니다.",
    "hand.captionPregame": "게임이 시작되면 이 칸에 내 손패가 보입니다.",
    // Join-code validity hint (aria-invalid)
    "join.codeInvalid": "방 코드는 4~6자리 영문/숫자여야 합니다.",
    "join.codeValid": "입장할 준비가 되었습니다.",
    // Daily share presentation (client-side formatting of the shared payload)
    "share.dailyCopied": "데일리 결과를 클립보드에 복사했습니다.",
    "share.dailyShared": "데일리 결과를 공유했습니다.",
    "share.shareFailed": "공유에 실패했습니다. 다시 시도해 주세요.",
  },
  en: {
    "app.tagline": "Realtime team board game",
    "topbar.legend.aria": "Seats by team",
    "topbar.themeToggle.toDark": "Turn on dark mode",
    "topbar.themeToggle.toLight": "Turn on light mode",
    "topbar.stats.aria": "View my records",
    "topbar.stats.title": "My records (daily calendar · history)",
    "topbar.help.aria": "View game rules and shortcuts",
    "topbar.help.title": "Game rules · shortcuts (?)",
    "topbar.install.aria": "Install app",
    "topbar.install.title": "Install app",
    "topbar.notification.aria": "Turn on your-turn browser notifications",
    "topbar.notification.title": "Turn on your-turn notifications",
    "topbar.sound.aria": "Turn on sound",
    "topbar.sound.title": "Turn on sound",
    "topbar.haptics.aria": "Turn off haptic feedback",
    "topbar.haptics.title": "Turn off vibration",
    "topbar.locale.toEnglish.aria": "Switch to English",
    "topbar.locale.toEnglish.title": "English",
    "topbar.locale.toKorean.aria": "Switch to Korean",
    "topbar.locale.toKorean.title": "한국어",
    "topbar.locale.switchedToEnglish": "Switched to English.",
    "topbar.locale.switchedToKorean": "Switched to Korean.",
    "skip.toContent": "Skip to main content",
    "gateway.heading": "Room",
    "gateway.subtitle": "Create a room or join with a code. Seats are restored in the same browser.",
    "gateway.createHeading": "Create a new room",
    "gateway.joinHeading": "Join an existing room",
    "gateway.myName": "My name",
    "gateway.nameHint": "Enter your name.",
    "gateway.roomCode": "Room code",
    "gateway.roomCodeHint": "4–6 letters/numbers",
    "gateway.pasteClipboard": "Paste from clipboard",
    "gateway.spectatorJoin": "Join as spectator",
    "gateway.createRoom": "Create room",
    "gateway.offlineSolo": "Offline solo",
    "gateway.dailyChallenge": "Daily challenge",
    "gateway.joinRoom": "Join room",
    "gateway.matchFormat": "Match format",
    "share.connectionStatus": "Connection status",
    "share.currentOrigin": "Current address",
    "share.currentRoomCode": "Current room code",
    "share.notConnected": "Not connected",
    "share.copyCode": "Copy code",
    "share.copyLink": "Copy link",
    "share.spectatorLink": "Spectator link",
    "share.share": "Share",
    "share.leaveRoom": "Leave room",
    "share.openLink": "Open link",
    "share.startTest": "Start solo test",
    "share.enterCount": "Players in",
    "host.settings": "Host settings",
    "host.locked": "Locked",
    "host.aiDifficulty": "AI difficulty",
    "host.aiEasy": "Easy",
    "host.aiSmart": "Smart",
    "host.aiAggressive": "Aggressive",
    "host.aiMaster": "Master",
    "host.spectatorOpen": "Open",
    "host.rematch": "Rematch",
    "host.rematchAll": "Everyone agrees",
    "host.rematchHost": "Host starts",
    "room.heading": "Seats",
    "room.subtitle": "Seat status appears once you join a room.",
    "room.enterProgress": "Join progress",
    "status.heading": "Current status",
    "status.subtitle": "Before the game starts.",
    "status.waiting": "Waiting",
    "status.finalResult": "Final result",
    "status.rematchVote": "Vote rematch",
    "status.shareDaily": "Share daily result",
    "status.saveReplay": "Save replay",
    "status.rubyTeam": "Ruby team",
    "status.cobaltTeam": "Cobalt team",
    "status.spectate": "Spectators",
    "status.discardPile": "Discard pile",
    "status.deck": "Deck",
    "status.drawNew": "Draw a new card",
    "status.empty": "Empty",
    "chat.heading": "Chat",
    "chat.subtitle": "Talk with people in the same room.",
    "chat.emojiRow.aria": "Quick emoji send",
    "chat.inputPlaceholder": "Type a message",
    "chat.inputAria": "Type a message",
    "chat.send": "Send",
    "hand.heading": "My hand",
    "hand.caption": "On your turn, pick a card and click the board.",
    "hand.hint": "💡 Hint",
    "hand.cancelSelection": "Cancel selection",
    "hand.discardDead": "Discard dead card",
    "log.heading": "Game log",
    "log.subtitle": "Recent actions shared across the room.",
    "history.heading": "Match history",
    "history.subtitle": "Recent results finished in this room.",
    "welcome.dismiss.aria": "Close welcome card",
    "welcome.title": "Welcome to Sequence Arena",
    "welcome.rejoin": "Continue in your last room",
    "welcome.soloPlay": "Play solo now",
    "welcome.guidePlay": "Guided play",
    "welcome.viewRules": "View detailed rules",
    "tutorial.next": "Next",
    "tutorial.skip": "Skip",
    "stats.title": "My records",
    "stats.close.aria": "Close my records",
    "stats.startDaily": "Start today's challenge",
    "help.title": "Game rules · shortcuts",
    "help.close.aria": "Close help",
    "help.goal": "Goal",
    "help.turnFlow": "Turn flow",
    "help.jackRules": "Jack (J) special rules",
    "help.dailyChallenge": "Daily challenge",
    "help.deadCard": "Dead card",
    "help.keyboard": "Keyboard · accessibility",
    "help.audioHaptics": "Audio · haptic settings",
    "help.sound": "Sound effects",
    "help.hapticStrength": "Haptic strength",
    "help.privacy": "Privacy policy",
    "bot.easy": "Easy",
    "bot.smart": "Smart",
    "bot.aggressive": "Aggressive",
    "bot.master": "Master",
    "statsDiff.easy": "Easy",
    "statsDiff.smart": "Smart",
    "statsDiff.aggressive": "Aggressive",
    "statsDiff.master": "Master",
    "common.close": "Close",
    "history.soloTest": "Solo test · {mode}",
    "history.offlineSolo": "Offline solo · {mode}",
    "history.multiplayer": "Multiplayer",
    "conn.offlineSolo": "Offline solo",
    "conn.staticBuild": "GitHub Pages static build",
    "conn.live": "Connected live",
    "conn.paused": "Connection interrupted",
    "conn.recovering": "Reconnecting{attempts}{delay}",
    "conn.recoveringAttempts": " ({count}x)",
    "conn.recoveringDelay": " · retry in {delay}",
    "conn.waiting": "Waiting to reconnect",
    "turn.finished": "Game over",
    "turn.discard": "Place a card down",
    "turn.draw": "Draw from the deck",
    "turn.aiThinking": "AI thinking",
    "turn.seatTurn": "Seat {seat}'s turn",
    "turn.soloWaiting": "Solo standby",
    "turn.lobbyWaiting": "Waiting in lobby · {match}",
    "turn.notInRoom": "Not in a room",
    "turn.solo": "Solo",
    "turn.playerWaiting": "Waiting for players",
    "turn.waiting": "Waiting",
    "turn.unknownPlayer": "Unknown",
    "rematch.voteStatus": "{votes} / {required} agree",
    "rematch.recordsFirstGame": "Record uses first game",
    "rematch.canRestart": "Ready to restart",
    "rematch.hostCanStart": "Host can start",
    "rematch.hostWaiting": "Waiting for host",
    "rematch.retryPuzzle": "Retry same puzzle",
    "rematch.start": "Start rematch",
    "rematch.hostWait": "Waiting for host",
    "rematch.retryPuzzleAria": "{label} (R)",
    "rematch.hostOnlyAria": "Only the host can start the rematch (R)",
    "rematch.hostWaitAria": "Waiting for host (R)",
    "rematch.retractVote": "Retract vote",
    "rematch.agree": "Agree to rematch",
    "rematch.agreeAria": "{label} (R)",
    "rematch.defaultAria": "Agree to rematch (R)",
    "status.winnerHost": "{winner} wins. The host can start a rematch with the same seats.",
    "status.winnerVote": "{winner} wins. Once all connected players agree, a rematch starts with the same seats.",
    "hand.captionSpectator": "Spectator mode · player hands are hidden.",
    "hand.captionMine": "{name} · {team} · {turn}",
    "hand.captionMyTurn": "Your turn",
    "hand.captionWaiting": "Waiting",
    "hand.captionNoSeat": "Your seat info is not available yet.",
    "hand.captionPregame": "Your hand will appear here once the game starts.",
    "join.codeInvalid": "The room code must be 4–6 letters/numbers.",
    "join.codeValid": "Ready to join.",
    "share.dailyCopied": "Copied the daily result to the clipboard.",
    "share.dailyShared": "Shared the daily result.",
    "share.shareFailed": "Sharing failed. Please try again.",
  },
};

function normalizeLocale(value) {
  return LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

let currentLocale = DEFAULT_LOCALE;

// A guarded default storage so setLocale/getLocale work in a browser without a stub, but a
// denied localStorage (Safari private mode) never throws.
const defaultStorage = {
  get(key) {
    try {
      return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore: preference simply won't persist this session
    }
  },
};

// Interpolate {var} placeholders. Unknown placeholders are left intact so a missing var is
// visible in QA rather than silently dropping text.
function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

// t(key, vars?) — current-locale lookup, falling back to ko then the raw key when a
// translation is missing or empty.
export function t(key, vars) {
  const active = catalog[currentLocale] || catalog[DEFAULT_LOCALE];
  let value = active[key];
  if (value === undefined || value === "") {
    value = catalog[DEFAULT_LOCALE][key];
  }
  if (value === undefined || value === "") {
    value = key;
  }
  return interpolate(value, vars);
}

export function getLocale(storage = defaultStorage) {
  const persisted = storage && typeof storage.get === "function" ? storage.get(LOCALE_STORAGE_KEY) : null;
  currentLocale = normalizeLocale(persisted);
  return currentLocale;
}

export function setLocale(locale, storage = defaultStorage) {
  currentLocale = normalizeLocale(locale);
  if (storage && typeof storage.set === "function") {
    storage.set(LOCALE_STORAGE_KEY, currentLocale);
  }
  return currentLocale;
}

// Read the in-memory locale without touching storage (hot render paths).
export function activeLocale() {
  return currentLocale;
}

// Walk [data-i18n] (textContent) and [data-i18n-attr] (attributes) nodes under root.
// SAST: textContent + setAttribute only, never innerHTML.
export function applyStaticTranslations(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope || typeof scope.querySelectorAll !== "function") {
    return;
  }
  for (const node of scope.querySelectorAll("[data-i18n]")) {
    const key = node.getAttribute("data-i18n");
    if (key) {
      node.textContent = t(key);
    }
  }
  for (const node of scope.querySelectorAll("[data-i18n-attr]")) {
    const spec = node.getAttribute("data-i18n-attr");
    if (!spec) continue;
    for (const pair of spec.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx <= 0) continue;
      const attr = trimmed.slice(0, idx).trim();
      const key = trimmed.slice(idx + 1).trim();
      if (attr && key) {
        node.setAttribute(attr, t(key));
      }
    }
  }
}
