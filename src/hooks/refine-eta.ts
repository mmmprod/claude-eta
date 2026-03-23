/**
 * Shared phase-transition ETA refinement for PostToolUse and PostToolUseFailure.
 *
 * Runs estimateWithTrace using cached historical stats on phase transitions (2-3 per turn).
 * Stores result in state.refined_eta for consumption by on-prompt continuation.
 */
import type { ActiveTurnState } from '../types.js';
import type { TaskPhase } from '../features.js';
import { getProjectStats } from '../stats-cache.js';
import { estimateInitial, estimateWithTrace } from '../estimator.js';

/**
 * Compute a refined ETA using full stats and store it in state.refined_eta.
 * Called only on phase transitions (gated by caller). Non-fatal on failure.
 */
export function refineEtaOnTransition(state: ActiveTurnState, cwd: string, newPhase: TaskPhase, now: number): void {
  state.last_phase = newPhase;
  try {
    const stats = getProjectStats(cwd);
    if (stats) {
      const initial = estimateInitial(stats, state.classification, state.prompt_complexity ?? 1, {
        model: state.model,
      });
      const elapsed = Math.round((now - state.started_at_ms) / 1000);
      const refined = estimateWithTrace(initial, elapsed, newPhase, {
        stats,
        classification: state.classification,
        model: state.model,
        cumulativeWorkItemSeconds: state.cumulative_work_item_seconds ?? 0,
      });
      state.refined_eta = { p50: refined.remaining_p50, p80: refined.remaining_p80, computed_at_ms: Date.now() };
    }
  } catch {
    // Stats load failure is non-fatal -- live_* fields already updated by applyPhaseTransition
  }
}
