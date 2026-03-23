import type { BaselineRecord } from '../supabase.js';
import type { AnalyticsTask, TaskClassification } from '../types.js';
export type BaselineMatchKind = 'type+loc+model' | 'type+model' | 'type+loc' | 'global';
export interface BaselineMatch {
    kind: BaselineMatchKind;
    record: BaselineRecord;
}
export interface CompareRow {
    task_type: TaskClassification;
    local_median_seconds: number;
    local_count: number;
    community_median_seconds: number;
    community_sample_count: number;
    baseline_match: BaselineMatch;
}
export declare function selectDominantModel(tasks: Pick<AnalyticsTask, 'model'>[]): string | null;
export declare function selectBestBaseline(baselines: BaselineRecord[], taskType: string, projectLocBucket: string | null, model: string | null): BaselineMatch | null;
export declare function buildCompareRows(tasks: AnalyticsTask[], baselines: BaselineRecord[], projectLocBucket: string | null): CompareRow[];
export declare function showCompare(cwd: string): Promise<void>;
//# sourceMappingURL=compare.d.ts.map