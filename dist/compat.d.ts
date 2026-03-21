import type { AnalyticsTask, CompletedTurn, TaskEntry } from './types.js';
export { taskEntryToCompletedTurn } from './convert.js';
/**
 * Load completed turns from the best available source.
 * - If v2 data exists (migrated or native): reads from event-store JSONL
 * - If only v1 data exists: reads legacy JSON and converts in-memory
 * - If neither: returns empty array
 */
export declare function loadCompletedTurnsCompat(cwd: string): CompletedTurn[];
/** Convert CompletedTurn[] to TaskEntry[] for legacy modules (stats, insights, etc.) */
export declare function turnsToTaskEntries(turns: CompletedTurn[]): TaskEntry[];
export declare function mainTurns(turns: CompletedTurn[]): CompletedTurn[];
export declare function mainTurnsToTaskEntries(turns: CompletedTurn[]): TaskEntry[];
/** Aggregate main-runner turns into logical work items for analytics and ETA. */
export declare function turnsToAnalyticsTasks(turns: CompletedTurn[]): AnalyticsTask[];
/** @deprecated Use turnsToAnalyticsTasks() in v2 analytics code. */
export declare function turnsToAnalyticsTaskEntries(turns: CompletedTurn[]): TaskEntry[];
//# sourceMappingURL=compat.d.ts.map