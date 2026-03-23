/**
 * Pure baseline matching logic — no I/O, no imports from baselines-cache or cli/compare.
 * Extracted to break the circular dependency: baselines-cache ↔ cli/compare.
 */
import type { BaselineRecord } from './supabase.js';
export type BaselineMatchKind = 'type+loc+model' | 'type+model' | 'type+loc' | 'global';
export interface BaselineMatch {
    kind: BaselineMatchKind;
    record: BaselineRecord;
}
export declare function selectBestBaseline(baselines: BaselineRecord[], taskType: string, projectLocBucket: string | null, model: string | null): BaselineMatch | null;
//# sourceMappingURL=baseline-match.d.ts.map