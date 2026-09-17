// Client REPLAY + ANALYSIS UI controller slice. Owns the whole offline replay experience:
// persisting saved replays to localStorage, describing/saving the just-finished game, the
// snapshot player board, the deterministic eval bar + post-game moments analysis, playback
// stepping, share-string copy/import, the replay list modal, and the analysis-for-pending
// entry point. All DOM is built with createElement + textContent + addEventListener only
// (SAST: no innerHTML/inline handlers) — the moved code is byte-identical to app.js except
// each function gains a single leading `const { ... } = host;` destructuring line.
//
// Following the board-paint.js / board-render.js / net-client.js precedent, every peer
// callback / ref / constant / pure import the slice needs from app.js is injected once at
// boot through a single module-scoped `host` handle via bindReplayControllerContext(). The
// two module-scope vars shared with app.js are threaded through getter/setter callbacks so
// both sides always observe the same value:
//   - storedReplaysCache (read + reassigned here; app.js keeps the `let` declaration so the
//     initial load owns it) -> getStoredReplays() / setStoredReplays(next).
//   - pendingReplayToSave (set by app.js's finish hook, read in renderStatus, read/nulled
//     here) -> getPendingReplay() / setPendingReplay(next).
// `replayPreviousFocus` and `activeReplayPlayback` are purely internal to the slice, so their
// declarations live here. The event-listener registrations moved with the slice into the
// exported wireReplayControllerEvents(), which app.js calls once right after the bind.

let host = null;

export function bindReplayControllerContext(context) {
  host = context;
}

let replayPreviousFocus = null;
// The replay currently loaded into the player: { snapshots, index, record } or null.
let activeReplayPlayback = null;

function persistStoredReplays() {
  const { safeLocalStorage, STORAGE_KEYS, getStoredReplays } = host;
  try {
    safeLocalStorage.set(
      STORAGE_KEYS.replays,
      JSON.stringify(
        getStoredReplays().map((entry) => ({
          id: entry.id,
          savedAt: entry.savedAt,
          label: entry.label,
          record: entry.record,
        }))
      )
    );
  } catch {
    // ignore: a denied/full storage simply won't persist this replay
  }
}

export function describeReplayRecord(record) {
  const { statsDifficultyLabel } = host;
  const winnerLabel = record.winner === "A" ? "루비 승" : record.winner === "B" ? "코발트 승" : "무승부";
  const modeLabel = record.tutorial
    ? "가이드"
    : record.daily
      ? `데일리 #${record.daily.number}`
      : `솔로 · ${statsDifficultyLabel(record.difficulty)}`;
  return `${modeLabel} · ${winnerLabel} · ${record.moves.length}수`;
}

export function savePendingReplay() {
  const {
    getPendingReplay,
    setPendingReplay,
    getStoredReplays,
    setStoredReplays,
    MAX_STORED_REPLAYS,
    refs,
    setFlashMessage,
    announcePolite,
    playSound,
    render,
  } = host;
  const pendingReplayToSave = getPendingReplay();
  if (!pendingReplayToSave) {
    setFlashMessage("저장할 리플레이가 없습니다.");
    render();
    return;
  }
  const savedAt = new Date().toISOString();
  const entry = {
    id: `${pendingReplayToSave.seed}-${savedAt}`,
    savedAt,
    label: describeReplayRecord(pendingReplayToSave),
    record: pendingReplayToSave,
  };
  // Newest first, de-duplicated by seed+finishedAt so re-clicking save is idempotent.
  setStoredReplays(
    [entry, ...getStoredReplays().filter((existing) => existing.id !== entry.id)].slice(0, MAX_STORED_REPLAYS)
  );
  persistStoredReplays();
  setPendingReplay(null);
  if (refs.saveReplayBtn) {
    refs.saveReplayBtn.hidden = true;
  }
  setFlashMessage("리플레이를 저장했습니다. 🎬 버튼에서 다시 볼 수 있습니다.");
  announcePolite("리플레이를 저장했습니다.");
  playSound("tap");
  render();
}

// Render one replay snapshot into the player board as a lightweight 10×10 grid of cell
// labels tinted by chip team. Deliberately simple (not the full canvas) so playback stays
// self-contained and SAST-safe.
function renderReplaySnapshot() {
  const { refs, BOARD_SIZE } = host;
  if (!activeReplayPlayback || !refs.replayPlayerBoard) return;
  const snapshot = activeReplayPlayback.snapshots[activeReplayPlayback.index];
  const total = activeReplayPlayback.snapshots.length;
  refs.replayPlayerBoard.hidden = false;
  refs.replayPlayerBoard.style.setProperty("--replay-board-size", String(BOARD_SIZE));
  const cells = snapshot.board.map((cell) => {
    const div = document.createElement("span");
    let className = "replay-cell";
    if (cell.corner) className += " corner";
    if (cell.chip === "A") className += " ruby";
    else if (cell.chip === "B") className += " cobalt";
    if (cell.seqCount > 0) className += " locked";
    if (cell.id === snapshot.lastPlacedCellId) className += " last";
    div.className = className;
    div.textContent = cell.corner ? "★" : cell.label;
    return div;
  });
  refs.replayPlayerBoard.replaceChildren(...cells);
  if (refs.replayPlayerControls) {
    refs.replayPlayerControls.hidden = false;
  }
  if (refs.replayStepLabel) {
    refs.replayStepLabel.textContent = `${activeReplayPlayback.index} / ${total - 1}`;
  }
  if (refs.replayPrevBtn) refs.replayPrevBtn.disabled = activeReplayPlayback.index <= 0;
  if (refs.replayNextBtn) refs.replayNextBtn.disabled = activeReplayPlayback.index >= total - 1;
  const scores = snapshot.scores || { A: 0, B: 0 };
  const statusText =
    snapshot.winner && activeReplayPlayback.index === total - 1
      ? `${snapshot.winner === "A" ? "루비 팀" : "코발트 팀"} 승리 · Ruby ${scores.A} : ${scores.B} Cobalt`
      : `${activeReplayPlayback.index}수 진행 · Ruby ${scores.A} : ${scores.B} Cobalt`;
  if (refs.replayPlayerStatus) {
    refs.replayPlayerStatus.textContent = statusText;
  }
  if (refs.replaySrSummary) {
    refs.replaySrSummary.textContent = `리플레이 ${activeReplayPlayback.index}번째 수, 전체 ${total - 1}수. ${statusText}`;
  }
  renderReplayEvalBar();
}

// Load a validated record into the player and show its first state.
function startReplayPlayback(record) {
  const { validateReplayRecord, replayGame, analyzeReplay } = host;
  const clean = validateReplayRecord(record);
  if (!clean) {
    setReplayImportFeedback("리플레이를 재생할 수 없습니다. 올바른 리플레이가 아닙니다.");
    return false;
  }
  let result;
  try {
    result = replayGame(clean);
  } catch {
    setReplayImportFeedback("리플레이를 재생하는 중 오류가 발생했습니다.");
    return false;
  }
  // Deterministic offline analysis (fixed reference depth) for the eval bar + moments list.
  // Purely explanatory — it never touches gameplay. Failures degrade gracefully to no bar.
  let analysis = { evalTimeline: [], moments: [] };
  try {
    analysis = analyzeReplay(clean);
  } catch {
    analysis = { evalTimeline: [], moments: [] };
  }
  activeReplayPlayback = { snapshots: result.snapshots, index: 0, record: clean, analysis };
  renderReplayAnalysis();
  renderReplaySnapshot();
  return true;
}

// Map a raw evaluator score (root = Ruby/team A perspective) to a 0..100 percentage for the
// eval bar. Squashed through a smooth tanh-like ratio so large tactical swings saturate near
// the ends without a runaway scale. Pure, deterministic, clock-free.
function evalToPercent(score) {
  if (!Number.isFinite(score)) return 50;
  const scale = 120_000; // ~an open-four advantage maps to a strong (not maxed) lean
  const squashed = score / (Math.abs(score) + scale);
  return Math.round((squashed + 1) * 50);
}

// Render the eval bar for the current playback step. Snapshot index 0 = initial deal (neutral
// 50%); index i (>=1) reflects evalTimeline[i-1] (the eval AFTER ply i-1). Reduced-motion +
// forced-colors friendly: the fill width is set inline and CSS owns the transition/hi-contrast.
function renderReplayEvalBar() {
  const { refs } = host;
  if (!refs.replayEvalBar || !refs.replayEvalFill || !activeReplayPlayback) return;
  const timeline = activeReplayPlayback.analysis?.evalTimeline || [];
  if (timeline.length === 0) {
    refs.replayEvalBar.hidden = true;
    return;
  }
  refs.replayEvalBar.hidden = false;
  const step = activeReplayPlayback.index;
  let score = 0;
  if (step >= 1) {
    const entry = timeline[Math.min(step - 1, timeline.length - 1)];
    score = typeof entry === "number" ? entry : entry?.eval ?? 0;
  }
  const percent = evalToPercent(score);
  refs.replayEvalFill.style.width = `${percent}%`;
  const lean = percent > 55 ? "루비 우세" : percent < 45 ? "코발트 우세" : "균형";
  refs.replayEvalBar.setAttribute("aria-label", `국면 우세 막대: 루비 ${percent}% · ${lean}`);
}

// Render the post-game moments list + a one-line summary. i18n KEYS from shared/analysis.js
// are resolved to the active locale here; the DOM is built with createElement/textContent
// only (SAST-clean). Stepping to a flagged moment's ply is offered as a jump button.
function renderReplayAnalysis() {
  const { refs, t } = host;
  if (!refs.replayAnalysisSection || !activeReplayPlayback) return;
  const moments = activeReplayPlayback.analysis?.moments || [];
  if (!refs.replayAnalysisMoments) return;
  if (moments.length === 0) {
    refs.replayAnalysisSection.hidden = false;
    refs.replayAnalysisMoments.replaceChildren();
    if (refs.replayAnalysisSummary) {
      refs.replayAnalysisSummary.textContent = t("analysis.summary.clean");
    }
    return;
  }
  refs.replayAnalysisSection.hidden = false;
  if (refs.replayAnalysisSummary) {
    refs.replayAnalysisSummary.textContent = `${t("analysis.summary.count")} ${moments.length}`;
  }
  const items = moments.map((moment) => {
    const li = document.createElement("li");
    li.className = "replay-moment";

    const kindLabel = document.createElement("span");
    kindLabel.className = "replay-moment-kind";
    kindLabel.textContent = t(moment.ko);

    const plyLabel = document.createElement("span");
    plyLabel.className = "replay-moment-ply";
    plyLabel.textContent = `${moment.ply + 1}${t("analysis.moment.plySuffix")}`;

    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    jumpBtn.className = "ghost-button replay-moment-jump";
    jumpBtn.textContent = t("analysis.moment.jump");
    jumpBtn.setAttribute("aria-label", `${t(moment.ko)} ${moment.ply + 1}${t("analysis.moment.plySuffix")}`);
    jumpBtn.addEventListener("click", () => {
      if (!activeReplayPlayback) return;
      const total = activeReplayPlayback.snapshots.length;
      activeReplayPlayback.index = Math.min(total - 1, Math.max(0, moment.ply + 1));
      renderReplaySnapshot();
    });

    li.append(plyLabel, kindLabel, jumpBtn);
    return li;
  });
  refs.replayAnalysisMoments.replaceChildren(...items);
}

function stepReplay(delta) {
  if (!activeReplayPlayback) return;
  const total = activeReplayPlayback.snapshots.length;
  const next = Math.min(total - 1, Math.max(0, activeReplayPlayback.index + delta));
  if (next === activeReplayPlayback.index) return;
  activeReplayPlayback.index = next;
  renderReplaySnapshot();
}

function setReplayImportFeedback(text) {
  const { refs } = host;
  if (refs.replayImportFeedback) {
    refs.replayImportFeedback.textContent = text || "";
  }
}

async function copyReplayShareString(record) {
  const { encodeReplayString, setFlashMessage, writeToClipboard, playSound, render } = host;
  const encoded = encodeReplayString(record);
  if (!encoded) {
    setFlashMessage("리플레이 공유 문자열을 만들지 못했습니다.");
    render();
    return;
  }
  window.__sequenceLastReplayShareString = encoded;
  const copied = await writeToClipboard(encoded);
  setFlashMessage(
    copied
      ? "리플레이 공유 문자열을 클립보드에 복사했습니다."
      : "클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요."
  );
  if (copied) playSound("tap");
  render();
}

function renderReplayList() {
  const { refs, getStoredReplays, setStoredReplays } = host;
  if (!refs.replayList) return;
  const items = getStoredReplays().map((entry) => {
    const li = document.createElement("li");
    li.className = "replay-list-item";

    const meta = document.createElement("div");
    meta.className = "replay-item-meta";
    const label = document.createElement("span");
    label.className = "replay-item-label";
    label.textContent = entry.label || describeReplayRecord(entry.record);
    const when = document.createElement("span");
    when.className = "replay-item-when";
    when.textContent = entry.savedAt ? entry.savedAt.slice(0, 10) : "";
    meta.append(label, when);

    const actions = document.createElement("div");
    actions.className = "replay-item-actions";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "primary-button replay-play-btn";
    playBtn.textContent = "▶ 재생";
    playBtn.setAttribute("aria-label", `${label.textContent} 재생`);
    playBtn.addEventListener("click", () => {
      if (startReplayPlayback(entry.record)) {
        setReplayImportFeedback("");
      }
    });

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "ghost-button replay-share-btn";
    shareBtn.textContent = "공유 문자열 복사";
    shareBtn.setAttribute("aria-label", `${label.textContent} 공유 문자열 복사`);
    shareBtn.addEventListener("click", () => copyReplayShareString(entry.record));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "ghost-button replay-delete-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.setAttribute("aria-label", `${label.textContent} 삭제`);
    deleteBtn.addEventListener("click", () => {
      setStoredReplays(getStoredReplays().filter((existing) => existing.id !== entry.id));
      persistStoredReplays();
      renderReplayList();
    });

    actions.append(playBtn, shareBtn, deleteBtn);
    li.append(meta, actions);
    return li;
  });
  refs.replayList.replaceChildren(...items);
  if (refs.replayEmpty) {
    refs.replayEmpty.hidden = getStoredReplays().length > 0;
  }
}

export function openReplayModal() {
  const { refs, setBackgroundInert } = host;
  if (!refs.replayModal) return;
  replayPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderReplayList();
  refs.replayModal.hidden = false;
  document.body.classList.add("help-open");
  refs.replayBtn?.setAttribute("aria-expanded", "true");
  setBackgroundInert(true, refs.replayModal);
  refs.replayCloseBtn?.focus();
}

export function closeReplayModal() {
  const { refs, setBackgroundInert } = host;
  if (!refs.replayModal) return;
  refs.replayModal.hidden = true;
  document.body.classList.remove("help-open");
  refs.replayBtn?.setAttribute("aria-expanded", "false");
  setBackgroundInert(false, refs.replayModal);
  if (replayPreviousFocus && replayPreviousFocus.isConnected) {
    replayPreviousFocus.focus();
  } else {
    refs.replayBtn?.focus();
  }
}

function importReplayFromInput() {
  const { refs, decodeReplayString, playSound } = host;
  const raw = refs.replayImportInput?.value || "";
  const record = decodeReplayString(raw.trim());
  if (!record) {
    setReplayImportFeedback("리플레이 문자열을 인식하지 못했습니다. 올바른 공유 문자열을 붙여넣어 주세요.");
    return;
  }
  if (startReplayPlayback(record)) {
    setReplayImportFeedback(`불러왔습니다: ${describeReplayRecord(record)}. 재생 컨트롤로 수를 넘겨 보세요.`);
    playSound("tap");
  }
}

// Open the replay modal preloaded with the just-finished local game, playing straight into
// the analysis view (moments list + eval bar). Read-only: it reuses the same validated
// pending record the save flow uses, so it never affects gameplay or stats.
export function openAnalysisForPending() {
  const { getPendingReplay, setFlashMessage, announcePolite, t, render } = host;
  const pendingReplayToSave = getPendingReplay();
  if (!pendingReplayToSave) {
    setFlashMessage("분석할 경기가 없습니다.");
    render();
    return;
  }
  openReplayModal();
  if (startReplayPlayback(pendingReplayToSave)) {
    setReplayImportFeedback("");
    announcePolite(t("analysis.opened"));
  }
}

// Register the replay-modal event listeners. Called once by app.js right after the bind so
// `host.refs` is populated. Kept byte-identical to the original app.js registration block.
export function wireReplayControllerEvents() {
  const { refs } = host;
  refs.replayBtn?.addEventListener("click", openReplayModal);
  refs.replayCloseBtn?.addEventListener("click", closeReplayModal);
  refs.saveReplayBtn?.addEventListener("click", savePendingReplay);
  refs.viewAnalysisBtn?.addEventListener("click", openAnalysisForPending);
  refs.replayModal?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.dataset.replayDismiss != null) {
      closeReplayModal();
    }
  });
  refs.replayPrevBtn?.addEventListener("click", () => stepReplay(-1));
  refs.replayNextBtn?.addEventListener("click", () => stepReplay(1));
  refs.replayImportBtn?.addEventListener("click", importReplayFromInput);
  refs.replayImportInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      importReplayFromInput();
    }
  });
}
