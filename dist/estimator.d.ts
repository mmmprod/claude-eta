/**
 * ETA Estimator v2 — shrinkage quantile estimation.
 *
 * Replaces the hardcoded confidence 80/60/30 and linear shift formula
 * with a data-driven model that smoothly blends local data and initial priors.
 *
 * Pure functions — no I/O.
 */
import type { TaskClassification } from './types.js';
import type { ProjectStats } from './stats.js';
import { type TaskPhase } from './features.js';
import type { CommunityPriors } from './baselines-cache.js';
export type CalibrationLevel = 'cold' | 'community' | 'warming' | 'project' | 'project+trace';
export interface EtaEstimate {
    /** Estimated p50 wall time in seconds */
    p50_wall: number;
    /** Estimated p80 wall time in seconds */
    p80_wall: number;
    /** Remaining p50 (only meaningful with trace data) */
    remaining_p50: number;
    /** Remaining p80 (only meaningful with trace data) */
    remaining_p80: number;
    /** Human-readable explanation of the estimate basis */
    basis: string;
    /** How well-calibrated this estimate is */
    calibration: CalibrationLevel;
    /** Current task phase (from trace features) */
    phase: TaskPhase;
}
/**
 * Estimate task duration using shrinkage quantile blending.
 *
 * Hierarchy (most specific → least specific):
 *   1. Classification-specific local stats (if enough data)
 *   2. Global local stats (all classifications)
 *   3. Initial cold priors
 *
 * Each level is blended with the next using shrinkage weights:
 *   w = n / (n + W), where n = sample count, W = shrinkage denominator
 */
export declare function estimateInitial(stats: ProjectStats | null, classification: TaskClassification, complexity: number, context?: {
    model?: string | null;
    communityPriors?: CommunityPriors | null;
}): EtaEstimate;
/**
 * Refine an estimate with live trace data.
 * Uses elapsed time and phase to adjust remaining time.
 */
export declare function estimateWithTrace(initial: EtaEstimate, elapsedSeconds: number, phase: TaskPhase, context?: {
    stats?: ProjectStats | null;
    classification?: TaskClassification;
    model?: string | null;
    cumulativeWorkItemSeconds?: number;
}): EtaEstimate;
/** Convert EtaEstimate to the legacy TaskEstimate shape using total wall-clock ranges. */
export declare function toTaskEstimate(est: EtaEstimate, complexity: number): import('./stats.js').TaskEstimate;
/** Convert EtaEstimate to the legacy TaskEstimate shape using remaining ranges. */
export declare function toRemainingTaskEstimate(est: EtaEstimate, complexity: number): import('./stats.js').TaskEstimate;
//# sourceMappingURL=estimator.d.ts.map