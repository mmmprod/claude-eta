/**
 * Legacy data migration: v1 snapshot JSON → v2 event-log JSONL.
 *
 * Idempotent: uses a marker file to prevent double-import.
 * Non-destructive: legacy files are preserved.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskEntry, ProjectData } from './types.js';
import {
  findLegacyFile,
  getProjectDir,
  getCompletedDir,
  ensureDir,
  ensureProjectDirs,
  getProjectMetaPath,
} from './paths.js';
import { taskEntryToCompletedTurn } from './convert.js';

const MIGRATION_MARKER = 'migrated-from-legacy.json';

/** Check if a legacy project file exists and hasn't been migrated yet */
export function needsMigration(projectFp: string, legacySlug: string): boolean {
  const legacyPath = findLegacyFile(`${legacySlug}.json`);
  if (!legacyPath) return false; // No legacy file anywhere

  const markerPath = path.join(getProjectDir(projectFp), MIGRATION_MARKER);

  try {
    fs.accessSync(markerPath, fs.constants.R_OK);
    return false; // Already migrated
  } catch {
    return true; // Legacy exists but not yet migrated
  }
}

/** Migrate legacy project data to v2 format */
export function migrateLegacyProject(
  projectFp: string,
  legacySlug: string,
  displayName: string,
  cwdRealpath: string,
): { migratedCount: number } {
  // Idempotence: skip if already migrated
  if (!needsMigration(projectFp, legacySlug)) {
    return { migratedCount: 0 };
  }

  const legacyPath = findLegacyFile(`${legacySlug}.json`);
  if (!legacyPath) return { migratedCount: 0 };

  let data: ProjectData;
  try {
    const content = fs.readFileSync(legacyPath, 'utf-8');
    data = JSON.parse(content) as ProjectData;
  } catch {
    return { migratedCount: 0 };
  }

  if (!data.tasks || data.tasks.length === 0) {
    // Write marker even for empty projects
    writeMarker(projectFp, legacySlug, 0);
    return { migratedCount: 0 };
  }

  ensureProjectDirs(projectFp);

  // Write marker FIRST to prevent double-migration race condition.
  // If crash happens after marker but before data write, we lose history
  // (recoverable by deleting marker), but we never get duplicates.
  const completedTasks = data.tasks.filter((t) => t.duration_seconds != null && t.duration_seconds > 0);
  writeMarker(projectFp, legacySlug, completedTasks.length);

  // Write project meta
  const metaPath = getProjectMetaPath(projectFp);
  const meta = {
    project_fp: projectFp,
    display_name: displayName,
    cwd_realpath: cwdRealpath,
    created: data.created,
    legacy_slug: legacySlug,
    file_count: data.file_count ?? null,
    loc_bucket: data.loc_bucket ?? null,
    eta_accuracy: data.eta_accuracy ?? {},
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  // Convert each completed task to a CompletedTurn JSONL line
  if (completedTasks.length > 0) {
    const bySession = new Map<string, TaskEntry[]>();
    for (const task of completedTasks) {
      const sid = task.session_id || 'legacy';
      const list = bySession.get(sid) ?? [];
      list.push(task);
      bySession.set(sid, list);
    }

    for (const [sid, tasks] of bySession) {
      const completedPath = path.join(getCompletedDir(projectFp), `${sid}__main.jsonl`);
      ensureDir(path.dirname(completedPath));

      const lines = tasks.map((t) => JSON.stringify(taskEntryToCompletedTurn(t, projectFp, displayName)));
      fs.appendFileSync(completedPath, lines.join('\n') + '\n');
    }
  }

  return { migratedCount: completedTasks.length };
}

/** Write the migration marker file */
function writeMarker(projectFp: string, legacySlug: string, count: number): void {
  const markerPath = path.join(getProjectDir(projectFp), MIGRATION_MARKER);
  ensureDir(path.dirname(markerPath));
  fs.writeFileSync(
    markerPath,
    JSON.stringify({
      migrated_at: new Date().toISOString(),
      legacy_slug: legacySlug,
      tasks_migrated: count,
    }),
  );
}

/** Legacy slug function (same as old store.ts) for finding legacy files */
export function legacySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
