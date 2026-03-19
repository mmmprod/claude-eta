/**
 * Bullshit Detector — finds time duration mentions in text
 * and identifies estimates wildly off from project history.
 */
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
/** Find all time duration mentions in text */
export function extractDurations(text) {
    const results = [];
    DURATION_RE.lastIndex = 0;
    let match;
    while ((match = DURATION_RE.exec(text)) !== null) {
        const num = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const multiplier = UNIT_SECONDS[unit];
        if (!multiplier || num <= 0)
            continue;
        results.push({ raw: match[0], seconds: num * multiplier });
    }
    return results;
}
/**
 * Find the worst offender among durations.
 * Returns null if all estimates are within reasonable range.
 *
 * Threshold: must be >5x the p75 AND >10 min above median.
 * Avoids false positives on small values and technical mentions.
 */
export function findBullshitEstimate(durations, p75, median) {
    if (durations.length === 0 || p75 <= 0)
        return null;
    const largest = durations.reduce((max, d) => (d.seconds > max.seconds ? d : max));
    const threshold = Math.max(p75 * 5, median + 600);
    return largest.seconds > threshold ? largest : null;
}
//# sourceMappingURL=detector.js.map