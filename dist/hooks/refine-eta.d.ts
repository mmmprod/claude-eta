/**
 * Shared phase-transition ETA refinement for PostToolUse and PostToolUseFailure.
 *
 * Runs estimateWithTrace using cached historical stats on phase transitions (2-3 per turn).
 * Stores result in state.refined_eta for consumption by on-prompt continuation.
 */
import type { ActiveTurnState } from '../types.js';
import type { TaskPhase } from '../features.js';
/**
 * Compute a refined ETA using full stats and store it in state.refined_eta.
 * Called only on phase transitions (gated by caller). Non-fatal on failure.
 */
export declare function refineEtaOnTransition(state: ActiveTurnState, cwd: string, newPhase: TaskPhase, now: number): void;
//# sourceMappingURL=refine-eta.d.ts.map