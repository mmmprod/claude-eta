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
import { findActiveMainTurn } from '../event-store.js';
import { evaluateTasks, formatEvaluationReport } from '../eval.js';
import { showExport } from './export.js';
import { c } from './colors.js';
import { showContribute, executeContribute } from './contribute.js';
import { showCompare } from './compare.js';
import { showAdminExport } from './admin-export.js';
import type { AnalyticsTask, CompletedTurn, TaskEntry, TaskClassification } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(getPluginDataDir(), 'export');
const INTERNAL_ONLY_MODES = new Set(['admin-export']);

function internalToolsEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.CLAUDE_ETA_INTERNAL ?? '');
}

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

function boolColor(enabled: boolean): (text: string) => string {
  return enabled ? c.green : c.yellow;
}

function coverageColor(rate: number): (text: string) => string {
  if (rate >= 0.7) return c.green;
  if (rate >= 0.5) return c.yellow;
  return c.red;
}

function renderActiveTask(cwd: string): boolean {
  const { fp } = resolveProjectIdentity(cwd);
  const activeTurn = findActiveMainTurn(fp);
  if (!activeTurn) return false;

  const elapsed = Math.round((Date.now() - activeTurn.started_at_ms) / 1000);
  const phase = activeTurn.live_phase ?? 'explore';

  console.log(`\n${c.bold('Active task')}: "${activeTurn.prompt_summary}" ${c.dim(`(${activeTurn.classification})`)}`);

  const parts = [`${c.dim('Phase:')} ${phase}`, `${c.dim('Elapsed:')} ${c.cyan(fmtDuration(elapsed))}`];

  if (activeTurn.live_remaining_p50 !== null && activeTurn.live_remaining_p80 !== null) {
    parts.push(
      `${c.dim('Remaining:')} ${c.cyan(`~${fmtDuration(activeTurn.live_remaining_p50)}-${fmtDuration(activeTurn.live_remaining_p80)}`)}`,
    );
  } else if (activeTurn.cached_eta) {
    const remainP50 = Math.max(0, activeTurn.cached_eta.p50_wall - elapsed);
    const remainP80 = Math.max(0, activeTurn.cached_eta.p80_wall - elapsed);
    parts.push(`${c.dim('Remaining:')} ${c.cyan(`~${fmtDuration(remainP50)}-${fmtDuration(remainP80)}`)}`);
  }

  console.log(parts.join(` ${c.dim('|')} `));
  return true;
}

// ── Modes ─────────────────────────────────────────────────────

function showSession(cwd: string, tasks: AnalyticsTask[]): void {
  const sessionTasks = tasks.length > 0 ? tasks.filter((t) => t.session_id === tasks[tasks.length - 1].session_id) : [];
  const completed = sessionTasks.filter((t) => t.duration_seconds !== null);

  const totalSec = completed.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
  const avgSec = completed.length > 0 ? Math.round(totalSec / completed.length) : 0;

  console.log(`\n${c.bold('Session Stats')} ${c.dim(`(${completed.length} tasks)`)}\n`);
  console.log(`${c.dim('| Metric              | Value               |')}`);
  console.log(`${c.dim('|---------------------|---------------------|')}`);
  console.log(`| ${c.dim('Tasks completed')}     | ${c.cyan(col(String(completed.length), 19))} |`);
  console.log(`| ${c.dim('Total time')}          | ${c.cyan(col(fmtDuration(totalSec), 19))} |`);
  console.log(
    `| ${c.dim('Avg per task')}        | ${c.cyan(col(completed.length > 0 ? fmtDuration(avgSec) : '-', 19))} |`,
  );
  console.log(
    `| ${c.dim('Total tool calls')}    | ${c.cyan(col(String(completed.reduce((s, t) => s + t.tool_calls, 0)), 19))} |`,
  );
  console.log(
    `| ${c.dim('Files read')}          | ${c.cyan(col(String(completed.reduce((s, t) => s + t.files_read, 0)), 19))} |`,
  );
  console.log(
    `| ${c.dim('Files edited')}        | ${c.cyan(col(String(completed.reduce((s, t) => s + t.files_edited, 0)), 19))} |`,
  );
  console.log(
    `| ${c.dim('Errors')}              | ${c.red(col(String(completed.reduce((s, t) => s + t.errors, 0)), 19))} |`,
  );

  renderActiveTask(cwd);
}

function showHistory(tasks: AnalyticsTask[]): void {
  const recent = tasks.slice(-20).reverse();

  console.log(`\n${c.bold('Last Tasks')} ${c.dim(`(${recent.length})`)}\n`);
  console.log(`${c.dim('| Date          | Duration | Type     | Prompt                           | Tools |')}`);
  console.log(`${c.dim('|---------------|----------|----------|----------------------------------|-------|')}`);

  for (const t of recent) {
    const date = col(fmtDate(t.timestamp_start), 13);
    const dur = col(t.duration_seconds !== null ? fmtDuration(t.duration_seconds) : 'running', 8);
    const cls = col(t.classification, 8);
    const prompt = col(t.prompt_summary.slice(0, 34) || '-', 34);
    const tools = col(String(t.tool_calls), 5, 'right');
    console.log(`| ${c.dim(date)} | ${c.cyan(dur)} | ${c.bold(cls)} | ${prompt} | ${c.dim(tools)} |`);
  }
}

function showStats(tasks: AnalyticsTask[]): void {
  const completed = tasks.filter((t) => t.duration_seconds !== null);
  if (completed.length === 0) {
    console.log(c.dim('No completed tasks yet.'));
    return;
  }

  const byType = new Map<TaskClassification, AnalyticsTask[]>();
  for (const t of completed) {
    const list = byType.get(t.classification) ?? [];
    list.push(t);
    byType.set(t.classification, list);
  }

  const sorted = [...byType.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log(`\n${c.bold('Stats by Task Type')} ${c.dim(`(${completed.length} total)`)}\n`);
  console.log(`${c.dim('| Type      | Count | Avg Duration | Avg Tools | Avg Files |')}`);
  console.log(`${c.dim('|-----------|-------|--------------|-----------|-----------|')}`);

  for (const [cls, entries] of sorted) {
    const count = entries.length;
    const avgDur = Math.round(entries.reduce((s, t) => s + (t.duration_seconds ?? 0), 0) / count);
    const avgTools = Math.round(entries.reduce((s, t) => s + t.tool_calls, 0) / count);
    const avgFiles = Math.round(
      entries.reduce((s, t) => s + t.files_read + t.files_edited + t.files_created, 0) / count,
    );

    console.log(
      `| ${c.bold(col(cls, 9))} | ${c.dim(col(String(count), 5, 'right'))} | ${c.cyan(col(fmtDuration(avgDur), 12))} | ${c.cyan(col(String(avgTools), 9, 'right'))} | ${c.cyan(col(String(avgFiles), 9, 'right'))} |`,
    );
  }
}

function showInspect(cwd: string, tasks: TaskEntry[], turns: CompletedTurn[]): void {
  const { fp, displayName } = resolveProjectIdentity(cwd);
  const meta = loadProjectMeta(fp);
  const completed = tasks.filter((t) => t.duration_seconds !== null);
  const prefs = loadPreferencesV2();

  console.log(`\n${c.bold('Data Inspection')} ${c.dim('(v2)')}\n`);
  console.log(`${c.dim('| Field               | Value                          |')}`);
  console.log(`${c.dim('|---------------------|--------------------------------|')}`);
  console.log(`| ${c.dim('Project')}             | ${col(displayName, 30)}|`);
  console.log(`| ${c.dim('Fingerprint')}         | ${col(fp, 30)}|`);
  console.log(`| ${c.dim('Data dir')}            | ${col(getPluginDataDir(), 30)}|`);
  console.log(`| ${c.dim('Total turns')}         | ${c.cyan(col(String(tasks.length), 30))}|`);
  console.log(`| ${c.dim('Completed')}           | ${c.cyan(col(String(completed.length), 30))}|`);
  console.log(
    `| ${c.dim('Community sharing')}   | ${(prefs.community_sharing ? c.green : c.yellow)(col(prefs.community_sharing ? 'enabled' : 'disabled', 30))}|`,
  );
  if (meta) {
    console.log(`| ${c.dim('Created')}             | ${col(meta.created, 30)}|`);
    if (meta.file_count != null) {
      console.log(`| ${c.dim('Repo files')}          | ${c.cyan(col(String(meta.file_count), 30))}|`);
    }
    if (meta.loc_bucket) {
      console.log(`| ${c.dim('LOC bucket')}          | ${col(meta.loc_bucket, 30)}|`);
    }
    if (meta.legacy_slug) {
      console.log(`| ${c.dim('Legacy migration')}    | ${col(`from ${meta.legacy_slug}`, 30)}|`);
    }
    if (meta.eta_accuracy) {
      const acc = meta.eta_accuracy;
      const types = Object.keys(acc.by_classification);
      if (types.length > 0) {
        console.log(`| ${c.dim('Accuracy types')}      | ${col(types.join(', '), 30)}|`);
      }
    }
  }

  console.log(`\n${c.bold('What Is Stored Per Turn')}\n`);
  console.log(
    'Each completed turn contains: `turn_id`, `work_item_id`, `session_id`, `agent_key`, `classification`, `prompt_summary`, `wall_seconds`, `span_until_last_event_seconds`, `tail_after_last_event_seconds`, `tool_calls`, `files_read`, `files_edited`, `files_created`, `errors`, `model`, `stop_reason`. Legacy `active_seconds` / `wait_seconds` are compatibility aliases for those proxy fields.',
  );
  console.log(`\n${c.bold('Not stored')}: full prompt text, file contents, conversation content, code.`);
  if (turns.length > 0) {
    const last = turns[turns.length - 1];
    console.log(`\n${c.bold('Latest Turn')} ${c.dim('(raw)')}\n`);
    console.log(c.cyan(JSON.stringify(last, null, 2)));
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
      console.log(`\n${c.bold('Latest Export')}\n`);
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

const FEEDBACK_LINE = `\n${c.dim('---')}\n${c.dim('Feedback? Bug?')} ${c.magenta('https://github.com/mmmprod/claude-eta/issues')}`;

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

  console.log(`\n${c.bold(`${dayLabel}'s Recap`)}\n`);
  console.log(
    `${c.cyan(String(dayTasks.length))} tasks completed in ${c.cyan(fmtDuration(totalSec))} of tracked wall time.\n`,
  );

  console.log(`${c.bold('By Type')}\n`);
  for (const [cls, entries] of sorted) {
    const dur = entries.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
    console.log(
      `- ${c.bold(cls)}: ${entries.length} task${entries.length > 1 ? 's' : ''} ${c.dim(`(${fmtDuration(dur)})`)}`,
    );
  }

  console.log(`\n${c.bold('Activity')}\n`);
  console.log(`${c.dim('| Metric         | Count |')}`);
  console.log(`${c.dim('|----------------|-------|')}`);
  console.log(`| ${c.dim('Tool calls')}     | ${c.cyan(col(String(totalTools), 5, 'right'))} |`);
  console.log(`| ${c.dim('Files read')}     | ${c.cyan(col(String(totalReads), 5, 'right'))} |`);
  console.log(`| ${c.dim('Files edited')}   | ${c.cyan(col(String(totalEdits), 5, 'right'))} |`);
  console.log(`| ${c.dim('Files created')}  | ${c.cyan(col(String(totalCreated), 5, 'right'))} |`);
  if (totalErrors > 0) {
    console.log(`| ${c.dim('Errors')}         | ${c.red(col(String(totalErrors), 5, 'right'))} |`);
  }

  const topTasks = [...dayTasks].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0)).slice(0, 5);
  if (topTasks.length > 0) {
    console.log(`\n${c.bold('Longest Tasks')}\n`);
    for (const t of topTasks) {
      const dur = t.duration_seconds != null ? fmtDuration(t.duration_seconds) : '?';
      const prompt = t.prompt_summary.slice(0, 50) || '(no summary)';
      console.log(`- ${c.cyan(dur)} - ${prompt} ${c.dim(`(${t.classification})`)}`);
    }
  }
}

// ── Auto ──────────────────────────────────────────────────────

function showAuto(cwd: string): void {
  const prefs = loadPreferencesV2();
  console.log(`\n${c.bold('Auto-ETA Status')}\n`);
  console.log(
    `Master switch: ${boolColor(prefs.auto_eta)(prefs.auto_eta ? 'enabled' : 'disabled')}${prefs.auto_eta ? '' : ' (enable with `/eta auto on`)'}\n`,
  );

  // Read accuracy from v2 project meta
  const { fp } = resolveProjectIdentity(cwd);
  const meta = loadProjectMeta(fp);
  const accuracy = meta?.eta_accuracy?.by_classification ?? {};
  const types = Object.keys(accuracy).sort();

  if (types.length === 0) {
    console.log(c.dim('No predictions recorded yet.'));
    return;
  }

  console.log(`${c.dim('| Type      | Predictions | Coverage  | Status              |')}`);
  console.log(`${c.dim('|-----------|-------------|-----------|---------------------|')}`);

  for (const type of types) {
    const { interval80_hits, interval80_total } = accuracy[type];
    const total = interval80_total;
    const pct = total > 0 ? Math.round((interval80_hits / total) * 100) : 0;
    let status = 'active';
    if (total < 10) status = 'warming';
    else if (interval80_hits / total < 0.5) status = 'suppressed (low coverage)';
    const accStr = total >= 10 ? `${interval80_hits}/${total} ${pct}%` : `${interval80_hits}/${total}`;
    const rate = total >= 10 && total > 0 ? interval80_hits / total : 0;
    console.log(
      `| ${c.bold(col(type, 9))} | ${c.dim(col(String(total), 11, 'right'))} | ${coverageColor(rate)(col(accStr, 9))} | ${coverageColor(rate)(col(status, 19))} |`,
    );
  }
}

function showCommunity(): void {
  const prefs = loadPreferencesV2();

  console.log(`\n${c.bold('Community Sharing')}\n`);
  console.log(`Upload switch: ${boolColor(prefs.community_sharing)(prefs.community_sharing ? 'enabled' : 'disabled')}`);
  console.log(`Choice: ${c.bold(getCommunityChoiceLabel(prefs))}`);
  console.log(`Current mode: ${c.bold(getCommunityModeLabel(prefs))}`);
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
  const internalMode = internalToolsEnabled();

  if (INTERNAL_ONLY_MODES.has(mode) && !internalMode) {
    console.log(c.red('Unknown command. Run `/eta help` for the public command list.'));
    return;
  }

  // Help
  if (mode === 'help') {
    console.log(`\n${c.bold('claude-eta commands')}\n`);
    console.log(`${c.dim('| Command                      | Description                                    |')}`);
    console.log(`${c.dim('|------------------------------|------------------------------------------------|')}`);
    console.log(`| ${c.bold('`/eta`')}                       | Current session stats                          |`);
    console.log(`| ${c.bold('`/eta history`')}               | Last 20 tasks with durations                   |`);
    console.log(`| ${c.bold('`/eta stats`')}                 | Averages by task type                          |`);
    console.log(`| ${c.bold('`/eta inspect`')}               | What data is stored (transparency)             |`);
    console.log(`| ${c.bold('`/eta compare`')}               | Your stats vs community baselines              |`);
    console.log(`| ${c.bold('`/eta community`')}             | Community sharing status and consent flow      |`);
    console.log(`| ${c.bold('`/eta community on`')}          | Explicitly allow anonymized community uploads  |`);
    console.log(`| ${c.bold('`/eta community off`')}         | Explicitly stay local-only                     |`);
    console.log(`| ${c.bold('`/eta export`')}                | Anonymize & save to local JSON                 |`);
    console.log(`| ${c.bold('`/eta contribute`')}            | Preview what would be shared                   |`);
    console.log(`| ${c.bold('`/eta contribute --confirm`')}  | Upload anonymized data (opt-in)                |`);
    console.log(`| ${c.bold('`/eta eval`')}                  | Walk-forward ETA calibration report            |`);
    console.log(`| ${c.bold('`/eta auto`')}                  | Auto-ETA status and accuracy                   |`);
    console.log(`| ${c.bold('`/eta auto on`')}               | Enable Auto-ETA injection                      |`);
    console.log(`| ${c.bold('`/eta auto off`')}              | Disable Auto-ETA injection                     |`);
    console.log(`| ${c.bold('`/eta insights`')}              | Deep patterns in your task data                |`);
    console.log(`| ${c.bold('`/eta recap`')}                 | Today's activity summary                       |`);
    console.log(`| ${c.bold('`/eta help`')}                  | This help                                      |`);
    if (internalMode) {
      console.log(`\n${c.bold('Maintainer-only tools')} ${c.dim('(enabled via `CLAUDE_ETA_INTERNAL=1`)')}\n`);
      console.log(`${c.dim('| Command                      | Description                                    |')}`);
      console.log(`${c.dim('|------------------------------|------------------------------------------------|')}`);
      console.log(`| ${c.bold('`/eta admin-export`')}            | Internal admin dashboard JSON/HTML export      |`);
    }
    console.log(`\nCommunity sharing: ${c.bold(getCommunityHelpStatus(prefs))}.`);
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
            ? c.green(
                'Community sharing enabled. You explicitly opted into manual anonymized uploads. Review with `/eta contribute`, send with `/eta contribute --confirm`.',
              )
            : c.yellow(
                'Community sharing disabled. You explicitly chose local-only mode. No anonymized records can be uploaded unless you later re-enable them with `/eta community on`.',
              ),
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
        prefs.auto_eta_explicitly_set = true;
        prefs.updated_at = new Date().toISOString();
        savePreferencesV2(prefs);
        console.log(
          subArg === 'on'
            ? c.green(
                'Auto-ETA enabled. Estimates will appear when conditions are met (min 5 tasks of the same type, not "other", not conversational).',
              )
            : c.yellow('Auto-ETA disabled.'),
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
    if (mode === 'session') {
      showSession(cwd, tasks);
      console.log(
        `\nPrivacy mode: ${c.bold(prefs.community_choice_made ? (prefs.community_sharing ? 'community uploads enabled (manual confirm required)' : 'local-only chosen') : 'choice pending (currently local-only)')}. Use \`/eta community\` to manage sharing.`,
      );
      return;
    }
    console.log('No tasks tracked yet. claude-eta is recording — data will appear after your first completed task.');
    console.log(
      `Privacy mode: ${c.bold(prefs.community_choice_made ? (prefs.community_sharing ? 'community uploads enabled (manual confirm required)' : 'local-only chosen') : 'choice pending (currently local-only)')}. Use \`/eta community\` to manage sharing.`,
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
      showSession(cwd, tasks);
      break;
  }

  console.log(FEEDBACK_LINE);
}

void main();
