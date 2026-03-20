/**
 * Auto-ETA decision module — pure functions, zero I/O.
 * Mirrors detector.ts pattern: called by on-prompt.ts hook.
 */
import type { UserPreferences, LastEtaPrediction, TaskClassification } from './types.js';
import type { ProjectStats } from './stats.js';
export declare const MIN_TYPE_TASKS = 5;
export declare const HIGH_VOL_INTERVAL_MULT = 1.5;
export declare const HIGH_VOL_CONFIDENCE = 60;
export declare const NORMAL_CONFIDENCE = 80;
export declare const MAX_INTERVAL_RATIO = 5;
export declare const COOLDOWN_INTERVAL = 5;
export declare const ACCURACY_MIN_PREDICTIONS = 10;
export declare const ACCURACY_MIN_RATE = 0.5;
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
/** Evaluate whether to inject an auto-ETA. Pure function — no I/O. */
export declare function evaluateAutoEta(params: {
    prefs: UserPreferences;
    stats: ProjectStats;
    etaAccuracy: Record<string, {
        hits: number;
        misses: number;
    }>;
    classification: TaskClassification;
    prompt: string;
    taskId: string;
}): AutoEtaDecision;
//# sourceMappingURL=auto-eta.d.ts.map