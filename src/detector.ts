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

/** Words before a duration that indicate a past report, not a future estimate */
const PAST_CONTEXT_RE =
  /\b(took|lasted|completed|finished|elapsed|spent|ran|total\s+time|duration|avg|average|median|session|previous|recorded|en\s+tout)\b/i;

/** Find all time duration mentions in text */
export function extractDurations(text: string, options?: { skipPastContext?: boolean }): DetectedEstimate[] {
  const results: DetectedEstimate[] = [];
  DURATION_RE.lastIndex = 0;
  let match;
  while ((match = DURATION_RE.exec(text)) !== null) {
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = UNIT_SECONDS[unit];
    if (!multiplier || num <= 0) continue;

    // Skip durations preceded by past-tense/reporting words (not estimates)
    // Only look within the current sentence to avoid cross-sentence false negatives
    if (options?.skipPastContext) {
      const raw = text.slice(Math.max(0, match.index - 120), match.index);
      const sentenceBreak = Math.max(
        raw.lastIndexOf('.'),
        raw.lastIndexOf('\n'),
        raw.lastIndexOf('!'),
        raw.lastIndexOf('?'),
      );
      const before = sentenceBreak >= 0 ? raw.slice(sentenceBreak + 1) : raw;
      if (PAST_CONTEXT_RE.test(before)) continue;
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
