import type { ErrorFingerprint } from './types.js';
/**
 * Normalize error text for fingerprinting.
 * Strips variable parts (paths, numbers, quoted values) so structurally
 * identical errors produce the same fingerprint.
 */
export declare function normalizeError(text: string): string;
/** Hash normalized error text into an 8-char fingerprint */
export declare function extractErrorFingerprint(text: string): string;
/** Build an ErrorFingerprint record from raw error text */
export declare function buildErrorFingerprint(text: string): ErrorFingerprint;
export interface LoopDetection {
    fingerprint: string;
    count: number;
    preview: string;
}
/**
 * Detect a repair loop in the accumulated error fingerprints.
 * Returns the most frequent fingerprint if it appears >= threshold times.
 */
export declare function detectRepairLoop(fingerprints: ErrorFingerprint[], threshold?: number): LoopDetection | null;
//# sourceMappingURL=loop-detector.d.ts.map