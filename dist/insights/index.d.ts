/**
 * Barrel module — computes all insights and formats the report.
 */
import type { AnalyticsTask } from '../types.js';
import type { InsightResult } from './types.js';
export type { InsightResult } from './types.js';
export { formatInsightsReport } from './format.js';
/** Run all 9 insight analyses. Returns only those with sufficient data. */
export declare function computeAllInsights(tasks: AnalyticsTask[]): InsightResult[];
//# sourceMappingURL=index.d.ts.map