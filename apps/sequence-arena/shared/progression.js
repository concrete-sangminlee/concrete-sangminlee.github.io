// Progression spine: a pure, offline, deterministic client-side progression system shared by
// the browser UI and the node test suite. Mirrors the side-effect-free style of shared/daily.js
// — no DOM, no storage, no clock reads except an injected `now` — so the "same inputs → same
// progression" contract can be pinned byte-exactly in scripts/progression-test.mjs.
//
// FREE-TIER POSTURE (surfaced in-UI and in QUALITY_ROADMAP.md): a true networked ELO ladder
// needs an always-on server + DB, which this free GitHub Pages PWA deliberately does not run.
// Instead we compute a PERSONAL, offline skill rating from the player's own results against the
// known-strength bot tiers. Each tier has a fixed nominal anchor rating; the player's rating
// updates with the standard Elo expected-score formula against that anchor, so beating a stronger
// bot raises rating more. Rating/XP/levels/achievements/cosmetics are all client-side localStorage
// state with NO server dependency and NO global leaderboard. Cosmetics are VISUAL-ONLY: they never
// affect gameplay, scoring, or fairness.

import { BOT_DIFFICULTIES, normalizeBotDifficulty } from "./bot-ai.js";

// Fixed nominal anchor rating per bot tier, strictly increasing with strength. These are the
// "opponent ratings" the personal Elo update runs against. Values chosen to span a familiar
// club-to-expert band (see design spec): EASY 800 < SMART 1200 < AGGRESSIVE 1300 < MASTER 1600 <
// GRANDMASTER 1900. The GRANDMASTER anchor is the strongest because Phase 1 proved that tier
// measurably beats MASTER.
export const TIER_RATINGS = {
  [BOT_DIFFICULTIES.easy]: 800,
  [BOT_DIFFICULTIES.smart]: 1200,
  [BOT_DIFFICULTIES.aggressive]: 1300,
  [BOT_DIFFICULTIES.master]: 1600,
  [BOT_DIFFICULTIES.grandmaster]: 1900,
  // LEGEND is the strongest anchor because Axis A proved that tier measurably beats
  // GRANDMASTER (same-seed head-to-head margin, scripts/board-fairness-test.mjs). Beating
  // LEGEND therefore raises the personal rating the most.
  [BOT_DIFFICULTIES.legend]: 2200,
};

// Standard Elo K-factor. A single match can move the rating at most K points (a full unexpected
// result). Kept modest so a personal rating settles rather than swinging wildly game to game.
const K_FACTOR = 32;
const RATING_FLOOR = 100;
const RATING_CEIL = 4000;

// XP curve. Documented and REVERSIBLE: the cumulative XP required to be AT a given level follows a
// quadratic curve. Level 1 needs 0 XP (the starting level). For level L >= 1:
//   xpForLevel(L) = XP_BASE * (L - 1) * L / 2   (a smooth, strictly increasing quadratic)
// so each level costs XP_BASE * (L-1) more than the previous — a gentle ramp. levelForXp is its
// exact integer inverse (largest L whose threshold does not exceed xp). Because thresholds are
// strictly increasing integers, xpForLevel(levelForXp(x)) <= x < xpForLevel(levelForXp(x)+1).
const XP_BASE = 100;

export function xpForLevel(level) {
  const clean = Math.max(1, Math.trunc(Number(level) || 1));
  return Math.trunc((XP_BASE * (clean - 1) * clean) / 2);
}

export function levelForXp(xp) {
  const clean = Math.max(0, Math.trunc(Number(xp) || 0));
  // Thresholds grow quadratically, so a bounded linear scan from level 1 is exact and cheap for
  // any realistic XP total; step up while the NEXT level's threshold is still affordable.
  let level = 1;
  while (xpForLevel(level + 1) <= clean) {
    level += 1;
  }
  return level;
}

// XP award model (documented so the curve is reproducible): every completed match grants a base
// amount for playing, a win bonus, a difficulty multiplier (harder tiers pay more), and a small
// mode multiplier (daily/puzzle count slightly more than plain solo). All integer.
const XP_PLAY_BASE = 20;
const XP_WIN_BONUS = 40;
const XP_DIFFICULTY_MULTIPLIER = {
  [BOT_DIFFICULTIES.easy]: 0.75,
  [BOT_DIFFICULTIES.smart]: 1,
  [BOT_DIFFICULTIES.aggressive]: 1.15,
  [BOT_DIFFICULTIES.master]: 1.5,
  [BOT_DIFFICULTIES.grandmaster]: 2,
  [BOT_DIFFICULTIES.legend]: 2.5,
};
const XP_MODE_MULTIPLIER = {
  solo: 1,
  daily: 1.25,
  puzzle: 1.25,
  gauntlet: 1.4,
};

function xpForMatch({ difficulty, won, mode }) {
  const tier = normalizeBotDifficulty(difficulty);
  const difficultyMultiplier = XP_DIFFICULTY_MULTIPLIER[tier] ?? 1;
  const modeMultiplier = XP_MODE_MULTIPLIER[mode] ?? 1;
  const raw = (XP_PLAY_BASE + (won ? XP_WIN_BONUS : 0)) * difficultyMultiplier * modeMultiplier;
  return Math.max(0, Math.round(raw));
}

// A "fast win" for the speed-win achievement family: a win finished within this many ms.
const SPEED_WIN_MS = 120_000;

// --- Elo math --------------------------------------------------------------------------

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function updateRating(rating, anchor, won, kFactor = K_FACTOR) {
  const current = Number.isFinite(rating) ? rating : TIER_RATINGS[BOT_DIFFICULTIES.smart];
  const expected = expectedScore(current, anchor);
  const actual = won ? 1 : 0;
  const next = current + kFactor * (actual - expected);
  return Math.max(RATING_FLOOR, Math.min(RATING_CEIL, Math.round(next)));
}

// --- Catalogs --------------------------------------------------------------------------
// Achievements are pure predicates over an evaluation context (see buildAchievementContext),
// so the catalog is DETERMINISTIC and unit-testable, and scripts/progression-test.mjs can audit
// that every achievement is REACHABLE. ko/en labels are duplicated in client/i18n.js at the UI
// layer (keyed by id) for the translation-parity test; the ko/en here keep the catalog
// self-describing and node-testable without a DOM.

export const ACHIEVEMENTS = [
  {
    id: "first-win",
    category: "milestone",
    ko: "첫 승리",
    en: "First Win",
    test: (ctx) => ctx.won && ctx.wins >= 1,
  },
  {
    id: "beat-easy",
    category: "tier",
    ko: "쉬움 봇 격파",
    en: "Beat EASY",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.easy,
  },
  {
    id: "beat-smart",
    category: "tier",
    ko: "전략 봇 격파",
    en: "Beat SMART",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.smart,
  },
  {
    id: "beat-aggressive",
    category: "tier",
    ko: "공격 봇 격파",
    en: "Beat AGGRESSIVE",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.aggressive,
  },
  {
    id: "beat-master",
    category: "tier",
    ko: "마스터 봇 격파",
    en: "Beat MASTER",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.master,
  },
  {
    id: "beat-grandmaster",
    category: "tier",
    ko: "그랜드마스터 격파",
    en: "Beat GRANDMASTER",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.grandmaster,
  },
  {
    id: "beat-legend",
    category: "tier",
    ko: "레전드 격파",
    en: "Beat LEGEND",
    test: (ctx) => ctx.won && ctx.difficulty === BOT_DIFFICULTIES.legend,
  },
  {
    id: "streak-3",
    category: "streak",
    ko: "3연승",
    en: "3-Win Streak",
    test: (ctx) => ctx.winStreak >= 3,
  },
  {
    id: "streak-5",
    category: "streak",
    ko: "5연승",
    en: "5-Win Streak",
    test: (ctx) => ctx.winStreak >= 5,
  },
  {
    id: "streak-10",
    category: "streak",
    ko: "10연승",
    en: "10-Win Streak",
    test: (ctx) => ctx.winStreak >= 10,
  },
  {
    id: "daily-streak-7",
    category: "daily",
    ko: "데일리 7일 연속",
    en: "7-Day Daily Streak",
    test: (ctx) => ctx.dailyStreak >= 7,
  },
  {
    id: "daily-streak-30",
    category: "daily",
    ko: "데일리 30일 연속",
    en: "30-Day Daily Streak",
    test: (ctx) => ctx.dailyStreak >= 30,
  },
  {
    id: "speed-win",
    category: "speed",
    ko: "속공 승리",
    en: "Speed Win",
    test: (ctx) => ctx.won && ctx.durationMs > 0 && ctx.durationMs <= SPEED_WIN_MS,
  },
  {
    id: "level-10",
    category: "level",
    ko: "레벨 10 달성",
    en: "Reach Level 10",
    test: (ctx) => ctx.level >= 10,
  },
  {
    id: "level-25",
    category: "level",
    ko: "레벨 25 달성",
    en: "Reach Level 25",
    test: (ctx) => ctx.level >= 25,
  },
  {
    id: "level-50",
    category: "level",
    ko: "레벨 50 달성",
    en: "Reach Level 50",
    test: (ctx) => ctx.level >= 50,
  },
  {
    id: "games-10",
    category: "volume",
    ko: "10판 플레이",
    en: "Play 10 Games",
    test: (ctx) => ctx.games >= 10,
  },
  {
    id: "games-100",
    category: "volume",
    ko: "100판 플레이",
    en: "Play 100 Games",
    test: (ctx) => ctx.games >= 100,
  },
  {
    id: "games-500",
    category: "volume",
    ko: "500판 플레이",
    en: "Play 500 Games",
    test: (ctx) => ctx.games >= 500,
  },
  {
    // Phase 3 hook: solo-modes.js will report a completed puzzle pack via ctx.puzzlePackCompleted.
    // Defined now so the catalog and its UI/i18n wiring exist before the content ships.
    id: "puzzle-pack-complete",
    category: "puzzle",
    ko: "퍼즐 팩 완료",
    en: "Complete a Puzzle Pack",
    test: (ctx) => ctx.puzzlePackCompleted === true,
  },
  {
    // Phase 3 (Axis B) content hooks. solo-modes.js reports campaign/rush milestones via the
    // corresponding ctx facts; each is proven REACHABLE by scripts/progression-test.mjs with a
    // constructed unlocking context. All are cosmetic milestones — free-tier, no gameplay unlocks.
    id: "campaign-chapter-clear",
    category: "puzzle",
    ko: "캠페인 챕터 클리어",
    en: "Clear a Campaign Chapter",
    test: (ctx) => ctx.campaignChapterCleared === true,
  },
  {
    id: "campaign-complete",
    category: "puzzle",
    ko: "캠페인 완주",
    en: "Complete the Campaign",
    test: (ctx) => ctx.campaignCompleted === true,
  },
  {
    id: "puzzle-rush-gold",
    category: "puzzle",
    ko: "퍼즐 러시 금메달",
    en: "Puzzle Rush Gold",
    test: (ctx) => ctx.puzzleRushMedal === "gold",
  },
];

// Cosmetics are VISUAL-ONLY (chip skins / board felt themes / player titles). A descriptor
// carries no gameplay field — the progression test audits this structurally. unlockRule is one of:
//   { type: "default" }                         always owned (each category needs one)
//   { type: "level", level: N }                 owned once the player reaches level N
//   { type: "achievement", achievementId: id }  owned once that achievement is unlocked
export const COSMETICS = [
  // Chip styles
  { id: "chip-classic", category: "chipStyle", ko: "클래식 칩", en: "Classic Chip", unlockRule: { type: "default" } },
  { id: "chip-ember", category: "chipStyle", ko: "잉걸 칩", en: "Ember Chip", unlockRule: { type: "level", level: 5 } },
  { id: "chip-frost", category: "chipStyle", ko: "서리 칩", en: "Frost Chip", unlockRule: { type: "level", level: 15 } },
  { id: "chip-gilded", category: "chipStyle", ko: "황금 칩", en: "Gilded Chip", unlockRule: { type: "achievement", achievementId: "beat-grandmaster" } },
  // Board themes
  { id: "board-felt", category: "boardTheme", ko: "펠트 보드", en: "Felt Board", unlockRule: { type: "default" } },
  { id: "board-midnight", category: "boardTheme", ko: "미드나이트 보드", en: "Midnight Board", unlockRule: { type: "level", level: 10 } },
  { id: "board-aurora", category: "boardTheme", ko: "오로라 보드", en: "Aurora Board", unlockRule: { type: "achievement", achievementId: "daily-streak-7" } },
  // Titles
  { id: "title-rookie", category: "title", ko: "새내기", en: "Rookie", unlockRule: { type: "default" } },
  { id: "title-tactician", category: "title", ko: "전략가", en: "Tactician", unlockRule: { type: "level", level: 20 } },
  { id: "title-grandmaster-slayer", category: "title", ko: "그랜드마스터 슬레이어", en: "Grandmaster Slayer", unlockRule: { type: "achievement", achievementId: "beat-grandmaster" } },
];

const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

// --- Rank titles -----------------------------------------------------------------------
// A rank title is a PURE, deterministic band over the personal rating, single-sourced here so the
// home meta-card and any share text agree. Bands align with the tier anchors in TIER_RATINGS so a
// player's rank reads as "how strong an opponent I can beat": Bronze (< SMART anchor), Silver (<
// AGGRESSIVE), Gold (< MASTER), Platinum (< GRANDMASTER), Diamond (>= GRANDMASTER anchor). Bands are
// listed low→high with an inclusive `min`; the highest band whose min the rating meets wins. ko/en
// labels live here (self-describing + node-testable) and are duplicated in client/i18n.js keyed by
// id for the translation-parity test, exactly like the achievement/cosmetic catalogs. VISUAL/LABEL
// ONLY: a rank title never affects gameplay, scoring, or fairness.
export const RANK_TITLES = [
  { id: "bronze", min: 0, ko: "브론즈", en: "Bronze" },
  { id: "silver", min: TIER_RATINGS[BOT_DIFFICULTIES.smart], ko: "실버", en: "Silver" },
  { id: "gold", min: TIER_RATINGS[BOT_DIFFICULTIES.aggressive], ko: "골드", en: "Gold" },
  { id: "platinum", min: TIER_RATINGS[BOT_DIFFICULTIES.master], ko: "플래티넘", en: "Platinum" },
  { id: "diamond", min: TIER_RATINGS[BOT_DIFFICULTIES.grandmaster], ko: "다이아몬드", en: "Diamond" },
];

// The rank title for a rating: the highest band whose inclusive `min` the rating meets. Pure +
// deterministic. Defensive: a non-finite rating clamps to the lowest band so the UI never breaks.
export function rankTitleForRating(rating) {
  const value = Number.isFinite(Number(rating)) ? Number(rating) : 0;
  let match = RANK_TITLES[0];
  for (const band of RANK_TITLES) {
    if (value >= band.min) {
      match = band;
    }
  }
  return { id: match.id, ko: match.ko, en: match.en, min: match.min };
}

// --- Normalization ---------------------------------------------------------------------

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

// Sanitize a stored progression blob to a canonical shape. Rejects/clamps malformed input with
// the same defensive posture as normalizeDailyResults/normalizeSoloStats. The level is ALWAYS
// derived from xp so the two can never drift out of sync. achievements/unlocks are id→value maps
// bounded by the finite catalogs (bogus ids are dropped). Pure: returns a fresh object.
export function normalizeProgression(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rating = Number.isFinite(Number(source.rating))
    ? Math.max(RATING_FLOOR, Math.min(RATING_CEIL, Math.round(Number(source.rating))))
    : TIER_RATINGS[BOT_DIFFICULTIES.smart];
  const xp = toCount(source.xp);

  const achievements = {};
  if (source.achievements && typeof source.achievements === "object" && !Array.isArray(source.achievements)) {
    for (const [id, when] of Object.entries(source.achievements)) {
      if (!ACHIEVEMENT_IDS.has(id)) continue;
      achievements[id] = typeof when === "string" ? when.slice(0, 40) : "";
    }
  }

  const unlocks = {};
  if (source.unlocks && typeof source.unlocks === "object" && !Array.isArray(source.unlocks)) {
    for (const [id, value] of Object.entries(source.unlocks)) {
      if (COSMETIC_BY_ID.has(id) && value) {
        unlocks[id] = true;
      }
    }
  }

  const streakSource = source.streak && typeof source.streak === "object" && !Array.isArray(source.streak) ? source.streak : {};
  const streak = { current: toCount(streakSource.current), best: toCount(streakSource.best) };

  const cosmetic = normalizeCosmeticSelection(source.cosmetic, unlocks, xp);

  return {
    rating,
    xp,
    level: levelForXp(xp),
    games: toCount(source.games),
    wins: toCount(source.wins),
    achievements,
    unlocks,
    seenAchievements: normalizeSeen(source.seenAchievements),
    streak,
    cosmetic,
  };
}

function normalizeSeen(raw) {
  const seen = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, value] of Object.entries(raw)) {
      if (ACHIEVEMENT_IDS.has(id) && value) {
        seen[id] = true;
      }
    }
  }
  return seen;
}

// A cosmetic selection is valid only if it names a real cosmetic of the right category that the
// player actually OWNS (default, or unlocked by level/achievement given the current state). Any
// bogus/unowned pick falls back to that category's default. Visual-only: this never touches
// gameplay state.
function normalizeCosmeticSelection(raw, unlocks, xp) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const level = levelForXp(xp);
  const selection = {};
  for (const category of ["chipStyle", "boardTheme", "title"]) {
    const candidateId = source[category];
    const candidate = typeof candidateId === "string" ? COSMETIC_BY_ID.get(candidateId) : null;
    const owned = candidate && candidate.category === category && isCosmeticOwned(candidate, unlocks, level);
    selection[category] = owned ? candidate.id : defaultCosmeticId(category);
  }
  return selection;
}

function defaultCosmeticId(category) {
  const found = COSMETICS.find((c) => c.category === category && c.unlockRule.type === "default");
  return found ? found.id : "";
}

// Is a cosmetic owned given the current unlock map + level? Default cosmetics are always owned;
// level cosmetics unlock at their level; achievement cosmetics unlock via the achievements map,
// which is what stamps the matching entry into `unlocks`.
function isCosmeticOwned(cosmetic, unlocks, level) {
  const rule = cosmetic.unlockRule;
  if (rule.type === "default") return true;
  if (rule.type === "level") return level >= rule.level;
  if (rule.type === "achievement") return Boolean(unlocks[cosmetic.id]);
  return false;
}

// --- Achievement evaluation ------------------------------------------------------------

// Build the pure evaluation context an achievement predicate sees. It combines this match's facts
// with the (already-updated) progression counters and any aggregate signals the caller supplies
// (win streak, daily streak, puzzle-pack completion). Kept separate so the test can construct a
// context directly and the client can feed real aggregates.
export function buildAchievementContext(progression, facts = {}) {
  const normalized = normalizeProgression(progression);
  const difficulty = normalizeBotDifficulty(facts.difficulty);
  return {
    progression: normalized,
    difficulty,
    won: Boolean(facts.won),
    mode: typeof facts.mode === "string" ? facts.mode : "solo",
    durationMs: Number.isFinite(Number(facts.durationMs)) ? Math.max(0, Math.trunc(Number(facts.durationMs))) : 0,
    level: normalized.level,
    games: normalized.games,
    wins: normalized.wins,
    winStreak: Number.isFinite(Number(facts.winStreak)) ? Math.trunc(Number(facts.winStreak)) : normalized.streak.current,
    dailyStreak: Number.isFinite(Number(facts.dailyStreak)) ? Math.trunc(Number(facts.dailyStreak)) : 0,
    puzzlePackCompleted: facts.puzzlePackCompleted === true,
    campaignChapterCleared: facts.campaignChapterCleared === true,
    campaignCompleted: facts.campaignCompleted === true,
    puzzleRushMedal: typeof facts.puzzleRushMedal === "string" ? facts.puzzleRushMedal : "none",
  };
}

// Return the ids of achievements newly satisfied by `context` that are NOT already unlocked in
// `progression`. Pure.
export function evaluateAchievements(progression, context) {
  const normalized = normalizeProgression(progression);
  const unlocked = normalized.achievements;
  const newlyEarned = [];
  for (const achievement of ACHIEVEMENTS) {
    if (unlocked[achievement.id]) continue;
    let satisfied = false;
    try {
      satisfied = Boolean(achievement.test(context));
    } catch {
      satisfied = false;
    }
    if (satisfied) {
      newlyEarned.push(achievement.id);
    }
  }
  return newlyEarned;
}

// --- applyMatchResult ------------------------------------------------------------------

// Pure: returns a NEW progression with rating updated (Elo vs the tier anchor), XP added, level
// recomputed, counters bumped, streak updated, and any newly-earned achievements + the cosmetics
// they unlock stamped. Never mutates its input. `now` is injected for deterministic timestamps.
export function applyMatchResult(progression, facts = {}) {
  const base = normalizeProgression(progression);
  const difficulty = normalizeBotDifficulty(facts.difficulty);
  const won = Boolean(facts.won);
  const mode = typeof facts.mode === "string" ? facts.mode : "solo";
  const durationMs = Number.isFinite(Number(facts.durationMs)) ? Math.max(0, Math.trunc(Number(facts.durationMs))) : 0;
  const nowFn = typeof facts.now === "function" ? facts.now : () => new Date(0);
  const stamp = new Date(nowFn()).toISOString();

  const anchor = TIER_RATINGS[difficulty] ?? TIER_RATINGS[BOT_DIFFICULTIES.smart];
  const rating = updateRating(base.rating, anchor, won);
  const xp = base.xp + xpForMatch({ difficulty, won, mode });
  const level = levelForXp(xp);
  const games = base.games + 1;
  const wins = base.wins + (won ? 1 : 0);
  const streakCurrent = won ? base.streak.current + 1 : 0;
  const streak = { current: streakCurrent, best: Math.max(base.streak.best, streakCurrent) };

  // Build the post-update context and evaluate achievements against it.
  const contextProgression = {
    ...base,
    rating,
    xp,
    level,
    games,
    wins,
    streak,
  };
  const context = buildAchievementContext(contextProgression, {
    difficulty,
    won,
    mode,
    durationMs,
    winStreak: streakCurrent,
    dailyStreak: Number.isFinite(Number(facts.dailyStreak)) ? Math.trunc(Number(facts.dailyStreak)) : 0,
    puzzlePackCompleted: facts.puzzlePackCompleted === true,
  });
  const newAchievements = evaluateAchievements(contextProgression, context);

  const achievements = { ...base.achievements };
  const unlocks = { ...base.unlocks };
  for (const id of newAchievements) {
    achievements[id] = stamp;
    // Stamp any cosmetic whose unlockRule is this achievement.
    for (const cosmetic of COSMETICS) {
      if (cosmetic.unlockRule.type === "achievement" && cosmetic.unlockRule.achievementId === id) {
        unlocks[cosmetic.id] = true;
      }
    }
  }
  // Stamp cosmetics unlocked purely by reaching the new level (idempotent).
  for (const cosmetic of COSMETICS) {
    if (cosmetic.unlockRule.type === "level" && level >= cosmetic.unlockRule.level) {
      unlocks[cosmetic.id] = true;
    }
  }

  const next = {
    rating,
    xp,
    level,
    games,
    wins,
    achievements,
    unlocks,
    seenAchievements: { ...base.seenAchievements },
    streak,
    cosmetic: normalizeCosmeticSelection(base.cosmetic, unlocks, xp),
  };
  // newAchievements is surfaced for the unlock toast; it is not part of the persisted blob shape,
  // but normalizeProgression tolerates/ignores it on the round-trip.
  return { ...next, newAchievements };
}

// --- Share text (ko) -------------------------------------------------------------------

// Compact Korean share summary, mirroring formatDailyShareText/formatWeeklyShareText. English is
// composed at the UI layer via i18n so this stays a pure, node-testable ko builder.
export function formatProgressionShareText({ level = 1, rating = 0, wins = 0, games = 0, url = "" } = {}) {
  const lines = [`Sequence Arena 진행도 · Lv.${level} · 레이팅 ${rating}`];
  if (games > 0) {
    lines.push(`🏆 ${wins}승 / ${games}판`);
  }
  if (url) {
    lines.push(url);
  }
  return lines.join("\n");
}

// Combined "player card" share summary (ko) that ties the retention meta-layer into one line-set:
// level + rank title + rating, current daily streak, and unlocked-achievement count. Mirrors the
// pure-ko-builder pattern of formatProgressionShareText/formatWeeklyShareText; English is composed
// at the UI layer via i18n. Pure + deterministic — every field is an injected primitive.
export function formatMetaProfileShareText({
  level = 1,
  rating = 0,
  rankTitleKo = "",
  dailyStreakCurrent = 0,
  achievementsUnlocked = 0,
  achievementsTotal = 0,
  url = "",
} = {}) {
  const rankPart = rankTitleKo ? ` · ${rankTitleKo}` : "";
  const lines = [`Sequence Arena 프로필 · Lv.${level}${rankPart} · 레이팅 ${rating}`];
  if (dailyStreakCurrent > 0) {
    lines.push(`🔥 데일리 ${dailyStreakCurrent}일 연속`);
  }
  if (achievementsTotal > 0) {
    lines.push(`🏅 업적 ${achievementsUnlocked}/${achievementsTotal}`);
  }
  if (url) {
    lines.push(url);
  }
  return lines.join("\n");
}
