/**
 * Offline evaluator for ETA calibration.
 * Replays completed work items in chronological order with walk-forward stats,
 * so each estimate only sees history that would have existed at prediction time.
 */
import { normalizeModel } from './anonymize.js';
import { estimateInitial, estimateWithTrace } from './estimator.js';
import { computeStats } from './stats.js';
const BREAKDOWN_MIN_SAMPLES = 3;
function compareTasks(left, right) {
    if (left.timestamp_start !== right.timestamp_start)
        return left.timestamp_start.localeCompare(right.timestamp_start);
    const leftEnd = left.timestamp_end ?? '';
    const rightEnd = right.timestamp_end ?? '';
    if (leftEnd !== rightEnd)
        return leftEnd.localeCompare(rightEnd);
    return left.analytics_id.localeCompare(right.analytics_id);
}
function emptyBuckets() {
    return {
        prompt: [],
        first_edit: [],
        first_bash: [],
    };
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
    return sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]);
}
function roundPct(value) {
    return value == null ? null : Math.round(value * 10) / 10;
}
function summarizeStage(observations) {
    if (observations.length === 0) {
        return {
            sample_count: 0,
            mdape_pct: null,
            p80_coverage_pct: null,
        };
    }
    const sortedErrors = observations.map((obs) => obs.ape_pct).sort((a, b) => a - b);
    const covered = observations.filter((obs) => obs.covered).length;
    return {
        sample_count: observations.length,
        mdape_pct: roundPct(percentile(sortedErrors, 50)),
        p80_coverage_pct: roundPct((covered / observations.length) * 100),
    };
}
function summarizeBuckets(buckets) {
    return {
        prompt: summarizeStage(buckets.prompt),
        first_edit: summarizeStage(buckets.first_edit),
        first_bash: summarizeStage(buckets.first_bash),
    };
}
function pushObservation(target, stage, predictedP50, predictedP80, actual) {
    if (!Number.isFinite(actual) || actual <= 0)
        return;
    const apePct = (Math.abs(predictedP50 - actual) / Math.max(1, actual)) * 100;
    target[stage].push({
        ape_pct: apePct,
        covered: actual <= predictedP80,
    });
}
function getBreakdownBuckets(map, key) {
    const existing = map.get(key);
    if (existing)
        return existing;
    const created = emptyBuckets();
    map.set(key, created);
    return created;
}
function summarizeBreakdown(map) {
    return [...map.entries()]
        .map(([key, buckets]) => {
        const summary = summarizeBuckets(buckets);
        return {
            key,
            sample_count: summary.prompt.sample_count,
            prompt: summary.prompt,
            first_edit: summary.first_edit,
            first_bash: summary.first_bash,
        };
    })
        .filter((row) => row.sample_count >= BREAKDOWN_MIN_SAMPLES)
        .sort((left, right) => {
        if (right.sample_count !== left.sample_count)
            return right.sample_count - left.sample_count;
        return left.key.localeCompare(right.key);
    });
}
export function evaluateTasks(tasks) {
    const ordered = tasks
        .filter((task) => task.runner_kind === 'main' && task.duration_seconds != null && task.duration_seconds > 0)
        .slice()
        .sort(compareTasks);
    const overall = emptyBuckets();
    const byClassification = new Map();
    const byClassificationModel = new Map();
    const history = [];
    for (const task of ordered) {
        const actualDuration = task.duration_seconds;
        if (actualDuration == null || actualDuration <= 0) {
            history.push(task);
            continue;
        }
        const stats = computeStats(history);
        if (!stats) {
            history.push(task);
            continue;
        }
        const initial = estimateInitial(stats, task.classification, task.prompt_complexity, {
            model: task.model,
        });
        pushObservation(overall, 'prompt', initial.p50_wall, initial.p80_wall, actualDuration);
        pushObservation(getBreakdownBuckets(byClassification, task.classification), 'prompt', initial.p50_wall, initial.p80_wall, actualDuration);
        const normalizedModel = normalizeModel(task.model);
        if (normalizedModel) {
            pushObservation(getBreakdownBuckets(byClassificationModel, `${task.classification} on ${normalizedModel}`), 'prompt', initial.p50_wall, initial.p80_wall, actualDuration);
        }
        if (task.first_edit_offset_seconds != null &&
            task.first_edit_offset_seconds >= 0 &&
            task.first_edit_offset_seconds < actualDuration) {
            const remaining = actualDuration - task.first_edit_offset_seconds;
            const refined = estimateWithTrace(initial, task.first_edit_offset_seconds, 'edit', {
                stats,
                classification: task.classification,
                model: task.model,
            });
            pushObservation(overall, 'first_edit', refined.remaining_p50, refined.remaining_p80, remaining);
            pushObservation(getBreakdownBuckets(byClassification, task.classification), 'first_edit', refined.remaining_p50, refined.remaining_p80, remaining);
            if (normalizedModel) {
                pushObservation(getBreakdownBuckets(byClassificationModel, `${task.classification} on ${normalizedModel}`), 'first_edit', refined.remaining_p50, refined.remaining_p80, remaining);
            }
        }
        if (task.first_bash_offset_seconds != null &&
            task.first_bash_offset_seconds >= 0 &&
            task.first_bash_offset_seconds < actualDuration) {
            const remaining = actualDuration - task.first_bash_offset_seconds;
            const refined = estimateWithTrace(initial, task.first_bash_offset_seconds, 'validate', {
                stats,
                classification: task.classification,
                model: task.model,
            });
            pushObservation(overall, 'first_bash', refined.remaining_p50, refined.remaining_p80, remaining);
            pushObservation(getBreakdownBuckets(byClassification, task.classification), 'first_bash', refined.remaining_p50, refined.remaining_p80, remaining);
            if (normalizedModel) {
                pushObservation(getBreakdownBuckets(byClassificationModel, `${task.classification} on ${normalizedModel}`), 'first_bash', refined.remaining_p50, refined.remaining_p80, remaining);
            }
        }
        history.push(task);
    }
    return {
        total_tasks: ordered.length,
        overall: summarizeBuckets(overall),
        byClassification: summarizeBreakdown(byClassification),
        byClassificationModel: summarizeBreakdown(byClassificationModel),
    };
}
function fmtMetric(metrics) {
    if (metrics.sample_count === 0 || metrics.mdape_pct == null || metrics.p80_coverage_pct == null)
        return '-';
    return `${metrics.mdape_pct.toFixed(1)}% / ${metrics.p80_coverage_pct.toFixed(1)}%`;
}
function fmtOverallMetrics(metrics) {
    return [
        String(metrics.sample_count),
        metrics.mdape_pct == null ? '-' : `${metrics.mdape_pct.toFixed(1)}%`,
        metrics.p80_coverage_pct == null ? '-' : `${metrics.p80_coverage_pct.toFixed(1)}%`,
    ];
}
function pad(value, width) {
    return value.length >= width ? value.slice(0, width) : value.padEnd(width);
}
function renderBreakdown(title, rows) {
    if (rows.length === 0)
        return [];
    return [
        `### ${title}`,
        '',
        'Cell format: `MdAPE / P80 coverage`',
        '',
        '| Bucket                     | N   | Prompt           | First edit       | First bash       |',
        '|----------------------------|-----|------------------|------------------|------------------|',
        ...rows.map((row) => `| ${pad(row.key, 26)} | ${pad(String(row.sample_count), 3)} | ${pad(fmtMetric(row.prompt), 16)} | ${pad(fmtMetric(row.first_edit), 16)} | ${pad(fmtMetric(row.first_bash), 16)} |`),
        '',
    ];
}
export function formatEvaluationReport(report) {
    if (report.total_tasks === 0) {
        return 'No completed main work items yet.';
    }
    const lines = [
        '## Predictor Evaluation',
        '',
        `Walk-forward replay over ${report.total_tasks} completed main work items.`,
        'Metrics start once project calibration exists (after the first 5 completed work items).',
        '',
        '| Stage       | Samples | MdAPE | P80 coverage |',
        '|-------------|---------|-------|--------------|',
    ];
    for (const stage of ['prompt', 'first_edit', 'first_bash']) {
        const [samples, mdape, coverage] = fmtOverallMetrics(report.overall[stage]);
        lines.push(`| ${pad(stage, 11)} | ${pad(samples, 7)} | ${pad(mdape, 5)} | ${pad(coverage, 12)} |`);
    }
    lines.push('');
    lines.push(...renderBreakdown('By Classification', report.byClassification));
    lines.push(...renderBreakdown('By Classification + Model', report.byClassificationModel.slice(0, 8)));
    return lines.join('\n').trimEnd();
}
//# sourceMappingURL=eval.js.map