import { DEFAULT_BASELINES, CALIBRATION_THRESHOLD } from './stats.js';
import { normalizeModel } from './anonymize.js';
// ── Shrinkage weights ────────────────────────────────────────
// These control how fast local data overrides the default baselines.
// Higher denominator = slower convergence = more conservative.
const W_CLS = 8; // Weight denominator for classification-specific data
const W_GLOBAL = 5; // Weight denominator for global data
const W_MODEL = 5; // Weight denominator for classification+model data
const W_PHASE = 6; // Weight denominator for phase-specific remaining-time data
const W_PHASE_MODEL = 4; // Weight denominator for classification+model+phase data
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
export function estimateInitial(stats, classification, complexity, context) {
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
    const globalP80 = stats.overall.p80;
    // Blend global with default
    const wGlobal = nGlobal / (nGlobal + W_GLOBAL);
    const blendedGlobalP50 = wGlobal * globalP50 + (1 - wGlobal) * defaultP50;
    const blendedGlobalP80 = wGlobal * globalP80 + (1 - wGlobal) * defaultP80;
    // Classification-specific stats
    const clsStats = stats.byClassification.find((s) => s.classification === classification);
    const normalizedModel = context?.model ? normalizeModel(context.model) : null;
    const clsModelStats = normalizedModel != null
        ? stats.byClassificationModel.find((s) => s.classification === classification && s.model === normalizedModel)
        : undefined;
    if (!clsStats || clsStats.count < 2) {
        // No classification data — use blended global
        const calibration = nGlobal >= CALIBRATION_THRESHOLD ? 'project' : 'warming';
        return makeEstimate(blendedGlobalP50, blendedGlobalP80, `${nGlobal} tasks (no ${classification}-specific data)`, calibration, complexity);
    }
    // Blend classification-specific with blended global
    const nCls = clsStats.count;
    const wCls = nCls / (nCls + W_CLS);
    const p50 = wCls * clsStats.median + (1 - wCls) * blendedGlobalP50;
    const p80 = wCls * clsStats.p80 + (1 - wCls) * blendedGlobalP80;
    if (clsModelStats && clsModelStats.count >= 2) {
        const nModel = clsModelStats.count;
        const wModel = nModel / (nModel + W_MODEL);
        return makeEstimate(wModel * clsModelStats.median + (1 - wModel) * p50, wModel * clsModelStats.p80 + (1 - wModel) * p80, `${nModel} similar ${classification} tasks on ${normalizedModel}`, 'project', complexity);
    }
    return makeEstimate(p50, p80, `${nCls} similar ${classification} tasks`, 'project', complexity);
}
/**
 * Refine an estimate with live trace data.
 * Uses elapsed time and phase to adjust remaining time.
 */
export function estimateWithTrace(initial, elapsedSeconds, phase, context) {
    const phaseMultipliers = {
        explore: 1.05,
        edit: 1,
        validate: 0.95,
        repair_loop: 1.15,
    };
    const baselineP50 = Math.max(0, initial.p50_wall - elapsedSeconds);
    const baselineP80 = Math.max(0, initial.p80_wall - elapsedSeconds);
    let remainP50 = Math.max(0, Math.round(baselineP50 * phaseMultipliers[phase]));
    let remainP80 = Math.max(remainP50 + (remainP50 === 0 ? 0 : 1), Math.round(baselineP80 * phaseMultipliers[phase]));
    let basis = initial.basis;
    const phaseBucket = phase === 'validate' ? 'validate' : phase === 'edit' || phase === 'repair_loop' ? 'edit' : null;
    const stats = context?.stats ?? null;
    const classification = context?.classification;
    const normalizedModel = context?.model ? normalizeModel(context.model) : null;
    if (stats && classification && phaseBucket) {
        const phaseStats = stats.byClassificationPhase.find((entry) => entry.phase === phaseBucket && entry.classification === classification);
        const phaseModelStats = normalizedModel != null
            ? stats.byClassificationModelPhase.find((entry) => entry.phase === phaseBucket && entry.classification === classification && entry.model === normalizedModel)
            : undefined;
        if (phaseStats && phaseStats.count >= 2) {
            let learnedP50 = phaseStats.median;
            let learnedP80 = phaseStats.p80;
            let detail = `${phaseStats.count} ${classification} ${phaseBucket} traces`;
            let trustedCount = phaseStats.count;
            if (phaseModelStats && phaseModelStats.count >= 2) {
                if (phaseModelStats.count >= CALIBRATION_THRESHOLD) {
                    learnedP50 = phaseModelStats.median;
                    learnedP80 = phaseModelStats.p80;
                }
                else {
                    const wModel = phaseModelStats.count / (phaseModelStats.count + W_PHASE_MODEL);
                    learnedP50 = Math.round(wModel * phaseModelStats.median + (1 - wModel) * learnedP50);
                    learnedP80 = Math.round(wModel * phaseModelStats.p80 + (1 - wModel) * learnedP80);
                }
                detail = `${phaseModelStats.count} ${classification} ${phaseBucket} traces on ${normalizedModel}`;
                trustedCount = phaseModelStats.count;
            }
            if (trustedCount >= CALIBRATION_THRESHOLD) {
                remainP50 = learnedP50;
                remainP80 = Math.max(learnedP50 + (learnedP50 === 0 ? 0 : 1), learnedP80);
            }
            else {
                const wPhase = phaseStats.count / (phaseStats.count + W_PHASE);
                remainP50 = Math.round(wPhase * learnedP50 + (1 - wPhase) * remainP50);
                remainP80 = Math.max(remainP50 + (remainP50 === 0 ? 0 : 1), Math.round(wPhase * learnedP80 + (1 - wPhase) * remainP80));
            }
            basis = `${initial.basis}, ${detail}`;
        }
    }
    return {
        ...initial,
        remaining_p50: remainP50,
        remaining_p80: remainP80,
        calibration: 'project+trace',
        phase,
        basis,
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