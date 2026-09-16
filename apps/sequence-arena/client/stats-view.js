// Pure model builders for the "내 기록" stats modal. No DOM, no clock — todayKey is always
// injected so the calendar/summary are deterministic and node-testable. Reuses the date
// math in shared/daily.js rather than re-deriving it.

import {
  normalizeDailyResults,
  normalizeSoloStats,
  computeDailyStreak,
  shiftDateKey,
  weekdayIndex,
  buildWeeklyLeaderboard,
} from "../shared/daily.js";
import {
  normalizeProgression,
  xpForLevel,
  ACHIEVEMENTS,
  COSMETICS,
  rankTitleForRating,
} from "../shared/progression.js";
import { listPuzzles } from "../shared/solo-modes.js";

function monthOf(dateKey) {
  return Number(String(dateKey).slice(5, 7));
}

// GitHub-contribution-style heatmap model: `weeks` columns laid out Sunday→Saturday, the
// last column containing today. Each cell is won/lost/none/future. monthLabels lets the UI
// align month captions to the column where a new month begins.
export function buildDailyCalendar(rawResults, todayKey, weeks = 12) {
  const results = normalizeDailyResults(rawResults);
  const columnCount = Math.max(1, Math.trunc(weeks));
  // End on the Saturday of today's week; step back a whole number of weeks lands on a
  // Sunday, so row 0 is always Sunday.
  const endKey = shiftDateKey(todayKey, 6 - weekdayIndex(todayKey));
  const startKey = shiftDateKey(endKey, -(columnCount * 7 - 1));

  const columns = [];
  const monthLabels = [];
  let previousMonth = null;
  for (let col = 0; col < columnCount; col += 1) {
    const days = [];
    for (let row = 0; row < 7; row += 1) {
      const dateKey = shiftDateKey(startKey, col * 7 + row);
      let status;
      if (dateKey > todayKey) {
        status = "future";
      } else if (results[dateKey]?.won) {
        status = "won";
      } else if (results[dateKey]) {
        status = "lost";
      } else {
        status = "none";
      }
      days.push({ dateKey, status, isToday: dateKey === todayKey, weekday: row });
    }
    const columnMonth = monthOf(days[0].dateKey);
    if (columnMonth !== previousMonth) {
      monthLabels.push({ columnIndex: col, month: columnMonth });
      previousMonth = columnMonth;
    }
    columns.push({ days });
  }
  return { columns, monthLabels, startKey, endKey };
}

export function buildStatsSummary(rawResults, rawStats, todayKey) {
  const results = normalizeDailyResults(rawResults);
  const stats = normalizeSoloStats(rawStats);
  const dates = Object.keys(results);
  const played = dates.length;
  const wins = dates.filter((dateKey) => results[dateKey].won).length;
  return {
    daily: {
      played,
      wins,
      losses: played - wins,
      winRate: played ? Math.round((wins / played) * 100) : 0,
      streak: computeDailyStreak(results, todayKey),
    },
    solo: stats,
  };
}

// View model for the personal weekly leaderboard section of the "내 기록" modal. Wraps the
// shared buildWeeklyLeaderboard aggregation (consistent with buildDailyCalendar living here)
// and pre-computes a few UI-facing extras: only weeks the player actually played are shown as
// ranked rows, the personal-best week (rank 1 among played weeks) is flagged, and a boolean
// says whether there is anything to render. Pure — todayKey is injected.
export function buildWeeklyLeaderboardView(rawResults, todayKey, weeks = 8) {
  const rows = buildWeeklyLeaderboard(rawResults, todayKey, weeks);
  const played = rows.filter((row) => row.played > 0);
  const bestWeekKey = played.reduce(
    (best, row) => (best == null || row.rank < best.rank ? row : best),
    null
  );
  const decorated = rows.map((row) => ({
    ...row,
    isPersonalBest: bestWeekKey != null && row.weekKey === bestWeekKey.weekKey && row.played > 0,
  }));
  return {
    rows: decorated,
    playedWeeks: played.length,
    hasHistory: played.length > 0,
    bestWeekKey: bestWeekKey ? bestWeekKey.weekKey : null,
  };
}

// View model for the progression section of the "내 기록" modal. Pure — derives level/rating/
// xp-to-next progress, groups achievements into unlocked vs locked (with ko/en labels), and lists
// cosmetics grouped by category with an owned/selected flag. Cosmetics are VISUAL-ONLY, so this
// model carries only labels + ownership, never any gameplay attribute. Reuses shared/progression
// so the curve/catalog stay single-sourced.
export function buildProgressionView(rawProgression) {
  const progression = normalizeProgression(rawProgression);
  const level = progression.level;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const intoLevel = Math.max(0, progression.xp - currentLevelXp);
  const xpToNext = Math.max(0, nextLevelXp - progression.xp);
  const levelProgress = Math.max(0, Math.min(100, Math.round((intoLevel / span) * 100)));

  const achievements = ACHIEVEMENTS.map((achievement) => {
    const unlockedAt = progression.achievements[achievement.id] || null;
    return {
      id: achievement.id,
      category: achievement.category,
      ko: achievement.ko,
      en: achievement.en,
      unlocked: Boolean(unlockedAt),
      unlockedAt,
    };
  });
  const unlockedAchievements = achievements.filter((a) => a.unlocked);
  const lockedAchievements = achievements.filter((a) => !a.unlocked);

  const cosmetics = COSMETICS.map((cosmetic) => {
    const owned = isCosmeticOwnedView(cosmetic, progression);
    return {
      id: cosmetic.id,
      category: cosmetic.category,
      ko: cosmetic.ko,
      en: cosmetic.en,
      owned,
      selected: progression.cosmetic[cosmetic.category] === cosmetic.id,
      unlockRule: cosmetic.unlockRule,
    };
  });

  return {
    rating: progression.rating,
    level,
    xp: progression.xp,
    xpToNext,
    levelProgress,
    games: progression.games,
    wins: progression.wins,
    losses: Math.max(0, progression.games - progression.wins),
    streak: progression.streak,
    achievements,
    unlockedAchievements,
    lockedAchievements,
    unlockedCount: unlockedAchievements.length,
    totalAchievements: achievements.length,
    cosmetics,
    selectedCosmetic: { ...progression.cosmetic },
  };
}

// Ownership for the view model. Mirrors the progression module's rule semantics without importing
// its private helper: default cosmetics are always owned, level cosmetics unlock by level, and
// achievement cosmetics are owned once stamped into unlocks by applyMatchResult.
function isCosmeticOwnedView(cosmetic, progression) {
  const rule = cosmetic.unlockRule;
  if (rule.type === "default") return true;
  if (rule.type === "level") return progression.level >= rule.level;
  if (rule.type === "achievement") return Boolean(progression.unlocks[cosmetic.id]);
  return false;
}

// --- Home meta-layer view --------------------------------------------------------------

// A deterministic PROXIMITY heuristic that ranks locked achievements so the home card can surface
// the ones the player is closest to earning. It never re-implements the achievement predicates
// (those stay single-sourced in shared/progression.js) — it just reads the numeric threshold each
// category tracks against the current progression counters, yielding a 0..1 fraction (higher =
// closer). Category order is a fixed, documented tiebreak so the selection is stable. Unknown
// categories score 0 (surfaced last). Pure.
const ACHIEVEMENT_CATEGORY_ORDER = ["milestone", "tier", "speed", "streak", "level", "volume", "daily", "puzzle"];

function achievementProximity(achievement, ctx) {
  const id = achievement.id;
  const ratio = (have, need) => (need > 0 ? Math.max(0, Math.min(1, have / need)) : 0);
  switch (achievement.category) {
    case "level": {
      const need = Number(id.split("-")[1]) || 0;
      return ratio(ctx.level, need);
    }
    case "volume": {
      const need = Number(id.split("-")[1]) || 0;
      return ratio(ctx.games, need);
    }
    case "streak": {
      const need = Number(id.split("-")[1]) || 0;
      return ratio(ctx.winStreak, need);
    }
    case "daily": {
      const need = Number(id.split("-")[2]) || 0;
      return ratio(ctx.dailyStreak, need);
    }
    case "milestone":
      // "first-win" — one win away at most; treat any played game as near.
      return ctx.games > 0 ? 0.99 : 0.5;
    case "tier":
    case "speed":
      // Single-shot achievements (beat a tier / a fast win): reachable in one targeted game.
      return 0.4;
    default:
      return 0;
  }
}

// The single "player card" model for the HOME screen (and a fuller stats-modal section). PURE and
// deterministic: `now` (today's date key) and every aggregate are injected — this function never
// reads the clock or storage. Ties Phase 2 progression + Phase 2-daily streak + weekly standing +
// Phase 3 puzzle/mode progress into one coherent retention snapshot:
//   level + rating + rank title, current daily streak, this-week standing (via the shared weekly
//   leaderboard), the next achievement(s) in progress, the next cosmetic unlock, and a today's-goals
//   list (play the daily, win a puzzle, reach the next level). Reuses buildProgressionView +
//   buildWeeklyLeaderboard + rankTitleForRating so no curve/catalog/rank logic is duplicated.
export function buildHomeMetaView({
  progression,
  dailyStreak = { current: 0, best: 0 },
  weekly = {},
  puzzleProgress = {},
  modeStats = null,
  now,
} = {}) {
  const todayKey = typeof now === "string" ? now : "";
  const view = buildProgressionView(progression);
  const rankTitle = rankTitleForRating(view.rating);

  const streak = {
    current: Math.max(0, Math.trunc(Number(dailyStreak?.current) || 0)),
    best: Math.max(0, Math.trunc(Number(dailyStreak?.best) || 0)),
  };

  // This-week standing sourced from the shared weekly leaderboard so the card and the weekly view
  // never disagree. The current week is the last-covered row.
  const weeklyRows = todayKey ? buildWeeklyLeaderboard(weekly, todayKey, 8) : [];
  const currentWeek = weeklyRows.find((row) => row.isCurrentWeek) || null;
  const thisWeek = currentWeek
    ? { weekKey: currentWeek.weekKey, played: currentWeek.played, wins: currentWeek.wins, rank: currentWeek.rank, points: currentWeek.points }
    : { weekKey: null, played: 0, wins: 0, rank: null, points: 0 };

  // Next achievement(s) in progress: still-locked achievements ranked by proximity (closest first),
  // stable-tiebroken by category order then id. Cap at the top three for the card.
  const proximityCtx = {
    level: view.level,
    games: view.games,
    winStreak: view.streak.current,
    dailyStreak: streak.current,
  };
  const nextAchievements = view.lockedAchievements
    .map((a) => ({ ...a, proximity: achievementProximity(a, proximityCtx) }))
    .sort((a, b) => {
      if (b.proximity !== a.proximity) return b.proximity - a.proximity;
      const ao = ACHIEVEMENT_CATEGORY_ORDER.indexOf(a.category);
      const bo = ACHIEVEMENT_CATEGORY_ORDER.indexOf(b.category);
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    })
    .slice(0, 3);

  // Next unlock: the not-yet-owned cosmetic closest to hand. Level cosmetics rank by the smallest
  // level gap; achievement cosmetics rank after the nearest level one. Deterministic tiebreak by id.
  const lockedCosmetics = view.cosmetics.filter((c) => !c.owned);
  const nextUnlock = lockedCosmetics
    .map((c) => ({
      ...c,
      levelGap: c.unlockRule?.type === "level" ? Math.max(0, c.unlockRule.level - view.level) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.levelGap !== b.levelGap) return a.levelGap - b.levelGap;
      return a.id.localeCompare(b.id);
    })[0] || null;

  // Today's goals: a small, coherent daily loop. Reuses listPuzzles to know whether ANY puzzle has
  // been solved. All three goals are always present so the card layout is stable.
  const dailyEntry = todayKey ? normalizeDailyResults(weekly)[todayKey] : null;
  const solvedPuzzleCount = countSolvedPuzzles(puzzleProgress);
  const nextLevel = view.level + 1;
  const goals = [
    { id: "play-daily", ko: "오늘의 데일리 챌린지 플레이", en: "Play today's daily challenge", done: Boolean(dailyEntry) },
    { id: "win-puzzle", ko: "퍼즐 1개 클리어", en: "Clear one puzzle", done: solvedPuzzleCount > 0 },
    {
      id: `reach-level-${nextLevel}`,
      ko: `레벨 ${nextLevel} 달성`,
      en: `Reach level ${nextLevel}`,
      done: false,
      target: nextLevel,
    },
  ];

  return {
    rating: view.rating,
    level: view.level,
    xp: view.xp,
    xpToNext: view.xpToNext,
    levelProgress: view.levelProgress,
    rankTitle,
    games: view.games,
    wins: view.wins,
    losses: view.losses,
    dailyStreak: streak,
    thisWeek,
    nextAchievements,
    nextUnlock,
    unlockedCount: view.unlockedCount,
    totalAchievements: view.totalAchievements,
    goals,
    solvedPuzzles: solvedPuzzleCount,
    totalPuzzles: listPuzzles().length,
  };
}

// Count how many catalog puzzles have at least one star in the (possibly untrusted) progress blob.
// Only counts KNOWN puzzle ids so a corrupted/foreign entry can never inflate the goal. Pure.
function countSolvedPuzzles(rawProgress) {
  if (!rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) return 0;
  const known = new Set(listPuzzles().map((puzzle) => puzzle.id));
  let solved = 0;
  for (const [id, stars] of Object.entries(rawProgress)) {
    if (known.has(id) && Number(stars) >= 1) solved += 1;
  }
  return solved;
}
