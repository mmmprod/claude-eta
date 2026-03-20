/**
 * Legacy TaskEntry → CompletedTurn conversion.
 * Extracted to break the circular dependency between compat.ts and migrate.ts.
 */
import type { TaskEntry, CompletedTurn } from './types.js';
/** Convert a legacy v1 TaskEntry to a v2 CompletedTurn */
export declare function taskEntryToCompletedTurn(task: TaskEntry, projectFp: string, displayName: string): CompletedTurn;
//# sourceMappingURL=convert.d.ts.map