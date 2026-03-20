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
import { loadProject, flushActiveTask, getActiveTask, setLastCompleted, consumeLastEta, saveProject } from '../store.js';
import { computeStats, fmtSec } from '../stats.js';
import { extractDurations, findBullshitEstimate } from '../detector.js';

function blockWithCorrection(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

/** Flush the active task and record a recap for the next prompt to pick up */
function flushAndRecord(): void {
  const data = flushActiveTask();
  if (!data) return;

  const lastTask = data.tasks[data.tasks.length - 1];
  if (lastTask?.duration_seconds != null) {
    const { classification, duration_seconds, tool_calls, files_read, files_edited, files_created } = lastTask;
    setLastCompleted({ classification, duration_seconds, tool_calls, files_read, files_edited, files_created });
  }
}

async function main(): Promise<void> {
  const stdin = await readStdin<StopStdin>();

  // If stop hook already fired (correction delivered), just flush
  if (stdin?.stop_hook_active) {
    flushAndRecord();
    consumeLastEta(); // cleanup, don't score
    return;
  }

  // Check for bad time estimates in Claude's last message
  const message = stdin?.last_assistant_message ?? '';
  const active = getActiveTask();

  if (message && active) {
    const data = loadProject(active.project);
    const stats = computeStats(data.tasks);

    if (stats) {
      const durations = extractDurations(message, { estimatesOnly: true });
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
  const activeBeforeFlush = getActiveTask();
  flushAndRecord();

  // Self-check Auto-ETA accuracy
  if (stdin?.stop_hook_active) {
    // BS detector fired — duration includes correction time, skip scoring
    consumeLastEta(); // cleanup only
  } else if (activeBeforeFlush) {
    const lastEta = consumeLastEta();
    if (lastEta) {
      const projectData = loadProject(activeBeforeFlush.project);
      const lastTask = projectData.tasks[projectData.tasks.length - 1];
      if (
        lastTask?.task_id === lastEta.task_id &&
        lastTask.duration_seconds != null
      ) {
        const hit =
          lastTask.duration_seconds >= lastEta.low &&
          lastTask.duration_seconds <= lastEta.high;
        projectData.eta_accuracy ??= {};
        projectData.eta_accuracy[lastEta.classification] ??= { hits: 0, misses: 0 };
        if (hit) projectData.eta_accuracy[lastEta.classification].hits++;
        else projectData.eta_accuracy[lastEta.classification].misses++;
        saveProject(projectData);
      }
    }
  }
}

void main();
