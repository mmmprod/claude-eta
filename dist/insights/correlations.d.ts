/**
 * Correlation-based insights: error-duration, context-switch cost, volatility root causes.
 */
import type { CompletedTask, ErrorDurationResult, ContextSwitchResult, VolatilityCausesResult } from './types.js';
/** Insight 1: Do tasks with errors take longer? */
export declare function errorDurationCorrelation(tasks: CompletedTask[]): ErrorDurationResult | null;
/** Insight 6: Does switching task type cost time? */
export declare function contextSwitchCost(tasks: CompletedTask[]): ContextSwitchResult | null;
/** Insight 7: What drives duration volatility in the most volatile classification? */
export declare function volatilityRootCauses(tasks: CompletedTask[]): VolatilityCausesResult | null;
//# sourceMappingURL=correlations.d.ts.map