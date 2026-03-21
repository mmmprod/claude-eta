import type { AnalyticsTask } from './types.js';
export type EvalStage = 'prompt' | 'first_edit' | 'first_bash';
export interface EvalMetrics {
    sample_count: number;
    mdape_pct: number | null;
    p80_coverage_pct: number | null;
}
export interface EvalBreakdownRow {
    key: string;
    sample_count: number;
    prompt: EvalMetrics;
    first_edit: EvalMetrics;
    first_bash: EvalMetrics;
}
export interface EvalReport {
    total_tasks: number;
    overall: Record<EvalStage, EvalMetrics>;
    byClassification: EvalBreakdownRow[];
    byClassificationModel: EvalBreakdownRow[];
}
export declare function evaluateTasks(tasks: AnalyticsTask[]): EvalReport;
export declare function formatEvaluationReport(report: EvalReport): string;
//# sourceMappingURL=eval.d.ts.map