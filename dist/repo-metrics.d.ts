export interface RepoMetrics {
    fileCount: number;
    fileCountBucket: string;
    estimatedLoc: number;
    locBucketValue: string;
    computedAt: string;
}
/** Map file count to a privacy-safe bucket */
export declare function fileCountBucket(count: number): string;
/**
 * Get repo metrics with caching.
 * Returns cached metrics if fresh (< 24h), otherwise recomputes.
 */
export declare function getRepoMetrics(dir: string, projectFp: string): RepoMetrics;
/** Force-compute metrics without cache (for /eta inspect etc.) */
export declare function computeRepoMetrics(dir: string): RepoMetrics;
/** Backward-compat: same signature as before for callers that don't need caching */
export declare function countSourceFiles(dir: string): RepoMetrics;
//# sourceMappingURL=repo-metrics.d.ts.map