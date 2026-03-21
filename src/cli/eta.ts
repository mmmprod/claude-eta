#!/usr/bin/env node
/**
 * CLI for /eta command — reads project data and outputs formatted stats.
 *
 * Usage:
 *   node dist/cli/eta.js [session|history|stats] [cwd]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getCommunityChoiceLabel,
  getCommunityHelpStatus,
  getCommunityModeLabel,
  renderCommunityConsentFlow,
  setCommunitySharingPreference,
} from '../community-consent.js';
import { getPluginDataDir } from '../paths.js';
import { loadPreferencesV2, savePreferencesV2 } from '../preferences.js';
import { loadProjectMeta } from '../project-meta.js';
import { resolveProjectIdentity } from '../identity.js';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks, turnsToTaskEntries } from '../compat.js';
import { evaluateTasks, formatEvaluationReport } from '../eval.js';
import { showExport } from './export.js';
import { showContribute, executeContribute } from './contribute.js';
import { showCompare } from './compare.js';
import { showAdminExport } from './admin-export.js';
import type { AnalyticsTask, CompletedTurn, TaskEntry, TaskClassification } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(getPluginDataDir(), 'export');

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

function showSession(tasks: AnalyticsTask[]): void {
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

function showHistory(tasks: AnalyticsTask[]): void {
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

function showStats(tasks: AnalyticsTask[]): void {
  const completed = tasks.filter((t) => t.duration_seconds !== null);
  if (completed.length === 0) {
    console.log('No completed tasks yet.');
    return;
  }

  const byType = new Map<TaskClassification, AnalyticsTask[]>();
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

function showInspect(cwd: string, tasks: TaskEntry[], turns: CompletedTurn[]): void {
  const { fp, displayName } = resolveProjectIdentity(cwd);
  const meta = loadProjectMeta(fp);
  const completed = tasks.filter((t) => t.duration_seconds !== null);
  const prefs = loadPreferencesV2();

  console.log(`## Data Inspection (v2)\n`);
  console.log(`| Field               | Value                          |`);
  console.log(`|---------------------|--------------------------------|`);
  console.log(`| Project             | ${col(displayName, 30)}|`);
  console.log(`| Fingerprint         | ${col(fp, 30)}|`);
  console.log(`| Data dir            | ${col(getPluginDataDir(), 30)}|`);
  console.log(`| Total turns         | ${col(String(tasks.length), 30)}|`);
  console.log(`| Completed           | ${col(String(completed.length), 30)}|`);
  console.log(`| Community sharing   | ${col(prefs.community_sharing ? 'enabled' : 'disabled', 30)}|`);
  if (meta) {
    console.log(`| Created             | ${col(meta.created, 30)}|`);
    if (meta.file_count != null) {
      console.log(`| Repo files          | ${col(String(meta.file_count), 30)}|`);
    }
    if (meta.loc_bucket) {
      console.log(`| LOC bucket          | ${col(meta.loc_bucket, 30)}|`);
    }
    if (meta.legacy_slug) {
      console.log(`| Legacy migration    | ${col(`from ${meta.legacy_slug}`, 30)}|`);
    }
    if (meta.eta_accuracy) {
      const acc = meta.eta_accuracy;
      const types = Object.keys(acc.by_classification);
      if (types.length > 0) {
        console.log(`| Accuracy types      | ${col(types.join(', '), 30)}|`);
      }
    }
  }

  console.log(`\n### What is stored per turn\n`);
  console.log(
    'Each completed turn contains: `turn_id`, `work_item_id`, `session_id`, `agent_key`, `classification`, `prompt_summary`, `wall_seconds`, `span_until_last_event_seconds`, `tail_after_last_event_seconds`, `tool_calls`, `files_read`, `files_edited`, `files_created`, `errors`, `model`, `stop_reason`. Legacy `active_seconds` / `wait_seconds` are compatibility aliases for those proxy fields.',
  );
  console.log('\n**Not stored**: full prompt text, file contents, conversation content, code.');
  if (turns.length > 0) {
    const last = turns[turns.length - 1];
    console.log(`\n### Latest turn (raw)\n`);
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

function showRecap(tasks: AnalyticsTask[]): void {
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

  const byType = new Map<TaskClassification, AnalyticsTask[]>();
  for (const t of dayTasks) {
    const list = byType.get(t.classification) ?? [];
    list.push(t);
    byType.set(t.classification, list);
  }
  const sorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

  const dayLabel =
    dayTasks[0].timestamp_start.slice(0, 10) === todayStr ? 'Today' : dayTasks[0].timestamp_start.slice(0, 10);

  console.log(`## ${dayLabel}'s Recap\n`);
  console.log(`**${dayTasks.length} tasks** completed in **${fmtDuration(totalSec)}** of tracked wall time.\n`);

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

function showAuto(cwd: string): void {
  const prefs = loadPreferencesV2();
  console.log(`## Auto-ETA Status\n`);
  console.log(
    `Master switch: **${prefs.auto_eta ? 'enabled' : 'disabled'}**${prefs.auto_eta ? '' : ' (enable with `/eta auto on`)'}\n`,
  );

  // Read accuracy from v2 project meta
  const { fp } = resolveProjectIdentity(cwd);
  const meta = loadProjectMeta(fp);
  const accuracy = meta?.eta_accuracy?.by_classification ?? {};
  const types = Object.keys(accuracy).sort();

  if (types.length === 0) {
    console.log('No predictions recorded yet.');
    return;
  }

  console.log(`| Type      | Predictions | Coverage  | Status              |`);
  console.log(`|-----------|-------------|-----------|---------------------|`);

  for (const type of types) {
    const { interval80_hits, interval80_total } = accuracy[type];
    const total = interval80_total;
    const pct = total > 0 ? Math.round((interval80_hits / total) * 100) : 0;
    let status = 'active';
    if (total < 10) status = 'warming';
    else if (interval80_hits / total < 0.5) status = 'suppressed (low coverage)';
    const accStr = total >= 10 ? `${interval80_hits}/${total} ${pct}%` : `${interval80_hits}/${total}`;
    console.log(`| ${col(type, 9)} | ${col(String(total), 11, 'right')} | ${col(accStr, 9)} | ${col(status, 19)} |`);
  }
}

function showCommunity(): void {
  const prefs = loadPreferencesV2();

  console.log(`## Community Sharing\n`);
  console.log(`Upload switch: **${prefs.community_sharing ? 'enabled' : 'disabled'}**`);
  console.log(`Choice: **${getCommunityChoiceLabel(prefs)}**`);
  console.log(`Current mode: **${getCommunityModeLabel(prefs)}**`);
  console.log('Local learning stays active either way.');
  console.log('`/eta compare` is read-only and does not upload your task data.');

  if (!prefs.community_choice_made) {
    console.log(`\n${renderCommunityConsentFlow()}`);
  } else if (prefs.community_sharing) {
    console.log(
      '\nAnonymized uploads are allowed, but they still require a manual `/eta contribute --confirm` each time.',
    );
  } else {
    console.log(
      '\nYou explicitly chose local-only mode. No anonymized records can be uploaded unless you later run `/eta community on`.',
    );
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'session';
  // Last arg is always cwd (appended by command runner as $(pwd)).
  // Earlier positional args (e.g. "auto on") sit between mode and cwd.
  const cwd = process.argv.at(-1) ?? process.cwd();
  const confirm = process.argv.includes('--confirm');
  const pluginVersion = getPluginVersion();
  const prefs = loadPreferencesV2();

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
    console.log(`| \`/eta community\`             | Community sharing status and consent flow      |`);
    console.log(`| \`/eta community on\`          | Explicitly allow anonymized community uploads  |`);
    console.log(`| \`/eta community off\`         | Explicitly stay local-only                     |`);
    console.log(`| \`/eta export\`                | Anonymize & save to local JSON                 |`);
    console.log(`| \`/eta contribute\`            | Preview what would be shared                   |`);
    console.log(`| \`/eta contribute --confirm\`  | Upload anonymized data (opt-in)                |`);
    console.log(`| \`/eta auto\`                  | Auto-ETA status and accuracy               |`);
    console.log(`| \`/eta auto on\`               | Enable Auto-ETA injection                  |`);
    console.log(`| \`/eta auto off\`              | Disable Auto-ETA injection                 |`);
    console.log(`| \`/eta insights\`              | Deep patterns in your task data             |`);
    console.log(`| \`/eta eval\`                  | Walk-forward ETA calibration report         |`);
    console.log(`| \`/eta recap\`                 | Today's activity summary                    |`);
    console.log(`| \`/eta admin-export\`          | Full admin dashboard JSON export            |`);
    console.log(`| \`/eta help\`                  | This help                                      |`);
    console.log(`\nCommunity sharing: **${getCommunityHelpStatus(prefs)}**.`);
    console.log(
      '\nAll data is 100% local by default. Community uploads stay blocked until the user enables them with `/eta community on`.',
    );
    if (!prefs.community_choice_made) {
      console.log('Run `/eta community` to make the local-only vs community-sharing choice explicit.');
    }
    console.log(FEEDBACK_LINE);
    return;
  }

  // Commands that don't need local task data to exist
  switch (mode) {
    case 'contribute':
      if (confirm) {
        await executeContribute(cwd, pluginVersion);
      } else {
        await showContribute(cwd, pluginVersion);
      }
      console.log(FEEDBACK_LINE);
      return;
    case 'compare':
      await showCompare(cwd);
      console.log(FEEDBACK_LINE);
      return;
    case 'community': {
      const subArg = process.argv[3];
      if (subArg === 'on' || subArg === 'off') {
        setCommunitySharingPreference(subArg === 'on');
        console.log(
          subArg === 'on'
            ? 'Community sharing **enabled**. You explicitly opted into manual anonymized uploads. Review with `/eta contribute`, send with `/eta contribute --confirm`.'
            : 'Community sharing **disabled**. You explicitly chose local-only mode. No anonymized records can be uploaded unless you later re-enable them with `/eta community on`.',
        );
        console.log(FEEDBACK_LINE);
        return;
      }
      showCommunity();
      console.log(FEEDBACK_LINE);
      return;
    }
    case 'export':
      showExport(cwd, pluginVersion);
      console.log(FEEDBACK_LINE);
      return;
    case 'admin-export':
      await showAdminExport(pluginVersion);
      console.log(FEEDBACK_LINE);
      return;
    case 'auto': {
      const subArg = process.argv[3];
      if (subArg === 'on' || subArg === 'off') {
        prefs.auto_eta = subArg === 'on';
        prefs.updated_at = new Date().toISOString();
        savePreferencesV2(prefs);
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
  const rawTasks = turnsToTaskEntries(turns);
  const tasks = turnsToAnalyticsTasks(turns);

  // auto and inspect work even with zero completed turns
  if (mode === 'auto') {
    showAuto(cwd);
    console.log(FEEDBACK_LINE);
    return;
  }
  if (mode === 'inspect') {
    showInspect(cwd, rawTasks, turns);
    console.log(FEEDBACK_LINE);
    return;
  }

  if (tasks.length === 0) {
    console.log('No tasks tracked yet. claude-eta is recording — data will appear after your first completed task.');
    console.log(
      `Privacy mode: **${prefs.community_choice_made ? (prefs.community_sharing ? 'community uploads enabled (manual confirm required)' : 'local-only chosen') : 'choice pending (currently local-only)'}**. Use \`/eta community\` to manage sharing.`,
    );
    return;
  }

  switch (mode) {
    case 'history':
      showHistory(tasks);
      break;
    case 'stats':
      showStats(tasks);
      break;
    case 'recap':
      showRecap(tasks);
      break;
    case 'insights': {
      const { computeAllInsights, formatInsightsReport } = await import('../insights/index.js');
      const results = computeAllInsights(tasks);
      console.log(formatInsightsReport(results));
      break;
    }
    case 'eval':
      console.log(formatEvaluationReport(evaluateTasks(tasks)));
      break;
    default:
      showSession(tasks);
      break;
  }

  console.log(FEEDBACK_LINE);
}

void main();
