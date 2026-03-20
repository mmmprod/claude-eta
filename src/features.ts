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
export function extractFeatures(state: ActiveTurnState): TraceFeatures {
  const now = Date.now();
  const elapsed = now - state.started_at_ms;
  const writeOps = state.files_edited + state.files_created;

  return {
    elapsed_wall_ms: elapsed,
    tool_calls: state.tool_calls,
    files_read: state.files_read,
    files_edited: state.files_edited,
    files_created: state.files_created,
    unique_files: state.unique_files,
    bash_calls: state.bash_calls,
    bash_failures: state.bash_failures,
    grep_calls: state.grep_calls,
    glob_calls: state.glob_calls,
    errors: state.errors,
    first_edit_delay_ms: state.first_edit_at_ms != null ? state.first_edit_at_ms - state.started_at_ms : null,
    first_bash_delay_ms: state.first_bash_at_ms != null ? state.first_bash_at_ms - state.started_at_ms : null,
    read_write_ratio: writeOps > 0 ? state.files_read / writeOps : state.files_read,
    phase: detectPhase(state),
  };
}

/**
 * Detect the current task phase from the tool usage sequence.
 *
 * - explore: before first edit (reading, grepping, globbing)
 * - edit: after first Edit/Write/NotebookEdit
 * - validate: after first Bash call
 * - repair_loop: Bash failure followed by more edits
 */
export function detectPhase(state: ActiveTurnState): TaskPhase {
  // No edits yet → exploring
  if (state.first_edit_at_ms === null) return 'explore';

  // Has bash failures AND edits came after bash → repair loop
  if (state.bash_failures > 0 && state.files_edited > 0) return 'repair_loop';

  // Has bash calls → validating
  if (state.first_bash_at_ms !== null) return 'validate';

  // Has edits but no bash → editing
  return 'edit';
}
