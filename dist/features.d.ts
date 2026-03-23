/**
 * Trace feature extraction and phase detection for ETA v2.
 * Pure functions — no I/O.
 */
import type { ActiveTurnState } from './types.js';
export type TaskPhase = 'explore' | 'edit' | 'validate' | 'validate_failed' | 'repair_loop';
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
 * Recompute remaining time from a cached ETA snapshot.
 * Pure arithmetic — no I/O, no stats lookup.
 * Used by on-tool-use/on-tool-failure on every tool event.
 */
export declare function recomputeRemaining(cachedEta: {
    p50_wall: number;
    p80_wall: number;
}, elapsedSeconds: number, phase: TaskPhase): {
    remaining_p50: number;
    remaining_p80: number;
};
/** Apply phase-transition ETA refinement to a mutable turn state.
 *  Called by on-tool-use and on-tool-failure on every tool event.
 *  Always refreshes the lightweight live countdown, and only reports a phase
 *  transition when the detected phase actually changes. */
export declare function applyPhaseTransition(state: ActiveTurnState, now: number): TaskPhase | null;
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