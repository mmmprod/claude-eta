/**
 * Bullshit Detector — finds time duration mentions in text
 * and identifies estimates wildly off from project history.
 */
export declare const DETECTOR_CONFIG: {
    /** Duration must exceed this multiple of the reference p75 to be flagged */
    readonly p75Multiplier: 5;
    /** Duration must also exceed reference median + this many seconds */
    readonly medianOffsetSeconds: 600;
};
export interface DetectedEstimate {
    raw: string;
    seconds: number;
}
/** Find all time duration mentions in text */
export declare function extractDurations(text: string, options?: {
    estimatesOnly?: boolean;
}): DetectedEstimate[];
/**
 * Find the worst offender among durations.
 * Returns null if all estimates are within reasonable range.
 *
 * Threshold: must exceed max(p75 * multiplier, median + offset).
 * Avoids false positives on small values and technical mentions.
 */
export declare function findBullshitEstimate(durations: DetectedEstimate[], p75: number, median: number): DetectedEstimate | null;
/**
 * Resolve the best reference stats for comparison.
 * Hierarchy: classification-specific → global → null.
 */
export declare function resolveDetectorReference(stats: {
    overall: {
        median: number;
        p25: number;
        p75: number;
    };
    byClassification: {
        classification: string;
        count: number;
        median: number;
        p25: number;
        p75: number;
    }[];
}, classification: string): {
    median: number;
    p25: number;
    p75: number;
    count: number;
    source: string;
} | null;
//# sourceMappingURL=detector.d.ts.map