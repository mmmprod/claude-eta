import { median, groupBy } from './types.js';
// ── Helpers ──────────────────────────────────────────────────
const MAX_TREND_WEEKS = 12;
function isoWeekLabel(iso) {
    const d = new Date(iso);
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
    const weekDay = d.getDay() || 7; // Mon=1 ... Sun=7
    const weekNum = Math.ceil((dayOfYear - weekDay + 10) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
function getPeriod(hour) {
    if (hour >= 6 && hour <= 11)
        return 'morning';
    if (hour >= 12 && hour <= 17)
        return 'afternoon';
    if (hour >= 18 && hour <= 21)
        return 'evening';
    return 'night';
}
const PERIOD_HOURS = {
    morning: '6-11',
    afternoon: '12-17',
    evening: '18-21',
    night: '22-5',
};
/** Sort by timestamp using a Schwartzian transform */
function sortByTimestamp(tasks) {
    return tasks
        .map((t) => ({ t, ts: new Date(t.timestamp_start).getTime() }))
        .sort((a, b) => a.ts - b.ts)
        .map((x) => x.t);
}
// ── Insights ─────────────────────────────────────────────────
/** Insight 4: Do tasks take longer later in a session? */
export function sessionFatigue(tasks) {
    const sessions = groupBy(tasks, (t) => t.session_id);
    // Keep sessions with 3+ tasks, sort each by timestamp
    const qualifiedSessions = [];
    for (const [, entries] of sessions) {
        if (entries.length >= 3) {
            qualifiedSessions.push(sortByTimestamp(entries));
        }
    }
    if (qualifiedSessions.length < 3)
        return null;
    // Collect durations by ordinal position + laterPositions in a single pass
    const byPosition = new Map();
    const laterPositions = [];
    let pos1Durations;
    for (const session of qualifiedSessions) {
        for (let i = 0; i < session.length; i++) {
            const pos = Math.min(i + 1, 5);
            const dur = session[i].duration_seconds;
            const list = byPosition.get(pos) ?? [];
            list.push(dur);
            byPosition.set(pos, list);
            if (pos === 1)
                pos1Durations ??= list;
            if (pos >= 3)
                laterPositions.push(dur);
        }
    }
    if (!pos1Durations || pos1Durations.length === 0 || laterPositions.length === 0)
        return null;
    const avgByPosition = [];
    for (const [pos, durations] of [...byPosition.entries()].sort((a, b) => a[0] - b[0])) {
        const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        avgByPosition.push({ position: pos, avgDuration: avg, count: durations.length });
    }
    const avgPos1 = pos1Durations.reduce((a, b) => a + b, 0) / pos1Durations.length;
    const avgLater = laterPositions.reduce((a, b) => a + b, 0) / laterPositions.length;
    const fatigueRatio = avgPos1 === 0 ? 1 : Math.round((avgLater / avgPos1) * 100) / 100;
    const totalTasks = qualifiedSessions.reduce((s, sess) => s + sess.length, 0);
    return {
        kind: 'session-fatigue',
        avgByPosition,
        fatigueRatio,
        sampleSize: totalTasks,
    };
}
/** Insight 5: Are you faster at certain times of day? */
export function timeOfDayPatterns(tasks) {
    if (tasks.length < 15)
        return null;
    const buckets = groupBy(tasks, (t) => getPeriod(new Date(t.timestamp_start).getHours()));
    const byPeriod = [];
    for (const period of ['morning', 'afternoon', 'evening', 'night']) {
        const entries = buckets.get(period);
        if (!entries || entries.length === 0)
            continue;
        const sortedDur = entries.map((t) => t.duration_seconds).sort((a, b) => a - b);
        byPeriod.push({
            period,
            hours: PERIOD_HOURS[period],
            count: entries.length,
            medianDuration: median(sortedDur),
        });
    }
    if (byPeriod.length < 2)
        return null;
    const fastestPeriod = byPeriod.reduce((a, b) => (a.medianDuration <= b.medianDuration ? a : b)).period;
    return {
        kind: 'time-of-day',
        byPeriod,
        fastestPeriod,
        sampleSize: tasks.length,
    };
}
/** Insight 9: Are you getting faster or slower over weeks? */
export function weeklyTrends(tasks) {
    const groups = groupBy(tasks, (t) => isoWeekLabel(t.timestamp_start));
    let weekEntries = [...groups.entries()]
        .map(([label, entries]) => {
        const durations = entries.map((t) => t.duration_seconds).sort((a, b) => a - b);
        return {
            label,
            count: entries.length,
            medianDuration: median(durations),
            totalDuration: durations.reduce((a, b) => a + b, 0),
        };
    })
        .sort((a, b) => a.label.localeCompare(b.label));
    if (weekEntries.length < 4)
        return null;
    // Cap to most recent weeks for readability
    weekEntries = weekEntries.slice(-MAX_TREND_WEEKS);
    // Compare first half vs last half medians
    const half = Math.floor(weekEntries.length / 2);
    const firstHalfMedians = weekEntries.slice(0, half).map((w) => w.medianDuration);
    const lastHalfMedians = weekEntries.slice(-half).map((w) => w.medianDuration);
    const firstAvg = firstHalfMedians.reduce((a, b) => a + b, 0) / firstHalfMedians.length;
    const lastAvg = lastHalfMedians.reduce((a, b) => a + b, 0) / lastHalfMedians.length;
    const changeRate = firstAvg === 0 ? 0 : Math.round(((lastAvg - firstAvg) / firstAvg) * 100);
    const direction = changeRate < -10 ? 'improving' : changeRate > 10 ? 'degrading' : 'stable';
    return {
        kind: 'trends',
        weeks: weekEntries,
        direction,
        changeRate,
        sampleSize: tasks.length,
    };
}
//# sourceMappingURL=temporal.js.map