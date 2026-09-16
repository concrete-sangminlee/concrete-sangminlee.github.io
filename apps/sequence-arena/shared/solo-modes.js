// Solo content & modes: a pure, side-effect-free, fully seeded module shared by the browser UI
// and the node test suite. Mirrors the purity style of shared/daily.js / shared/replay.js /
// shared/progression.js — no DOM, no storage, no clock reads — so every unit here can be pinned
// byte-exactly by scripts/solo-modes-test.mjs.
//
// Two families of content, both DETERMINISTIC and FREE-TIER (static in-repo, no server/DB):
//
//   (a) PUZZLE PACKS — curated, seeded tactical positions. A puzzle is a `seed` plus a
//       deterministic `setupMoves` prefix (same shape as a replay move) that, replayed through
//       the seeded engine, arranges a solvable position; the player finishes from there. `par` is
//       the target number of the PLAYER's own moves to win. par is checked into the catalog AND is
//       PROVABLY correct: solvePuzzle() re-derives it deterministically with the Phase 1 engine
//       (GRANDMASTER at a FIXED search depth — clock-free, so identical on every CPU) as a strong
//       reference solver. The test asserts the re-derived par equals the checked-in value and that
//       the puzzle is solvable within par — an unsolvable or mis-par'd puzzle FAILS the test. This
//       is the honesty gate: no hollow puzzles.
//
//   (b) SOLO MODES — GAUNTLET (a seeded increasing-difficulty opponent ladder incl. GRANDMASTER),
//       SURVIVAL (a seeded consecutive-win streak at a fixed tier), and TIME-ATTACK (a seeded game
//       scored by completion time into medal tiers). All mode state is a plain serializable object
//       suited to localStorage; all randomness flows through createSeededRng(seed) so a given seed
//       reproduces the exact content.
//
// Puzzle/mode completion feeds Phase 2 progression (applyMatchResult) at the UI layer — this module
// stays pure and never grants gameplay-affecting unlocks (free-tier, fairness-preserving).

import {
  createGame,
  discardDeadCard,
  discardPendingCard,
  drawReplacementCard,
  getCurrentPlayer,
  playCard,
} from "./game-core.js";
import { BOT_DIFFICULTIES, chooseBotAction, chooseGrandmasterAction, normalizeBotDifficulty } from "./bot-ai.js";
import { createSeededRng } from "./rng.js";

// Seat layout matches shared/replay.js exactly (seat 0 = human/team A, seat 1 = bot/team B) so a
// puzzle's seed deals the identical board + hands the live runtime and replay reproduce.
const PUZZLE_SEATS = [
  { seatIndex: 0, team: "A", name: "Player 1" },
  { seatIndex: 1, team: "B", name: "Player 2" },
];

// FIXED reference-solver depth. The GRANDMASTER engine's clock-free fixed-depth mode
// (chooseGrandmasterAction with options.maxDepth) makes par derivation identical on every CPU.
// Depth 2 is deliberately shallow: it is strong enough to cash forced tactical wins from the
// curated positions (which is all a solvable puzzle needs to PROVE its par) while keeping
// scripts/solo-modes-test.mjs fast — far cheaper than the depth-5 board-fairness proof.
export const SOLVER_DEPTH = 2;

// The opponent the reference solver plays against while proving a puzzle. Fixed + deterministic
// (SMART is clock-free and reproducible) so re-derivation is stable. The player (seat 0) drives
// GRANDMASTER; the opponent (seat 1) drives this tier.
const SOLVER_OPPONENT = BOT_DIFFICULTIES.smart;

// Hard ceiling on the player's own moves while solving, so an accidentally-unsolvable position
// cannot loop forever — the solver returns null (unsolved) past this and the test fails loudly.
const SOLVER_MAX_PLAYER_MOVES = 24;

// scorePuzzleAttempt star thresholds (documented + tested at the boundaries):
//   3 stars — solved in <= par player-moves (optimal / reference-quality)
//   2 stars — solved in <= par + STAR_TWO_SLACK player-moves (good)
//   1 star  — solved at all (any win)
//   0 stars — did not win (loss / abandoned)
export const STAR_TWO_SLACK = 2;

// --- engine-driving helpers (reuse game-core; DO NOT duplicate rule loops) --------------

// Resolve the deterministic follow-up steps (discard the played/dead card, draw a replacement)
// exactly as shared/replay.js drainPendingSteps and shared/local-solo.js do after an initiating
// action. Kept local so a puzzle position advances the turn identically to a live/replay game.
function drainPendingSteps(game, seatIndex, rng) {
  const pending = game.pendingStep;
  if (!pending || pending.seatIndex !== seatIndex) return;
  if (pending.type === "discard") discardPendingCard(game, seatIndex);
  if (game.pendingStep?.type === "draw") drawReplacementCard(game, seatIndex, rng);
}

// Apply a single initiating move (play / discard_dead) for the seat to move, then drain the
// deterministic follow-up. Returns true if the move was applied. Mirrors the replay apply loop.
function applyInitiatingMove(game, seatIndex, move, rng) {
  let ok = false;
  if (move.type === "play") {
    ok = playCard(game, seatIndex, move.cardId, move.targetCellId, rng).ok;
  } else if (move.type === "discard_dead") {
    ok = discardDeadCard(game, seatIndex, move.cardId, rng).ok;
  }
  if (ok) drainPendingSteps(game, seatIndex, rng);
  return ok;
}

// Translate a bot action into the initiating-move shape the apply loop + replay record use.
function actionToMove(action) {
  if (!action) return null;
  if (action.type === "play_card") {
    return { type: "play", cardId: action.cardId, targetCellId: action.targetCellId };
  }
  if (action.type === "discard_dead") {
    return { type: "discard_dead", cardId: action.cardId, targetCellId: null };
  }
  return null;
}

// --- puzzle position construction -------------------------------------------------------

// Re-create the exact seeded game and apply the deterministic `setupMoves` prefix, reproducing
// the identical starting position for the puzzle. Returns { game, rng } sharing ONE seeded PRNG
// stream (so subsequent draws during solving stay deterministic). Pure aside from the local
// game/rng it creates. Throws on a malformed setup move (a checked-in puzzle must be valid).
export function buildPuzzleGame(puzzle) {
  const seed = String(puzzle?.seed ?? "");
  const rng = createSeededRng(seed);
  const game = createGame(PUZZLE_SEATS, rng);
  const setupMoves = Array.isArray(puzzle?.setupMoves) ? puzzle.setupMoves : [];
  for (const move of setupMoves) {
    if (game.phase !== "playing") break;
    const current = getCurrentPlayer(game);
    if (!current) break;
    const applied = applyInitiatingMove(game, current.seatIndex, move, rng);
    if (!applied) {
      throw new Error(`buildPuzzleGame: illegal setup move in puzzle ${puzzle?.id}`);
    }
  }
  return { game, rng };
}

// Deterministically SOLVE a puzzle from its built position: the player seat (0) plays the
// GRANDMASTER reference solver at the fixed SOLVER_DEPTH, the opponent seat (1) plays the fixed
// SOLVER_OPPONENT tier, until team A wins, team B wins, or the move ceiling is hit. Returns
// { won, playerMoves } where playerMoves counts ONLY the player seat's own initiating moves.
// Clock-free + fixed-depth so the result is identical on every machine — this is what makes par
// re-derivation stable and the "provably solvable within par" gate meaningful. Pure.
export function solvePuzzle(puzzle, { maxPlayerMoves = SOLVER_MAX_PLAYER_MOVES } = {}) {
  const { game, rng } = buildPuzzleGame(puzzle);
  let playerMoves = 0;

  while (game.phase === "playing" && game.winner == null) {
    const current = getCurrentPlayer(game);
    if (!current) break;
    let action;
    if (current.seatIndex === 0) {
      if (playerMoves >= maxPlayerMoves) break;
      action = chooseGrandmasterAction(game, current, { maxDepth: SOLVER_DEPTH });
    } else {
      action = chooseBotAction(game, current, SOLVER_OPPONENT);
    }
    const move = actionToMove(action);
    if (!move) break;
    const applied = applyInitiatingMove(game, current.seatIndex, move, rng);
    if (!applied) break;
    if (current.seatIndex === 0) playerMoves += 1;
  }

  return { won: game.winner === "A", playerMoves };
}

// Re-derive a puzzle's par: the number of the player's own moves the reference solver needs to
// win. Returns a positive integer, or null if the reference solver cannot win within the ceiling
// (an unsolvable puzzle — the honesty gate turns this into a hard test failure). Deterministic.
export function derivePar(puzzle) {
  const { won, playerMoves } = solvePuzzle(puzzle);
  return won ? playerMoves : null;
}

// --- puzzle catalog ---------------------------------------------------------------------
// Inlined static content (no separate shipped data file → no extra six-location churn — the
// design spec's preferred posture). Each puzzle's `par` is checked in and re-derived by the test.
// `difficulty` is the nominal flavour label shown in the UI; the reference solver always uses the
// fixed GRANDMASTER/SMART pairing above so par is comparable across puzzles.

export const PUZZLE_PACKS = [
  {
    id: "opening-forks",
    ko: "오프닝 포크",
    en: "Opening Forks",
    ko_desc: "초반 이중 위협을 만드는 기초 전술 팩입니다.",
    en_desc: "A beginner tactics pack about creating early double threats.",
    puzzles: [
        {
          id: "of-1",
          seed: "puzzle-seed-10",
          difficulty: "smart",
          par: 3,
          ko: "이중 위협 1",
          en: "Double Threat 1",
          setupMoves: [{ type: "play", cardId: 53, targetCellId: 55 }, { type: "play", cardId: 50, targetCellId: 66 }, { type: "play", cardId: 35, targetCellId: 64 }, { type: "play", cardId: 4, targetCellId: 84 }, { type: "play", cardId: 91, targetCellId: 28 }, { type: "play", cardId: 57, targetCellId: 82 }, { type: "play", cardId: 75, targetCellId: 85 }, { type: "play", cardId: 39, targetCellId: 91 }, { type: "play", cardId: 81, targetCellId: 37 }, { type: "play", cardId: 25, targetCellId: 72 }, { type: "play", cardId: 21, targetCellId: 56 }, { type: "play", cardId: 14, targetCellId: 50 }, { type: "play", cardId: 20, targetCellId: 59 }, { type: "play", cardId: 12, targetCellId: 70 }, { type: "play", cardId: 70, targetCellId: 74 }, { type: "play", cardId: 77, targetCellId: 69 }, { type: "play", cardId: 82, targetCellId: 41 }, { type: "play", cardId: 3, targetCellId: 3 }, { type: "play", cardId: 102, targetCellId: 46 }, { type: "play", cardId: 2, targetCellId: 75 }, { type: "play", cardId: 62, targetCellId: 25 }, { type: "play", cardId: 43, targetCellId: 58 }, { type: "play", cardId: 93, targetCellId: 26 }, { type: "play", cardId: 32, targetCellId: 52 }, { type: "play", cardId: 68, targetCellId: 48 }, { type: "play", cardId: 85, targetCellId: 40 }, { type: "play", cardId: 15, targetCellId: 29 }, { type: "play", cardId: 47, targetCellId: 93 }, { type: "play", cardId: 78, targetCellId: 49 }, { type: "play", cardId: 29, targetCellId: 6 }],
        },
        {
          id: "of-2",
          seed: "puzzle-seed-9",
          difficulty: "smart",
          par: 4,
          ko: "이중 위협 2",
          en: "Double Threat 2",
          setupMoves: [{ type: "play", cardId: 35, targetCellId: 45 }, { type: "play", cardId: 51, targetCellId: 54 }, { type: "play", cardId: 86, targetCellId: 65 }, { type: "play", cardId: 10, targetCellId: 81 }, { type: "play", cardId: 50, targetCellId: 55 }, { type: "play", cardId: 78, targetCellId: 82 }, { type: "play", cardId: 54, targetCellId: 25 }, { type: "play", cardId: 104, targetCellId: 83 }, { type: "play", cardId: 11, targetCellId: 81 }, { type: "play", cardId: 16, targetCellId: 80 }, { type: "play", cardId: 8, targetCellId: 5 }, { type: "play", cardId: 69, targetCellId: 63 }, { type: "play", cardId: 36, targetCellId: 60 }, { type: "play", cardId: 47, targetCellId: 41 }, { type: "play", cardId: 39, targetCellId: 8 }, { type: "play", cardId: 56, targetCellId: 75 }, { type: "play", cardId: 34, targetCellId: 22 }, { type: "play", cardId: 18, targetCellId: 30 }, { type: "play", cardId: 9, targetCellId: 27 }, { type: "play", cardId: 87, targetCellId: 15 }, { type: "play", cardId: 85, targetCellId: 28 }, { type: "play", cardId: 73, targetCellId: 31 }, { type: "play", cardId: 65, targetCellId: 7 }, { type: "play", cardId: 42, targetCellId: 26 }, { type: "play", cardId: 92, targetCellId: 59 }, { type: "play", cardId: 57, targetCellId: 43 }, { type: "play", cardId: 19, targetCellId: 46 }, { type: "play", cardId: 89, targetCellId: 6 }, { type: "play", cardId: 79, targetCellId: 47 }, { type: "play", cardId: 22, targetCellId: 48 }, { type: "play", cardId: 102, targetCellId: 37 }, { type: "play", cardId: 40, targetCellId: 19 }, { type: "play", cardId: 62, targetCellId: 81 }, { type: "play", cardId: 64, targetCellId: 57 }, { type: "play", cardId: 3, targetCellId: 38 }, { type: "play", cardId: 32, targetCellId: 16 }, { type: "play", cardId: 53, targetCellId: 12 }, { type: "play", cardId: 43, targetCellId: 52 }, { type: "play", cardId: 93, targetCellId: 42 }, { type: "play", cardId: 26, targetCellId: 32 }, { type: "play", cardId: 29, targetCellId: 69 }, { type: "play", cardId: 100, targetCellId: 56 }, { type: "play", cardId: 5, targetCellId: 89 }, { type: "play", cardId: 99, targetCellId: 39 }, { type: "play", cardId: 90, targetCellId: 21 }, { type: "play", cardId: 33, targetCellId: 29 }],
        },
        {
          id: "of-3",
          seed: "puzzle-seed-7",
          difficulty: "aggressive",
          par: 3,
          ko: "이중 위협 3",
          en: "Double Threat 3",
          setupMoves: [{ type: "play", cardId: 103, targetCellId: 72 }, { type: "play", cardId: 45, targetCellId: 63 }, { type: "play", cardId: 50, targetCellId: 52 }, { type: "play", cardId: 53, targetCellId: 82 }, { type: "play", cardId: 22, targetCellId: 74 }, { type: "play", cardId: 42, targetCellId: 36 }, { type: "play", cardId: 95, targetCellId: 70 }, { type: "play", cardId: 65, targetCellId: 27 }, { type: "play", cardId: 46, targetCellId: 50 }, { type: "play", cardId: 14, targetCellId: 18 }, { type: "play", cardId: 63, targetCellId: 36 }, { type: "play", cardId: 59, targetCellId: 53 }, { type: "play", cardId: 19, targetCellId: 40 }, { type: "play", cardId: 31, targetCellId: 80 }, { type: "play", cardId: 6, targetCellId: 20 }, { type: "play", cardId: 30, targetCellId: 35 }, { type: "play", cardId: 35, targetCellId: 42 }, { type: "play", cardId: 72, targetCellId: 84 }, { type: "play", cardId: 16, targetCellId: 71 }, { type: "play", cardId: 54, targetCellId: 85 }, { type: "play", cardId: 47, targetCellId: 73 }, { type: "play", cardId: 75, targetCellId: 83 }, { type: "play", cardId: 36, targetCellId: 41 }, { type: "play", cardId: 100, targetCellId: 61 }, { type: "play", cardId: 89, targetCellId: 30 }, { type: "play", cardId: 99, targetCellId: 43 }, { type: "play", cardId: 93, targetCellId: 32 }, { type: "play", cardId: 74, targetCellId: 13 }, { type: "play", cardId: 56, targetCellId: 33 }, { type: "play", cardId: 40, targetCellId: 31 }, { type: "play", cardId: 52, targetCellId: 24 }, { type: "play", cardId: 61, targetCellId: 26 }, { type: "play", cardId: 49, targetCellId: 12 }, { type: "play", cardId: 62, targetCellId: 88 }, { type: "play", cardId: 85, targetCellId: 87 }, { type: "play", cardId: 82, targetCellId: 7 }, { type: "play", cardId: 98, targetCellId: 17 }, { type: "play", cardId: 60, targetCellId: 44 }, { type: "play", cardId: 34, targetCellId: 6 }, { type: "play", cardId: 96, targetCellId: 47 }, { type: "play", cardId: 28, targetCellId: 66 }, { type: "play", cardId: 78, targetCellId: 75 }, { type: "play", cardId: 23, targetCellId: 55 }, { type: "play", cardId: 84, targetCellId: 60 }, { type: "play", cardId: 43, targetCellId: 51 }, { type: "play", cardId: 26, targetCellId: 25 }, { type: "play", cardId: 66, targetCellId: 86 }, { type: "play", cardId: 97, targetCellId: 23 }, { type: "play", cardId: 33, targetCellId: 2 }, { type: "play", cardId: 102, targetCellId: 81 }, { type: "play", cardId: 104, targetCellId: 28 }, { type: "play", cardId: 12, targetCellId: 58 }, { type: "play", cardId: 94, targetCellId: 36 }, { type: "play", cardId: 70, targetCellId: 68 }, { type: "play", cardId: 90, targetCellId: 37 }, { type: "play", cardId: 24, targetCellId: 42 }, { type: "play", cardId: 25, targetCellId: 78 }, { type: "play", cardId: 83, targetCellId: 46 }],
        },
    ],
  },
  {
    id: "endgame-finishers",
    ko: "엔드게임 마무리",
    en: "Endgame Finishers",
    ko_desc: "강한 봇을 상대로 승부를 마무리 짓는 종반 전술 팩입니다.",
    en_desc: "A finishing-tactics pack about closing out won positions against strong bots.",
    puzzles: [
        {
          id: "ef-1",
          seed: "puzzle-seed-5",
          difficulty: "master",
          par: 5,
          ko: "마무리 1",
          en: "Finisher 1",
          setupMoves: [{ type: "play", cardId: 95, targetCellId: 44 }, { type: "play", cardId: 88, targetCellId: 77 }, { type: "play", cardId: 67, targetCellId: 4 }, { type: "play", cardId: 30, targetCellId: 59 }, { type: "play", cardId: 97, targetCellId: 45 }, { type: "play", cardId: 50, targetCellId: 69 }, { type: "play", cardId: 1, targetCellId: 22 }, { type: "play", cardId: 63, targetCellId: 44 }, { type: "play", cardId: 74, targetCellId: 79 }, { type: "play", cardId: 56, targetCellId: 49 }, { type: "play", cardId: 16, targetCellId: 52 }, { type: "play", cardId: 98, targetCellId: 19 }, { type: "play", cardId: 83, targetCellId: 53 }, { type: "play", cardId: 52, targetCellId: 88 }, { type: "play", cardId: 5, targetCellId: 86 }, { type: "play", cardId: 19, targetCellId: 50 }, { type: "play", cardId: 20, targetCellId: 97 }, { type: "play", cardId: 60, targetCellId: 60 }, { type: "play", cardId: 81, targetCellId: 20 }, { type: "play", cardId: 7, targetCellId: 94 }, { type: "play", cardId: 39, targetCellId: 76 }, { type: "play", cardId: 58, targetCellId: 93 }, { type: "play", cardId: 73, targetCellId: 98 }, { type: "play", cardId: 104, targetCellId: 96 }, { type: "play", cardId: 91, targetCellId: 81 }, { type: "play", cardId: 38, targetCellId: 91 }, { type: "play", cardId: 48, targetCellId: 75 }, { type: "play", cardId: 54, targetCellId: 30 }, { type: "play", cardId: 3, targetCellId: 36 }, { type: "play", cardId: 22, targetCellId: 63 }, { type: "play", cardId: 76, targetCellId: 94 }, { type: "play", cardId: 79, targetCellId: 46 }, { type: "play", cardId: 46, targetCellId: 65 }, { type: "play", cardId: 87, targetCellId: 54 }, { type: "play", cardId: 53, targetCellId: 24 }, { type: "play", cardId: 29, targetCellId: 74 }, { type: "play", cardId: 8, targetCellId: 18 }, { type: "play", cardId: 11, targetCellId: 75 }, { type: "play", cardId: 99, targetCellId: 33 }, { type: "play", cardId: 37, targetCellId: 27 }, { type: "play", cardId: 90, targetCellId: 25 }, { type: "play", cardId: 65, targetCellId: 21 }, { type: "play", cardId: 12, targetCellId: 85 }, { type: "play", cardId: 93, targetCellId: 95 }, { type: "play", cardId: 85, targetCellId: 66 }, { type: "play", cardId: 71, targetCellId: 70 }, { type: "play", cardId: 75, targetCellId: 29 }, { type: "play", cardId: 14, targetCellId: 11 }, { type: "play", cardId: 9, targetCellId: 37 }, { type: "play", cardId: 69, targetCellId: 38 }, { type: "play", cardId: 43, targetCellId: 44 }, { type: "play", cardId: 26, targetCellId: 80 }, { type: "play", cardId: 15, targetCellId: 61 }, { type: "play", cardId: 84, targetCellId: 14 }, { type: "play", cardId: 34, targetCellId: 92 }, { type: "play", cardId: 35, targetCellId: 23 }],
        },
        {
          id: "ef-2",
          seed: "puzzle-seed-2",
          difficulty: "grandmaster",
          par: 4,
          ko: "마무리 2",
          en: "Finisher 2",
          setupMoves: [{ type: "play", cardId: 90, targetCellId: 27 }, { type: "play", cardId: 55, targetCellId: 55 }, { type: "play", cardId: 63, targetCellId: 55 }, { type: "play", cardId: 53, targetCellId: 72 }, { type: "play", cardId: 25, targetCellId: 25 }, { type: "play", cardId: 78, targetCellId: 26 }, { type: "play", cardId: 12, targetCellId: 34 }, { type: "play", cardId: 92, targetCellId: 81 }, { type: "play", cardId: 83, targetCellId: 61 }, { type: "play", cardId: 15, targetCellId: 15 }, { type: "play", cardId: 6, targetCellId: 64 }, { type: "play", cardId: 18, targetCellId: 14 }, { type: "play", cardId: 45, targetCellId: 65 }, { type: "play", cardId: 49, targetCellId: 5 }, { type: "play", cardId: 84, targetCellId: 17 }, { type: "play", cardId: 22, targetCellId: 23 }, { type: "play", cardId: 66, targetCellId: 50 }, { type: "play", cardId: 19, targetCellId: 37 }, { type: "play", cardId: 69, targetCellId: 7 }, { type: "play", cardId: 73, targetCellId: 35 }, { type: "play", cardId: 4, targetCellId: 43 }, { type: "play", cardId: 44, targetCellId: 71 }, { type: "play", cardId: 13, targetCellId: 68 }, { type: "play", cardId: 37, targetCellId: 52 }, { type: "play", cardId: 68, targetCellId: 78 }, { type: "play", cardId: 9, targetCellId: 92 }, { type: "play", cardId: 27, targetCellId: 69 }, { type: "play", cardId: 54, targetCellId: 38 }, { type: "play", cardId: 39, targetCellId: 56 }, { type: "play", cardId: 48, targetCellId: 44 }, { type: "play", cardId: 30, targetCellId: 62 }, { type: "play", cardId: 11, targetCellId: 64 }, { type: "play", cardId: 59, targetCellId: 76 }, { type: "play", cardId: 50, targetCellId: 16 }, { type: "play", cardId: 71, targetCellId: 33 }, { type: "play", cardId: 3, targetCellId: 55 }, { type: "play", cardId: 46, targetCellId: 49 }, { type: "play", cardId: 10, targetCellId: 63 }, { type: "play", cardId: 87, targetCellId: 98 }, { type: "play", cardId: 67, targetCellId: 88 }, { type: "play", cardId: 104, targetCellId: 54 }, { type: "play", cardId: 85, targetCellId: 45 }, { type: "play", cardId: 60, targetCellId: 32 }, { type: "play", cardId: 35, targetCellId: 28 }, { type: "play", cardId: 51, targetCellId: 77 }, { type: "play", cardId: 14, targetCellId: 96 }, { type: "play", cardId: 47, targetCellId: 46 }, { type: "play", cardId: 88, targetCellId: 86 }, { type: "play", cardId: 77, targetCellId: 58 }, { type: "play", cardId: 74, targetCellId: 94 }, { type: "play", cardId: 43, targetCellId: 91 }, { type: "play", cardId: 79, targetCellId: 74 }, { type: "play", cardId: 98, targetCellId: 19 }, { type: "play", cardId: 103, targetCellId: 36 }, { type: "play", cardId: 17, targetCellId: 10 }, { type: "play", cardId: 101, targetCellId: 85 }, { type: "play", cardId: 86, targetCellId: 31 }, { type: "play", cardId: 52, targetCellId: 29 }, { type: "play", cardId: 23, targetCellId: 66 }, { type: "play", cardId: 1, targetCellId: 70 }, { type: "play", cardId: 26, targetCellId: 51 }, { type: "play", cardId: 58, targetCellId: 64 }, { type: "play", cardId: 57, targetCellId: 11 }, { type: "play", cardId: 62, targetCellId: 53 }, { type: "play", cardId: 5, targetCellId: 1 }, { type: "play", cardId: 32, targetCellId: 59 }],
        },
    ],
  },
];

// Flattened id→puzzle index built once. Every puzzle carries its packId for scoring/progression.
const ALL_PUZZLES = PUZZLE_PACKS.flatMap((pack) =>
  pack.puzzles.map((puzzle) => ({ ...puzzle, packId: pack.id }))
);
const PUZZLE_BY_ID = new Map(ALL_PUZZLES.map((puzzle) => [puzzle.id, puzzle]));

export function listPuzzles() {
  return ALL_PUZZLES.map((puzzle) => ({ ...puzzle }));
}

export function loadPuzzle(id) {
  const found = PUZZLE_BY_ID.get(id);
  return found ? { ...found } : null;
}

// --- scoring ----------------------------------------------------------------------------

// Pure star scoring for a finished puzzle attempt. `moves` is the count of the player's own
// initiating moves; `won` whether the player completed the puzzle objective (a win). Thresholds
// documented at STAR_TWO_SLACK above. Returns { won, moveCount, par, stars }.
export function scorePuzzleAttempt(puzzle, { moves = 0, won = false } = {}) {
  const par = Math.max(1, Math.trunc(Number(puzzle?.par) || 1));
  const moveCount = Math.max(0, Math.trunc(Number(moves) || 0));
  let stars = 0;
  if (won) {
    if (moveCount <= par) stars = 3;
    else if (moveCount <= par + STAR_TWO_SLACK) stars = 2;
    else stars = 1;
  }
  return { won: Boolean(won), moveCount, par, stars };
}

// --- GAUNTLET ---------------------------------------------------------------------------

// The gauntlet ladder: a fixed, increasing-difficulty sequence of opponent tiers culminating in
// GRANDMASTER. Order is fixed (difficulty must strictly increase along a documented tier rank) so
// the ladder is fair and reproducible; the SEED only derives each stage's game seed, not the order.
const GAUNTLET_TIERS = [
  BOT_DIFFICULTIES.smart,
  BOT_DIFFICULTIES.aggressive,
  BOT_DIFFICULTIES.master,
  BOT_DIFFICULTIES.grandmaster,
];

// Build a seeded gauntlet run: an ordered list of stages, each with its own derived game seed so
// every stage is a distinct-but-reproducible board. Pure; a given `seed` reproduces the exact
// ladder (same per-stage seeds). Returns a serializable run-state object.
export function buildGauntletRun(seed) {
  const rng = createSeededRng(`gauntlet:${String(seed ?? "")}`);
  const stages = GAUNTLET_TIERS.map((difficulty, index) => ({
    index,
    difficulty,
    // Derive a stable per-stage game seed from the run rng so each stage is reproducible.
    seed: `g-${String(seed ?? "")}-${index}-${Math.floor(rng() * 1e9)}`,
  }));
  return {
    seed: String(seed ?? ""),
    stages,
    stageIndex: 0,
    cleared: 0,
    finished: false,
    won: false,
  };
}

// Pure gauntlet transition: apply one stage result. A win advances to the next stage (clearing
// the whole ladder finishes the run as a win); a loss ends the run. Never mutates its input.
export function advanceGauntlet(state, stageResult) {
  const base = normalizeGauntlet(state);
  if (base.finished) return base;
  const won = Boolean(stageResult?.won);
  if (!won) {
    return { ...base, finished: true, won: false };
  }
  const cleared = base.cleared + 1;
  const stageIndex = base.stageIndex + 1;
  const finished = stageIndex >= base.stages.length;
  return {
    ...base,
    cleared,
    stageIndex: finished ? base.stages.length : stageIndex,
    finished,
    won: finished ? true : false,
  };
}

// The tier the current stage plays at (or null if the run is over / out of stages).
export function currentGauntletStage(state) {
  const base = normalizeGauntlet(state);
  if (base.finished || base.stageIndex >= base.stages.length) return null;
  return base.stages[base.stageIndex];
}

function normalizeGauntlet(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.stages)) {
    return buildGauntletRun("");
  }
  const stages = state.stages
    .filter((stage) => stage && typeof stage === "object")
    .map((stage, index) => ({
      index,
      difficulty: normalizeBotDifficulty(stage.difficulty),
      seed: String(stage.seed ?? ""),
    }));
  const clamp = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  return {
    seed: String(state.seed ?? ""),
    stages,
    stageIndex: Math.min(clamp(state.stageIndex), stages.length),
    cleared: Math.min(clamp(state.cleared), stages.length),
    finished: state.finished === true,
    won: state.won === true,
  };
}

// --- SURVIVAL ---------------------------------------------------------------------------

// Fresh survival state: consecutive seeded games at a fixed difficulty; track current + longest
// win streak. Pure + serializable.
export function createSurvivalState(seed, difficulty = BOT_DIFFICULTIES.smart) {
  return {
    seed: String(seed ?? ""),
    difficulty: normalizeBotDifficulty(difficulty),
    current: 0,
    best: 0,
    games: 0,
    alive: true,
  };
}

// Pure survival transition: a win extends the streak (updating the best), a loss resets the
// current streak and ends the run. Never mutates its input.
export function recordSurvival(state, won) {
  const base = normalizeSurvival(state);
  const current = won ? base.current + 1 : 0;
  return {
    ...base,
    current,
    best: Math.max(base.best, current),
    games: base.games + 1,
    alive: Boolean(won),
  };
}

// Derive the seed for the Nth survival game (0-based) so each consecutive game is a distinct but
// reproducible board. Pure + deterministic.
export function survivalGameSeed(state, gameIndex) {
  const base = normalizeSurvival(state);
  const index = Math.max(0, Math.trunc(Number(gameIndex) || 0));
  return `s-${base.seed}-${index}`;
}

function normalizeSurvival(state) {
  if (!state || typeof state !== "object") {
    return createSurvivalState("");
  }
  const clamp = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  const current = clamp(state.current);
  return {
    seed: String(state.seed ?? ""),
    difficulty: normalizeBotDifficulty(state.difficulty),
    current,
    best: Math.max(clamp(state.best), current),
    games: clamp(state.games),
    alive: state.alive !== false,
  };
}

// --- TIME-ATTACK ------------------------------------------------------------------------

// Medal thresholds for time-attack, in milliseconds of completion time (documented + tested at
// the boundaries). A LOSS earns no medal. Faster wins earn better medals.
//   gold   — win in <= 90s
//   silver — win in <= 180s
//   bronze — win in <= 300s
//   none   — a slower win still counts as a win but earns no medal
export const TIME_ATTACK_THRESHOLDS = {
  gold: 90_000,
  silver: 180_000,
  bronze: 300_000,
};

// Pure time-attack scoring: map a finished game's { won, durationMs } to a medal tier. Returns
// { won, durationMs, medal } where medal is "gold" | "silver" | "bronze" | "none".
export function scoreTimeAttack({ won = false, durationMs = 0 } = {}) {
  const duration = Math.max(0, Math.trunc(Number(durationMs) || 0));
  let medal = "none";
  if (won) {
    if (duration <= TIME_ATTACK_THRESHOLDS.gold) medal = "gold";
    else if (duration <= TIME_ATTACK_THRESHOLDS.silver) medal = "silver";
    else if (duration <= TIME_ATTACK_THRESHOLDS.bronze) medal = "bronze";
    else medal = "none";
  }
  return { won: Boolean(won), durationMs: duration, medal };
}

// --- share text (ko) --------------------------------------------------------------------

// Compact Korean share summaries, mirroring formatDailyShareText/formatProgressionShareText.
// English is composed at the UI layer via i18n so these stay pure, node-testable ko builders.
export function formatPuzzleShareText({ packKo = "", puzzleKo = "", stars = 0, par = 0, moveCount = 0, url = "" } = {}) {
  const starText = "★".repeat(Math.max(0, Math.min(3, Math.trunc(stars)))) || "☆";
  const lines = [`Sequence Arena 퍼즐 · ${packKo}${puzzleKo ? " · " + puzzleKo : ""}`, `${starText} · ${moveCount}수 (파 ${par})`];
  if (url) lines.push(url);
  return lines.join("\n");
}

export function formatGauntletShareText({ cleared = 0, total = 0, url = "" } = {}) {
  const lines = [`Sequence Arena 건틀릿 · ${cleared}/${total} 스테이지 클리어`];
  if (url) lines.push(url);
  return lines.join("\n");
}

export function formatSurvivalShareText({ best = 0, url = "" } = {}) {
  const lines = [`Sequence Arena 서바이벌 · 최고 ${best}연승`];
  if (url) lines.push(url);
  return lines.join("\n");
}

export function formatTimeAttackShareText({ medal = "none", durationMs = 0, url = "" } = {}) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const medalKo = { gold: "금메달", silver: "은메달", bronze: "동메달", none: "완주" }[medal] || "완주";
  const lines = [`Sequence Arena 타임어택 · ${medalKo} · ${seconds}초`];
  if (url) lines.push(url);
  return lines.join("\n");
}

export { GAUNTLET_TIERS };
