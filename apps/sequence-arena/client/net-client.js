// Client WebSocket NETWORK / RECONNECT slice. Owns the whole socket lifecycle: opening the
// connection, the open/message/close handlers, exponential-backoff reconnect scheduling plus
// its countdown UI, the offline banner reconnect controls, and the low-level send path. This
// slice is more coupled than the render slice — it calls many peer functions that STAY in
// app.js (render, setFlashMessage, applyRoomSnapshot, reconnectToSavedRoom, …) and touches
// shared mutable state (clientState, refs, safeLocalStorage). Following the board-paint.js /
// board-render.js precedent, every one of those peer references is injected once at app.js boot
// through a single module-scoped `host` handle via bindNetClientContext(); the ~430 extracted
// lines therefore move here byte-identical, each function pulling the identifiers it needs off
// `host` with a leading destructuring line (only the injected identifiers change). The two
// module-scope vars the message handler shares with app.js (spectatorClosedRecoveryAttempted)
// and the live solo runtime instance (localSoloRuntime) are threaded through getter/setter
// callbacks so both sides always see the same value. The recursive window.setTimeout(connectSocket)
// resolves to this module-local connectSocket, so reconnect backoff stays entirely in-module.

// Reconnect backoff tuning. Base 1.5s doubles per attempt, capped at 30s, with up to 400ms of
// jitter so a mass reconnect (server restart) does not thundering-herd. After 8 attempts the
// auto-reconnect pauses and the user must retry manually. These live here because only the
// functions in this module read them.
const RECONNECT_BACKOFF_BASE_MS = 1500;
const RECONNECT_BACKOFF_MAX_MS = 30_000;
const RECONNECT_BACKOFF_JITTER_MS = 400;
const RECONNECT_MAX_ATTEMPTS = 8;

let host = null;

export function bindNetClientContext(context) {
  host = context;
}

export function formatRetryDelay(ms) {
  if (!ms || ms <= 0) {
    return "곧";
  }
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}초 뒤`;
}

export function clearReconnectCountdownTimer() {
  const { clientState } = host;
  if (clientState.reconnectCountdownTimer) {
    window.clearInterval(clientState.reconnectCountdownTimer);
  }
  clientState.reconnectCountdownTimer = null;
  clientState.reconnectCountdownDeadline = 0;
}

function updateReconnectCountdownUi() {
  const { clientState, refs } = host;
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
  const { clientState } = host;
  clearReconnectCountdownTimer();
  clientState.reconnectDelayMs = Number(delayMs) > 0 ? Math.max(0, Number(delayMs)) : 0;
  if (clientState.reconnectDelayMs <= 0) {
    return;
  }
  clientState.reconnectCountdownDeadline = Date.now() + clientState.reconnectDelayMs;
  clientState.reconnectCountdownTimer = window.setInterval(updateReconnectCountdownUi, 1000);
  updateReconnectCountdownUi();
}

export function sendSocket(payload) {
  const { clientState, getLocalSoloRuntime, markPlayerActionTempo, setFlashMessage } = host;
  const type = payload?.type;
  if (type === "play_card" || type === "discard_dead" || type === "discard_to_pile" || type === "draw_from_deck") {
    // Every gameplay action funnels through here (mouse, keyboard, auto-move), making
    // this the one reliable place to measure the player's action-to-action tempo.
    markPlayerActionTempo();
  }
  if (clientState.localMode) {
    getLocalSoloRuntime()?.handle(payload);
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

export function connectSocket() {
  const {
    clientState,
    refs,
    safeLocalStorage,
    STORAGE_KEYS,
    urlRoomCode,
    CLIENT_PROTOCOL_VERSION,
    DEFAULT_MAX_MATCH_HISTORY,
    getSpectatorClosedRecoveryAttempted,
    setSpectatorClosedRecoveryAttempted,
    render,
    setFlashMessage,
    reportClientError,
    warnProtocolMismatch,
    shouldReconnectSavedRoom,
    reconnectToSavedRoom,
    maybeAutoJoinSharedRoom,
    announceAssertive,
    setJoinRolePreference,
    applyJoinServerErrorHint,
    normalizeRoomCode,
    normalizePlayerName,
    setChatFeedback,
    playSound,
    updateUrlRoom,
    clearBotThinkingTimer,
    saveSessionMeta,
    applyRoomSnapshot,
    isOfflineOnlyRuntime,
  } = host;
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
      if (message.includes("관전 입장이 닫혀 있습니다") && !message.includes("방이 가득 찼고")) {
        setJoinRolePreference("player");
        applyJoinServerErrorHint(message);
        const recoveredRoomCode = normalizeRoomCode(
          refs.joinCode?.value || clientState.roomCode || urlRoomCode || ""
        );
        const recoveredName = normalizePlayerName(
          refs.joinName?.value || safeLocalStorage.get(STORAGE_KEYS.name) || clientState.lastName || ""
        );
        if (
          !getSpectatorClosedRecoveryAttempted() &&
          recoveredRoomCode &&
          recoveredName &&
          clientState.socketReady &&
          clientState.roomCode === "" &&
          clientState.game == null &&
          refs.joinRoomBtn
        ) {
          setSpectatorClosedRecoveryAttempted(true);
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
      if (message.includes("방이 가득 찼고 관전 입장이 닫혀 있습니다")) {
        applyJoinServerErrorHint(message);
        setFlashMessage("방이 가득 찼고 관전 입장이 닫혀 있습니다.");
        return;
      }
      setFlashMessage(message);
      applyJoinServerErrorHint(message);
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
        clearBotThinkingTimer();
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

export function canFallbackToOfflineSolo() {
  const { clientState } = host;
  if (clientState.localMode) {
    return false;
  }
  if (!clientState.roomCode) {
    return true;
  }
  return clientState.roomPhase !== "playing";
}

export function showOfflineBanner(message, options = {}) {
  const { refs, announcePolite } = host;
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

export function hideOfflineBanner() {
  const { refs } = host;
  if (!refs.offlineBanner) return;
  refs.offlineBanner.hidden = true;
  refs.offlineBanner.removeAttribute("data-reconnect-state");
  if (refs.offlineFallbackSoloBtn) {
    refs.offlineFallbackSoloBtn.hidden = true;
  }
}

export function forceReconnectNow() {
  const { clientState } = host;
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
