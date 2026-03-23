import { type BaselineRecord } from './supabase.js';
import { type BaselineMatchKind } from './baseline-match.js';
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
/** Refresh cache with short timeout (3s) — for session-start hook. */
export declare function refreshBaselinesCache(): Promise<BaselineRecord[] | null>;
/** Get baselines with cache — for compare CLI (uses default 10s timeout). */
export declare function getBaselinesWithCache(): Promise<BaselineRecord[] | null>;
/**
 * Map baselines → per-classification priors using the selectBestBaseline() hierarchy.
 * Returns a partial map — only classifications with matching baselines are included.
 */
export declare function baselinesToPriors(baselines: BaselineRecord[], locBucket: string | null, model: string | null): CommunityPriors;
//# sourceMappingURL=baselines-cache.d.ts.map