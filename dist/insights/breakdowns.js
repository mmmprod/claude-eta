import { median, groupBy } from './types.js';
// ── Helpers ──────────────────────────────────────────────────
/** Strip date suffix from model IDs: claude-sonnet-4-20250514 -> claude-sonnet-4 */
function normalizeModel(model) {
    return model.replace(/-\d{8}$/, '');
}
// ── Insights ─────────────────────────────────────────────────
/** Insight 2: File operation ratios by classification */
export function fileOperationRatios(tasks) {
    if (tasks.length < 5)
        return null;
    const groups = groupBy(tasks, (t) => t.classification);
    const byClassification = [];
    for (const [cls, entries] of groups) {
        if (entries.length < 5)
            continue;
        const avgReads = Math.round(entries.reduce((s, t) => s + t.files_read, 0) / entries.length);
        const avgEdits = Math.round(entries.reduce((s, t) => s + t.files_edited, 0) / entries.length);
        const avgCreates = Math.round(entries.reduce((s, t) => s + t.files_created, 0) / entries.length);
        const totalOpsAvg = avgReads + avgEdits + avgCreates;
        if (totalOpsAvg === 0)
            continue;
        const writeOps = Math.max(avgEdits + avgCreates, 1);
        const explorationIndex = Math.min(Math.round((avgReads / writeOps) * 10) / 10, 10);
        byClassification.push({
            classification: cls,
            count: entries.length,
            avgReads,
            avgEdits,
            avgCreates,
            explorationIndex,
        });
    }
    if (byClassification.length === 0)
        return null;
    byClassification.sort((a, b) => b.count - a.count);
    return {
        kind: 'file-ops',
        byClassification,
        sampleSize: tasks.length,
    };
}
/** Insight 3: Compare performance across models */
export function perModelComparison(tasks) {
    const valid = tasks.filter((t) => t.model && t.model.length > 0);
    if (valid.length < 10)
        return null;
    const groups = groupBy(valid, (t) => normalizeModel(t.model));
    const byModel = [];
    for (const [model, entries] of groups) {
        if (entries.length < 5)
            continue;
        const sortedDur = entries.map((t) => t.duration_seconds).sort((a, b) => a - b);
        const sortedTools = entries.map((t) => t.tool_calls).sort((a, b) => a - b);
        byModel.push({
            model,
            count: entries.length,
            medianDuration: median(sortedDur),
            medianToolCalls: median(sortedTools),
        });
    }
    if (byModel.length < 2)
        return null;
    byModel.sort((a, b) => a.medianDuration - b.medianDuration);
    const fastestModel = byModel[0].model;
    return {
        kind: 'model-comparison',
        byModel,
        fastestModel,
        sampleSize: valid.length,
    };
}
/** Insight 8: Efficiency scoring — seconds per tool call, tools per file */
export function efficiencyScoring(tasks) {
    const valid = tasks.filter((t) => t.tool_calls > 0);
    if (valid.length < 5)
        return null;
    const groups = groupBy(valid, (t) => t.classification);
    const byClassification = [];
    for (const [cls, entries] of groups) {
        if (entries.length < 5)
            continue;
        const secsPerTool = entries.map((t) => t.duration_seconds / t.tool_calls).sort((a, b) => a - b);
        const toolsPerFile = entries
            .map((t) => {
            const fileOps = Math.max(t.files_read + t.files_edited + t.files_created, 1);
            return t.tool_calls / fileOps;
        })
            .sort((a, b) => a - b);
        byClassification.push({
            classification: cls,
            count: entries.length,
            medianSecsPerTool: Math.round(median(secsPerTool) * 10) / 10,
            medianToolsPerFile: Math.round(median(toolsPerFile) * 10) / 10,
        });
    }
    if (byClassification.length === 0)
        return null;
    byClassification.sort((a, b) => b.count - a.count);
    return {
        kind: 'efficiency',
        byClassification,
        sampleSize: valid.length,
    };
}
//# sourceMappingURL=breakdowns.js.map