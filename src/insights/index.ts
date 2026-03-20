/**
 * Barrel module — computes all insights and formats the report.
 */
import type { TaskEntry } from '../types.js';
import type { InsightResult } from './types.js';
import { completed } from './types.js';
import { errorDurationCorrelation, contextSwitchCost, volatilityRootCauses } from './correlations.js';
import { fileOperationRatios, perModelComparison, efficiencyScoring } from './breakdowns.js';
import { sessionFatigue, timeOfDayPatterns, weeklyTrends } from './temporal.js';

export type { InsightResult } from './types.js';
export { formatInsightsReport } from './format.js';

/** Run all 9 insight analyses. Returns only those with sufficient data. */
export function computeAllInsights(tasks: TaskEntry[]): InsightResult[] {
  const valid = completed(tasks);
  const fns = [
    errorDurationCorrelation,
    contextSwitchCost,
    volatilityRootCauses,
    fileOperationRatios,
    perModelComparison,
    efficiencyScoring,
    sessionFatigue,
    timeOfDayPatterns,
    weeklyTrends,
  ];
  return fns.map((fn) => fn(valid)).filter((r): r is InsightResult => r !== null);
}
