/**
 * Stop hook — marks the end of the current task.
 * Calculates duration and closes the active task.
 */
import { getActiveTask, clearActiveTask, updateLastTask } from '../store.js';

function main(): void {
  const active = getActiveTask();
  if (!active) return;

  const durationMs = Date.now() - active.start;
  updateLastTask(active.project, {
    timestamp_end: new Date().toISOString(),
    duration_seconds: Math.round(durationMs / 1000),
  });
  clearActiveTask();
}

main();
