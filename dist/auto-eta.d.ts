/**
 * Auto-ETA decision module — pure functions, zero I/O.
 * Mirrors detector.ts pattern: called by on-prompt.ts hook.
 */
import type { LastEtaPrediction, TaskClassification } from './types.js';
import type { ProjectStats } from './stats.js';
import { type TaskEstimate } from './stats.js';
export declare const MIN_TYPE_TASKS = 5;
export declare const HIGH_VOL_INTERVAL_MULT = 1.5;
export declare const HIGH_VOL_CONFIDENCE_PENALTY = 15;
export declare const OTHER_CONFIDENCE_PENALTY = 10;
export declare const MAX_INTERVAL_RATIO = 5;
export declare const MAX_DISPLAY_RATIO = 8;
export declare const MIN_CONFIDENCE = 25;
export declare const COOLDOWN_INTERVAL = 5;
export declare const AUTO_ACTIVATE_THRESHOLD = 10;
export declare const ACCURACY_MIN_PREDICTIONS = 10;
export declare const ACCURACY_MIN_RATE = 0.5;
/** Loose conversational pattern — matches prompts starting with acknowledgements.
 *  Permissive (prefix match): used to skip ETA injection, where false positives are cheap.
 *  See also CONTINUATION_PATTERNS in classify.ts (strict end-anchored, for turn continuation). */
export declare const CONVERSATIONAL_PATTERNS: RegExp;
export declare const DISABLE_PATTERNS: RegExp;
export type AutoEtaDecision = {
    action: 'inject';
    injection: string;
    prediction: LastEtaPrediction;
} | {
    action: 'cooldown';
} | {
    action: 'skip';
};
/** Check if the user wants to disable auto-eta via natural language. */
export declare function checkDisableRequest(prompt: string): boolean;
/** Minimal prefs shape needed by auto-eta — compatible with both v1 and v2 */
export interface AutoEtaPrefs {
    auto_eta: boolean;
    auto_eta_explicitly_set?: boolean;
    prompts_since_last_eta: number;
    last_eta_task_id?: string | null | undefined;
}
/** Check if auto-ETA should activate dynamically for this classification. Pure function. */
export declare function shouldAutoActivate(prefs: AutoEtaPrefs, stats: ProjectStats, classification: TaskClassification): boolean;
/** Evaluate whether to inject an auto-ETA. Pure function — no I/O.
 *  When `precomputedEstimate` is provided, it is used directly instead of
 *  recomputing — this ensures the auto-ETA line matches the stats context. */
export declare function evaluateAutoEta(params: {
    prefs: AutoEtaPrefs;
    stats: ProjectStats;
    etaAccuracy: Record<string, {
        hits: number;
        misses: number;
    }>;
    classification: TaskClassification;
    prompt: string;
    taskId: string;
    model?: string | null;
    precomputedEstimate?: TaskEstimate;
}): AutoEtaDecision;
//# sourceMappingURL=auto-eta.d.ts.map