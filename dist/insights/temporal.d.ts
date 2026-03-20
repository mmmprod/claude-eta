/**
 * Temporal insights: session fatigue, time-of-day patterns, weekly trends.
 */
import type { CompletedTask, SessionFatigueResult, TimeOfDayResult, WeeklyTrendsResult } from './types.js';
export declare function isoWeekLabel(iso: string): string;
/** Insight 4: Do tasks take longer later in a session? */
export declare function sessionFatigue(tasks: CompletedTask[]): SessionFatigueResult | null;
/** Insight 5: Are you faster at certain times of day? */
export declare function timeOfDayPatterns(tasks: CompletedTask[]): TimeOfDayResult | null;
/** Insight 9: Are you getting faster or slower over weeks? */
export declare function weeklyTrends(tasks: CompletedTask[]): WeeklyTrendsResult | null;
//# sourceMappingURL=temporal.d.ts.map