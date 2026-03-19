/**
 * Stop hook — closes the active task with final duration and counters.
 * Flushes accumulated counters from _active.json into the project data file.
 */
import { getActiveTask, clearActiveTask, updateLastTask } from '../store.js';

function main(): void {
  const active = getActiveTask();
  if (!active) return;

  const durationMs = Date.now() - active.start;
  updateLastTask(active.project, {
    timestamp_end: new Date().toISOString(),
    duration_seconds: Math.round(durationMs / 1000),
    tool_calls: active.tool_calls,
    files_read: active.files_read,
    files_edited: active.files_edited,
    files_created: active.files_created,
    errors: active.errors,
  });
  clearActiveTask();
}

main();
