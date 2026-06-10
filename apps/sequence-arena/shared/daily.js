// Daily-challenge core: pure date/seed/result/streak logic shared by the client UI and
// the node test suite. Everything here is side-effect free — no DOM, no storage, no
// clock reads except the optional `now` parameter — so the "same date → same puzzle for
// everyone" contract can be pinned byte-exactly in scripts/daily-challenge-test.mjs.

import { normalizeBotDifficulty } from "./bot-ai.js";

// Launch day of the daily challenge; that date is challenge #1.
export const DAILY_EPOCH_DATE_KEY = "2026-06-10";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
// Streak math only ever looks back day-by-day, so ~3 months of history is plenty; the
// cap keeps the localStorage payload bounded for years-long players.
const MAX_RESULT_DAYS = 90;

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Local calendar date — the daily rolls over at the player's local midnight, like Wordle.
export function dailyDateKey(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function dateKeyToUtcMs(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

function utcMsToDateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Date keys are compared in UTC space so the day arithmetic is immune to DST jumps.
export function dailyChallengeNumber(dateKey) {
  const delta = Math.round((dateKeyToUtcMs(dateKey) - dateKeyToUtcMs(DAILY_EPOCH_DATE_KEY)) / DAY_MS);
  return Math.max(1, delta + 1);
}

export function dailySeed(dateKey) {
  return `daily-${dateKey}`;
}

export function normalizeDailyResults(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const results = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!DATE_KEY_PATTERN.test(key)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const durationMs = Number(value.durationMs);
    const attempts = Number(value.attempts);
    results[key] = {
      won: Boolean(value.won),
      durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.trunc(durationMs) : 0,
      attempts: Number.isFinite(attempts) && attempts >= 1 ? Math.trunc(attempts) : 1,
    };
  }
  return results;
}

// The first completed run of a date is the record (Wordle semantics) — retries only bump
// `attempts` so the player can practice without farming a better stat line. Pure: returns
// a new object, never mutates the input.
export function recordDailyResult(results, dateKey, { won = false, durationMs = 0 } = {}) {
  const base = normalizeDailyResults(results);
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return base;
  }
  const existing = base[dateKey];
  const cleanDuration = Number.isFinite(Number(durationMs)) && durationMs >= 0 ? Math.trunc(Number(durationMs)) : 0;
  const next = existing
    ? { ...existing, attempts: existing.attempts + 1 }
    : { won: Boolean(won), durationMs: cleanDuration, attempts: 1 };
  const merged = { ...base, [dateKey]: next };
  const keys = Object.keys(merged).sort();
  while (keys.length > MAX_RESULT_DAYS) {
    delete merged[keys.shift()];
  }
  return merged;
}

// current: consecutive won days ending today — or ending yesterday when today is still
// unplayed (an unplayed today must not show a broken streak at 9am). A played-and-lost
// today zeroes it. best: longest consecutive won run anywhere in retained history.
export function computeDailyStreak(results, todayKey = dailyDateKey()) {
  const base = normalizeDailyResults(results);
  let current = 0;
  const todayEntry = base[todayKey];
  if (!todayEntry || todayEntry.won) {
    let cursorMs = dateKeyToUtcMs(todayKey);
    if (!todayEntry) {
      cursorMs -= DAY_MS;
    }
    while (true) {
      const entry = base[utcMsToDateKey(cursorMs)];
      if (!entry || !entry.won) break;
      current += 1;
      cursorMs -= DAY_MS;
    }
  }

  let best = 0;
  let run = 0;
  let previousMs = null;
  for (const key of Object.keys(base).sort()) {
    if (!base[key].won) {
      previousMs = null;
      run = 0;
      continue;
    }
    const ms = dateKeyToUtcMs(key);
    run = previousMs != null && ms - previousMs === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    previousMs = ms;
  }
  return { current, best };
}

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

export function normalizeSoloStats(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { games: 0, wins: 0, byDifficulty: {} };
  }
  const byDifficulty = {};
  if (raw.byDifficulty && typeof raw.byDifficulty === "object" && !Array.isArray(raw.byDifficulty)) {
    for (const [key, value] of Object.entries(raw.byDifficulty)) {
      if (normalizeBotDifficulty(key) !== key) continue;
      if (!value || typeof value !== "object") continue;
      byDifficulty[key] = { games: toCount(value.games), wins: toCount(value.wins) };
    }
  }
  return { games: toCount(raw.games), wins: toCount(raw.wins), byDifficulty };
}

export function recordSoloResult(stats, { difficulty, won = false } = {}) {
  const base = normalizeSoloStats(stats);
  const cleanDifficulty = normalizeBotDifficulty(difficulty);
  const bucket = base.byDifficulty[cleanDifficulty] || { games: 0, wins: 0 };
  return {
    games: base.games + 1,
    wins: base.wins + (won ? 1 : 0),
    byDifficulty: {
      ...base.byDifficulty,
      [cleanDifficulty]: { games: bucket.games + 1, wins: bucket.wins + (won ? 1 : 0) },
    },
  };
}

function formatDurationKo(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs) / 1000) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}초`;
  if (seconds === 0) return `${minutes}분`;
  return `${minutes}분 ${seconds}초`;
}

export function formatDailyShareText({ number, won, durationMs, streakCurrent = 0, url = "" } = {}) {
  const marker = won ? "✅ 승리" : "❌ 패배";
  const lines = [`Sequence Arena 데일리 #${number} ${marker} · ${formatDurationKo(durationMs)}`];
  if (won && streakCurrent > 1) {
    lines.push(`🔥 ${streakCurrent}일 연속 달성`);
  }
  if (url) {
    lines.push(url);
  }
  return lines.join("\n");
}
