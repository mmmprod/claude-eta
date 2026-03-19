/**
 * SessionStart hook — injects passive velocity context for the project.
 * Fires on startup/resume/clear/compact so Claude always has calibration data.
 */
import * as path from 'node:path';
import { readStdin } from '../stdin.js';
import { loadProject } from '../store.js';
import { computeStats, formatStatsContext, CALIBRATION_THRESHOLD } from '../stats.js';

interface SessionStartStdin {
  session_id?: string;
  cwd?: string;
}

async function main(): Promise<void> {
  const stdin = await readStdin<SessionStartStdin>();
  const cwd = stdin?.cwd;
  if (!cwd) return;

  const project = path.basename(cwd);
  const data = loadProject(project);
  const completed = data.tasks.filter((t) => t.duration_seconds != null).length;

  if (completed === 0) {
    // First-run welcome
    process.stdout.write(
      `[claude-eta] Plugin active — tracking task durations. Data is 100% local.\n` +
        `Calibration: 0/${CALIBRATION_THRESHOLD} tasks. Estimates unlock after a few completed tasks.`,
    );
    return;
  }

  if (completed < CALIBRATION_THRESHOLD) {
    // Cold start progress
    process.stdout.write(
      `[claude-eta] Calibration: ${completed}/${CALIBRATION_THRESHOLD} tasks recorded. Estimates improving with each task.`,
    );
    return;
  }

  // Calibrated — inject full velocity context
  const stats = computeStats(data.tasks);
  if (!stats) return;
  process.stdout.write(formatStatsContext(stats));
}

void main();
