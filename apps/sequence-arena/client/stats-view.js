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
