import { estimateTask, scorePromptComplexity, fmtSec } from './stats.js';
export const MIN_TYPE_TASKS = 5;
export const HIGH_VOL_INTERVAL_MULT = 1.5;
export const HIGH_VOL_CONFIDENCE_PENALTY = 15;
export const MAX_INTERVAL_RATIO = 5;
export const COOLDOWN_INTERVAL = 5;
export const AUTO_ACTIVATE_THRESHOLD = 10;
export const ACCURACY_MIN_PREDICTIONS = 10;
export const ACCURACY_MIN_RATE = 0.5;
const ANSI_CYAN = '\u001b[36m';
const ANSI_DIM = '\u001b[2m';
const ANSI_RESET = '\u001b[0m';
/** Loose conversational pattern — matches prompts starting with acknowledgements.
 *  Permissive (prefix match): used to skip ETA injection, where false positives are cheap.
 *  See also CONTINUATION_PATTERNS in classify.ts (strict end-anchored, for turn continuation). */
export const CONVERSATIONAL_PATTERNS = /^(merci|thanks|ok|oui|yes|non|no|continue|go|sure|d'accord|parfait|cool|nice|got it|understood|tell me about|what is a |how does .{0,10} work)/i;
export const DISABLE_PATTERNS = /^.{0,50}\b(stop|disable|remove|hide|arr\u00eate|d\u00e9sactive|enl\u00e8ve)\b.{0,20}\bauto.?eta\b/i;
const CODING_TERMS = /\b(implement|refactor|code|module|function|file)\b/i;
/** Check if the user wants to disable auto-eta via natural language. */
export function checkDisableRequest(prompt) {
    return DISABLE_PATTERNS.test(prompt) && !CODING_TERMS.test(prompt);
}
function formatAutoEtaExample(low, high, confidence, count, classification) {
    return (`${ANSI_CYAN}\u23F1 Estimated: ${fmtSec(low)}\u2013${fmtSec(high)}${ANSI_RESET} ` +
        `${ANSI_DIM}(${confidence}%, based on ${count} similar ${classification} tasks)${ANSI_RESET}`);
}
/** Check if auto-ETA should activate dynamically for this classification. Pure function. */
export function shouldAutoActivate(prefs, stats, classification) {
    if (prefs.auto_eta_explicitly_set)
        return false;
    if (classification === 'other')
        return false;
    const clsStats = stats.byClassification.find((s) => s.classification === classification);
    if (!clsStats || clsStats.count < AUTO_ACTIVATE_THRESHOLD)
        return false;
    if (clsStats.volatility === 'high')
        return false;
    return true;
}
/** Evaluate whether to inject an auto-ETA. Pure function — no I/O. */
export function evaluateAutoEta(params) {
    const { prefs, stats, etaAccuracy, classification, prompt, taskId, model } = params;
    // 1. Master switch
    if (!prefs.auto_eta)
        return { action: 'skip' };
    // 2. Not "other"
    if (classification === 'other')
        return { action: 'skip' };
    // 3. Min type tasks
    const clsStats = stats.byClassification.find((s) => s.classification === classification);
    if (!clsStats || clsStats.count < MIN_TYPE_TASKS)
        return { action: 'skip' };
    // 4. Not conversational
    if (prompt.length < 20 || CONVERSATIONAL_PATTERNS.test(prompt))
        return { action: 'skip' };
    // 5. Compute estimate (pass model for model-specific calibration)
    const complexity = scorePromptComplexity(prompt);
    const estimate = estimateTask(stats, classification, complexity, { model });
    // 6. Volatility adjustment (no mutation — create new object)
    const adjusted = clsStats.volatility === 'high'
        ? {
            ...estimate,
            low: Math.max(1, Math.round(estimate.low / HIGH_VOL_INTERVAL_MULT)),
            high: Math.round(estimate.high * HIGH_VOL_INTERVAL_MULT),
        }
        : estimate;
    // Derive confidence from the estimator's calibration level (already mapped from CalibrationLevel)
    const confidence = clsStats.volatility === 'high'
        ? Math.max(10, estimate.confidence - HIGH_VOL_CONFIDENCE_PENALTY)
        : estimate.confidence;
    // 7. Interval sanity
    if (adjusted.high > adjusted.low * MAX_INTERVAL_RATIO)
        return { action: 'skip' };
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
    const exampleLine = formatAutoEtaExample(adjusted.low, adjusted.high, confidence, clsStats.count, classification);
    const injection = `[claude-eta auto-eta] At the very start of your response, display a single ETA line in the SAME LANGUAGE as the user's prompt, using ANSI terminal colors in this exact pattern:\n` +
        `"${exampleLine}"\n` +
        `Adapt only the word "Estimated" to the user's language (e.g. "Estim\u00e9" in French, "Gesch\u00e4tzt" in German), but keep the ANSI color pattern identical: cyan for the ETA range, dim for the parenthetical details.\n` +
        `Do not elaborate on it, do not caveat it, do not discuss it unless the user asks.`;
    const prediction = {
        low: adjusted.low,
        high: adjusted.high,
        classification,
        task_id: taskId,
        timestamp: new Date().toISOString(),
    };
    return { action: 'inject', injection, prediction };
}
//# sourceMappingURL=auto-eta.js.map