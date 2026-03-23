import { type BaselineRecord } from './supabase.js';
import { type BaselineMatchKind } from './cli/compare.js';
import type { TaskClassification } from './types.js';
/** A prior resolved from community baselines — same shape as INITIAL_PRIORS entries */
export interface CommunityPrior {
    low: number;
    median: number;
    high: number;
    sample_count: number;
    match_kind: BaselineMatchKind;
}
/** Map of classification → community prior (partial — not all types may have baselines) */
export type CommunityPriors = Partial<Record<TaskClassification, CommunityPrior>>;
/** Read cached baselines from disk. Returns null if missing/corrupt. Never throws. */
export declare function loadCachedBaselines(): BaselineRecord[] | null;
/** Check whether the cache file exists and is fresh (< TTL). */
export declare function isCacheFresh(): boolean;
/**
 * Refresh the baselines cache if stale (>6h) or missing.
 * Uses a short timeout to avoid blocking session start.
 * Returns records on success, null on failure. Never throws.
 */
export declare function refreshBaselinesCache(): Promise<BaselineRecord[] | null>;
/**
 * Get baselines with cache — async variant for compare CLI.
 * Same logic as refreshBaselinesCache but uses the default fetch timeout.
 */
export declare function getBaselinesWithCache(): Promise<BaselineRecord[] | null>;
/**
 * Map baselines → per-classification priors using the selectBestBaseline() hierarchy.
 * Returns a partial map — only classifications with matching baselines are included.
 */
export declare function baselinesToPriors(baselines: BaselineRecord[], locBucket: string | null, model: string | null): CommunityPriors;
//# sourceMappingURL=baselines-cache.d.ts.map