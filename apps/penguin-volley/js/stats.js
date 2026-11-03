// Local records (this browser only): results against each CPU level, win
// streaks, the longest rally and spike counts.
const KEY = 'penguin-volley-stats';
const LEVELS = ['easy', 'normal', 'hard'];

const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const record = value => ({ w: nonnegative(value?.w), l: nonnegative(value?.l) });

function empty() {
    return {
        cpu: Object.fromEntries(LEVELS.map(l => [l, { w: 0, l: 0 }])),
        competitive: Object.fromEntries(LEVELS.map(l => [l, { w: 0, l: 0 }])),
        streak: 0,
        bestStreak: 0,
        longestRally: 0,
        spikes: 0,
        matches2p: 0,
        practiceBest: 0,
    };
}

export function loadStats() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (!s || typeof s !== 'object') return empty();
        const base = empty();
        return {
            ...base,
            cpu: Object.fromEntries(LEVELS.map(l => [l, record(s.cpu?.[l])])),
            competitive: Object.fromEntries(LEVELS.map(l => [l, record(s.competitive?.[l])])),
            streak: nonnegative(s.streak),
            bestStreak: nonnegative(s.bestStreak),
            longestRally: nonnegative(s.longestRally),
            spikes: nonnegative(s.spikes),
            matches2p: nonnegative(s.matches2p),
            practiceBest: Math.min(10, nonnegative(s.practiceBest)),
        };
    } catch {
        return empty();
    }
}

function store(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Record a finished match. Returns { stats, newBest: string[] } (which records improved). */
export function recordMatch(stats, { mode, level, rules = 'arcade', won, longestRally, spikes }) {
    const newBest = [];
    if (mode === 'cpu') {
        const group = rules === 'competitive' ? stats.competitive : stats.cpu;
        const r = group[level] || (group[level] = { w: 0, l: 0 });
        if (won) {
            r.w++;
            stats.streak++;
            if (stats.streak > stats.bestStreak) {
                stats.bestStreak = stats.streak;
                if (stats.bestStreak > 1) newBest.push('streak');
            }
        } else {
            r.l++;
            stats.streak = 0;
        }
        stats.spikes += spikes;
    } else {
        stats.matches2p++;
    }
    if (longestRally > stats.longestRally) {
        stats.longestRally = longestRally;
        newBest.push('rally');
    }
    store(stats);
    return { stats, newBest };
}

export function recordPractice(stats, hits) {
    const improved = hits > stats.practiceBest;
    stats.practiceBest = Math.max(stats.practiceBest, Math.min(10, nonnegative(hits)));
    store(stats);
    return { stats, improved };
}

export function resetStats() {
    const s = empty();
    store(s);
    return s;
}

export { LEVELS };
