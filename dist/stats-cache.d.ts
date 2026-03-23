import type { ProjectStats } from './stats.js';
/** Return historical project stats using a signature-validated cache.
 *  Pass preloadedTurns to avoid a redundant JSONL re-read when the caller
 *  has already loaded turns (e.g. on-prompt.ts). */
export declare function getProjectStats(cwd: string, preloadedTurns?: import('./types.js').CompletedTurn[]): ProjectStats | null;
//# sourceMappingURL=stats-cache.d.ts.map