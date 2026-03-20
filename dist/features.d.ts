/**
 * Trace feature extraction and phase detection for ETA v2.
 * Pure functions — no I/O.
 */
import type { ActiveTurnState } from './types.js';
export type TaskPhase = 'explore' | 'edit' | 'validate' | 'repair_loop';
export interface TraceFeatures {
    elapsed_wall_ms: number;
    tool_calls: number;
    files_read: number;
    files_edited: number;
    files_created: number;
    unique_files: number;
    bash_calls: number;
    bash_failures: number;
    grep_calls: number;
    glob_calls: number;
    errors: number;
    first_edit_delay_ms: number | null;
    first_bash_delay_ms: number | null;
    read_write_ratio: number;
    phase: TaskPhase;
}
/** Extract trace features from an active turn state */
export declare function extractFeatures(state: ActiveTurnState): TraceFeatures;
/**
 * Detect the current task phase from the tool usage sequence.
 *
 * - explore: before first edit (reading, grepping, globbing)
 * - edit: after first Edit/Write/NotebookEdit
 * - validate: after first Bash call
 * - repair_loop: Bash failure followed by more edits
 */
export declare function detectPhase(state: ActiveTurnState): TaskPhase;
//# sourceMappingURL=features.d.ts.map