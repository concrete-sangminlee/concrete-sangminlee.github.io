// Interactive-tutorial core: the step script and a pure state machine that advances on
// real game-state transitions. No DOM access lives here — app.js owns the coach bubble,
// spotlight classes, and storage; this module answers "which step are we on and when does
// it advance", which is what the node test suite pins.
//
// The guided game is seeded so every player (and the regression suite) sees the identical
// board, hands, and deterministic bot replies. Changing TUTORIAL_SEED invalidates the
// step copy's references to what the player sees — treat it like a wire-format constant.

export const TUTORIAL_SEED = "tutorial-v1";

export const TUTORIAL_STEPS = [
  {
    id: "goal",
    title: "목표",
    body: "보드의 같은 카드 칸에 칩을 놓아 가로·세로·대각선 5칸 일렬(시퀀스)을 먼저 2개 만들면 승리합니다. 코너 ★ 4칸은 모두에게 열린 보너스 칸이에요.",
    advance: "manual",
    spotlight: "board",
  },
  {
    id: "select",
    title: "1단계 · 카드 선택",
    body: "아래 손패에서 카드를 하나 눌러 보세요. 선택하면 그 카드를 놓을 수 있는 칸이 보드에 강조됩니다. (강조 칸이 없으면 다른 카드를 골라 보세요)",
    advance: "state",
    spotlight: "hand",
  },
  {
    id: "place",
    title: "2단계 · 칩 놓기",
    body: "보드에서 초록색으로 강조된 칸을 누르면 내 칩이 놓입니다. 강조 표시는 지금 선택한 카드와 같은 그림의 빈 칸이에요.",
    advance: "state",
    spotlight: "board",
  },
  {
    id: "discard",
    title: "3단계 · 카드 버리기",
    body: "방금 쓴 카드를 버림 더미에 올립니다. 강조된 버림 더미를 눌러 주세요.",
    advance: "state",
    spotlight: "discard",
  },
  {
    id: "draw",
    title: "4단계 · 새 카드 뽑기",
    body: "덱에서 새 카드를 뽑으면 한 턴이 끝납니다. 강조된 덱을 눌러 주세요. 시퀀스는 항상 5장 손패를 유지해요.",
    advance: "state",
    spotlight: "deck",
  },
  {
    id: "bot",
    title: "상대 차례",
    body: "이제 코발트 봇이 생각하고 있어요. 상태 패널의 점 세 개가 상대가 수를 고르는 중이라는 표시입니다. 잠시 기다려 주세요.",
    advance: "state",
    spotlight: null,
  },
  {
    id: "jacks",
    title: "잭(J) 특수 카드",
    body: "J♣·J♦(눈 2개)는 빈 칸 어디든 칩을 놓는 와일드, J♥·J♠(눈 1개)는 상대 칩 하나를 제거하는 컷입니다. 완성된 시퀀스의 칩은 제거할 수 없어요.",
    advance: "manual",
    spotlight: null,
  },
  {
    id: "free",
    title: "이제 실전!",
    body: "지금부터는 자유롭게 플레이하세요. 같은 흐름(선택 → 놓기 → 버리기 → 뽑기)을 반복해 시퀀스 2개를 먼저 완성하면 승리합니다. 이 연습 게임은 전적에 기록되지 않아요.",
    advance: "manual",
    spotlight: null,
  },
];

const STATE_STEP_ORDER = ["select", "place", "discard", "draw", "bot"];

// The first four gameplay milestones are strictly ordered, and their trigger states are
// TRANSIENT (a selection vanishes when the play snapshot clears it; pendingStep moves
// discard → draw → null). A snapshot can therefore prove a step happened without showing
// its trigger state — e.g. the keyboard auto-move selects and plays in one task, so the
// first observed state is already "pending discard" while the machine still waits on
// "card selected". Ranking the state instead of testing only the current step lets
// observe() fast-forward past every milestone the state already implies.
function reachedMilestoneRank(state) {
  if (state?.botThinkingSeatIndex === 1 || state?.currentTurnSeat === 1) return 4; // turn left the player
  if (state?.pendingStep?.type === "draw") return 3; // discard done
  if (state?.pendingStep?.type === "discard") return 2; // chip placed
  if (state?.selectedCard) return 1; // card selected
  return 0;
}

const STEP_REQUIRED_RANK = { select: 1, place: 2, discard: 3, draw: 4 };

function stepAdvances(stepId, state) {
  if (stepId === "bot") {
    // The bot step ends on a RESTING state (player's turn, nothing pending) which
    // persists until the player acts, so it cannot be missed and needs no rank logic.
    return state?.currentTurnSeat === 0 && !state?.pendingStep;
  }
  const required = STEP_REQUIRED_RANK[stepId];
  return Number.isFinite(required) && reachedMilestoneRank(state) >= required;
}

export function createTutorialMachine({ onStepChange = null, onComplete = null } = {}) {
  let stepIndex = -1;
  let active = false;

  const api = {
    get active() {
      return active;
    },
    get stepIndex() {
      return stepIndex;
    },
    get step() {
      return active ? TUTORIAL_STEPS[stepIndex] : null;
    },
    start() {
      active = true;
      stepIndex = 0;
      onStepChange?.(TUTORIAL_STEPS[stepIndex], stepIndex);
    },
    next() {
      if (!active) return;
      if (stepIndex >= TUTORIAL_STEPS.length - 1) {
        api.finish("completed");
        return;
      }
      stepIndex += 1;
      onStepChange?.(TUTORIAL_STEPS[stepIndex], stepIndex);
    },
    finish(reason = "completed") {
      if (!active) return;
      active = false;
      stepIndex = -1;
      onComplete?.(reason);
    },
    // Advance through every state-gated step the given snapshot already implies (see
    // reachedMilestoneRank). Looping (instead of advancing once) means a missed
    // intermediate snapshot can never deadlock the script.
    observe(state) {
      if (!active) return;
      let guard = STATE_STEP_ORDER.length + 1;
      while (active && guard > 0) {
        const step = TUTORIAL_STEPS[stepIndex];
        if (!step || step.advance !== "state" || !stepAdvances(step.id, state)) {
          return;
        }
        api.next();
        guard -= 1;
      }
    },
  };
  return api;
}
