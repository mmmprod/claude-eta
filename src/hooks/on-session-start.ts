/**
 * SessionStart hook — injects passive velocity context for the project.
 * Fires on startup/resume/clear/compact so Claude always has calibration data.
 */
import * as path from 'node:path';
import { readStdin } from '../stdin.js';
import { loadProject } from '../store.js';
import { computeStats, formatStatsContext } from '../stats.js';

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
  const stats = computeStats(data.tasks);
  if (!stats) return;

  process.stdout.write(formatStatsContext(stats));
}

void main();
