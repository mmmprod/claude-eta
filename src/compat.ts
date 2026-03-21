/**
 * Compatibility layer: reads from v2 event-store if migrated, else legacy store.
 *
 * This bridge allows progressive migration — each module can switch to compat
 * without requiring all modules to migrate simultaneously.
 */
import * as fs from 'node:fs';
import type { AnalyticsTask, CompletedTurn, TaskEntry, ProjectData, StopReason } from './types.js';
import { loadCompletedTurns } from './event-store.js';
import { resolveProjectIdentity } from './identity.js';
import { needsMigration, legacySlug } from './migrate.js';
import { findLegacyFile } from './paths.js';
import { taskEntryToCompletedTurn } from './convert.js';

// Re-export for external callers
export { taskEntryToCompletedTurn } from './convert.js';

/**
 * Load completed turns from the best available source.
 * - If v2 data exists (migrated or native): reads from event-store JSONL
 * - If only v1 data exists: reads legacy JSON and converts in-memory
 * - If neither: returns empty array
 */
export function loadCompletedTurnsCompat(cwd: string): CompletedTurn[] {
  const { fp, displayName } = resolveProjectIdentity(cwd);
  const slug = legacySlug(displayName);

  // If legacy exists and not yet migrated, convert in-memory (don't migrate on read)
  if (needsMigration(fp, slug)) {
    return convertLegacyInMemory(slug, fp, displayName);
  }

  // Try v2 first
  const v2Turns = loadCompletedTurns(fp);
  if (v2Turns.length > 0) return v2Turns;

  // Fallback: try legacy in-memory conversion (for edge cases)
  return convertLegacyInMemory(slug, fp, displayName);
}

/** Convert legacy TaskEntry[] to CompletedTurn[] without writing to disk */
function convertLegacyInMemory(slug: string, projectFp: string, displayName: string): CompletedTurn[] {
  const data = loadLegacyProject(slug);
  return data.tasks
    .filter((t) => t.duration_seconds != null && t.duration_seconds > 0)
    .map((t) => taskEntryToCompletedTurn(t, projectFp, displayName));
}

/** Read legacy project JSON from whichever legacy directory contains it */
function loadLegacyProject(slug: string): ProjectData {
  const filePath = findLegacyFile(`${slug}.json`);
  if (!filePath) {
    return { project: slug, created: new Date().toISOString(), tasks: [] };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ProjectData;
  } catch {
    return { project: slug, created: new Date().toISOString(), tasks: [] };
  }
}

/** Convert CompletedTurn[] to TaskEntry[] for legacy modules (stats, insights, etc.) */
export function turnsToTaskEntries(turns: CompletedTurn[]): TaskEntry[] {
  return turns.map((t) => ({
    task_id: t.turn_id,
    session_id: t.session_id,
    project: t.project_display_name,
    timestamp_start: t.started_at,
    timestamp_end: t.ended_at,
    duration_seconds: t.wall_seconds,
    prompt_summary: t.prompt_summary,
    classification: t.classification,
    tool_calls: t.tool_calls,
    files_read: t.files_read,
    files_edited: t.files_edited,
    files_created: t.files_created,
    errors: t.errors,
    model: t.model ?? 'unknown',
  }));
}

export function mainTurns(turns: CompletedTurn[]): CompletedTurn[] {
  return turns.filter((t) => t.runner_kind === 'main');
}

export function mainTurnsToTaskEntries(turns: CompletedTurn[]): TaskEntry[] {
  return turnsToTaskEntries(mainTurns(turns));
}

function compareTurns(left: CompletedTurn, right: CompletedTurn): number {
  if (left.started_at !== right.started_at) return left.started_at.localeCompare(right.started_at);
  if (left.ended_at !== right.ended_at) return left.ended_at.localeCompare(right.ended_at);
  return left.turn_id.localeCompare(right.turn_id);
}

function representativeClassification(turns: CompletedTurn[]): CompletedTurn['classification'] {
  return turns.find((turn) => turn.classification !== 'other')?.classification ?? turns[0].classification;
}

function aggregateFirstObservedOffset(
  turns: CompletedTurn[],
  key: 'first_edit_offset_seconds' | 'first_bash_offset_seconds',
): number | null {
  let elapsed = 0;
  for (const turn of turns) {
    const offset = turn[key];
    if (typeof offset === 'number' && Number.isFinite(offset)) {
      return elapsed + Math.max(0, offset);
    }
    elapsed += Math.max(0, turn.wall_seconds ?? 0);
  }
  return null;
}

/** Stop reasons that indicate the work item reached a terminal state. */
const TERMINAL_STOP_REASONS = new Set<StopReason>(['stop', 'stop_failure', 'session_end', 'subagent_stop', 'migrated']);

/** Aggregate main-runner turns into logical work items for analytics and ETA. */
export function turnsToAnalyticsTasks(turns: CompletedTurn[]): AnalyticsTask[] {
  const grouped = new Map<string, CompletedTurn[]>();

  for (const turn of mainTurns(turns).slice().sort(compareTurns)) {
    const key = `${turn.session_id}:${turn.work_item_id || turn.turn_id}`;
    const list = grouped.get(key) ?? [];
    list.push(turn);
    grouped.set(key, list);
  }

  return [...grouped.values()]
    .filter((group) => TERMINAL_STOP_REASONS.has(group[group.length - 1].stop_reason))
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];

      return {
        analytics_id: first.work_item_id || first.turn_id,
        work_item_id: first.work_item_id || first.turn_id,
        session_id: first.session_id,
        project: first.project_display_name,
        timestamp_start: first.started_at,
        timestamp_end: last.ended_at,
        duration_seconds: group.reduce((sum, turn) => sum + turn.wall_seconds, 0),
        prompt_summary: first.prompt_summary,
        prompt_complexity: first.prompt_complexity ?? 0,
        classification: representativeClassification(group),
        tool_calls: group.reduce((sum, turn) => sum + turn.tool_calls, 0),
        files_read: group.reduce((sum, turn) => sum + turn.files_read, 0),
        files_edited: group.reduce((sum, turn) => sum + turn.files_edited, 0),
        files_created: group.reduce((sum, turn) => sum + turn.files_created, 0),
        errors: group.reduce((sum, turn) => sum + turn.errors, 0),
        model: group.find((turn) => turn.model)?.model ?? 'unknown',
        first_edit_offset_seconds: aggregateFirstObservedOffset(group, 'first_edit_offset_seconds'),
        first_bash_offset_seconds: aggregateFirstObservedOffset(group, 'first_bash_offset_seconds'),
        runner_kind: 'main' as const,
        source_turn_count: group.length,
      };
    })
    .sort((left, right) => {
      if (left.timestamp_start !== right.timestamp_start)
        return left.timestamp_start.localeCompare(right.timestamp_start);
      return left.analytics_id.localeCompare(right.analytics_id);
    });
}

/** @deprecated Use turnsToAnalyticsTasks() in v2 analytics code. */
export function turnsToAnalyticsTaskEntries(turns: CompletedTurn[]): TaskEntry[] {
  return turnsToAnalyticsTasks(turns).map((task) => ({
    task_id: task.analytics_id,
    session_id: task.session_id,
    project: task.project,
    timestamp_start: task.timestamp_start,
    timestamp_end: task.timestamp_end,
    duration_seconds: task.duration_seconds,
    prompt_summary: task.prompt_summary,
    classification: task.classification,
    tool_calls: task.tool_calls,
    files_read: task.files_read,
    files_edited: task.files_edited,
    files_created: task.files_created,
    errors: task.errors,
    model: task.model,
  }));
}
