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
import type { TaskPhase } from './features.js';
import type { CommunityPriors } from './baselines-cache.js';
import { INITIAL_PRIORS, CALIBRATION_THRESHOLD } from './stats.js';
import { normalizeModel } from './anonymize.js';

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

// ── Shrinkage weights ────────────────────────────────────────
// These control how fast local data overrides the initial priors.
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
 *   3. Initial cold priors
 *
 * Each level is blended with the next using shrinkage weights:
 *   w = n / (n + W), where n = sample count, W = shrinkage denominator
 */
export function estimateInitial(
  stats: ProjectStats | null,
  classification: TaskClassification,
  complexity: number,
  context?: { model?: string | null; communityPriors?: CommunityPriors | null },
): EtaEstimate {
  // Resolve prior: community baseline → INITIAL_PRIORS
  const communityPrior = context?.communityPriors?.[classification];
  const hardcodedPrior = INITIAL_PRIORS[classification] ?? INITIAL_PRIORS.other;
  const prior = communityPrior
    ? { low: communityPrior.low, median: communityPrior.median, high: communityPrior.high }
    : hardcodedPrior;
  const priorCalibration: CalibrationLevel = communityPrior ? 'community' : 'cold';
  const priorBasis = communityPrior
    ? `community ${classification} baseline (${communityPrior.sample_count} samples)`
    : `initial ${classification} prior`;
  const defaultP50 = prior.median;
  const defaultP80 = prior.high;

  if (!stats) {
    // No local data at all — use community baseline or cold start
    return makeEstimate(defaultP50, defaultP80, priorBasis, priorCalibration, complexity);
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
  const clsModelStats = normalizedModel
    ? stats.byClassificationModel.find((s) => s.classification === classification && s.model === normalizedModel)
    : undefined;

  if (!clsStats || clsStats.count < 2) {
    // No classification data — use blended global
    const calibration: CalibrationLevel = nGlobal >= CALIBRATION_THRESHOLD ? 'project' : 'warming';
    return makeEstimate(
      blendedGlobalP50,
      blendedGlobalP80,
      `${nGlobal} tasks (no ${classification}-specific data)`,
      calibration,
      complexity,
    );
  }

  // Blend classification-specific with blended global
  const nCls = clsStats.count;
  const wCls = nCls / (nCls + W_CLS);
  const p50 = wCls * clsStats.median + (1 - wCls) * blendedGlobalP50;
  const p80 = wCls * clsStats.p80 + (1 - wCls) * blendedGlobalP80;

  if (clsModelStats && clsModelStats.count >= 2) {
    const nModel = clsModelStats.count;
    const wModel = nModel / (nModel + W_MODEL);
    return makeEstimate(
      wModel * clsModelStats.median + (1 - wModel) * p50,
      wModel * clsModelStats.p80 + (1 - wModel) * p80,
      `${nModel} similar ${classification} tasks on ${normalizedModel}`,
      'project',
      complexity,
    );
  }

  return makeEstimate(p50, p80, `${nCls} similar ${classification} tasks`, 'project', complexity);
}

/**
 * Refine an estimate with live trace data.
 * Uses elapsed time and phase to adjust remaining time.
 */
export function estimateWithTrace(
  initial: EtaEstimate,
  elapsedSeconds: number,
  phase: TaskPhase,
  context?: {
    stats?: ProjectStats | null;
    classification?: TaskClassification;
    model?: string | null;
    cumulativeWorkItemSeconds?: number;
  },
): EtaEstimate {
  const phaseMultipliers: Record<TaskPhase, number> = {
    explore: 1.05,
    edit: 1,
    validate: 0.95,
    validate_failed: 1.0,
    repair_loop: 1.15,
  };
  const effectiveElapsed = elapsedSeconds + (context?.cumulativeWorkItemSeconds ?? 0);
  const baselineP50 = Math.max(0, initial.p50_wall - effectiveElapsed);
  const baselineP80 = Math.max(0, initial.p80_wall - effectiveElapsed);
  let remainP50 = Math.max(0, Math.round(baselineP50 * phaseMultipliers[phase]));
  let remainP80 = Math.max(remainP50 + (remainP50 === 0 ? 0 : 1), Math.round(baselineP80 * phaseMultipliers[phase]));
  let basis = initial.basis;

  const phaseBucket =
    phase === 'validate' || phase === 'validate_failed'
      ? 'validate'
      : phase === 'edit' || phase === 'repair_loop'
        ? 'edit'
        : null;
  const stats = context?.stats ?? null;
  const classification = context?.classification;
  const normalizedModel = context?.model ? normalizeModel(context.model) : null;

  if (stats && classification && phaseBucket) {
    const phaseStats = stats.byClassificationPhase.find(
      (entry) => entry.phase === phaseBucket && entry.classification === classification,
    );
    const phaseModelStats = normalizedModel
      ? stats.byClassificationModelPhase.find(
          (entry) =>
            entry.phase === phaseBucket && entry.classification === classification && entry.model === normalizedModel,
        )
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
        } else {
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
      } else {
        const wPhase = phaseStats.count / (phaseStats.count + W_PHASE);
        remainP50 = Math.round(wPhase * learnedP50 + (1 - wPhase) * remainP50);
        remainP80 = Math.max(
          remainP50 + (remainP50 === 0 ? 0 : 1),
          Math.round(wPhase * learnedP80 + (1 - wPhase) * remainP80),
        );
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

function toLegacyTaskEstimate(
  low: number,
  high: number,
  est: EtaEstimate,
  complexity: number,
): import('./stats.js').TaskEstimate {
  return {
    low,
    high,
    median: low,
    confidence: calibrationToConfidence(est.calibration),
    basis: est.basis,
    volatility: 'medium', // No longer meaningful, kept for compat
    complexity,
  };
}

/** Convert EtaEstimate to the legacy TaskEstimate shape using total wall-clock ranges. */
export function toTaskEstimate(est: EtaEstimate, complexity: number): import('./stats.js').TaskEstimate {
  return toLegacyTaskEstimate(est.p50_wall, est.p80_wall, est, complexity);
}

/** Convert EtaEstimate to the legacy TaskEstimate shape using remaining ranges. */
export function toRemainingTaskEstimate(est: EtaEstimate, complexity: number): import('./stats.js').TaskEstimate {
  return toLegacyTaskEstimate(est.remaining_p50, est.remaining_p80, est, complexity);
}

/** Map calibration level to a rough confidence % for backward-compat display */
function calibrationToConfidence(cal: CalibrationLevel): number {
  switch (cal) {
    case 'cold':
      return 30;
    case 'community':
      return 40;
    case 'warming':
      return 50;
    case 'project':
      return 75;
    case 'project+trace':
      return 80;
  }
}

// ── Internals ────────────────────────────────────────────────

function makeEstimate(
  p50: number,
  p80: number,
  basis: string,
  calibration: CalibrationLevel,
  complexity: number,
): EtaEstimate {
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
