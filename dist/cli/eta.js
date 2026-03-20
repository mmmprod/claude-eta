#!/usr/bin/env node
/**
 * CLI for /eta command — reads project data and outputs formatted stats.
 *
 * Usage:
 *   node dist/cli/eta.js [session|history|stats] [cwd]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProject } from '../store.js';
import { showExport } from './export.js';
import { showContribute, executeContribute } from './contribute.js';
import { showCompare } from './compare.js';
const EXPORT_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'export');
const ETA_COMMAND = '/eta';
const ETA_FALLBACK_COMMAND = '/claude-eta:eta';
// ── Formatting helpers ────────────────────────────────────────
function fmtDuration(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    if (min < 60)
        return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
    const hr = Math.floor(min / 60);
    const remainMin = min % 60;
    return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`;
}
function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
/** Pad and truncate to exact column width */
function col(s, len, align = 'left') {
    const truncated = s.length > len ? s.slice(0, len) : s;
    return align === 'left' ? truncated.padEnd(len) : truncated.padStart(len);
}
// ── Modes ─────────────────────────────────────────────────────
function showSession(tasks) {
    const lastSessionId = tasks[tasks.length - 1].session_id;
    const sessionTasks = tasks.filter((t) => t.session_id === lastSessionId);
    const completed = sessionTasks.filter((t) => t.duration_seconds !== null);
    const active = sessionTasks.find((t) => t.duration_seconds === null);
    const totalSec = completed.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
    const avgSec = completed.length > 0 ? Math.round(totalSec / completed.length) : 0;
    console.log(`## Session Stats (${completed.length} tasks completed)\n`);
    console.log(`| Metric              | Value               |`);
    console.log(`|---------------------|---------------------|`);
    console.log(`| Tasks completed     | ${col(String(completed.length), 19)} |`);
    console.log(`| Total time          | ${col(fmtDuration(totalSec), 19)} |`);
    console.log(`| Avg per task        | ${col(completed.length > 0 ? fmtDuration(avgSec) : '-', 19)} |`);
    console.log(`| Total tool calls    | ${col(String(completed.reduce((s, t) => s + t.tool_calls, 0)), 19)} |`);
    console.log(`| Files read          | ${col(String(completed.reduce((s, t) => s + t.files_read, 0)), 19)} |`);
    console.log(`| Files edited        | ${col(String(completed.reduce((s, t) => s + t.files_edited, 0)), 19)} |`);
    console.log(`| Errors              | ${col(String(completed.reduce((s, t) => s + t.errors, 0)), 19)} |`);
    if (active) {
        console.log(`\n**Active task**: "${active.prompt_summary}" (${active.classification})`);
    }
}
function showHistory(tasks) {
    const recent = tasks.slice(-20).reverse();
    console.log(`## Last ${recent.length} Tasks\n`);
    console.log(`| Date          | Duration | Type     | Prompt                           | Tools |`);
    console.log(`|---------------|----------|----------|----------------------------------|-------|`);
    for (const t of recent) {
        const date = col(fmtDate(t.timestamp_start), 13);
        const dur = col(t.duration_seconds !== null ? fmtDuration(t.duration_seconds) : 'running', 8);
        const cls = col(t.classification, 8);
        const prompt = col(t.prompt_summary.slice(0, 34) || '-', 34);
        const tools = col(String(t.tool_calls), 5, 'right');
        console.log(`| ${date} | ${dur} | ${cls} | ${prompt} | ${tools} |`);
    }
}
function showStats(tasks) {
    const completed = tasks.filter((t) => t.duration_seconds !== null);
    if (completed.length === 0) {
        console.log('No completed tasks yet.');
        return;
    }
    const byType = new Map();
    for (const t of completed) {
        const list = byType.get(t.classification) ?? [];
        list.push(t);
        byType.set(t.classification, list);
    }
    const sorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);
    console.log(`## Stats by Task Type (${completed.length} total)\n`);
    console.log(`| Type      | Count | Avg Duration | Avg Tools | Avg Files |`);
    console.log(`|-----------|-------|--------------|-----------|-----------|`);
    for (const [cls, entries] of sorted) {
        const count = entries.length;
        const avgDur = Math.round(entries.reduce((s, t) => s + (t.duration_seconds ?? 0), 0) / count);
        const avgTools = Math.round(entries.reduce((s, t) => s + t.tool_calls, 0) / count);
        const avgFiles = Math.round(entries.reduce((s, t) => s + t.files_read + t.files_edited + t.files_created, 0) / count);
        console.log(`| ${col(cls, 9)} | ${col(String(count), 5, 'right')} | ${col(fmtDuration(avgDur), 12)} | ${col(String(avgTools), 9, 'right')} | ${col(String(avgFiles), 9, 'right')} |`);
    }
}
function showInspect(data) {
    const completed = data.tasks.filter((t) => t.duration_seconds !== null);
    console.log(`## Data Inspection\n`);
    console.log(`| Field             | Value                          |`);
    console.log(`|-------------------|--------------------------------|`);
    console.log(`| Project           | ${col(data.project, 30)}|`);
    console.log(`| Data file created | ${col(data.created, 30)}|`);
    console.log(`| Total tasks       | ${col(String(data.tasks.length), 30)}|`);
    console.log(`| Completed         | ${col(String(completed.length), 30)}|`);
    console.log(`\n### What is stored per task\n`);
    console.log('Each task entry contains: `task_id`, `session_id`, `project`, `timestamp_start`, `timestamp_end`, `duration_seconds`, `prompt_summary` (first 80 chars of prompt), `classification`, `tool_calls`, `files_read`, `files_edited`, `files_created`, `errors`, `model`.');
    console.log('\n**Not stored**: full prompt text, file contents, conversation content, code.');
    if (data.tasks.length > 0) {
        const last = data.tasks[data.tasks.length - 1];
        console.log(`\n### Latest task entry (raw)\n`);
        console.log('```json');
        console.log(JSON.stringify(last, null, 2));
        console.log('```');
    }
    // Show latest export if it exists
    try {
        const files = fs
            .readdirSync(EXPORT_DIR)
            .filter((f) => f.startsWith('velocity-'))
            .sort();
        if (files.length > 0) {
            const latest = path.join(EXPORT_DIR, files[files.length - 1]);
            const stat = fs.statSync(latest);
            console.log(`\n### Latest export\n`);
            console.log(`File: \`${latest}\``);
            console.log(`Size: ${stat.size} bytes, modified: ${stat.mtime.toISOString()}`);
        }
    }
    catch {
        // No export dir yet
    }
}
function getPluginVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
        return pkg.version;
    }
    catch {
        return 'unknown';
    }
}
const FEEDBACK_LINE = '\n---\nFeedback? Bug? https://github.com/mmmprod/claude-eta/issues';
// ── Main ──────────────────────────────────────────────────────
async function main() {
    const mode = process.argv[2] ?? 'session';
    const cwd = process.argv[3] ?? process.cwd();
    const project = path.basename(cwd);
    const confirm = process.argv.includes('--confirm');
    const pluginVersion = getPluginVersion();
    // Help
    if (mode === 'help') {
        console.log(`## claude-eta commands\n`);
        console.log(`Shortcut: \`${ETA_COMMAND}\``);
        console.log(`Fallback: \`${ETA_FALLBACK_COMMAND}\`\n`);
        console.log(`| Command                      | Description                                    |`);
        console.log(`|------------------------------|------------------------------------------------|`);
        console.log(`| \`${ETA_COMMAND}\`              | Current session stats                          |`);
        console.log(`| \`${ETA_COMMAND} history\`      | Last 20 tasks with durations                   |`);
        console.log(`| \`${ETA_COMMAND} stats\`        | Averages by task type                          |`);
        console.log(`| \`${ETA_COMMAND} inspect\`      | What data is stored (transparency)             |`);
        console.log(`| \`${ETA_COMMAND} compare\`      | Your stats vs community baselines              |`);
        console.log(`| \`${ETA_COMMAND} export\`       | Anonymize & save to local JSON                 |`);
        console.log(`| \`${ETA_COMMAND} contribute\`   | Preview what would be shared                   |`);
        console.log(`| \`${ETA_COMMAND} contribute --confirm\` | Upload anonymized data (opt-in)         |`);
        console.log(`| \`${ETA_COMMAND} help\`         | This help                                      |`);
        console.log(`\nAll data is 100% local by default. Community features (\`compare\`, \`contribute\`) are opt-in.`);
        console.log(`If the shortcut is not loaded in the current session yet, use \`${ETA_FALLBACK_COMMAND}\`.`);
        console.log(FEEDBACK_LINE);
        return;
    }
    // Async commands (don't need local task data to exist)
    switch (mode) {
        case 'contribute':
            if (confirm) {
                await executeContribute(project, pluginVersion);
            }
            else {
                await showContribute(project, pluginVersion);
            }
            console.log(FEEDBACK_LINE);
            return;
        case 'compare':
            await showCompare(project);
            console.log(FEEDBACK_LINE);
            return;
        case 'export':
            showExport(project, pluginVersion);
            console.log(FEEDBACK_LINE);
            return;
    }
    // Sync commands
    const data = loadProject(project);
    if (data.tasks.length === 0) {
        console.log('No tasks tracked yet. claude-eta is recording — data will appear after your first completed task.');
        return;
    }
    switch (mode) {
        case 'history':
            showHistory(data.tasks);
            break;
        case 'stats':
            showStats(data.tasks);
            break;
        case 'inspect':
            showInspect(data);
            break;
        default:
            showSession(data.tasks);
            break;
    }
    console.log(FEEDBACK_LINE);
}
void main();
//# sourceMappingURL=eta.js.map