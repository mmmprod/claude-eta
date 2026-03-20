/**
 * Auto-ETA decision module — pure functions, zero I/O.
 * Mirrors detector.ts pattern: called by on-prompt.ts hook.
 */
import type { LastEtaPrediction, TaskClassification } from './types.js';
import type { ProjectStats } from './stats.js';
import { estimateTask, scorePromptComplexity, fmtSec } from './stats.js';

export const MIN_TYPE_TASKS = 5;
export const HIGH_VOL_INTERVAL_MULT = 1.5;
export const HIGH_VOL_CONFIDENCE = 60;
export const NORMAL_CONFIDENCE = 80;
export const MAX_INTERVAL_RATIO = 5;
export const COOLDOWN_INTERVAL = 5;
export const ACCURACY_MIN_PREDICTIONS = 10;
export const ACCURACY_MIN_RATE = 0.5;

export const CONVERSATIONAL_PATTERNS =
  /^(merci|thanks|ok|oui|yes|non|no|continue|go|sure|d'accord|parfait|cool|nice|got it|understood|tell me about|what is a |how does .{0,10} work)/i;

export const DISABLE_PATTERNS =
  /^.{0,50}\b(stop|disable|remove|hide|arr\u00eate|d\u00e9sactive|enl\u00e8ve)\b.{0,20}\bauto.?eta\b/i;

const CODING_TERMS = /\b(implement|refactor|code|module|function|file)\b/i;

export type AutoEtaDecision =
  | { action: 'inject'; injection: string; prediction: LastEtaPrediction }
  | { action: 'cooldown' }
  | { action: 'skip' };

/** Check if the user wants to disable auto-eta via natural language. */
export function checkDisableRequest(prompt: string): boolean {
  return DISABLE_PATTERNS.test(prompt) && !CODING_TERMS.test(prompt);
}

/** Minimal prefs shape needed by auto-eta — compatible with both v1 and v2 */
export interface AutoEtaPrefs {
  auto_eta: boolean;
  prompts_since_last_eta: number;
  last_eta_task_id?: string | null | undefined;
}

/** Evaluate whether to inject an auto-ETA. Pure function — no I/O. */
export function evaluateAutoEta(params: {
  prefs: AutoEtaPrefs;
  stats: ProjectStats;
  etaAccuracy: Record<string, { hits: number; misses: number }>;
  classification: TaskClassification;
  prompt: string;
  taskId: string;
}): AutoEtaDecision {
  const { prefs, stats, etaAccuracy, classification, prompt, taskId } = params;

  // 1. Master switch
  if (!prefs.auto_eta) return { action: 'skip' };

  // 2. Not "other"
  if (classification === 'other') return { action: 'skip' };

  // 3. Min type tasks
  const clsStats = stats.byClassification.find((s) => s.classification === classification);
  if (!clsStats || clsStats.count < MIN_TYPE_TASKS) return { action: 'skip' };

  // 4. Not conversational
  if (prompt.length < 20 || CONVERSATIONAL_PATTERNS.test(prompt)) return { action: 'skip' };

  // 5. Compute estimate
  const complexity = scorePromptComplexity(prompt);
  const estimate = estimateTask(stats, classification, complexity);

  // 6. Volatility adjustment (no mutation — create new object)
  const adjusted =
    clsStats.volatility === 'high'
      ? {
          ...estimate,
          low: Math.max(1, Math.round(estimate.low / HIGH_VOL_INTERVAL_MULT)),
          high: Math.round(estimate.high * HIGH_VOL_INTERVAL_MULT),
        }
      : estimate;
  const confidence = clsStats.volatility === 'high' ? HIGH_VOL_CONFIDENCE : NORMAL_CONFIDENCE;

  // 7. Interval sanity
  if (adjusted.high > adjusted.low * MAX_INTERVAL_RATIO) return { action: 'skip' };

  // 8. Per-type accuracy gate
  const acc = etaAccuracy[classification];
  if (acc) {
    const total = acc.hits + acc.misses;
    if (total >= ACCURACY_MIN_PREDICTIONS && acc.misses / total > ACCURACY_MIN_RATE) {
      return { action: 'skip' };
    }
  }

  // 9. Cooldown
  const isNewTask = prefs.last_eta_task_id !== taskId;
  if (!isNewTask && prefs.prompts_since_last_eta < COOLDOWN_INTERVAL) {
    return { action: 'cooldown' };
  }

  // All conditions pass — build injection
  const injection =
    `[claude-eta auto-eta] At the very start of your response, display a single ETA line in the SAME LANGUAGE as the user's prompt:\n` +
    `"\u23F1 Estimated: ${fmtSec(adjusted.low)}\u2013${fmtSec(adjusted.high)} (${confidence}%, based on ${clsStats.count} similar ${classification} tasks)"\n` +
    `Adapt the word "Estimated" to the user's language (e.g. "Estim\u00e9" in French, "Gesch\u00e4tzt" in German).\n` +
    `Do not elaborate on it, do not caveat it, do not discuss it unless the user asks.`;

  const prediction: LastEtaPrediction = {
    low: adjusted.low,
    high: adjusted.high,
    classification,
    task_id: taskId,
    timestamp: new Date().toISOString(),
  };

  return { action: 'inject', injection, prediction };
}
