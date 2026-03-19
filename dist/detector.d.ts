/**
 * Bullshit Detector — finds time duration mentions in text
 * and identifies estimates wildly off from project history.
 */
export interface DetectedEstimate {
    raw: string;
    seconds: number;
}
/** Find all time duration mentions in text */
export declare function extractDurations(text: string): DetectedEstimate[];
/**
 * Find the worst offender among durations.
 * Returns null if all estimates are within reasonable range.
 *
 * Threshold: must be >5x the p75 AND >10 min above median.
 * Avoids false positives on small values and technical mentions.
 */
export declare function findBullshitEstimate(durations: DetectedEstimate[], p75: number, median: number): DetectedEstimate | null;
//# sourceMappingURL=detector.d.ts.map