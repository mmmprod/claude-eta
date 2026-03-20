/**
 * Breakdown insights: file operation ratios, model comparison, efficiency scoring.
 */
import type { CompletedTask, FileOpsResult, ModelComparisonResult, EfficiencyResult } from './types.js';
/** Insight 2: File operation ratios by classification */
export declare function fileOperationRatios(tasks: CompletedTask[]): FileOpsResult | null;
/** Insight 3: Compare performance across models */
export declare function perModelComparison(tasks: CompletedTask[]): ModelComparisonResult | null;
/** Insight 8: Efficiency scoring — seconds per tool call, tools per file */
export declare function efficiencyScoring(tasks: CompletedTask[]): EfficiencyResult | null;
//# sourceMappingURL=breakdowns.d.ts.map