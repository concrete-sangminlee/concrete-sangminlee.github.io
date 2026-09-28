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
  {
    id: "midgame-tactics",
    ko: "미드게임 전술",
    en: "Midgame Tactics",
    ko_desc: "중반 위협을 엮어 승기를 잡는 전술 팩입니다.",
    en_desc: "A midgame pack about weaving threats into a winning initiative.",
    puzzles: [
        {
          id: "mt-1",
          seed: "midgame-3001",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 1",
          en: "Midgame Combo 1",
          setupMoves: [{ type: "play", cardId: 82, targetCellId: 44 }, { type: "play", cardId: 64, targetCellId: 63 }, { type: "play", cardId: 37, targetCellId: 43 }, { type: "play", cardId: 42, targetCellId: 41 }, { type: "play", cardId: 67, targetCellId: 54 }, { type: "play", cardId: 25, targetCellId: 32 }, { type: "play", cardId: 13, targetCellId: 84 }, { type: "play", cardId: 24, targetCellId: 44 }, { type: "play", cardId: 99, targetCellId: 52 }, { type: "play", cardId: 35, targetCellId: 23 }, { type: "play", cardId: 58, targetCellId: 34 }, { type: "play", cardId: 11, targetCellId: 34 }, { type: "play", cardId: 73, targetCellId: 70 }, { type: "play", cardId: 53, targetCellId: 50 }, { type: "play", cardId: 56, targetCellId: 76 }, { type: "play", cardId: 95, targetCellId: 62 }, { type: "play", cardId: 27, targetCellId: 65 }, { type: "play", cardId: 69, targetCellId: 22 }, { type: "play", cardId: 49, targetCellId: 45 }, { type: "play", cardId: 28, targetCellId: 94 }, { type: "play", cardId: 70, targetCellId: 27 }, { type: "play", cardId: 59, targetCellId: 85 }, { type: "play", cardId: 97, targetCellId: 35 }, { type: "play", cardId: 48, targetCellId: 4 }, { type: "play", cardId: 20, targetCellId: 87 }, { type: "play", cardId: 12, targetCellId: 3 }, { type: "play", cardId: 63, targetCellId: 32 }, { type: "play", cardId: 6, targetCellId: 34 }, { type: "play", cardId: 5, targetCellId: 91 }, { type: "play", cardId: 80, targetCellId: 93 }, { type: "play", cardId: 71, targetCellId: 14 }, { type: "play", cardId: 91, targetCellId: 74 }, { type: "play", cardId: 50, targetCellId: 55 }, { type: "play", cardId: 62, targetCellId: 7 }, { type: "play", cardId: 77, targetCellId: 32 }, { type: "play", cardId: 4, targetCellId: 29 }, { type: "play", cardId: 51, targetCellId: 36 }, { type: "play", cardId: 29, targetCellId: 15 }, { type: "play", cardId: 96, targetCellId: 83 }, { type: "play", cardId: 40, targetCellId: 19 }, { type: "play", cardId: 47, targetCellId: 88 }, { type: "play", cardId: 76, targetCellId: 45 }, { type: "play", cardId: 33, targetCellId: 25 }, { type: "play", cardId: 41, targetCellId: 77 }, { type: "play", cardId: 84, targetCellId: 5 }, { type: "play", cardId: 9, targetCellId: 75 }, { type: "play", cardId: 88, targetCellId: 1 }, { type: "play", cardId: 44, targetCellId: 72 }, { type: "play", cardId: 52, targetCellId: 67 }, { type: "play", cardId: 61, targetCellId: 33 }, { type: "play", cardId: 54, targetCellId: 10 }, { type: "play", cardId: 102, targetCellId: 21 }, { type: "play", cardId: 78, targetCellId: 12 }, { type: "play", cardId: 39, targetCellId: 39 }, { type: "play", cardId: 46, targetCellId: 95 }, { type: "play", cardId: 1, targetCellId: 68 }, { type: "play", cardId: 94, targetCellId: 31 }, { type: "play", cardId: 74, targetCellId: 47 }, { type: "play", cardId: 26, targetCellId: 48 }, { type: "play", cardId: 65, targetCellId: 38 }, { type: "play", cardId: 98, targetCellId: 60 }, { type: "play", cardId: 68, targetCellId: 57 }, { type: "play", cardId: 83, targetCellId: 56 }, { type: "play", cardId: 93, targetCellId: 71 }, { type: "play", cardId: 15, targetCellId: 49 }, { type: "play", cardId: 34, targetCellId: 53 }, { type: "play", cardId: 104, targetCellId: 89 }, { type: "play", cardId: 90, targetCellId: 11 }, { type: "play", cardId: 23, targetCellId: 73 }, { type: "play", cardId: 21, targetCellId: 78 }, { type: "play", cardId: 18, targetCellId: 69 }, { type: "play", cardId: 8, targetCellId: 59 }, { type: "play", cardId: 60, targetCellId: 97 }, { type: "play", cardId: 89, targetCellId: 44 }, { type: "play", cardId: 38, targetCellId: 64 }, { type: "play", cardId: 45, targetCellId: 96 }, { type: "play", cardId: 66, targetCellId: 80 }, { type: "play", cardId: 10, targetCellId: 81 }, { type: "play", cardId: 86, targetCellId: 30 }, { type: "play", cardId: 30, targetCellId: 98 }, { type: "play", cardId: 16, targetCellId: 40 }, { type: "play", cardId: 36, targetCellId: 61 }],
        },
        {
          id: "mt-2",
          seed: "midgame-3002",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 2",
          en: "Midgame Combo 2",
          setupMoves: [{ type: "play", cardId: 17, targetCellId: 88 }, { type: "play", cardId: 85, targetCellId: 22 }, { type: "play", cardId: 62, targetCellId: 58 }, { type: "play", cardId: 87, targetCellId: 25 }, { type: "play", cardId: 43, targetCellId: 48 }, { type: "play", cardId: 9, targetCellId: 34 }, { type: "play", cardId: 36, targetCellId: 77 }, { type: "play", cardId: 32, targetCellId: 30 }, { type: "play", cardId: 5, targetCellId: 26 }, { type: "play", cardId: 31, targetCellId: 54 }, { type: "play", cardId: 40, targetCellId: 16 }, { type: "play", cardId: 19, targetCellId: 68 }, { type: "play", cardId: 73, targetCellId: 17 }, { type: "play", cardId: 81, targetCellId: 24 }, { type: "play", cardId: 48, targetCellId: 27 }, { type: "play", cardId: 15, targetCellId: 47 }, { type: "play", cardId: 63, targetCellId: 24 }, { type: "play", cardId: 53, targetCellId: 36 }, { type: "play", cardId: 90, targetCellId: 70 }, { type: "play", cardId: 22, targetCellId: 43 }, { type: "play", cardId: 4, targetCellId: 4 }, { type: "play", cardId: 37, targetCellId: 37 }, { type: "play", cardId: 82, targetCellId: 66 }, { type: "play", cardId: 77, targetCellId: 39 }, { type: "play", cardId: 11, targetCellId: 36 }, { type: "play", cardId: 33, targetCellId: 19 }, { type: "play", cardId: 41, targetCellId: 6 }, { type: "play", cardId: 3, targetCellId: 28 }, { type: "play", cardId: 71, targetCellId: 2 }, { type: "play", cardId: 66, targetCellId: 15 }, { type: "play", cardId: 76, targetCellId: 19 }, { type: "play", cardId: 65, targetCellId: 32 }, { type: "play", cardId: 45, targetCellId: 57 }, { type: "play", cardId: 79, targetCellId: 87 }, { type: "play", cardId: 58, targetCellId: 55 }, { type: "play", cardId: 91, targetCellId: 5 }, { type: "play", cardId: 83, targetCellId: 93 }, { type: "play", cardId: 44, targetCellId: 81 }, { type: "play", cardId: 34, targetCellId: 52 }, { type: "play", cardId: 6, targetCellId: 56 }, { type: "play", cardId: 68, targetCellId: 75 }, { type: "play", cardId: 46, targetCellId: 64 }, { type: "play", cardId: 35, targetCellId: 74 }, { type: "play", cardId: 96, targetCellId: 69 }, { type: "play", cardId: 92, targetCellId: 3 }, { type: "play", cardId: 42, targetCellId: 78 }, { type: "play", cardId: 2, targetCellId: 71 }, { type: "play", cardId: 8, targetCellId: 31 }, { type: "play", cardId: 16, targetCellId: 33 }, { type: "play", cardId: 52, targetCellId: 14 }],
        },
        {
          id: "mt-3",
          seed: "midgame-3003",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 3",
          en: "Midgame Combo 3",
          setupMoves: [{ type: "play", cardId: 19, targetCellId: 27 }, { type: "play", cardId: 40, targetCellId: 50 }, { type: "play", cardId: 53, targetCellId: 10 }, { type: "play", cardId: 28, targetCellId: 30 }, { type: "play", cardId: 17, targetCellId: 49 }, { type: "play", cardId: 86, targetCellId: 39 }, { type: "play", cardId: 58, targetCellId: 28 }, { type: "play", cardId: 26, targetCellId: 75 }, { type: "play", cardId: 60, targetCellId: 58 }, { type: "play", cardId: 5, targetCellId: 77 }, { type: "play", cardId: 82, targetCellId: 74 }, { type: "play", cardId: 18, targetCellId: 79 }, { type: "play", cardId: 24, targetCellId: 30 }, { type: "play", cardId: 50, targetCellId: 76 }, { type: "play", cardId: 21, targetCellId: 16 }, { type: "play", cardId: 11, targetCellId: 16 }, { type: "play", cardId: 52, targetCellId: 64 }, { type: "play", cardId: 56, targetCellId: 57 }, { type: "play", cardId: 42, targetCellId: 26 }, { type: "play", cardId: 33, targetCellId: 48 }, { type: "play", cardId: 83, targetCellId: 62 }, { type: "play", cardId: 68, targetCellId: 67 }, { type: "play", cardId: 95, targetCellId: 93 }, { type: "play", cardId: 10, targetCellId: 56 }, { type: "play", cardId: 37, targetCellId: 66 }, { type: "play", cardId: 90, targetCellId: 86 }, { type: "play", cardId: 9, targetCellId: 72 }, { type: "play", cardId: 36, targetCellId: 38 }, { type: "play", cardId: 100, targetCellId: 97 }, { type: "play", cardId: 29, targetCellId: 73 }, { type: "play", cardId: 59, targetCellId: 78 }, { type: "play", cardId: 25, targetCellId: 23 }, { type: "play", cardId: 34, targetCellId: 24 }, { type: "play", cardId: 35, targetCellId: 20 }, { type: "play", cardId: 72, targetCellId: 63 }, { type: "play", cardId: 43, targetCellId: 81 }, { type: "play", cardId: 65, targetCellId: 65 }, { type: "play", cardId: 84, targetCellId: 47 }, { type: "play", cardId: 67, targetCellId: 34 }, { type: "play", cardId: 39, targetCellId: 53 }, { type: "play", cardId: 27, targetCellId: 92 }, { type: "play", cardId: 88, targetCellId: 91 }, { type: "play", cardId: 92, targetCellId: 85 }, { type: "play", cardId: 80, targetCellId: 30 }, { type: "play", cardId: 98, targetCellId: 41 }, { type: "play", cardId: 44, targetCellId: 71 }, { type: "play", cardId: 55, targetCellId: 36 }, { type: "play", cardId: 8, targetCellId: 89 }],
        },
        {
          id: "mt-4",
          seed: "midgame-3005",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 4",
          en: "Midgame Combo 4",
          setupMoves: [{ type: "play", cardId: 7, targetCellId: 77 }, { type: "play", cardId: 12, targetCellId: 88 }, { type: "play", cardId: 101, targetCellId: 74 }, { type: "play", cardId: 16, targetCellId: 78 }, { type: "play", cardId: 99, targetCellId: 52 }, { type: "play", cardId: 26, targetCellId: 89 }, { type: "play", cardId: 64, targetCellId: 63 }, { type: "play", cardId: 39, targetCellId: 41 }, { type: "play", cardId: 50, targetCellId: 85 }, { type: "play", cardId: 34, targetCellId: 45 }, { type: "play", cardId: 27, targetCellId: 81 }, { type: "play", cardId: 40, targetCellId: 23 }, { type: "play", cardId: 9, targetCellId: 65 }, { type: "play", cardId: 74, targetCellId: 5 }, { type: "play", cardId: 87, targetCellId: 56 }, { type: "play", cardId: 48, targetCellId: 92 }, { type: "play", cardId: 45, targetCellId: 96 }, { type: "play", cardId: 89, targetCellId: 47 }, { type: "play", cardId: 23, targetCellId: 66 }, { type: "play", cardId: 58, targetCellId: 67 }, { type: "play", cardId: 42, targetCellId: 53 }, { type: "play", cardId: 79, targetCellId: 55 }, { type: "play", cardId: 17, targetCellId: 76 }, { type: "play", cardId: 54, targetCellId: 49 }, { type: "play", cardId: 15, targetCellId: 26 }, { type: "play", cardId: 1, targetCellId: 93 }, { type: "play", cardId: 75, targetCellId: 94 }, { type: "play", cardId: 62, targetCellId: 57 }, { type: "play", cardId: 55, targetCellId: 97 }, { type: "play", cardId: 70, targetCellId: 86 }, { type: "play", cardId: 29, targetCellId: 64 }, { type: "play", cardId: 95, targetCellId: 75 }, { type: "play", cardId: 24, targetCellId: 67 }, { type: "play", cardId: 2, targetCellId: 61 }],
        },
        {
          id: "mt-5",
          seed: "midgame-3006",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 5",
          en: "Midgame Combo 5",
          setupMoves: [{ type: "play", cardId: 80, targetCellId: 55 }, { type: "play", cardId: 51, targetCellId: 60 }, { type: "play", cardId: 102, targetCellId: 66 }, { type: "play", cardId: 33, targetCellId: 93 }, { type: "play", cardId: 17, targetCellId: 44 }, { type: "play", cardId: 79, targetCellId: 97 }, { type: "play", cardId: 91, targetCellId: 77 }, { type: "play", cardId: 97, targetCellId: 62 }, { type: "play", cardId: 11, targetCellId: 93 }, { type: "play", cardId: 48, targetCellId: 84 }, { type: "play", cardId: 39, targetCellId: 53 }, { type: "play", cardId: 62, targetCellId: 30 }, { type: "play", cardId: 5, targetCellId: 57 }, { type: "play", cardId: 65, targetCellId: 87 }, { type: "play", cardId: 56, targetCellId: 85 }, { type: "play", cardId: 3, targetCellId: 92 }, { type: "play", cardId: 46, targetCellId: 58 }, { type: "play", cardId: 96, targetCellId: 54 }, { type: "play", cardId: 58, targetCellId: 68 }, { type: "play", cardId: 45, targetCellId: 81 }, { type: "play", cardId: 104, targetCellId: 78 }, { type: "play", cardId: 75, targetCellId: 48 }, { type: "play", cardId: 90, targetCellId: 24 }, { type: "play", cardId: 101, targetCellId: 33 }, { type: "play", cardId: 61, targetCellId: 69 }, { type: "play", cardId: 57, targetCellId: 46 }, { type: "play", cardId: 41, targetCellId: 98 }, { type: "play", cardId: 25, targetCellId: 56 }, { type: "play", cardId: 78, targetCellId: 25 }, { type: "play", cardId: 99, targetCellId: 94 }, { type: "play", cardId: 22, targetCellId: 26 }, { type: "play", cardId: 30, targetCellId: 64 }, { type: "play", cardId: 20, targetCellId: 23 }, { type: "play", cardId: 40, targetCellId: 91 }, { type: "play", cardId: 24, targetCellId: 94 }, { type: "play", cardId: 98, targetCellId: 36 }],
        },
        {
          id: "mt-6",
          seed: "midgame-3009",
          difficulty: "aggressive",
          par: 3,
          ko: "미드게임 콤보 6",
          en: "Midgame Combo 6",
          setupMoves: [{ type: "play", cardId: 91, targetCellId: 54 }, { type: "play", cardId: 51, targetCellId: 72 }, { type: "play", cardId: 32, targetCellId: 45 }, { type: "play", cardId: 57, targetCellId: 73 }, { type: "play", cardId: 34, targetCellId: 74 }, { type: "play", cardId: 6, targetCellId: 64 }, { type: "play", cardId: 60, targetCellId: 42 }, { type: "play", cardId: 104, targetCellId: 55 }, { type: "play", cardId: 78, targetCellId: 34 }, { type: "play", cardId: 19, targetCellId: 88 }, { type: "play", cardId: 52, targetCellId: 44 }, { type: "play", cardId: 59, targetCellId: 53 }, { type: "play", cardId: 98, targetCellId: 30 }, { type: "play", cardId: 41, targetCellId: 4 }, { type: "play", cardId: 18, targetCellId: 46 }, { type: "play", cardId: 24, targetCellId: 44 }, { type: "play", cardId: 73, targetCellId: 57 }, { type: "play", cardId: 97, targetCellId: 2 }, { type: "play", cardId: 69, targetCellId: 24 }, { type: "play", cardId: 14, targetCellId: 67 }, { type: "play", cardId: 77, targetCellId: 36 }, { type: "play", cardId: 26, targetCellId: 76 }, { type: "play", cardId: 90, targetCellId: 13 }, { type: "play", cardId: 33, targetCellId: 48 }, { type: "play", cardId: 50, targetCellId: 35 }, { type: "play", cardId: 11, targetCellId: 36 }, { type: "play", cardId: 27, targetCellId: 32 }, { type: "play", cardId: 40, targetCellId: 78 }, { type: "play", cardId: 71, targetCellId: 79 }, { type: "play", cardId: 65, targetCellId: 14 }, { type: "play", cardId: 100, targetCellId: 27 }, { type: "play", cardId: 13, targetCellId: 65 }, { type: "play", cardId: 67, targetCellId: 58 }, { type: "play", cardId: 4, targetCellId: 52 }, { type: "play", cardId: 48, targetCellId: 56 }, { type: "play", cardId: 12, targetCellId: 18 }, { type: "play", cardId: 35, targetCellId: 93 }, { type: "play", cardId: 31, targetCellId: 17 }, { type: "play", cardId: 58, targetCellId: 12 }, { type: "play", cardId: 22, targetCellId: 8 }, { type: "play", cardId: 101, targetCellId: 86 }, { type: "play", cardId: 66, targetCellId: 59 }, { type: "play", cardId: 46, targetCellId: 20 }, { type: "play", cardId: 7, targetCellId: 40 }, { type: "play", cardId: 84, targetCellId: 37 }, { type: "play", cardId: 23, targetCellId: 16 }, { type: "play", cardId: 95, targetCellId: 26 }, { type: "play", cardId: 79, targetCellId: 39 }, { type: "play", cardId: 85, targetCellId: 29 }, { type: "play", cardId: 39, targetCellId: 25 }, { type: "play", cardId: 54, targetCellId: 1 }, { type: "play", cardId: 63, targetCellId: 34 }, { type: "play", cardId: 64, targetCellId: 38 }, { type: "play", cardId: 92, targetCellId: 50 }, { type: "play", cardId: 16, targetCellId: 43 }, { type: "play", cardId: 83, targetCellId: 60 }, { type: "play", cardId: 56, targetCellId: 41 }, { type: "play", cardId: 89, targetCellId: 15 }, { type: "play", cardId: 20, targetCellId: 63 }, { type: "play", cardId: 61, targetCellId: 47 }, { type: "play", cardId: 28, targetCellId: 7 }, { type: "play", cardId: 2, targetCellId: 5 }, { type: "play", cardId: 43, targetCellId: 75 }, { type: "play", cardId: 76, targetCellId: 45 }, { type: "play", cardId: 37, targetCellId: 36 }, { type: "play", cardId: 9, targetCellId: 10 }],
        },
    ],
  },
  {
    id: "defensive-holds",
    ko: "수비 반격",
    en: "Defensive Holds",
    ko_desc: "강한 봇의 공격을 막고 반격하는 수비 팩입니다.",
    en_desc: "A defensive pack about holding a strong bot off and countering.",
    puzzles: [
        {
          id: "dh-1",
          seed: "defense-4000",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 1",
          en: "Defensive Counter 1",
          setupMoves: [{ type: "play", cardId: 98, targetCellId: 55 }, { type: "play", cardId: 35, targetCellId: 44 }, { type: "play", cardId: 63, targetCellId: 44 }, { type: "play", cardId: 67, targetCellId: 66 }, { type: "play", cardId: 76, targetCellId: 66 }, { type: "play", cardId: 77, targetCellId: 22 }, { type: "play", cardId: 6, targetCellId: 25 }, { type: "play", cardId: 51, targetCellId: 35 }, { type: "play", cardId: 29, targetCellId: 59 }, { type: "play", cardId: 88, targetCellId: 37 }, { type: "play", cardId: 26, targetCellId: 61 }, { type: "play", cardId: 97, targetCellId: 62 }, { type: "play", cardId: 83, targetCellId: 36 }, { type: "play", cardId: 89, targetCellId: 44 }, { type: "play", cardId: 66, targetCellId: 68 }, { type: "play", cardId: 19, targetCellId: 4 }, { type: "play", cardId: 81, targetCellId: 2 }, { type: "play", cardId: 53, targetCellId: 32 }, { type: "play", cardId: 48, targetCellId: 54 }, { type: "play", cardId: 74, targetCellId: 56 }, { type: "play", cardId: 50, targetCellId: 69 }, { type: "play", cardId: 11, targetCellId: 69 }, { type: "play", cardId: 99, targetCellId: 18 }, { type: "play", cardId: 47, targetCellId: 12 }, { type: "play", cardId: 21, targetCellId: 51 }, { type: "play", cardId: 92, targetCellId: 80 }, { type: "play", cardId: 15, targetCellId: 63 }, { type: "play", cardId: 78, targetCellId: 17 }, { type: "play", cardId: 100, targetCellId: 8 }, { type: "play", cardId: 90, targetCellId: 45 }, { type: "play", cardId: 96, targetCellId: 6 }, { type: "play", cardId: 7, targetCellId: 40 }, { type: "play", cardId: 27, targetCellId: 7 }, { type: "play", cardId: 33, targetCellId: 46 }, { type: "play", cardId: 44, targetCellId: 5 }, { type: "play", cardId: 23, targetCellId: 60 }, { type: "play", cardId: 41, targetCellId: 47 }, { type: "play", cardId: 36, targetCellId: 58 }, { type: "play", cardId: 52, targetCellId: 50 }, { type: "play", cardId: 102, targetCellId: 53 }, { type: "play", cardId: 38, targetCellId: 23 }, { type: "play", cardId: 93, targetCellId: 86 }, { type: "play", cardId: 75, targetCellId: 76 }, { type: "play", cardId: 61, targetCellId: 75 }, { type: "play", cardId: 79, targetCellId: 16 }, { type: "play", cardId: 40, targetCellId: 97 }, { type: "play", cardId: 101, targetCellId: 71 }, { type: "play", cardId: 5, targetCellId: 41 }, { type: "play", cardId: 65, targetCellId: 43 }, { type: "play", cardId: 60, targetCellId: 52 }],
        },
        {
          id: "dh-2",
          seed: "defense-4001",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 2",
          en: "Defensive Counter 2",
          setupMoves: [{ type: "play", cardId: 4, targetCellId: 49 }, { type: "play", cardId: 85, targetCellId: 39 }, { type: "play", cardId: 5, targetCellId: 69 }, { type: "play", cardId: 16, targetCellId: 55 }, { type: "play", cardId: 30, targetCellId: 36 }, { type: "play", cardId: 51, targetCellId: 77 }, { type: "play", cardId: 77, targetCellId: 4 }, { type: "play", cardId: 35, targetCellId: 79 }, { type: "play", cardId: 2, targetCellId: 25 }, { type: "play", cardId: 94, targetCellId: 47 }, { type: "play", cardId: 69, targetCellId: 1 }, { type: "play", cardId: 9, targetCellId: 2 }, { type: "play", cardId: 65, targetCellId: 45 }, { type: "play", cardId: 87, targetCellId: 27 }, { type: "play", cardId: 39, targetCellId: 16 }, { type: "play", cardId: 46, targetCellId: 67 }, { type: "play", cardId: 88, targetCellId: 66 }, { type: "play", cardId: 79, targetCellId: 57 }, { type: "play", cardId: 43, targetCellId: 41 }, { type: "play", cardId: 3, targetCellId: 87 }, { type: "play", cardId: 10, targetCellId: 23 }, { type: "play", cardId: 28, targetCellId: 17 }, { type: "play", cardId: 86, targetCellId: 53 }, { type: "play", cardId: 34, targetCellId: 86 }, { type: "play", cardId: 84, targetCellId: 64 }, { type: "play", cardId: 98, targetCellId: 76 }, { type: "play", cardId: 12, targetCellId: 43 }, { type: "play", cardId: 73, targetCellId: 42 }, { type: "play", cardId: 44, targetCellId: 62 }, { type: "play", cardId: 62, targetCellId: 73 }, { type: "play", cardId: 81, targetCellId: 5 }, { type: "play", cardId: 18, targetCellId: 7 }, { type: "play", cardId: 76, targetCellId: 27 }, { type: "play", cardId: 53, targetCellId: 44 }, { type: "play", cardId: 19, targetCellId: 34 }, { type: "play", cardId: 31, targetCellId: 52 }, { type: "play", cardId: 23, targetCellId: 22 }, { type: "play", cardId: 71, targetCellId: 21 }, { type: "play", cardId: 100, targetCellId: 94 }, { type: "play", cardId: 14, targetCellId: 26 }, { type: "play", cardId: 82, targetCellId: 12 }, { type: "play", cardId: 96, targetCellId: 15 }, { type: "play", cardId: 58, targetCellId: 93 }, { type: "play", cardId: 78, targetCellId: 37 }, { type: "play", cardId: 104, targetCellId: 60 }, { type: "play", cardId: 13, targetCellId: 56 }],
        },
        {
          id: "dh-3",
          seed: "defense-4002",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 3",
          en: "Defensive Counter 3",
          setupMoves: [{ type: "play", cardId: 102, targetCellId: 4 }, { type: "play", cardId: 34, targetCellId: 69 }, { type: "play", cardId: 63, targetCellId: 69 }, { type: "play", cardId: 51, targetCellId: 7 }, { type: "play", cardId: 23, targetCellId: 22 }, { type: "play", cardId: 64, targetCellId: 8 }, { type: "play", cardId: 92, targetCellId: 63 }, { type: "play", cardId: 13, targetCellId: 13 }, { type: "play", cardId: 8, targetCellId: 73 }, { type: "play", cardId: 74, targetCellId: 53 }, { type: "play", cardId: 72, targetCellId: 64 }, { type: "play", cardId: 18, targetCellId: 65 }, { type: "play", cardId: 88, targetCellId: 46 }, { type: "play", cardId: 73, targetCellId: 11 }, { type: "play", cardId: 38, targetCellId: 43 }, { type: "play", cardId: 10, targetCellId: 54 }, { type: "play", cardId: 47, targetCellId: 56 }, { type: "play", cardId: 50, targetCellId: 55 }, { type: "play", cardId: 28, targetCellId: 23 }, { type: "play", cardId: 25, targetCellId: 15 }, { type: "play", cardId: 39, targetCellId: 21 }, { type: "play", cardId: 33, targetCellId: 20 }, { type: "play", cardId: 90, targetCellId: 50 }, { type: "play", cardId: 3, targetCellId: 77 }, { type: "play", cardId: 94, targetCellId: 96 }, { type: "play", cardId: 59, targetCellId: 24 }, { type: "play", cardId: 36, targetCellId: 14 }, { type: "play", cardId: 62, targetCellId: 60 }, { type: "play", cardId: 26, targetCellId: 51 }, { type: "play", cardId: 82, targetCellId: 27 }, { type: "play", cardId: 96, targetCellId: 78 }, { type: "play", cardId: 37, targetCellId: 66 }, { type: "play", cardId: 9, targetCellId: 87 }, { type: "play", cardId: 99, targetCellId: 57 }, { type: "play", cardId: 44, targetCellId: 58 }, { type: "play", cardId: 104, targetCellId: 84 }, { type: "play", cardId: 15, targetCellId: 44 }, { type: "play", cardId: 29, targetCellId: 42 }, { type: "play", cardId: 31, targetCellId: 26 }, { type: "play", cardId: 24, targetCellId: 56 }, { type: "play", cardId: 56, targetCellId: 45 }, { type: "play", cardId: 97, targetCellId: 39 }, { type: "play", cardId: 45, targetCellId: 49 }, { type: "play", cardId: 103, targetCellId: 74 }, { type: "play", cardId: 58, targetCellId: 31 }, { type: "play", cardId: 77, targetCellId: 61 }, { type: "play", cardId: 48, targetCellId: 17 }, { type: "play", cardId: 98, targetCellId: 52 }, { type: "play", cardId: 2, targetCellId: 75 }, { type: "play", cardId: 49, targetCellId: 5 }, { type: "play", cardId: 19, targetCellId: 3 }, { type: "play", cardId: 30, targetCellId: 2 }, { type: "play", cardId: 67, targetCellId: 6 }, { type: "play", cardId: 57, targetCellId: 67 }, { type: "play", cardId: 76, targetCellId: 55 }, { type: "play", cardId: 86, targetCellId: 69 }, { type: "play", cardId: 32, targetCellId: 55 }, { type: "play", cardId: 16, targetCellId: 62 }, { type: "play", cardId: 89, targetCellId: 36 }, { type: "play", cardId: 52, targetCellId: 38 }],
        },
        {
          id: "dh-4",
          seed: "defense-4006",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 4",
          en: "Defensive Counter 4",
          setupMoves: [{ type: "play", cardId: 14, targetCellId: 44 }, { type: "play", cardId: 28, targetCellId: 94 }, { type: "play", cardId: 69, targetCellId: 45 }, { type: "play", cardId: 75, targetCellId: 95 }, { type: "play", cardId: 102, targetCellId: 43 }, { type: "play", cardId: 9, targetCellId: 50 }, { type: "play", cardId: 17, targetCellId: 97 }, { type: "play", cardId: 100, targetCellId: 60 }, { type: "play", cardId: 51, targetCellId: 61 }, { type: "play", cardId: 92, targetCellId: 36 }, { type: "play", cardId: 63, targetCellId: 50 }, { type: "play", cardId: 91, targetCellId: 30 }, { type: "play", cardId: 61, targetCellId: 50 }, { type: "play", cardId: 12, targetCellId: 10 }, { type: "play", cardId: 5, targetCellId: 64 }, { type: "play", cardId: 26, targetCellId: 84 }, { type: "play", cardId: 79, targetCellId: 63 }, { type: "play", cardId: 72, targetCellId: 33 }, { type: "play", cardId: 55, targetCellId: 81 }, { type: "play", cardId: 82, targetCellId: 85 }, { type: "play", cardId: 34, targetCellId: 72 }, { type: "play", cardId: 81, targetCellId: 86 }, { type: "play", cardId: 39, targetCellId: 62 }, { type: "play", cardId: 3, targetCellId: 87 }, { type: "play", cardId: 98, targetCellId: 65 }, { type: "play", cardId: 53, targetCellId: 96 }, { type: "play", cardId: 11, targetCellId: 85 }, { type: "play", cardId: 73, targetCellId: 91 }, { type: "play", cardId: 54, targetCellId: 40 }, { type: "play", cardId: 87, targetCellId: 53 }, { type: "play", cardId: 47, targetCellId: 92 }, { type: "play", cardId: 7, targetCellId: 75 }, { type: "play", cardId: 66, targetCellId: 82 }, { type: "play", cardId: 58, targetCellId: 48 }, { type: "play", cardId: 24, targetCellId: 60 }, { type: "play", cardId: 83, targetCellId: 59 }],
        },
        {
          id: "dh-5",
          seed: "defense-4011",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 5",
          en: "Defensive Counter 5",
          setupMoves: [{ type: "play", cardId: 12, targetCellId: 33 }, { type: "play", cardId: 85, targetCellId: 63 }, { type: "play", cardId: 36, targetCellId: 35 }, { type: "play", cardId: 21, targetCellId: 83 }, { type: "play", cardId: 65, targetCellId: 13 }, { type: "play", cardId: 30, targetCellId: 74 }, { type: "play", cardId: 14, targetCellId: 44 }, { type: "play", cardId: 1, targetCellId: 92 }, { type: "play", cardId: 70, targetCellId: 26 }, { type: "play", cardId: 75, targetCellId: 94 }, { type: "play", cardId: 95, targetCellId: 8 }, { type: "play", cardId: 88, targetCellId: 41 }, { type: "play", cardId: 63, targetCellId: 63 }, { type: "play", cardId: 15, targetCellId: 23 }, { type: "play", cardId: 18, targetCellId: 16 }, { type: "play", cardId: 89, targetCellId: 17 }, { type: "play", cardId: 93, targetCellId: 62 }, { type: "play", cardId: 17, targetCellId: 24 }, { type: "play", cardId: 76, targetCellId: 17 }, { type: "play", cardId: 3, targetCellId: 55 }, { type: "play", cardId: 16, targetCellId: 64 }, { type: "play", cardId: 92, targetCellId: 53 }, { type: "play", cardId: 35, targetCellId: 17 }, { type: "play", cardId: 82, targetCellId: 45 }, { type: "play", cardId: 29, targetCellId: 66 }, { type: "play", cardId: 91, targetCellId: 81 }, { type: "play", cardId: 44, targetCellId: 75 }, { type: "play", cardId: 94, targetCellId: 71 }, { type: "play", cardId: 5, targetCellId: 27 }, { type: "play", cardId: 11, targetCellId: 64 }, { type: "play", cardId: 28, targetCellId: 57 }, { type: "play", cardId: 48, targetCellId: 37 }, { type: "play", cardId: 45, targetCellId: 93 }, { type: "play", cardId: 68, targetCellId: 39 }, { type: "play", cardId: 24, targetCellId: 53 }, { type: "play", cardId: 90, targetCellId: 31 }, { type: "play", cardId: 61, targetCellId: 14 }, { type: "play", cardId: 41, targetCellId: 20 }, { type: "play", cardId: 49, targetCellId: 46 }, { type: "play", cardId: 71, targetCellId: 42 }, { type: "play", cardId: 96, targetCellId: 49 }, { type: "play", cardId: 22, targetCellId: 38 }, { type: "play", cardId: 66, targetCellId: 51 }, { type: "play", cardId: 26, targetCellId: 52 }],
        },
        {
          id: "dh-6",
          seed: "defense-4014",
          difficulty: "master",
          par: 4,
          ko: "수비 반격 6",
          en: "Defensive Counter 6",
          setupMoves: [{ type: "play", cardId: 43, targetCellId: 95 }, { type: "play", cardId: 40, targetCellId: 98 }, { type: "play", cardId: 50, targetCellId: 94 }, { type: "play", cardId: 6, targetCellId: 88 }, { type: "play", cardId: 98, targetCellId: 68 }, { type: "play", cardId: 70, targetCellId: 66 }, { type: "play", cardId: 17, targetCellId: 56 }, { type: "play", cardId: 31, targetCellId: 64 }, { type: "play", cardId: 13, targetCellId: 86 }, { type: "play", cardId: 14, targetCellId: 46 }, { type: "play", cardId: 73, targetCellId: 55 }, { type: "play", cardId: 81, targetCellId: 59 }, { type: "play", cardId: 64, targetCellId: 53 }, { type: "play", cardId: 33, targetCellId: 49 }, { type: "play", cardId: 90, targetCellId: 65 }, { type: "play", cardId: 53, targetCellId: 4 }, { type: "play", cardId: 27, targetCellId: 39 }, { type: "play", cardId: 37, targetCellId: 54 }, { type: "play", cardId: 93, targetCellId: 74 }, { type: "play", cardId: 99, targetCellId: 44 }, { type: "play", cardId: 97, targetCellId: 47 }, { type: "play", cardId: 21, targetCellId: 26 }, { type: "play", cardId: 10, targetCellId: 34 }, { type: "play", cardId: 2, targetCellId: 15 }, { type: "play", cardId: 69, targetCellId: 37 }, { type: "play", cardId: 67, targetCellId: 8 }, { type: "play", cardId: 46, targetCellId: 45 }, { type: "play", cardId: 38, targetCellId: 12 }, { type: "play", cardId: 89, targetCellId: 35 }, { type: "play", cardId: 1, targetCellId: 40 }, { type: "play", cardId: 77, targetCellId: 89 }, { type: "play", cardId: 20, targetCellId: 31 }, { type: "play", cardId: 80, targetCellId: 17 }, { type: "play", cardId: 34, targetCellId: 3 }, { type: "play", cardId: 84, targetCellId: 32 }, { type: "play", cardId: 83, targetCellId: 23 }, { type: "play", cardId: 79, targetCellId: 29 }, { type: "play", cardId: 26, targetCellId: 92 }, { type: "play", cardId: 86, targetCellId: 63 }, { type: "play", cardId: 57, targetCellId: 22 }, { type: "play", cardId: 35, targetCellId: 24 }, { type: "play", cardId: 22, targetCellId: 85 }, { type: "play", cardId: 56, targetCellId: 30 }, { type: "play", cardId: 8, targetCellId: 52 }, { type: "play", cardId: 63, targetCellId: 31 }, { type: "play", cardId: 52, targetCellId: 75 }],
        },
    ],
  },
  {
    id: "sprint-finishes",
    ko: "스프린트 마무리",
    en: "Sprint Finishes",
    ko_desc: "두 수 안에 끝내는 초고속 마무리 팩입니다.",
    en_desc: "A rapid pack about closing the game in just two moves.",
    puzzles: [
        {
          id: "sf-1",
          seed: "sprint-5004",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 1",
          en: "Sprint Finish 1",
          setupMoves: [{ type: "play", cardId: 61, targetCellId: 72 }, { type: "play", cardId: 52, targetCellId: 54 }, { type: "play", cardId: 19, targetCellId: 55 }, { type: "play", cardId: 45, targetCellId: 50 }, { type: "play", cardId: 33, targetCellId: 70 }, { type: "play", cardId: 82, targetCellId: 18 }, { type: "play", cardId: 3, targetCellId: 64 }, { type: "play", cardId: 23, targetCellId: 10 }, { type: "play", cardId: 80, targetCellId: 21 }, { type: "play", cardId: 32, targetCellId: 28 }, { type: "play", cardId: 67, targetCellId: 65 }, { type: "play", cardId: 17, targetCellId: 68 }, { type: "play", cardId: 30, targetCellId: 66 }, { type: "play", cardId: 76, targetCellId: 66 }, { type: "play", cardId: 86, targetCellId: 56 }, { type: "play", cardId: 83, targetCellId: 20 }, { type: "play", cardId: 44, targetCellId: 95 }, { type: "play", cardId: 89, targetCellId: 40 }, { type: "play", cardId: 28, targetCellId: 33 }, { type: "play", cardId: 24, targetCellId: 55 }, { type: "play", cardId: 93, targetCellId: 34 }, { type: "play", cardId: 16, targetCellId: 29 }, { type: "play", cardId: 84, targetCellId: 43 }, { type: "play", cardId: 100, targetCellId: 30 }, { type: "play", cardId: 22, targetCellId: 16 }, { type: "play", cardId: 11, targetCellId: 34 }, { type: "play", cardId: 68, targetCellId: 73 }, { type: "play", cardId: 18, targetCellId: 71 }, { type: "play", cardId: 43, targetCellId: 76 }, { type: "play", cardId: 71, targetCellId: 55 }, { type: "play", cardId: 59, targetCellId: 26 }, { type: "play", cardId: 39, targetCellId: 88 }, { type: "play", cardId: 56, targetCellId: 27 }, { type: "play", cardId: 26, targetCellId: 62 }, { type: "play", cardId: 12, targetCellId: 44 }, { type: "play", cardId: 50, targetCellId: 60 }, { type: "play", cardId: 2, targetCellId: 23 }, { type: "play", cardId: 36, targetCellId: 45 }, { type: "play", cardId: 13, targetCellId: 74 }, { type: "play", cardId: 62, targetCellId: 63 }, { type: "play", cardId: 98, targetCellId: 36 }, { type: "play", cardId: 87, targetCellId: 98 }, { type: "play", cardId: 72, targetCellId: 35 }, { type: "play", cardId: 101, targetCellId: 83 }, { type: "play", cardId: 97, targetCellId: 31 }, { type: "play", cardId: 48, targetCellId: 86 }, { type: "play", cardId: 42, targetCellId: 49 }, { type: "play", cardId: 37, targetCellId: 46 }, { type: "play", cardId: 69, targetCellId: 5 }, { type: "play", cardId: 9, targetCellId: 24 }, { type: "play", cardId: 47, targetCellId: 14 }, { type: "play", cardId: 66, targetCellId: 52 }, { type: "play", cardId: 20, targetCellId: 17 }, { type: "play", cardId: 40, targetCellId: 3 }, { type: "play", cardId: 10, targetCellId: 15 }, { type: "play", cardId: 88, targetCellId: 12 }, { type: "play", cardId: 46, targetCellId: 51 }, { type: "play", cardId: 103, targetCellId: 53 }, { type: "play", cardId: 91, targetCellId: 7 }, { type: "play", cardId: 65, targetCellId: 77 }, { type: "play", cardId: 27, targetCellId: 25 }, { type: "play", cardId: 64, targetCellId: 61 }, { type: "play", cardId: 8, targetCellId: 58 }, { type: "play", cardId: 25, targetCellId: 69 }, { type: "play", cardId: 34, targetCellId: 84 }, { type: "play", cardId: 95, targetCellId: 8 }, { type: "play", cardId: 81, targetCellId: 85 }, { type: "play", cardId: 21, targetCellId: 94 }, { type: "play", cardId: 7, targetCellId: 79 }, { type: "play", cardId: 38, targetCellId: 11 }, { type: "play", cardId: 57, targetCellId: 91 }, { type: "play", cardId: 41, targetCellId: 34 }],
        },
        {
          id: "sf-2",
          seed: "sprint-5007",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 2",
          en: "Sprint Finish 2",
          setupMoves: [{ type: "play", cardId: 50, targetCellId: 4 }, { type: "play", cardId: 34, targetCellId: 72 }, { type: "play", cardId: 47, targetCellId: 1 }, { type: "play", cardId: 93, targetCellId: 45 }, { type: "play", cardId: 19, targetCellId: 55 }, { type: "play", cardId: 38, targetCellId: 43 }, { type: "play", cardId: 40, targetCellId: 44 }, { type: "play", cardId: 97, targetCellId: 3 }, { type: "play", cardId: 46, targetCellId: 33 }, { type: "play", cardId: 80, targetCellId: 34 }, { type: "play", cardId: 31, targetCellId: 53 }, { type: "play", cardId: 91, targetCellId: 75 }, { type: "play", cardId: 14, targetCellId: 62 }, { type: "play", cardId: 86, targetCellId: 56 }, { type: "play", cardId: 67, targetCellId: 73 }, { type: "play", cardId: 59, targetCellId: 84 }, { type: "play", cardId: 82, targetCellId: 88 }, { type: "play", cardId: 95, targetCellId: 64 }, { type: "play", cardId: 61, targetCellId: 93 }, { type: "play", cardId: 72, targetCellId: 85 }, { type: "play", cardId: 5, targetCellId: 65 }, { type: "play", cardId: 70, targetCellId: 63 }, { type: "play", cardId: 94, targetCellId: 25 }, { type: "play", cardId: 85, targetCellId: 49 }, { type: "play", cardId: 54, targetCellId: 35 }, { type: "play", cardId: 60, targetCellId: 17 }, { type: "play", cardId: 58, targetCellId: 87 }, { type: "play", cardId: 6, targetCellId: 69 }, { type: "play", cardId: 65, targetCellId: 23 }, { type: "play", cardId: 102, targetCellId: 71 }, { type: "play", cardId: 99, targetCellId: 26 }, { type: "play", cardId: 87, targetCellId: 66 }, { type: "play", cardId: 1, targetCellId: 28 }, { type: "play", cardId: 68, targetCellId: 91 }, { type: "play", cardId: 89, targetCellId: 24 }, { type: "play", cardId: 7, targetCellId: 13 }, { type: "play", cardId: 32, targetCellId: 42 }, { type: "play", cardId: 64, targetCellId: 61 }, { type: "play", cardId: 3, targetCellId: 48 }, { type: "play", cardId: 74, targetCellId: 32 }, { type: "play", cardId: 43, targetCellId: 37 }, { type: "play", cardId: 103, targetCellId: 39 }],
        },
        {
          id: "sf-3",
          seed: "sprint-5009",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 3",
          en: "Sprint Finish 3",
          setupMoves: [{ type: "play", cardId: 5, targetCellId: 44 }, { type: "play", cardId: 81, targetCellId: 94 }, { type: "play", cardId: 77, targetCellId: 64 }, { type: "play", cardId: 50, targetCellId: 93 }, { type: "play", cardId: 7, targetCellId: 84 }, { type: "play", cardId: 93, targetCellId: 98 }, { type: "play", cardId: 10, targetCellId: 33 }, { type: "play", cardId: 72, targetCellId: 92 }, { type: "play", cardId: 74, targetCellId: 11 }, { type: "play", cardId: 49, targetCellId: 67 }, { type: "play", cardId: 35, targetCellId: 97 }, { type: "play", cardId: 1, targetCellId: 57 }, { type: "play", cardId: 29, targetCellId: 74 }, { type: "play", cardId: 94, targetCellId: 75 }, { type: "play", cardId: 37, targetCellId: 54 }, { type: "play", cardId: 86, targetCellId: 65 }, { type: "play", cardId: 64, targetCellId: 45 }, { type: "play", cardId: 98, targetCellId: 72 }, { type: "play", cardId: 9, targetCellId: 41 }, { type: "play", cardId: 82, targetCellId: 69 }, { type: "play", cardId: 53, targetCellId: 21 }, { type: "play", cardId: 19, targetCellId: 66 }, { type: "play", cardId: 97, targetCellId: 88 }, { type: "play", cardId: 100, targetCellId: 29 }, { type: "play", cardId: 20, targetCellId: 91 }, { type: "play", cardId: 56, targetCellId: 96 }, { type: "play", cardId: 63, targetCellId: 94 }, { type: "play", cardId: 4, targetCellId: 63 }, { type: "play", cardId: 52, targetCellId: 10 }, { type: "play", cardId: 40, targetCellId: 79 }, { type: "play", cardId: 12, targetCellId: 61 }, { type: "play", cardId: 87, targetCellId: 36 }, { type: "play", cardId: 3, targetCellId: 71 }, { type: "play", cardId: 76, targetCellId: 41 }, { type: "play", cardId: 36, targetCellId: 47 }, { type: "play", cardId: 31, targetCellId: 26 }, { type: "play", cardId: 84, targetCellId: 49 }, { type: "play", cardId: 67, targetCellId: 53 }, { type: "play", cardId: 70, targetCellId: 34 }, { type: "play", cardId: 25, targetCellId: 52 }, { type: "play", cardId: 44, targetCellId: 32 }, { type: "play", cardId: 58, targetCellId: 43 }, { type: "play", cardId: 71, targetCellId: 86 }, { type: "play", cardId: 2, targetCellId: 46 }, { type: "play", cardId: 79, targetCellId: 89 }, { type: "play", cardId: 83, targetCellId: 16 }, { type: "play", cardId: 88, targetCellId: 78 }, { type: "play", cardId: 33, targetCellId: 76 }],
        },
        {
          id: "sf-4",
          seed: "sprint-5011",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 4",
          en: "Sprint Finish 4",
          setupMoves: [{ type: "play", cardId: 58, targetCellId: 45 }, { type: "play", cardId: 43, targetCellId: 54 }, { type: "play", cardId: 67, targetCellId: 53 }, { type: "play", cardId: 86, targetCellId: 76 }, { type: "play", cardId: 93, targetCellId: 43 }, { type: "play", cardId: 31, targetCellId: 98 }, { type: "play", cardId: 65, targetCellId: 27 }, { type: "play", cardId: 11, targetCellId: 45 }, { type: "play", cardId: 99, targetCellId: 7 }, { type: "play", cardId: 6, targetCellId: 87 }, { type: "play", cardId: 53, targetCellId: 6 }, { type: "play", cardId: 10, targetCellId: 95 }, { type: "play", cardId: 5, targetCellId: 4 }, { type: "play", cardId: 64, targetCellId: 23 }, { type: "play", cardId: 20, targetCellId: 3 }, { type: "play", cardId: 88, targetCellId: 12 }, { type: "play", cardId: 50, targetCellId: 5 }, { type: "play", cardId: 44, targetCellId: 66 }, { type: "play", cardId: 82, targetCellId: 36 }, { type: "play", cardId: 23, targetCellId: 18 }, { type: "play", cardId: 85, targetCellId: 14 }, { type: "play", cardId: 73, targetCellId: 68 }, { type: "play", cardId: 35, targetCellId: 58 }, { type: "play", cardId: 60, targetCellId: 34 }, { type: "play", cardId: 27, targetCellId: 56 }, { type: "play", cardId: 19, targetCellId: 73 }, { type: "play", cardId: 79, targetCellId: 44 }, { type: "play", cardId: 100, targetCellId: 67 }, { type: "play", cardId: 12, targetCellId: 26 }, { type: "play", cardId: 55, targetCellId: 37 }, { type: "play", cardId: 101, targetCellId: 29 }, { type: "play", cardId: 54, targetCellId: 2 }, { type: "play", cardId: 32, targetCellId: 96 }, { type: "play", cardId: 42, targetCellId: 55 }, { type: "play", cardId: 80, targetCellId: 28 }, { type: "play", cardId: 94, targetCellId: 42 }, { type: "play", cardId: 74, targetCellId: 88 }, { type: "play", cardId: 68, targetCellId: 77 }, { type: "play", cardId: 92, targetCellId: 35 }, { type: "play", cardId: 104, targetCellId: 51 }, { type: "play", cardId: 28, targetCellId: 97 }, { type: "play", cardId: 2, targetCellId: 25 }, { type: "play", cardId: 69, targetCellId: 69 }, { type: "play", cardId: 47, targetCellId: 57 }, { type: "play", cardId: 8, targetCellId: 22 }, { type: "play", cardId: 45, targetCellId: 40 }, { type: "play", cardId: 13, targetCellId: 74 }, { type: "play", cardId: 56, targetCellId: 79 }, { type: "play", cardId: 33, targetCellId: 86 }, { type: "play", cardId: 78, targetCellId: 78 }, { type: "play", cardId: 81, targetCellId: 82 }, { type: "play", cardId: 36, targetCellId: 50 }, { type: "play", cardId: 96, targetCellId: 60 }, { type: "play", cardId: 83, targetCellId: 20 }, { type: "play", cardId: 46, targetCellId: 72 }, { type: "play", cardId: 57, targetCellId: 62 }],
        },
        {
          id: "sf-5",
          seed: "sprint-5017",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 5",
          en: "Sprint Finish 5",
          setupMoves: [{ type: "play", cardId: 68, targetCellId: 44 }, { type: "play", cardId: 50, targetCellId: 33 }, { type: "play", cardId: 63, targetCellId: 33 }, { type: "play", cardId: 94, targetCellId: 63 }, { type: "play", cardId: 82, targetCellId: 24 }, { type: "play", cardId: 90, targetCellId: 41 }, { type: "play", cardId: 93, targetCellId: 42 }, { type: "play", cardId: 58, targetCellId: 60 }, { type: "play", cardId: 14, targetCellId: 62 }, { type: "play", cardId: 41, targetCellId: 82 }, { type: "play", cardId: 9, targetCellId: 35 }, { type: "play", cardId: 11, targetCellId: 44 }, { type: "play", cardId: 51, targetCellId: 26 }, { type: "play", cardId: 24, targetCellId: 35 }, { type: "play", cardId: 81, targetCellId: 52 }, { type: "play", cardId: 83, targetCellId: 55 }, { type: "play", cardId: 97, targetCellId: 72 }, { type: "play", cardId: 100, targetCellId: 33 }, { type: "play", cardId: 86, targetCellId: 64 }, { type: "play", cardId: 43, targetCellId: 75 }, { type: "play", cardId: 53, targetCellId: 28 }, { type: "play", cardId: 12, targetCellId: 31 }, { type: "play", cardId: 59, targetCellId: 84 }, { type: "play", cardId: 84, targetCellId: 45 }, { type: "play", cardId: 57, targetCellId: 54 }, { type: "play", cardId: 13, targetCellId: 1 }, { type: "play", cardId: 54, targetCellId: 95 }, { type: "play", cardId: 91, targetCellId: 3 }, { type: "play", cardId: 47, targetCellId: 4 }, { type: "play", cardId: 3, targetCellId: 73 }, { type: "play", cardId: 31, targetCellId: 34 }, { type: "play", cardId: 49, targetCellId: 94 }, { type: "play", cardId: 18, targetCellId: 76 }, { type: "play", cardId: 64, targetCellId: 51 }, { type: "play", cardId: 39, targetCellId: 8 }, { type: "play", cardId: 102, targetCellId: 44 }, { type: "play", cardId: 96, targetCellId: 65 }, { type: "play", cardId: 79, targetCellId: 71 }, { type: "play", cardId: 104, targetCellId: 87 }, { type: "play", cardId: 55, targetCellId: 77 }, { type: "play", cardId: 76, targetCellId: 44 }, { type: "play", cardId: 60, targetCellId: 5 }, { type: "play", cardId: 25, targetCellId: 11 }, { type: "play", cardId: 4, targetCellId: 74 }, { type: "play", cardId: 45, targetCellId: 21 }, { type: "play", cardId: 23, targetCellId: 86 }, { type: "play", cardId: 17, targetCellId: 81 }, { type: "play", cardId: 32, targetCellId: 61 }, { type: "play", cardId: 85, targetCellId: 53 }, { type: "play", cardId: 78, targetCellId: 16 }, { type: "play", cardId: 30, targetCellId: 12 }, { type: "play", cardId: 77, targetCellId: 23 }, { type: "play", cardId: 67, targetCellId: 67 }, { type: "play", cardId: 80, targetCellId: 38 }, { type: "play", cardId: 37, targetCellId: 44 }, { type: "play", cardId: 62, targetCellId: 36 }, { type: "play", cardId: 52, targetCellId: 39 }, { type: "play", cardId: 103, targetCellId: 88 }],
        },
        {
          id: "sf-6",
          seed: "sprint-5018",
          difficulty: "smart",
          par: 2,
          ko: "스프린트 마무리 6",
          en: "Sprint Finish 6",
          setupMoves: [{ type: "play", cardId: 16, targetCellId: 45 }, { type: "play", cardId: 37, targetCellId: 36 }, { type: "play", cardId: 41, targetCellId: 26 }, { type: "play", cardId: 67, targetCellId: 66 }, { type: "play", cardId: 76, targetCellId: 66 }, { type: "play", cardId: 86, targetCellId: 29 }, { type: "play", cardId: 51, targetCellId: 37 }, { type: "play", cardId: 52, targetCellId: 92 }, { type: "play", cardId: 98, targetCellId: 44 }, { type: "play", cardId: 85, targetCellId: 83 }, { type: "play", cardId: 15, targetCellId: 66 }, { type: "play", cardId: 73, targetCellId: 46 }, { type: "play", cardId: 91, targetCellId: 33 }, { type: "play", cardId: 24, targetCellId: 44 }, { type: "play", cardId: 89, targetCellId: 55 }, { type: "play", cardId: 82, targetCellId: 93 }, { type: "play", cardId: 81, targetCellId: 77 }, { type: "play", cardId: 17, targetCellId: 22 }, { type: "play", cardId: 21, targetCellId: 4 }, { type: "play", cardId: 53, targetCellId: 56 }, { type: "play", cardId: 56, targetCellId: 53 }, { type: "play", cardId: 10, targetCellId: 95 }, { type: "play", cardId: 55, targetCellId: 43 }, { type: "play", cardId: 45, targetCellId: 23 }, { type: "play", cardId: 42, targetCellId: 52 }, { type: "play", cardId: 32, targetCellId: 51 }, { type: "play", cardId: 48, targetCellId: 15 }, { type: "play", cardId: 60, targetCellId: 47 }, { type: "play", cardId: 40, targetCellId: 91 }, { type: "play", cardId: 75, targetCellId: 84 }, { type: "play", cardId: 79, targetCellId: 34 }, { type: "play", cardId: 94, targetCellId: 88 }, { type: "play", cardId: 5, targetCellId: 7 }, { type: "play", cardId: 99, targetCellId: 35 }],
        },
    ],
  },
  {
    id: "grand-combinations",
    ko: "그랜드 콤비네이션",
    en: "Grand Combinations",
    ko_desc: "그랜드마스터를 상대로 다섯 수 대장정을 완성하는 팩입니다.",
    en_desc: "A pack about completing a five-move journey against the grandmaster.",
    puzzles: [
        {
          id: "gc-1",
          seed: "grand-6005",
          difficulty: "grandmaster",
          par: 5,
          ko: "그랜드 콤비네이션 1",
          en: "Grand Combination 1",
          setupMoves: [{ type: "play", cardId: 66, targetCellId: 55 }, { type: "play", cardId: 102, targetCellId: 66 }, { type: "play", cardId: 29, targetCellId: 56 }, { type: "play", cardId: 71, targetCellId: 64 }, { type: "play", cardId: 8, targetCellId: 47 }, { type: "play", cardId: 26, targetCellId: 59 }, { type: "play", cardId: 51, targetCellId: 45 }, { type: "play", cardId: 38, targetCellId: 79 }, { type: "play", cardId: 5, targetCellId: 49 }, { type: "play", cardId: 16, targetCellId: 89 }, { type: "play", cardId: 93, targetCellId: 67 }, { type: "play", cardId: 61, targetCellId: 75 }, { type: "play", cardId: 80, targetCellId: 19 }, { type: "play", cardId: 48, targetCellId: 29 }, { type: "play", cardId: 63, targetCellId: 89 }, { type: "play", cardId: 99, targetCellId: 57 }, { type: "play", cardId: 27, targetCellId: 84 }, { type: "play", cardId: 77, targetCellId: 35 }, { type: "play", cardId: 58, targetCellId: 74 }, { type: "play", cardId: 94, targetCellId: 83 }, { type: "play", cardId: 13, targetCellId: 97 }, { type: "play", cardId: 10, targetCellId: 31 }, { type: "play", cardId: 103, targetCellId: 27 }, { type: "play", cardId: 64, targetCellId: 53 }, { type: "play", cardId: 39, targetCellId: 46 }, { type: "play", cardId: 62, targetCellId: 37 }, { type: "play", cardId: 24, targetCellId: 53 }, { type: "play", cardId: 68, targetCellId: 89 }, { type: "play", cardId: 60, targetCellId: 23 }, { type: "play", cardId: 56, targetCellId: 78 }, { type: "play", cardId: 17, targetCellId: 26 }, { type: "play", cardId: 32, targetCellId: 42 }, { type: "play", cardId: 98, targetCellId: 22 }, { type: "play", cardId: 33, targetCellId: 20 }, { type: "play", cardId: 97, targetCellId: 25 }, { type: "play", cardId: 47, targetCellId: 63 }, { type: "play", cardId: 82, targetCellId: 18 }, { type: "play", cardId: 75, targetCellId: 12 }, { type: "play", cardId: 3, targetCellId: 61 }, { type: "play", cardId: 78, targetCellId: 32 }, { type: "play", cardId: 11, targetCellId: 64 }, { type: "play", cardId: 79, targetCellId: 41 }, { type: "play", cardId: 7, targetCellId: 82 }, { type: "play", cardId: 89, targetCellId: 69 }, { type: "play", cardId: 14, targetCellId: 91 }, { type: "play", cardId: 46, targetCellId: 60 }, { type: "play", cardId: 43, targetCellId: 21 }, { type: "play", cardId: 42, targetCellId: 81 }, { type: "play", cardId: 52, targetCellId: 33 }, { type: "play", cardId: 65, targetCellId: 5 }, { type: "play", cardId: 100, targetCellId: 3 }, { type: "play", cardId: 88, targetCellId: 11 }, { type: "play", cardId: 12, targetCellId: 53 }, { type: "play", cardId: 31, targetCellId: 44 }, { type: "play", cardId: 92, targetCellId: 51 }, { type: "play", cardId: 36, targetCellId: 80 }, { type: "play", cardId: 19, targetCellId: 64 }, { type: "play", cardId: 76, targetCellId: 23 }, { type: "play", cardId: 2, targetCellId: 94 }, { type: "play", cardId: 83, targetCellId: 68 }, { type: "play", cardId: 6, targetCellId: 50 }, { type: "play", cardId: 23, targetCellId: 76 }],
        },
        {
          id: "gc-2",
          seed: "grand-6006",
          difficulty: "grandmaster",
          par: 5,
          ko: "그랜드 콤비네이션 2",
          en: "Grand Combination 2",
          setupMoves: [{ type: "play", cardId: 22, targetCellId: 33 }, { type: "play", cardId: 50, targetCellId: 44 }, { type: "play", cardId: 61, targetCellId: 31 }, { type: "play", cardId: 72, targetCellId: 64 }, { type: "play", cardId: 23, targetCellId: 63 }, { type: "play", cardId: 81, targetCellId: 75 }, { type: "play", cardId: 52, targetCellId: 36 }, { type: "play", cardId: 82, targetCellId: 76 }, { type: "play", cardId: 21, targetCellId: 45 }, { type: "play", cardId: 97, targetCellId: 18 }, { type: "play", cardId: 65, targetCellId: 73 }, { type: "play", cardId: 27, targetCellId: 72 }, { type: "play", cardId: 62, targetCellId: 77 }, { type: "play", cardId: 99, targetCellId: 32 }, { type: "play", cardId: 48, targetCellId: 21 }, { type: "play", cardId: 2, targetCellId: 42 }, { type: "play", cardId: 45, targetCellId: 11 }, { type: "play", cardId: 70, targetCellId: 55 }, { type: "play", cardId: 95, targetCellId: 61 }, { type: "play", cardId: 90, targetCellId: 74 }, { type: "play", cardId: 98, targetCellId: 94 }, { type: "play", cardId: 6, targetCellId: 92 }, { type: "play", cardId: 71, targetCellId: 54 }, { type: "play", cardId: 11, targetCellId: 63 }, { type: "play", cardId: 12, targetCellId: 12 }, { type: "play", cardId: 7, targetCellId: 97 }, { type: "play", cardId: 42, targetCellId: 86 }, { type: "play", cardId: 36, targetCellId: 47 }, { type: "play", cardId: 16, targetCellId: 16 }, { type: "play", cardId: 51, targetCellId: 53 }, { type: "play", cardId: 94, targetCellId: 15 }, { type: "play", cardId: 77, targetCellId: 17 }, { type: "play", cardId: 43, targetCellId: 34 }, { type: "play", cardId: 69, targetCellId: 48 }, { type: "play", cardId: 29, targetCellId: 58 }, { type: "play", cardId: 20, targetCellId: 38 }, { type: "play", cardId: 75, targetCellId: 63 }, { type: "play", cardId: 49, targetCellId: 49 }, { type: "play", cardId: 73, targetCellId: 78 }, { type: "play", cardId: 8, targetCellId: 66 }, { type: "play", cardId: 100, targetCellId: 5 }, { type: "play", cardId: 58, targetCellId: 89 }, { type: "play", cardId: 91, targetCellId: 1 }, { type: "play", cardId: 63, targetCellId: 45 }, { type: "play", cardId: 24, targetCellId: 48 }, { type: "play", cardId: 18, targetCellId: 98 }, { type: "play", cardId: 57, targetCellId: 62 }, { type: "play", cardId: 64, targetCellId: 4 }, { type: "play", cardId: 17, targetCellId: 48 }, { type: "play", cardId: 39, targetCellId: 84 }],
        },
        {
          id: "gc-3",
          seed: "grand-6007",
          difficulty: "grandmaster",
          par: 5,
          ko: "그랜드 콤비네이션 3",
          en: "Grand Combination 3",
          setupMoves: [{ type: "play", cardId: 3, targetCellId: 36 }, { type: "play", cardId: 92, targetCellId: 45 }, { type: "play", cardId: 89, targetCellId: 25 }, { type: "play", cardId: 96, targetCellId: 35 }, { type: "play", cardId: 43, targetCellId: 3 }, { type: "play", cardId: 41, targetCellId: 2 }, { type: "play", cardId: 71, targetCellId: 69 }, { type: "play", cardId: 66, targetCellId: 33 }, { type: "play", cardId: 70, targetCellId: 5 }, { type: "play", cardId: 38, targetCellId: 8 }, { type: "play", cardId: 8, targetCellId: 4 }, { type: "play", cardId: 17, targetCellId: 72 }, { type: "play", cardId: 42, targetCellId: 24 }, { type: "play", cardId: 34, targetCellId: 31 }, { type: "play", cardId: 36, targetCellId: 22 }, { type: "play", cardId: 98, targetCellId: 27 }, { type: "play", cardId: 58, targetCellId: 21 }, { type: "play", cardId: 39, targetCellId: 7 }, { type: "play", cardId: 12, targetCellId: 12 }, { type: "play", cardId: 72, targetCellId: 23 }, { type: "play", cardId: 15, targetCellId: 15 }, { type: "play", cardId: 29, targetCellId: 64 }, { type: "play", cardId: 48, targetCellId: 75 }, { type: "play", cardId: 6, targetCellId: 53 }, { type: "play", cardId: 14, targetCellId: 32 }, { type: "play", cardId: 102, targetCellId: 47 }, { type: "play", cardId: 61, targetCellId: 74 }, { type: "play", cardId: 90, targetCellId: 28 }, { type: "play", cardId: 62, targetCellId: 67 }, { type: "play", cardId: 78, targetCellId: 55 }, { type: "play", cardId: 64, targetCellId: 11 }, { type: "play", cardId: 10, targetCellId: 82 }, { type: "play", cardId: 30, targetCellId: 68 }, { type: "play", cardId: 44, targetCellId: 77 }, { type: "play", cardId: 13, targetCellId: 17 }, { type: "play", cardId: 18, targetCellId: 81 }, { type: "play", cardId: 91, targetCellId: 89 }, { type: "play", cardId: 2, targetCellId: 65 }, { type: "play", cardId: 47, targetCellId: 29 }, { type: "play", cardId: 35, targetCellId: 92 }, { type: "play", cardId: 11, targetCellId: 55 }, { type: "play", cardId: 16, targetCellId: 54 }, { type: "play", cardId: 85, targetCellId: 76 }, { type: "play", cardId: 67, targetCellId: 73 }, { type: "play", cardId: 95, targetCellId: 43 }, { type: "play", cardId: 46, targetCellId: 40 }, { type: "play", cardId: 45, targetCellId: 83 }, { type: "play", cardId: 104, targetCellId: 48 }, { type: "play", cardId: 87, targetCellId: 39 }, { type: "play", cardId: 40, targetCellId: 20 }, { type: "play", cardId: 56, targetCellId: 46 }, { type: "play", cardId: 60, targetCellId: 60 }, { type: "play", cardId: 32, targetCellId: 42 }, { type: "play", cardId: 5, targetCellId: 51 }, { type: "play", cardId: 53, targetCellId: 62 }, { type: "play", cardId: 7, targetCellId: 79 }, { type: "play", cardId: 28, targetCellId: 30 }, { type: "play", cardId: 79, targetCellId: 34 }, { type: "play", cardId: 101, targetCellId: 86 }, { type: "play", cardId: 25, targetCellId: 52 }, { type: "play", cardId: 24, targetCellId: 52 }, { type: "play", cardId: 80, targetCellId: 88 }, { type: "play", cardId: 88, targetCellId: 96 }, { type: "play", cardId: 84, targetCellId: 26 }, { type: "play", cardId: 50, targetCellId: 49 }, { type: "play", cardId: 99, targetCellId: 87 }, { type: "play", cardId: 4, targetCellId: 56 }, { type: "play", cardId: 65, targetCellId: 91 }, { type: "play", cardId: 22, targetCellId: 13 }, { type: "play", cardId: 86, targetCellId: 10 }, { type: "play", cardId: 68, targetCellId: 85 }, { type: "play", cardId: 27, targetCellId: 95 }, { type: "play", cardId: 94, targetCellId: 70 }, { type: "play", cardId: 63, targetCellId: 76 }, { type: "play", cardId: 52, targetCellId: 38 }, { type: "play", cardId: 77, targetCellId: 52 }, { type: "play", cardId: 76, targetCellId: 54 }, { type: "play", cardId: 97, targetCellId: 50 }],
        },
        {
          id: "gc-4",
          seed: "grand-6008",
          difficulty: "grandmaster",
          par: 5,
          ko: "그랜드 콤비네이션 4",
          en: "Grand Combination 4",
          setupMoves: [{ type: "play", cardId: 91, targetCellId: 49 }, { type: "play", cardId: 47, targetCellId: 36 }, { type: "play", cardId: 61, targetCellId: 26 }, { type: "play", cardId: 7, targetCellId: 46 }, { type: "play", cardId: 8, targetCellId: 6 }, { type: "play", cardId: 12, targetCellId: 79 }, { type: "play", cardId: 21, targetCellId: 29 }, { type: "play", cardId: 11, targetCellId: 49 }, { type: "play", cardId: 80, targetCellId: 24 }, { type: "play", cardId: 32, targetCellId: 23 }, { type: "play", cardId: 104, targetCellId: 15 }, { type: "play", cardId: 101, targetCellId: 43 }, { type: "play", cardId: 66, targetCellId: 48 }, { type: "play", cardId: 51, targetCellId: 3 }, { type: "play", cardId: 30, targetCellId: 14 }, { type: "play", cardId: 85, targetCellId: 27 }, { type: "play", cardId: 38, targetCellId: 34 }, { type: "play", cardId: 77, targetCellId: 16 }, { type: "play", cardId: 1, targetCellId: 38 }, { type: "play", cardId: 63, targetCellId: 24 }, { type: "play", cardId: 72, targetCellId: 65 }, { type: "play", cardId: 57, targetCellId: 42 }, { type: "play", cardId: 78, targetCellId: 41 }, { type: "play", cardId: 86, targetCellId: 57 }, { type: "play", cardId: 68, targetCellId: 37 }, { type: "play", cardId: 44, targetCellId: 68 }, { type: "play", cardId: 90, targetCellId: 55 }, { type: "play", cardId: 33, targetCellId: 12 }, { type: "play", cardId: 24, targetCellId: 46 }, { type: "play", cardId: 45, targetCellId: 8 }, { type: "play", cardId: 76, targetCellId: 23 }, { type: "play", cardId: 60, targetCellId: 62 }, { type: "play", cardId: 46, targetCellId: 35 }, { type: "play", cardId: 36, targetCellId: 64 }, { type: "play", cardId: 23, targetCellId: 95 }, { type: "play", cardId: 26, targetCellId: 20 }, { type: "play", cardId: 22, targetCellId: 25 }, { type: "play", cardId: 16, targetCellId: 18 }, { type: "play", cardId: 49, targetCellId: 53 }, { type: "play", cardId: 2, targetCellId: 30 }, { type: "play", cardId: 50, targetCellId: 45 }, { type: "play", cardId: 99, targetCellId: 50 }, { type: "play", cardId: 93, targetCellId: 96 }, { type: "play", cardId: 10, targetCellId: 94 }, { type: "play", cardId: 31, targetCellId: 77 }, { type: "play", cardId: 75, targetCellId: 22 }, { type: "play", cardId: 5, targetCellId: 39 }, { type: "play", cardId: 27, targetCellId: 75 }],
        },
        {
          id: "gc-5",
          seed: "grand-6009",
          difficulty: "grandmaster",
          par: 5,
          ko: "그랜드 콤비네이션 5",
          en: "Grand Combination 5",
          setupMoves: [{ type: "play", cardId: 5, targetCellId: 66 }, { type: "play", cardId: 36, targetCellId: 50 }, { type: "play", cardId: 35, targetCellId: 77 }, { type: "play", cardId: 20, targetCellId: 81 }, { type: "play", cardId: 14, targetCellId: 56 }, { type: "play", cardId: 61, targetCellId: 84 }, { type: "play", cardId: 19, targetCellId: 86 }, { type: "play", cardId: 95, targetCellId: 85 }, { type: "play", cardId: 78, targetCellId: 67 }, { type: "play", cardId: 12, targetCellId: 34 }, { type: "play", cardId: 23, targetCellId: 82 }, { type: "play", cardId: 75, targetCellId: 95 }, { type: "play", cardId: 73, targetCellId: 65 }, { type: "play", cardId: 90, targetCellId: 47 }, { type: "play", cardId: 48, targetCellId: 74 }, { type: "play", cardId: 37, targetCellId: 76 }, { type: "play", cardId: 28, targetCellId: 78 }, { type: "play", cardId: 53, targetCellId: 64 }, { type: "play", cardId: 10, targetCellId: 97 }, { type: "play", cardId: 44, targetCellId: 87 }, { type: "play", cardId: 104, targetCellId: 53 }, { type: "play", cardId: 98, targetCellId: 43 }, { type: "play", cardId: 25, targetCellId: 45 }, { type: "play", cardId: 41, targetCellId: 40 }, { type: "play", cardId: 33, targetCellId: 33 }, { type: "play", cardId: 54, targetCellId: 93 }, { type: "play", cardId: 47, targetCellId: 94 }, { type: "play", cardId: 60, targetCellId: 60 }, { type: "play", cardId: 102, targetCellId: 55 }, { type: "play", cardId: 9, targetCellId: 58 }, { type: "play", cardId: 97, targetCellId: 22 }, { type: "play", cardId: 79, targetCellId: 63 }, { type: "play", cardId: 52, targetCellId: 80 }, { type: "play", cardId: 58, targetCellId: 30 }, { type: "play", cardId: 50, targetCellId: 54 }, { type: "play", cardId: 49, targetCellId: 25 }, { type: "play", cardId: 100, targetCellId: 10 }, { type: "play", cardId: 11, targetCellId: 55 }, { type: "play", cardId: 88, targetCellId: 69 }, { type: "play", cardId: 55, targetCellId: 35 }, { type: "play", cardId: 92, targetCellId: 20 }, { type: "play", cardId: 69, targetCellId: 52 }, { type: "play", cardId: 18, targetCellId: 7 }, { type: "play", cardId: 91, targetCellId: 16 }, { type: "play", cardId: 38, targetCellId: 89 }, { type: "play", cardId: 66, targetCellId: 68 }, { type: "play", cardId: 7, targetCellId: 24 }, { type: "play", cardId: 103, targetCellId: 55 }, { type: "play", cardId: 39, targetCellId: 79 }, { type: "play", cardId: 80, targetCellId: 21 }, { type: "play", cardId: 15, targetCellId: 39 }, { type: "play", cardId: 64, targetCellId: 31 }, { type: "play", cardId: 31, targetCellId: 44 }, { type: "play", cardId: 82, targetCellId: 92 }, { type: "play", cardId: 56, targetCellId: 19 }, { type: "play", cardId: 99, targetCellId: 13 }],
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

// --- PUZZLE RUSH ------------------------------------------------------------------------

// PUZZLE RUSH is the fourth seeded solo mode alongside GAUNTLET/SURVIVAL/TIME-ATTACK. A run is a
// seeded ORDERED sequence of puzzle ids drawn deterministically from the shipped catalog; the
// player solves them back-to-back and the run accumulates the stars scored on each. Like the other
// modes it is a plain serializable object (localStorage-friendly) and fully reproducible from its
// seed (createSeededRng picks the same puzzle order every time). It NEVER grants gameplay-affecting
// unlocks — the earned medal is a cosmetic milestone that feeds progression at the UI layer.

// Default number of puzzles in a rush run. Kept small so a run is a tight sprint, not a marathon.
export const PUZZLE_RUSH_LENGTH = 5;

// Medal thresholds by TOTAL stars accumulated across the run (documented + tested at boundaries).
// Max stars = 3 * length. A run always finishes (each puzzle is attempted); the medal reflects how
// cleanly the player solved the sequence.
//   gold   — >= 90% of the maximum stars
//   silver — >= 70%
//   bronze — >= 50%
//   none   — below half of the maximum
export const PUZZLE_RUSH_MEDAL_RATIOS = { gold: 0.9, silver: 0.7, bronze: 0.5 };

// Deterministically pick an ordered, non-repeating sequence of puzzle ids from the catalog for a
// given seed. Uses a seeded Fisher–Yates over the flattened puzzle list so a seed reproduces the
// exact order; falls back gracefully when the catalog is smaller than the requested length.
function pickRushPuzzleIds(seed, length) {
  const rng = createSeededRng(`rush:${String(seed ?? "")}`);
  const pool = ALL_PUZZLES.map((puzzle) => puzzle.id);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const wanted = Math.max(1, Math.min(Math.trunc(Number(length) || PUZZLE_RUSH_LENGTH), pool.length));
  return pool.slice(0, wanted);
}

// Build a seeded puzzle-rush run. Pure; a given seed reproduces the exact puzzle order. Returns a
// serializable run-state object mirroring the gauntlet/survival shape.
export function buildPuzzleRush(seed, { length = PUZZLE_RUSH_LENGTH } = {}) {
  const puzzleIds = pickRushPuzzleIds(seed, length);
  return {
    seed: String(seed ?? ""),
    puzzleIds,
    index: 0,
    stars: 0,
    solved: 0,
    finished: false,
  };
}

function normalizePuzzleRush(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.puzzleIds) || state.puzzleIds.length === 0) {
    return buildPuzzleRush("");
  }
  const clamp = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  const puzzleIds = state.puzzleIds.map((id) => String(id));
  return {
    seed: String(state.seed ?? ""),
    puzzleIds,
    index: Math.min(clamp(state.index), puzzleIds.length),
    stars: clamp(state.stars),
    solved: Math.min(clamp(state.solved), puzzleIds.length),
    finished: state.finished === true,
  };
}

// The puzzle id the current rush stage should launch (or null once the run is finished).
export function currentRushPuzzle(state) {
  const base = normalizePuzzleRush(state);
  if (base.finished || base.index >= base.puzzleIds.length) return null;
  return base.puzzleIds[base.index];
}

// Pure puzzle-rush transition: record one puzzle's star result (0-3) and advance. Unlike the
// gauntlet, a rush NEVER ends early on a poor result — every puzzle in the sequence is attempted;
// the run finishes when the last puzzle is recorded. Never mutates its input.
export function advancePuzzleRush(state, { stars = 0, won = false } = {}) {
  const base = normalizePuzzleRush(state);
  if (base.finished) return base;
  const gained = Math.max(0, Math.min(3, Math.trunc(Number(stars) || 0)));
  const index = base.index + 1;
  const finished = index >= base.puzzleIds.length;
  return {
    ...base,
    index: finished ? base.puzzleIds.length : index,
    stars: base.stars + gained,
    solved: base.solved + (won || gained > 0 ? 1 : 0),
    finished,
  };
}

// Pure puzzle-rush scoring: map a run's accumulated stars to a medal tier by ratio of the maximum
// possible stars. Returns { stars, maxStars, medal }. A run must be finished to earn a medal.
export function scorePuzzleRush(state) {
  const base = normalizePuzzleRush(state);
  const maxStars = base.puzzleIds.length * 3;
  let medal = "none";
  if (base.finished && maxStars > 0) {
    const ratio = base.stars / maxStars;
    if (ratio >= PUZZLE_RUSH_MEDAL_RATIOS.gold) medal = "gold";
    else if (ratio >= PUZZLE_RUSH_MEDAL_RATIOS.silver) medal = "silver";
    else if (ratio >= PUZZLE_RUSH_MEDAL_RATIOS.bronze) medal = "bronze";
    else medal = "none";
  }
  return { stars: base.stars, maxStars, medal };
}

// --- CAMPAIGN ---------------------------------------------------------------------------

// The CAMPAIGN meta sequences the puzzle packs into ordered CHAPTERS. It is a pure structure with
// PROGRESS-based unlock: chapter 0 is always unlocked; chapter N+1 unlocks only once chapter N is
// CLEARED (every puzzle in it solved for at least 1 star). Unlock is NEVER time- or payment-gated —
// purely a function of the player's puzzleProgress map, so the whole thing is free-tier + offline.
// Completion feeds progression at the UI layer (achievements for clearing a chapter / the campaign).

// Chapter order = pack order in PUZZLE_PACKS. Each chapter carries its pack id + the ordered puzzle
// ids it contains, so campaign progress is computed purely from a puzzleProgress map.
export const CAMPAIGN_CHAPTERS = PUZZLE_PACKS.map((pack, order) => ({
  order,
  packId: pack.id,
  ko: pack.ko,
  en: pack.en,
  puzzleIds: pack.puzzles.map((puzzle) => puzzle.id),
}));

// Normalize an arbitrary puzzleProgress map to { [puzzleId]: stars(0-3) }. Tolerant of the client
// shape { [id]: { stars } } as well as a bare { [id]: stars } map. Pure.
function normalizePuzzleProgress(puzzleProgress) {
  const out = {};
  if (!puzzleProgress || typeof puzzleProgress !== "object") return out;
  for (const [id, value] of Object.entries(puzzleProgress)) {
    let stars = 0;
    if (typeof value === "number") stars = value;
    else if (value && typeof value === "object") stars = Number(value.stars) || 0;
    out[String(id)] = Math.max(0, Math.min(3, Math.trunc(stars)));
  }
  return out;
}

// True when every puzzle in the chapter has been solved for at least 1 star. Pure.
export function isChapterCleared(chapter, puzzleProgress) {
  if (!chapter || !Array.isArray(chapter.puzzleIds) || chapter.puzzleIds.length === 0) return false;
  const stars = normalizePuzzleProgress(puzzleProgress);
  return chapter.puzzleIds.every((id) => (stars[id] || 0) >= 1);
}

// True when the chapter at `order` is unlocked: chapter 0 is always open; a later chapter is open
// only once the PREVIOUS chapter is cleared. Progress-based, never paid. Pure.
export function isChapterUnlocked(order, puzzleProgress) {
  const index = Math.trunc(Number(order) || 0);
  if (index <= 0) return true;
  const prev = CAMPAIGN_CHAPTERS[index - 1];
  if (!prev) return false;
  return isChapterCleared(prev, puzzleProgress);
}

// Aggregate campaign progress from a puzzleProgress map. Returns a serializable summary with a
// per-chapter breakdown (unlocked / cleared / stars / maxStars) plus campaign totals and a
// completion flag. Pure — the single source of truth the UI + achievements read.
export function computeCampaignProgress(puzzleProgress) {
  const stars = normalizePuzzleProgress(puzzleProgress);
  let totalStars = 0;
  let totalMax = 0;
  let clearedChapters = 0;
  const chapters = CAMPAIGN_CHAPTERS.map((chapter) => {
    const chapterStars = chapter.puzzleIds.reduce((sum, id) => sum + (stars[id] || 0), 0);
    const chapterMax = chapter.puzzleIds.length * 3;
    const cleared = chapter.puzzleIds.every((id) => (stars[id] || 0) >= 1);
    const unlocked = isChapterUnlocked(chapter.order, puzzleProgress);
    totalStars += chapterStars;
    totalMax += chapterMax;
    if (cleared) clearedChapters += 1;
    return {
      order: chapter.order,
      packId: chapter.packId,
      ko: chapter.ko,
      en: chapter.en,
      puzzleIds: chapter.puzzleIds.slice(),
      unlocked,
      cleared,
      stars: chapterStars,
      maxStars: chapterMax,
    };
  });
  return {
    chapters,
    clearedChapters,
    totalChapters: CAMPAIGN_CHAPTERS.length,
    stars: totalStars,
    maxStars: totalMax,
    completed: clearedChapters === CAMPAIGN_CHAPTERS.length && CAMPAIGN_CHAPTERS.length > 0,
  };
}

// The next chapter the player should tackle: the lowest-order UNLOCKED chapter that is not yet
// cleared, or null when the whole campaign is complete. Pure.
export function nextCampaignChapter(puzzleProgress) {
  const progress = computeCampaignProgress(puzzleProgress);
  for (const chapter of progress.chapters) {
    if (chapter.unlocked && !chapter.cleared) return chapter;
  }
  return null;
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

export function formatPuzzleRushShareText({ stars = 0, maxStars = 0, medal = "none", url = "" } = {}) {
  const medalKo = { gold: "금메달", silver: "은메달", bronze: "동메달", none: "완주" }[medal] || "완주";
  const lines = [`Sequence Arena 퍼즐 러시 · ${medalKo} · ★${Math.max(0, Math.trunc(stars))}/${Math.max(0, Math.trunc(maxStars))}`];
  if (url) lines.push(url);
  return lines.join("\n");
}

export function formatCampaignShareText({ clearedChapters = 0, totalChapters = 0, stars = 0, maxStars = 0, url = "" } = {}) {
  const lines = [
    `Sequence Arena 캠페인 · ${Math.max(0, Math.trunc(clearedChapters))}/${Math.max(0, Math.trunc(totalChapters))} 챕터`,
    `★ ${Math.max(0, Math.trunc(stars))}/${Math.max(0, Math.trunc(maxStars))}`,
  ];
  if (url) lines.push(url);
  return lines.join("\n");
}

export { GAUNTLET_TIERS };
