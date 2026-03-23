import { type BaselineMatch } from '../baseline-match.js';
import type { BaselineRecord } from '../supabase.js';
import type { AnalyticsTask, TaskClassification } from '../types.js';
export { selectBestBaseline, type BaselineMatch, type BaselineMatchKind } from '../baseline-match.js';
export interface CompareRow {
    task_type: TaskClassification;
    local_median_seconds: number;
    local_count: number;
    community_median_seconds: number;
    community_sample_count: number;
    baseline_match: BaselineMatch;
}
export declare function selectDominantModel(tasks: Pick<AnalyticsTask, 'model'>[]): string | null;
export declare function buildCompareRows(tasks: AnalyticsTask[], baselines: BaselineRecord[], projectLocBucket: string | null): CompareRow[];
export declare function showCompare(cwd: string): Promise<void>;
//# sourceMappingURL=compare.d.ts.map