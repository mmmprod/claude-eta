/**
 * SessionStart hook — injects passive velocity context for the project.
 * Fires on startup/resume/clear/compact so Claude always has calibration data.
 * Also updates project metadata (file count, LOC bucket) for analytics.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdin } from '../stdin.js';
import { loadProject, saveProject } from '../store.js';
import { computeStats, formatStatsContext, CALIBRATION_THRESHOLD } from '../stats.js';
import { locBucket } from '../anonymize.js';
import { ensureEtaCommandAlias } from '../command-alias.js';
const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '__pycache__',
    'vendor',
    '.cache',
    '.turbo',
    '.output',
]);
const MAX_FILES = 50_000;
function pluginRootFromImportMeta(importMetaUrl) {
    return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '../..');
}
/** Count source files and total bytes for LOC estimation */
function countSourceFiles(dir) {
    let fileCount = 0;
    let totalBytes = 0;
    function walk(d) {
        if (fileCount >= MAX_FILES)
            return;
        let entries;
        try {
            entries = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (fileCount >= MAX_FILES)
                return;
            if (entry.isDirectory()) {
                if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                    walk(path.join(d, entry.name));
                }
            }
            else if (entry.isFile()) {
                fileCount++;
                try {
                    totalBytes += fs.statSync(path.join(d, entry.name)).size;
                }
                catch {
                    /* skip unreadable files */
                }
            }
        }
    }
    walk(dir);
    return { fileCount, totalBytes };
}
async function main() {
    const stdin = await readStdin();
    ensureEtaCommandAlias(pluginRootFromImportMeta(import.meta.url));
    const cwd = stdin?.cwd;
    if (!cwd)
        return;
    const project = path.basename(cwd);
    const data = loadProject(project);
    const completed = data.tasks.filter((t) => t.duration_seconds != null).length;
    // Update project metadata (file count, LOC bucket)
    const { fileCount, totalBytes } = countSourceFiles(cwd);
    const estimatedLoc = Math.round(totalBytes / 40);
    data.file_count = fileCount;
    data.loc_bucket = locBucket(estimatedLoc);
    saveProject(data);
    if (completed === 0) {
        // First-run welcome
        process.stdout.write(`[claude-eta] Plugin active — tracking task durations. Data is 100% local.\n` +
            `Calibration: 0/${CALIBRATION_THRESHOLD} tasks. Estimates unlock after a few completed tasks.`);
        return;
    }
    if (completed < CALIBRATION_THRESHOLD) {
        // Cold start progress
        process.stdout.write(`[claude-eta] Calibration: ${completed}/${CALIBRATION_THRESHOLD} tasks recorded. Estimates improving with each task.`);
        return;
    }
    // Calibrated — inject full velocity context
    const stats = computeStats(data.tasks);
    if (!stats)
        return;
    let context = formatStatsContext(stats);
    // One-time hint about community features (shown between tasks 5-7)
    if (completed >= CALIBRATION_THRESHOLD && completed <= CALIBRATION_THRESHOLD + 2) {
        context +=
            '\nTip: run `/eta compare` to see how your pace compares to the community, or `/claude-eta:eta compare` if the shortcut is not loaded yet.';
    }
    process.stdout.write(context);
}
void main();
//# sourceMappingURL=on-session-start.js.map