/**
 * Bullshit Detector — finds time duration mentions in text
 * and identifies estimates wildly off from project history.
 */
// ── Centralized thresholds ───────────────────────────────────
export const DETECTOR_CONFIG = {
    /** Duration must exceed this multiple of the reference p75 to be flagged */
    p75Multiplier: 5,
    /** Duration must also exceed reference median + this many seconds */
    medianOffsetSeconds: 600,
};
const UNIT_SECONDS = {
    second: 1,
    seconds: 1,
    sec: 1,
    secs: 1,
    minute: 60,
    minutes: 60,
    min: 60,
    mins: 60,
    hour: 3600,
    hours: 3600,
    hr: 3600,
    hrs: 3600,
    day: 86400,
    days: 86400,
    week: 604800,
    weeks: 604800,
    seconde: 1,
    secondes: 1,
    heure: 3600,
    heures: 3600,
    jour: 86400,
    jours: 86400,
    semaine: 604800,
    semaines: 604800,
};
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|secondes?|heures?|jours?|semaines?)\b/gi;
/** Verbs/phrases that signal a future time estimate (not a past report or example) */
const ESTIMATE_CONTEXT_RE = /\b(will\s+take|should\s+take|take\s+about|takes?\s+(?:roughly|approximately|around)|(va|devrait)\s+prendre|prendra|environ|about|approximately|around|roughly|estimated?\s+at|need\s+(?:about|around)|require[ds]?\s+(?:about|around)|expect\s+(?:about|around)|looking\s+at\s+(?:about|around))\b/i;
/** Find all time duration mentions in text */
export function extractDurations(text, options) {
    // Filter out plugin-injected lines to avoid self-detection
    const filteredText = text
        .split('\n')
        .filter((line) => !line.includes('\u23F1') && !line.includes('[claude-eta'))
        .join('\n');
    const results = [];
    DURATION_RE.lastIndex = 0;
    let match;
    while ((match = DURATION_RE.exec(filteredText)) !== null) {
        const num = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const multiplier = UNIT_SECONDS[unit];
        if (!multiplier || num <= 0)
            continue;
        // Only keep durations that look like estimates (have estimation verbs nearby)
        if (options?.estimatesOnly) {
            const start = Math.max(0, match.index - 120);
            const end = Math.min(filteredText.length, match.index + match[0].length + 40);
            const context = filteredText.slice(start, end);
            if (!ESTIMATE_CONTEXT_RE.test(context))
                continue;
        }
        results.push({ raw: match[0], seconds: num * multiplier });
    }
    return results;
}
/**
 * Find the worst offender among durations.
 * Returns null if all estimates are within reasonable range.
 *
 * Threshold: must exceed max(p75 * multiplier, median + offset).
 * Avoids false positives on small values and technical mentions.
 */
export function findBullshitEstimate(durations, p75, median) {
    if (durations.length === 0 || p75 <= 0)
        return null;
    const largest = durations.reduce((max, d) => (d.seconds > max.seconds ? d : max));
    const threshold = Math.max(p75 * DETECTOR_CONFIG.p75Multiplier, median + DETECTOR_CONFIG.medianOffsetSeconds);
    return largest.seconds > threshold ? largest : null;
}
/**
 * Resolve the best reference stats for comparison.
 * Hierarchy: classification-specific → global → null.
 */
export function resolveDetectorReference(stats, classification) {
    // 1. Classification-specific
    const cls = stats.byClassification.find((s) => s.classification === classification);
    if (cls && cls.count >= 2) {
        return { median: cls.median, p25: cls.p25, p75: cls.p75, count: cls.count, source: classification };
    }
    // 2. Global
    return {
        median: stats.overall.median,
        p25: stats.overall.p25,
        p75: stats.overall.p75,
        count: stats.byClassification.reduce((s, c) => s + c.count, 0),
        source: 'overall',
    };
}
//# sourceMappingURL=detector.js.map