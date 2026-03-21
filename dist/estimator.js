import { DEFAULT_BASELINES, CALIBRATION_THRESHOLD } from './stats.js';
// ── Shrinkage weights ────────────────────────────────────────
// These control how fast local data overrides the default baselines.
// Higher denominator = slower convergence = more conservative.
const W_CLS = 8; // Weight denominator for classification-specific data
const W_GLOBAL = 5; // Weight denominator for global data
/**
 * Estimate task duration using shrinkage quantile blending.
 *
 * Hierarchy (most specific → least specific):
 *   1. Classification-specific local stats (if enough data)
 *   2. Global local stats (all classifications)
 *   3. Default cold baselines
 *
 * Each level is blended with the next using shrinkage weights:
 *   w = n / (n + W), where n = sample count, W = shrinkage denominator
 */
export function estimateInitial(stats, classification, complexity) {
    // Default baselines (cold start)
    const baseline = DEFAULT_BASELINES[classification] ?? DEFAULT_BASELINES.other;
    const defaultP50 = baseline.median;
    const defaultP80 = baseline.high;
    if (!stats) {
        // No local data at all — pure cold start
        return makeEstimate(defaultP50, defaultP80, `generic ${classification} baseline`, 'cold', complexity);
    }
    // Global local stats
    const nGlobal = stats.totalCompleted;
    const globalP50 = stats.overall.median;
    const globalP75 = stats.overall.p75;
    // Blend global with default
    const wGlobal = nGlobal / (nGlobal + W_GLOBAL);
    const blendedGlobalP50 = wGlobal * globalP50 + (1 - wGlobal) * defaultP50;
    const blendedGlobalP80 = wGlobal * globalP75 + (1 - wGlobal) * defaultP80;
    // Classification-specific stats
    const clsStats = stats.byClassification.find((s) => s.classification === classification);
    if (!clsStats || clsStats.count < 2) {
        // No classification data — use blended global
        const calibration = nGlobal >= CALIBRATION_THRESHOLD ? 'project' : 'warming';
        return makeEstimate(blendedGlobalP50, blendedGlobalP80, `${nGlobal} tasks (no ${classification}-specific data)`, calibration, complexity);
    }
    // Blend classification-specific with blended global
    const nCls = clsStats.count;
    const wCls = nCls / (nCls + W_CLS);
    const p50 = wCls * clsStats.median + (1 - wCls) * blendedGlobalP50;
    const p80 = wCls * clsStats.p75 + (1 - wCls) * blendedGlobalP80;
    return makeEstimate(p50, p80, `${nCls} similar ${classification} tasks`, 'project', complexity);
}
/**
 * Refine an estimate with live trace data.
 * Uses elapsed time and phase to adjust remaining time.
 */
export function estimateWithTrace(initial, elapsedSeconds, phase) {
    // Phase multipliers: how much of the total time is typically remaining
    const phaseRemaining = {
        explore: 0.7, // 70% of work remaining
        edit: 0.4, // 40% remaining
        validate: 0.2, // 20% remaining
        repair_loop: 0.5, // 50% remaining (back to editing)
    };
    const factor = phaseRemaining[phase];
    // Remaining = max(0, initial estimate * phase factor - elapsed time)
    const remainP50 = Math.max(0, Math.round(initial.p50_wall * factor - elapsedSeconds));
    const remainP80 = Math.max(0, Math.round(initial.p80_wall * factor - elapsedSeconds));
    return {
        ...initial,
        remaining_p50: remainP50,
        remaining_p80: remainP80,
        calibration: 'project+trace',
        phase,
    };
}
// ── Backward compat adapter ──────────────────────────────────
/** Convert EtaEstimate to the legacy TaskEstimate shape for existing consumers */
export function toTaskEstimate(est, complexity) {
    return {
        low: est.p50_wall,
        high: est.p80_wall,
        median: est.p50_wall,
        confidence: calibrationToConfidence(est.calibration),
        basis: est.basis,
        volatility: 'medium', // No longer meaningful, kept for compat
        complexity,
    };
}
/** Map calibration level to a rough confidence % for backward-compat display */
function calibrationToConfidence(cal) {
    switch (cal) {
        case 'cold':
            return 30;
        case 'warming':
            return 50;
        case 'project':
            return 75;
        case 'project+trace':
            return 80;
    }
}
// ── Internals ────────────────────────────────────────────────
function makeEstimate(p50, p80, basis, calibration, complexity) {
    // Complexity adjustment: shift percentile targets
    // complexity 1-2: slightly lower, 4-5: slightly higher
    const shift = 1 + (complexity - 3) * 0.1; // 0.8 to 1.2
    const adjP50 = Math.max(1, Math.round(p50 * shift));
    const adjP80 = Math.max(adjP50 + 1, Math.round(p80 * shift));
    return {
        p50_wall: adjP50,
        p80_wall: adjP80,
        remaining_p50: adjP50,
        remaining_p80: adjP80,
        basis,
        calibration,
        phase: 'explore', // Default phase for initial estimates
    };
}
//# sourceMappingURL=estimator.js.map