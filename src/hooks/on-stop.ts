/**
 * Stop hook — Bullshit Detector + task flush.
 *
 * 1. If stop_hook_active (already corrected once) → just flush
 * 2. Scan last_assistant_message for time estimates
 * 3. If wildly off from project history → block stop + inject correction
 * 4. Otherwise → flush active task normally
 */
import type { StopStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { loadProject, flushActiveTask, getActiveTask } from '../store.js';
import { computeStats } from '../stats.js';
import { extractDurations, findBullshitEstimate } from '../detector.js';

function fmtSec(s: number): string {
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${min % 60}m`;
}

function blockWithCorrection(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

async function main(): Promise<void> {
  const stdin = await readStdin<StopStdin>();

  // If stop hook already fired (correction delivered), just flush
  if (stdin?.stop_hook_active) {
    flushActiveTask();
    return;
  }

  // Check for bad time estimates in Claude's last message
  const message = stdin?.last_assistant_message ?? '';
  const active = getActiveTask();

  if (message && active) {
    const data = loadProject(active.project);
    const stats = computeStats(data.tasks);

    if (stats) {
      const durations = extractDurations(message);
      const bullshit = findBullshitEstimate(durations, stats.overall.p75, stats.overall.median);

      if (bullshit) {
        // Find classification-specific stats for the current task
        const lastTask = data.tasks[data.tasks.length - 1];
        const cls = lastTask?.classification ?? 'other';
        const clsStats = stats.byClassification.find((s) => s.classification === cls);
        const ref = clsStats ?? {
          median: stats.overall.median,
          p25: stats.overall.p25,
          p75: stats.overall.p75,
          count: stats.totalCompleted,
        };

        const reason =
          `[claude-eta] Time estimate correction: you said "${bullshit.raw}" ` +
          `but project history shows ${cls} tasks take ${fmtSec(ref.p25)}–${fmtSec(ref.p75)} ` +
          `(median ${fmtSec(ref.median)}, based on ${ref.count} tasks). ` +
          `Please correct your time estimate to match the real data.`;

        blockWithCorrection(reason);
        return; // Don't flush — Claude will continue, next Stop will flush
      }
    }
  }

  // No bad estimate detected — flush normally
  flushActiveTask();
}

void main();
