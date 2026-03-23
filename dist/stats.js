import { normalizeModel } from './anonymize.js';
import { estimateInitial, toTaskEstimate } from './estimator.js';
// ── Constants ─────────────────────────────────────────────────
/** Minimum completed tasks before real stats kick in */
export const CALIBRATION_THRESHOLD = 5;
/** Injected when auto-ETA is active — prescriptive, no "do not volunteer" (would contradict auto-injection) */
export const PRESCRIPTIVE_ETA_GUIDANCE = 'RULES FOR TIME ESTIMATES: Use ONLY the data above. Never guess durations. Format: "[type] tasks take [p25]-[p75] (median [median], [N] measured)."';
/**
 * Hand-tuned initial priors for cold-start estimation.
 * These are rough order-of-magnitude values based on typical Claude Code tasks.
 * They are progressively replaced by real project data via shrinkage blending.
 * Will be superseded by community baselines when Layer 3 has sufficient volume.
 */
export const INITIAL_PRIORS = {
    bugfix: { low: 300, median: 600, high: 900 }, // 5–15min
    feature: { low: 900, median: 1800, high: 2700 }, // 15–45min
    refactor: { low: 300, median: 600, high: 1200 }, // 5–20min
    config: { low: 120, median: 180, high: 300 }, // 2–5min
    docs: { low: 120, median: 300, high: 600 }, // 2–10min
    test: { low: 180, median: 480, high: 900 }, // 3–15min
    debug: { low: 180, median: 480, high: 1200 }, // 3–20min
    review: { low: 60, median: 180, high: 480 }, // 1–8min
    other: { low: 30, median: 60, high: 180 }, // 30s–3min
};
function sortedDurations(tasks) {
    return sortedValues(tasks.filter((t) => t.duration_seconds != null && t.duration_seconds > 0).map((t) => t.duration_seconds));
}
function sortedValues(values) {
    return values
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.max(1, Math.round(value)))
        .sort((a, b) => a - b);
}
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    if (sorted.length === 1)
        return sorted[0];
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper)
        return sorted[lower];
    return Math.round(sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]));
}
function volatility(median, iqr) {
    if (median === 0)
        return 'low';
    const ratio = iqr / median;
    if (ratio < 0.5)
        return 'low';
    if (ratio < 1.5)
        return 'medium';
    return 'high';
}
export function computeStats(tasks) {
    const durations = sortedDurations(tasks);
    if (durations.length < 5)
        return null; // Not enough data
    const overall = {
        median: percentile(durations, 50),
        p25: percentile(durations, 25),
        p75: percentile(durations, 75),
        p80: percentile(durations, 80),
    };
    // Group by classification
    const groups = new Map();
    for (const t of tasks) {
        if (t.duration_seconds == null || !Number.isFinite(t.duration_seconds) || t.duration_seconds <= 0)
            continue;
        const list = groups.get(t.classification) ?? [];
        list.push(t);
        groups.set(t.classification, list);
    }
    const byClassification = [];
    for (const [cls, entries] of groups) {
        if (entries.length < 2)
            continue; // Need at least 2 for meaningful stats
        const sorted = sortedDurations(entries);
        const med = percentile(sorted, 50);
        const p25 = percentile(sorted, 25);
        const p75 = percentile(sorted, 75);
        const p80 = percentile(sorted, 80);
        byClassification.push({
            classification: cls,
            count: entries.length,
            median: med,
            p25,
            p75,
            p80,
            volatility: volatility(med, p75 - p25),
        });
    }
    // Sort by count descending
    byClassification.sort((a, b) => b.count - a.count);
    const modelGroups = new Map();
    for (const task of tasks) {
        if (task.duration_seconds == null || !Number.isFinite(task.duration_seconds) || task.duration_seconds <= 0)
            continue;
        if (!task.model)
            continue;
        const normalizedModel = normalizeModel(task.model);
        const key = `${task.classification}:${normalizedModel}`;
        const list = modelGroups.get(key) ?? [];
        list.push(task);
        modelGroups.set(key, list);
    }
    const byClassificationModel = [];
    for (const [key, entries] of modelGroups) {
        if (entries.length < 2)
            continue;
        const sorted = sortedDurations(entries);
        const med = percentile(sorted, 50);
        const p25 = percentile(sorted, 25);
        const p75 = percentile(sorted, 75);
        const p80 = percentile(sorted, 80);
        const [classification, model] = key.split(':', 2);
        byClassificationModel.push({
            classification,
            model,
            count: entries.length,
            median: med,
            p25,
            p75,
            p80,
            volatility: volatility(med, p75 - p25),
        });
    }
    byClassificationModel.sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        if (a.classification !== b.classification)
            return a.classification.localeCompare(b.classification);
        return a.model.localeCompare(b.model);
    });
    const phaseGroups = new Map();
    const phaseModelGroups = new Map();
    for (const task of tasks) {
        if (task.duration_seconds == null || !Number.isFinite(task.duration_seconds) || task.duration_seconds <= 0)
            continue;
        const phaseSamples = [
            ['edit', task.first_edit_offset_seconds],
            ['validate', task.first_bash_offset_seconds],
        ];
        const normalizedModel = task.model ? normalizeModel(task.model) : null;
        for (const [phase, offset] of phaseSamples) {
            if (offset == null || offset < 0 || offset >= task.duration_seconds)
                continue;
            const remaining = task.duration_seconds - offset;
            const phaseKey = `${phase}|${task.classification}`;
            const phaseList = phaseGroups.get(phaseKey) ?? [];
            phaseList.push(remaining);
            phaseGroups.set(phaseKey, phaseList);
            if (normalizedModel) {
                const modelKey = `${phase}|${task.classification}|${normalizedModel}`;
                const modelList = phaseModelGroups.get(modelKey) ?? [];
                modelList.push(remaining);
                phaseModelGroups.set(modelKey, modelList);
            }
        }
    }
    const byClassificationPhase = [];
    for (const [key, values] of phaseGroups) {
        if (values.length < 2)
            continue;
        const sorted = sortedValues(values);
        const med = percentile(sorted, 50);
        const p25 = percentile(sorted, 25);
        const p75 = percentile(sorted, 75);
        const p80 = percentile(sorted, 80);
        const [phase, classification] = key.split('|', 2);
        byClassificationPhase.push({
            phase,
            classification,
            count: values.length,
            median: med,
            p25,
            p75,
            p80,
            volatility: volatility(med, p75 - p25),
        });
    }
    byClassificationPhase.sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        if (a.phase !== b.phase)
            return a.phase.localeCompare(b.phase);
        return a.classification.localeCompare(b.classification);
    });
    const byClassificationModelPhase = [];
    for (const [key, values] of phaseModelGroups) {
        if (values.length < 2)
            continue;
        const sorted = sortedValues(values);
        const med = percentile(sorted, 50);
        const p25 = percentile(sorted, 25);
        const p75 = percentile(sorted, 75);
        const p80 = percentile(sorted, 80);
        const [phase, classification, model] = key.split('|', 3);
        byClassificationModelPhase.push({
            phase,
            classification,
            model,
            count: values.length,
            median: med,
            p25,
            p75,
            p80,
            volatility: volatility(med, p75 - p25),
        });
    }
    byClassificationModelPhase.sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        if (a.phase !== b.phase)
            return a.phase.localeCompare(b.phase);
        if (a.classification !== b.classification)
            return a.classification.localeCompare(b.classification);
        return a.model.localeCompare(b.model);
    });
    return {
        totalCompleted: durations.length,
        overall,
        byClassification,
        byClassificationModel,
        byClassificationPhase,
        byClassificationModelPhase,
    };
}
// ── Task estimation ───────────────────────────────────────────
/** Score prompt complexity 1-5 based on length, file mentions, and scope */
export function scorePromptComplexity(prompt) {
    let score = 1;
    // Length factor
    if (prompt.length > 200)
        score += 1;
    if (prompt.length > 500)
        score += 1;
    // File/path mentions
    const fileMentions = (prompt.match(/\b[\w./-]+\.(ts|js|tsx|jsx|json|md|css|html|py|go|rs|yaml|yml|toml)\b/gi) || [])
        .length;
    if (fileMentions >= 2)
        score += 1;
    if (fileMentions >= 5)
        score += 1;
    // Broad scope words
    if (/\b(all|every|entire|whole|across|throughout|each|multiple|several|many|everything)\b/i.test(prompt))
        score += 1;
    return Math.min(score, 5);
}
/** Estimate duration using shrinkage quantile blending (v2 estimator) */
export function estimateTask(stats, classification, complexity, context) {
    const est = estimateInitial(stats, classification, complexity, context);
    return toTaskEstimate(est, complexity);
}
/** Estimate from initial priors or community baselines (cold start, before real data exists) */
export function getDefaultEstimate(classification, complexity, context) {
    const est = estimateInitial(null, classification, complexity, context);
    return toTaskEstimate(est, complexity);
}
// ── Formatting ────────────────────────────────────────────────
export function fmtSec(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min < 60)
        return sec > 0 ? `${min}m${sec}s` : `${min}m`;
    const hr = Math.floor(min / 60);
    const remainMin = min % 60;
    return remainMin > 0 ? `${hr}h${remainMin}m` : `${hr}h`;
}
/** Format stats as a concise context string for Claude injection */
export function formatStatsContext(stats, estimate, estimateLabel = 'Current task estimate', options) {
    const lines = [
        `[claude-eta] Project velocity (${stats.totalCompleted} completed tasks):`,
        `Overall: median ${fmtSec(stats.overall.median)}, range ${fmtSec(stats.overall.p25)}–${fmtSec(stats.overall.p75)}`,
    ];
    for (const s of stats.byClassification) {
        lines.push(`${s.classification}: median ${fmtSec(s.median)} (${fmtSec(s.p25)}–${fmtSec(s.p75)}, ${s.volatility} volatility, ${s.count} tasks)`);
    }
    if (estimate) {
        const vol = estimate.volatility === 'high' ? ' — high volatility, wide range expected' : '';
        lines.push(`→ ${estimateLabel}: ${fmtSec(estimate.low)}–${fmtSec(estimate.high)} (${estimate.confidence}% confidence, ${estimate.basis}${vol})`);
    }
    lines.push(options?.autoEtaActive
        ? PRESCRIPTIVE_ETA_GUIDANCE
        : 'Use these project stats to calibrate any time estimates. Do not volunteer time estimates unless the user asks.');
    return lines.join('\n');
}
/** Format context during cold start (< CALIBRATION_THRESHOLD tasks) */
export function formatColdStartContext(estimate, tasksCompleted, estimateLabel = 'Current task estimate', options) {
    const isCommunity = options?.isCommunity ?? estimate.basis.startsWith('community ');
    const calibrationLine = isCommunity
        ? `[claude-eta] Calibration: ${tasksCompleted}/${CALIBRATION_THRESHOLD} tasks recorded. Using community baselines until calibrated.`
        : `[claude-eta] Calibration: ${tasksCompleted}/${CALIBRATION_THRESHOLD} tasks recorded. Estimates become project-specific after ${CALIBRATION_THRESHOLD} tasks.`;
    const guidanceLine = options?.autoEtaActive
        ? PRESCRIPTIVE_ETA_GUIDANCE
        : isCommunity
            ? 'Use these community baselines to calibrate any time estimates. Do not volunteer time estimates unless the user asks.'
            : 'Use these initial priors to calibrate any time estimates. Do not volunteer time estimates unless the user asks.';
    const lines = [
        calibrationLine,
        `→ ${estimateLabel}: ${fmtSec(estimate.low)}–${fmtSec(estimate.high)} (${estimate.confidence}% confidence, ${estimate.basis} — not calibrated to this project yet)`,
        guidanceLine,
    ];
    return lines.join('\n');
}
/** One-line recap of the last completed task */
export function formatTaskRecap(info) {
    const parts = [];
    if (info.tool_calls > 0)
        parts.push(`${info.tool_calls} tool calls`);
    const fileOps = info.files_read + info.files_edited + info.files_created;
    if (fileOps > 0)
        parts.push(`${fileOps} files`);
    const detail = parts.length > 0 ? `, ${parts.join(', ')}` : '';
    return `[claude-eta] Previous task completed: ${info.classification}, ${fmtSec(info.duration_seconds)}${detail}`;
}
//# sourceMappingURL=stats.js.map