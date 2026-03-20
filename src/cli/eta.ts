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
import { fileURLToPath } from 'node:url';
import { loadProject, loadPreferences, savePreferences } from '../store.js';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { showExport } from './export.js';
import { showContribute, executeContribute } from './contribute.js';
import { showCompare } from './compare.js';
import type { TaskEntry, TaskClassification } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'export');

// ── Formatting helpers ────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Pad and truncate to exact column width */
function col(s: string, len: number, align: 'left' | 'right' = 'left'): string {
  const truncated = s.length > len ? s.slice(0, len) : s;
  return align === 'left' ? truncated.padEnd(len) : truncated.padStart(len);
}

// ── Modes ─────────────────────────────────────────────────────

function showSession(tasks: TaskEntry[]): void {
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

function showHistory(tasks: TaskEntry[]): void {
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

function showStats(tasks: TaskEntry[]): void {
  const completed = tasks.filter((t) => t.duration_seconds !== null);
  if (completed.length === 0) {
    console.log('No completed tasks yet.');
    return;
  }

  const byType = new Map<TaskClassification, TaskEntry[]>();
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
    const avgFiles = Math.round(
      entries.reduce((s, t) => s + t.files_read + t.files_edited + t.files_created, 0) / count,
    );

    console.log(
      `| ${col(cls, 9)} | ${col(String(count), 5, 'right')} | ${col(fmtDuration(avgDur), 12)} | ${col(String(avgTools), 9, 'right')} | ${col(String(avgFiles), 9, 'right')} |`,
    );
  }
}

function showInspect(data: { project: string; created: string; tasks: TaskEntry[] }): void {
  const completed = data.tasks.filter((t) => t.duration_seconds !== null);
  console.log(`## Data Inspection\n`);
  console.log(`| Field             | Value                          |`);
  console.log(`|-------------------|--------------------------------|`);
  console.log(`| Project           | ${col(data.project, 30)}|`);
  console.log(`| Data file created | ${col(data.created, 30)}|`);
  console.log(`| Total tasks       | ${col(String(data.tasks.length), 30)}|`);
  console.log(`| Completed         | ${col(String(completed.length), 30)}|`);
  console.log(`\n### What is stored per task\n`);
  console.log(
    'Each task entry contains: `task_id`, `session_id`, `project`, `timestamp_start`, `timestamp_end`, `duration_seconds`, `prompt_summary` (first 80 chars of prompt), `classification`, `tool_calls`, `files_read`, `files_edited`, `files_created`, `errors`, `model`.',
  );
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
  } catch {
    // No export dir yet
  }
}

function getPluginVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

const FEEDBACK_LINE = '\n---\nFeedback? Bug? https://github.com/mmmprod/claude-eta/issues';

// ── Recap ────────────────────────────────────────────────────

function showRecap(tasks: TaskEntry[]): void {
  const completed = tasks.filter((t) => t.duration_seconds != null);
  if (completed.length === 0) {
    console.log('No completed tasks yet.');
    return;
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  let dayTasks = completed.filter((t) => t.timestamp_start.startsWith(todayStr));

  if (dayTasks.length === 0) {
    const lastTask = completed[completed.length - 1];
    const lastDay = lastTask.timestamp_start.slice(0, 10);
    dayTasks = completed.filter((t) => t.timestamp_start.startsWith(lastDay));
  }

  const totalSec = dayTasks.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
  const totalTools = dayTasks.reduce((s, t) => s + t.tool_calls, 0);
  const totalReads = dayTasks.reduce((s, t) => s + t.files_read, 0);
  const totalEdits = dayTasks.reduce((s, t) => s + t.files_edited, 0);
  const totalCreated = dayTasks.reduce((s, t) => s + t.files_created, 0);
  const totalErrors = dayTasks.reduce((s, t) => s + t.errors, 0);

  const byType = new Map<TaskClassification, TaskEntry[]>();
  for (const t of dayTasks) {
    const list = byType.get(t.classification) ?? [];
    list.push(t);
    byType.set(t.classification, list);
  }
  const sorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

  const dayLabel =
    dayTasks[0].timestamp_start.slice(0, 10) === todayStr ? 'Today' : dayTasks[0].timestamp_start.slice(0, 10);

  console.log(`## ${dayLabel}'s Recap\n`);
  console.log(`**${dayTasks.length} tasks** completed in **${fmtDuration(totalSec)}** of active work.\n`);

  console.log(`### By type\n`);
  for (const [cls, entries] of sorted) {
    const dur = entries.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
    console.log(`- **${cls}**: ${entries.length} task${entries.length > 1 ? 's' : ''} (${fmtDuration(dur)})`);
  }

  console.log(`\n### Activity\n`);
  console.log(`| Metric         | Count |`);
  console.log(`|----------------|-------|`);
  console.log(`| Tool calls     | ${col(String(totalTools), 5, 'right')} |`);
  console.log(`| Files read     | ${col(String(totalReads), 5, 'right')} |`);
  console.log(`| Files edited   | ${col(String(totalEdits), 5, 'right')} |`);
  console.log(`| Files created  | ${col(String(totalCreated), 5, 'right')} |`);
  if (totalErrors > 0) {
    console.log(`| Errors         | ${col(String(totalErrors), 5, 'right')} |`);
  }

  const topTasks = [...dayTasks].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0)).slice(0, 5);
  if (topTasks.length > 0) {
    console.log(`\n### Longest tasks\n`);
    for (const t of topTasks) {
      const dur = t.duration_seconds != null ? fmtDuration(t.duration_seconds) : '?';
      const prompt = t.prompt_summary.slice(0, 50) || '(no summary)';
      console.log(`- **${dur}** — ${prompt} _(${t.classification})_`);
    }
  }
}

// ── Auto ──────────────────────────────────────────────────────

function showAuto(data: { eta_accuracy?: Record<string, { hits: number; misses: number }> }): void {
  const prefs = loadPreferences();
  console.log(`## Auto-ETA Status\n`);
  console.log(
    `Master switch: **${prefs.auto_eta ? 'enabled' : 'disabled'}**${prefs.auto_eta ? '' : ' (enable with `/eta auto on`)'}\n`,
  );

  const accuracy = data.eta_accuracy ?? {};
  const types = Object.keys(accuracy).sort();

  if (types.length === 0) {
    console.log('No predictions recorded yet.');
    return;
  }

  console.log(`| Type      | Predictions | Accuracy  | Status              |`);
  console.log(`|-----------|-------------|-----------|---------------------|`);

  for (const type of types) {
    const { hits, misses } = accuracy[type];
    const total = hits + misses;
    const pct = total > 0 ? Math.round((hits / total) * 100) : 0;
    let status = 'active';
    if (total < 10) status = '< 10 predictions';
    else if (misses / total > 0.5) status = 'disabled (low accuracy)';
    const accStr = total >= 10 ? `${hits}/${total} ${pct}%` : '-';
    console.log(`| ${col(type, 9)} | ${col(String(total), 11, 'right')} | ${col(accStr, 9)} | ${col(status, 19)} |`);
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'session';
  // Last arg is always cwd (appended by command runner as $(pwd)).
  // Earlier positional args (e.g. "auto on") sit between mode and cwd.
  const cwd = process.argv.at(-1) ?? process.cwd();
  const project = path.basename(cwd);
  const confirm = process.argv.includes('--confirm');
  const pluginVersion = getPluginVersion();

  // Help
  if (mode === 'help') {
    console.log(`## claude-eta commands\n`);
    console.log(`| Command                      | Description                                    |`);
    console.log(`|------------------------------|------------------------------------------------|`);
    console.log(`| \`/eta\`                       | Current session stats                          |`);
    console.log(`| \`/eta history\`               | Last 20 tasks with durations                   |`);
    console.log(`| \`/eta stats\`                 | Averages by task type                          |`);
    console.log(`| \`/eta inspect\`               | What data is stored (transparency)             |`);
    console.log(`| \`/eta compare\`               | Your stats vs community baselines              |`);
    console.log(`| \`/eta export\`                | Anonymize & save to local JSON                 |`);
    console.log(`| \`/eta contribute\`            | Preview what would be shared                   |`);
    console.log(`| \`/eta contribute --confirm\`  | Upload anonymized data (opt-in)                |`);
    console.log(`| \`/eta auto\`                  | Auto-ETA status and accuracy               |`);
    console.log(`| \`/eta auto on\`               | Enable Auto-ETA injection                  |`);
    console.log(`| \`/eta auto off\`              | Disable Auto-ETA injection                 |`);
    console.log(`| \`/eta insights\`              | Deep patterns in your task data             |`);
    console.log(`| \`/eta help\`                  | This help                                      |`);
    console.log(`\nAll data is 100% local by default. Community features (\`compare\`, \`contribute\`) are opt-in.`);
    console.log(FEEDBACK_LINE);
    return;
  }

  // Commands that don't need local task data to exist
  switch (mode) {
    case 'contribute':
      if (confirm) {
        await executeContribute(project, pluginVersion);
      } else {
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
    case 'auto': {
      const subArg = process.argv[3];
      if (subArg === 'on' || subArg === 'off') {
        const prefs = loadPreferences();
        prefs.auto_eta = subArg === 'on';
        savePreferences(prefs);
        console.log(
          subArg === 'on'
            ? 'Auto-ETA **enabled**. Estimates will appear when conditions are met (min 5 tasks of the same type, not "other", not conversational).'
            : 'Auto-ETA **disabled**.',
        );
        console.log(FEEDBACK_LINE);
        return;
      }
      // `/eta auto` (status) falls through to sync section below
      break;
    }
  }

  // Sync commands — load data via compat layer (v2 or legacy)
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToTaskEntries(turns);

  // Also load legacy data for commands that still need ProjectData shape
  const data = loadProject(project);

  if (tasks.length === 0 && data.tasks.length === 0) {
    console.log('No tasks tracked yet. claude-eta is recording — data will appear after your first completed task.');
    return;
  }

  // Prefer v2 turns if available, else fall back to legacy tasks
  const displayTasks = tasks.length > 0 ? tasks : data.tasks;

  switch (mode) {
    case 'history':
      showHistory(displayTasks);
      break;
    case 'stats':
      showStats(displayTasks);
      break;
    case 'inspect':
      showInspect(data);
      break;
    case 'recap':
      showRecap(displayTasks);
      break;
    case 'auto':
      showAuto(data);
      break;
    case 'insights': {
      const { computeAllInsights, formatInsightsReport } = await import('../insights/index.js');
      const results = computeAllInsights(displayTasks);
      console.log(formatInsightsReport(results));
      break;
    }
    default:
      showSession(data.tasks);
      break;
  }

  console.log(FEEDBACK_LINE);
}

void main();
