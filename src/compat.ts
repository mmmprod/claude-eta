/**
 * Compatibility layer: reads from v2 event-store if migrated, else legacy store.
 *
 * This bridge allows progressive migration — each module can switch to compat
 * without requiring all modules to migrate simultaneously.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CompletedTurn, TaskEntry, ProjectData } from './types.js';
import { loadCompletedTurns } from './event-store.js';
import { resolveProjectIdentity } from './identity.js';
import { needsMigration, legacySlug } from './migrate.js';
import { getLegacyDataDir } from './paths.js';
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

/** Read legacy project JSON directly from CLAUDE_PLUGIN_DATA/data/ */
function loadLegacyProject(slug: string): ProjectData {
  const filePath = path.join(getLegacyDataDir(), `${slug}.json`);
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
