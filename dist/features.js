/** Extract trace features from an active turn state */
export function extractFeatures(state) {
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
 * Recompute remaining time from a cached ETA snapshot.
 * Pure arithmetic — no I/O, no stats lookup.
 * Used by on-tool-use/on-tool-failure on phase transitions.
 */
export function recomputeRemaining(cachedEta, elapsedSeconds, phase) {
    const phaseMultipliers = {
        explore: 1.05,
        edit: 1,
        validate: 0.95,
        repair_loop: 1.15,
    };
    const mult = phaseMultipliers[phase];
    const remainP50 = Math.max(0, Math.round((cachedEta.p50_wall - elapsedSeconds) * mult));
    const remainP80 = Math.max(remainP50 + (remainP50 === 0 ? 0 : 1), Math.round((cachedEta.p80_wall - elapsedSeconds) * mult));
    return { remaining_p50: remainP50, remaining_p80: remainP80 };
}
/** Apply phase-transition ETA refinement to a mutable turn state.
 *  Called by on-tool-use and on-tool-failure on every tool event.
 *  Returns the new phase if a transition occurred, or null if unchanged. */
export function applyPhaseTransition(state, now) {
    const currentPhase = detectPhase(state);
    if (currentPhase === state.live_phase)
        return null;
    state.live_phase = currentPhase;
    if (state.cached_eta) {
        const elapsed = Math.round((now - state.started_at_ms) / 1000);
        const remaining = recomputeRemaining(state.cached_eta, elapsed, currentPhase);
        state.live_remaining_p50 = remaining.remaining_p50;
        state.live_remaining_p80 = remaining.remaining_p80;
    }
    return currentPhase;
}
/**
 * Detect the current task phase from the tool usage sequence.
 *
 * - explore: before first edit (reading, grepping, globbing)
 * - edit: after first Edit/Write/NotebookEdit
 * - validate: after first Bash call
 * - repair_loop: Bash failure followed by more edits
 */
export function detectPhase(state) {
    // No edits yet → exploring
    if (state.first_edit_at_ms === null)
        return 'explore';
    // Has bash failures AND edits came after bash → repair loop
    if (state.bash_failures > 0 && state.files_edited > 0)
        return 'repair_loop';
    // Has bash calls → validating
    if (state.first_bash_at_ms !== null)
        return 'validate';
    // Has edits but no bash → editing
    return 'edit';
}
//# sourceMappingURL=features.js.map