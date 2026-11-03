// Versioned local records (this browser only): results against each CPU
// level and format, win streaks, rally/spike totals, and engagement counts.
const KEY = 'penguin-volley-stats';
const SCHEMA_VERSION = 2;
const LEVELS = ['easy', 'normal', 'hard'];

const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const record = value => ({ w: nonnegative(value?.w), l: nonnegative(value?.l) });
const records = (value = undefined) => Object.fromEntries(LEVELS.map(level => [level, record(value?.[level])]));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function empty() {
    return {
        version: SCHEMA_VERSION,
        cpu: records(),
        competitive: records(),
        bo3: {
            arcade: records(),
            competitive: records(),
        },
        streak: 0,
        bestStreak: 0,
        longestRally: 0,
        spikes: 0,
        matches2p: 0,
        practiceBest: 0,
        perfectHits: 0,
        highlightsViewed: 0,
        shares: 0,
    };
}

function normalizeStats(value) {
    const source = isObject(value) ? value : {};
    return {
        version: SCHEMA_VERSION,
        cpu: records(source.cpu),
        competitive: records(source.competitive),
        bo3: {
            arcade: records(source.bo3?.arcade),
            competitive: records(source.bo3?.competitive),
        },
        streak: nonnegative(source.streak),
        bestStreak: nonnegative(source.bestStreak),
        longestRally: nonnegative(source.longestRally),
        spikes: nonnegative(source.spikes),
        matches2p: nonnegative(source.matches2p),
        practiceBest: Math.min(10, nonnegative(source.practiceBest)),
        perfectHits: nonnegative(source.perfectHits),
        highlightsViewed: nonnegative(source.highlightsViewed),
        shares: nonnegative(source.shares),
    };
}

function normalizeMutable(stats) {
    const normalized = normalizeStats(stats);
    if (!isObject(stats)) return normalized;
    Object.assign(stats, normalized);
    return stats;
}

export function loadStats() {
    try {
        return normalizeStats(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch {
        return empty();
    }
}

function store(stats) {
    try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* private mode */ }
}

/** Record a finished match. Returns { stats, newBest: string[] } (which records improved). */
export function recordMatch(stats, {
    mode,
    level,
    rules = 'arcade',
    format = 'single',
    won,
    longestRally = 0,
    spikes = 0,
}) {
    stats = normalizeMutable(stats);
    let streakBest = false;
    let rallyBest = false;
    if (mode === 'cpu') {
        const competitive = rules === 'competitive';
        const group = format === 'bo3'
            ? stats.bo3[competitive ? 'competitive' : 'arcade']
            : stats[competitive ? 'competitive' : 'cpu'];
        const result = LEVELS.includes(level) ? group[level] : null;
        if (won) {
            if (result) result.w++;
            stats.streak++;
            if (stats.streak > stats.bestStreak) {
                stats.bestStreak = stats.streak;
                if (stats.bestStreak > 1) streakBest = true;
            }
        } else {
            if (result) result.l++;
            stats.streak = 0;
        }
        stats.spikes += nonnegative(spikes);
    } else if (mode === '2p') {
        stats.matches2p++;
    }
    const rally = nonnegative(longestRally);
    if (rally > stats.longestRally) {
        stats.longestRally = rally;
        rallyBest = true;
    }
    store(stats);
    const newBest = [
        ...(streakBest ? ['streak'] : []),
        ...(rallyBest ? ['rally'] : []),
    ];
    return { stats, newBest };
}

export function recordPractice(stats, hits) {
    stats = normalizeMutable(stats);
    const improved = hits > stats.practiceBest;
    stats.practiceBest = Math.max(stats.practiceBest, Math.min(10, nonnegative(hits)));
    store(stats);
    return { stats, improved };
}

export function recordPerfectHits(stats, n) {
    stats = normalizeMutable(stats);
    stats.perfectHits += nonnegative(n);
    store(stats);
    return stats;
}

export function recordHighlightViewed(stats) {
    stats = normalizeMutable(stats);
    stats.highlightsViewed++;
    store(stats);
    return stats;
}

export function recordShare(stats) {
    stats = normalizeMutable(stats);
    stats.shares++;
    store(stats);
    return stats;
}

export function resetStats() {
    const stats = empty();
    store(stats);
    return stats;
}

export { LEVELS };
