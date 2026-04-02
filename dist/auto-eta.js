import { estimateTask, scorePromptComplexity, fmtSec } from './stats.js';
export const MIN_TYPE_TASKS = 5;
export const HIGH_VOL_INTERVAL_MULT = 1.5;
export const HIGH_VOL_CONFIDENCE_PENALTY = 15;
export const OTHER_CONFIDENCE_PENALTY = 10;
export const MAX_INTERVAL_RATIO = 5;
export const MAX_DISPLAY_RATIO = 8;
export const MIN_CONFIDENCE = 25;
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
const SLASH_COMMAND_PATTERN = /^\/[a-z0-9][\w-]*(?:\s|$)/i;
/** Check if the user wants to disable auto-eta via natural language. */
export function checkDisableRequest(prompt) {
    return DISABLE_PATTERNS.test(prompt) && !CODING_TERMS.test(prompt);
}
function isShortNonCommandPrompt(prompt) {
    const trimmed = prompt.trim();
    return trimmed.length < 20 && !SLASH_COMMAND_PATTERN.test(trimmed);
}
function formatAutoEtaExample(low, high, confidence, basis) {
    return (`${ANSI_CYAN}\u23F1 Estimated: ${fmtSec(low)}\u2013${fmtSec(high)}${ANSI_RESET} ` +
        `${ANSI_DIM}(${confidence}%, based on ${basis})${ANSI_RESET}`);
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
/** Evaluate whether to inject an auto-ETA. Pure function — no I/O.
 *  When `precomputedEstimate` is provided, it is used directly instead of
 *  recomputing — this ensures the auto-ETA line matches the stats context. */
export function evaluateAutoEta(params) {
    const { prefs, stats, etaAccuracy, classification, prompt, taskId, model, precomputedEstimate } = params;
    // 1. Master switch
    if (!prefs.auto_eta)
        return { action: 'skip' };
    // 2. Min type tasks — for "other", use overall count (catch-all has no coherent per-type distribution)
    const clsStats = stats.byClassification.find((s) => s.classification === classification);
    const effectiveCount = classification === 'other' ? stats.totalCompleted : (clsStats?.count ?? 0);
    if (effectiveCount < MIN_TYPE_TASKS)
        return { action: 'skip' };
    // 3. Not conversational
    if (isShortNonCommandPrompt(prompt) || CONVERSATIONAL_PATTERNS.test(prompt))
        return { action: 'skip' };
    // 4. Use pre-computed estimate if available, otherwise compute fresh
    const estimate = precomputedEstimate ?? estimateTask(stats, classification, scorePromptComplexity(prompt), { model });
    // 5. Interval sanity — check on RAW estimate, before volatility widening.
    //    Widening adjusts the display range but shouldn't cause rejection.
    if (estimate.high > estimate.low * MAX_INTERVAL_RATIO)
        return { action: 'skip' };
    // 6. Volatility adjustment (no mutation — create new object)
    const effectiveVolatility = clsStats?.volatility ?? 'medium';
    const adjusted = effectiveVolatility === 'high'
        ? {
            ...estimate,
            low: Math.max(1, Math.round(estimate.low / HIGH_VOL_INTERVAL_MULT)),
            high: Math.round(estimate.high * HIGH_VOL_INTERVAL_MULT),
        }
        : estimate;
    // 7. Derive confidence from the estimator's calibration level
    let confidence = estimate.confidence;
    if (effectiveVolatility === 'high')
        confidence = Math.max(10, confidence - HIGH_VOL_CONFIDENCE_PENALTY);
    if (classification === 'other')
        confidence = Math.max(10, confidence - OTHER_CONFIDENCE_PENALTY);
    // 7b. Post-widening display ratio guard — reject truly absurd displayed ranges
    if (adjusted.high > adjusted.low * MAX_DISPLAY_RATIO)
        return { action: 'skip' };
    // 7c. Confidence floor — don't show ETAs the user can't trust
    if (confidence < MIN_CONFIDENCE)
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
    // All conditions pass — build injection using estimate.basis for consistent display
    const exampleLine = formatAutoEtaExample(adjusted.low, adjusted.high, confidence, estimate.basis);
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