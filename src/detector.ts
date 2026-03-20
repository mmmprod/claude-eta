/**
 * Bullshit Detector — finds time duration mentions in text
 * and identifies estimates wildly off from project history.
 */

export interface DetectedEstimate {
  raw: string;
  seconds: number;
}

const UNIT_SECONDS: Record<string, number> = {
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

const DURATION_RE =
  /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|secondes?|heures?|jours?|semaines?)\b/gi;

/** Verbs/phrases that signal a future time estimate (not a past report or example) */
const ESTIMATE_CONTEXT_RE =
  /\b(will\s+take|should\s+take|take\s+about|takes?\s+(?:roughly|approximately|around)|(va|devrait)\s+prendre|prendra|environ|about|approximately|around|roughly|estimated?\s+at|need\s+(?:about|around)|require[ds]?\s+(?:about|around)|expect\s+(?:about|around)|looking\s+at\s+(?:about|around))\b/i;

/** Find all time duration mentions in text */
export function extractDurations(text: string, options?: { estimatesOnly?: boolean }): DetectedEstimate[] {
  // Filter out plugin-injected lines to avoid self-detection
  const filteredText = text
    .split('\n')
    .filter((line) => !line.includes('\u23F1') && !line.includes('[claude-eta'))
    .join('\n');

  const results: DetectedEstimate[] = [];
  DURATION_RE.lastIndex = 0;
  let match;
  while ((match = DURATION_RE.exec(filteredText)) !== null) {
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = UNIT_SECONDS[unit];
    if (!multiplier || num <= 0) continue;

    // Only keep durations that look like estimates (have estimation verbs nearby)
    if (options?.estimatesOnly) {
      const start = Math.max(0, match.index - 120);
      const end = Math.min(filteredText.length, match.index + match[0].length + 40);
      const context = filteredText.slice(start, end);
      if (!ESTIMATE_CONTEXT_RE.test(context)) continue;
    }

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
export function findBullshitEstimate(
  durations: DetectedEstimate[],
  p75: number,
  median: number,
): DetectedEstimate | null {
  if (durations.length === 0 || p75 <= 0) return null;

  const largest = durations.reduce((max, d) => (d.seconds > max.seconds ? d : max));
  const threshold = Math.max(p75 * 5, median + 600);
  return largest.seconds > threshold ? largest : null;
}
