/**
 * Project velocity statistics — computes medians, IQR, and volatility
 * per task classification from historical data.
 */
import type { TaskEntry, TaskClassification, LastCompleted } from './types.js';
import { estimateInitial, toTaskEstimate } from './estimator.js';

interface ClassificationStats {
  classification: TaskClassification;
  count: number;
  median: number;
  p25: number;
  p75: number;
  volatility: 'low' | 'medium' | 'high';
}

export interface ProjectStats {
  totalCompleted: number;
  overall: { median: number; p25: number; p75: number };
  byClassification: ClassificationStats[];
}

export interface TaskEstimate {
  low: number;
  high: number;
  median: number;
  confidence: number;
  basis: string;
  volatility: 'low' | 'medium' | 'high';
  complexity: number;
}

// ── Constants ─────────────────────────────────────────────────

/** Minimum completed tasks before real stats kick in */
export const CALIBRATION_THRESHOLD = 5;

/** Generic baselines (seconds) used before enough real data exists */
export const DEFAULT_BASELINES: Record<TaskClassification, { low: number; median: number; high: number }> = {
  bugfix: { low: 300, median: 600, high: 900 }, // 5–15min
  feature: { low: 900, median: 1800, high: 2700 }, // 15–45min
  refactor: { low: 300, median: 600, high: 1200 }, // 5–20min
  config: { low: 120, median: 180, high: 300 }, // 2–5min
  docs: { low: 120, median: 300, high: 600 }, // 2–10min
  test: { low: 180, median: 480, high: 900 }, // 3–15min
  debug: { low: 180, median: 480, high: 1200 }, // 3–20min
  review: { low: 60, median: 180, high: 480 }, // 1–8min
  other: { low: 30, median: 60, high: 180 }, // 30s–3min
};

function sortedDurations(tasks: TaskEntry[]): number[] {
  return tasks
    .filter((t) => t.duration_seconds != null && t.duration_seconds > 0)
    .map((t) => t.duration_seconds as number)
    .sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (idx - lower) * (sorted[upper] - sorted[lower]));
}

function volatility(median: number, iqr: number): 'low' | 'medium' | 'high' {
  if (median === 0) return 'low';
  const ratio = iqr / median;
  if (ratio < 0.5) return 'low';
  if (ratio < 1.5) return 'medium';
  return 'high';
}

export function computeStats(tasks: TaskEntry[]): ProjectStats | null {
  const durations = sortedDurations(tasks);
  if (durations.length < 5) return null; // Not enough data

  const overall = {
    median: percentile(durations, 50),
    p25: percentile(durations, 25),
    p75: percentile(durations, 75),
  };

  // Group by classification
  const groups = new Map<TaskClassification, TaskEntry[]>();
  for (const t of tasks) {
    if (t.duration_seconds == null || t.duration_seconds <= 0) continue;
    const list = groups.get(t.classification) ?? [];
    list.push(t);
    groups.set(t.classification, list);
  }

  const byClassification: ClassificationStats[] = [];
  for (const [cls, entries] of groups) {
    if (entries.length < 2) continue; // Need at least 2 for meaningful stats
    const sorted = sortedDurations(entries);
    const med = percentile(sorted, 50);
    const p25 = percentile(sorted, 25);
    const p75 = percentile(sorted, 75);
    byClassification.push({
      classification: cls,
      count: entries.length,
      median: med,
      p25,
      p75,
      volatility: volatility(med, p75 - p25),
    });
  }

  // Sort by count descending
  byClassification.sort((a, b) => b.count - a.count);

  return { totalCompleted: durations.length, overall, byClassification };
}

// ── Task estimation ───────────────────────────────────────────

/** Score prompt complexity 1-5 based on length, file mentions, and scope */
export function scorePromptComplexity(prompt: string): number {
  let score = 1;

  // Length factor
  if (prompt.length > 200) score += 1;
  if (prompt.length > 500) score += 1;

  // File/path mentions
  const fileMentions = (prompt.match(/\b[\w./-]+\.(ts|js|tsx|jsx|json|md|css|html|py|go|rs|yaml|yml|toml)\b/gi) || [])
    .length;
  if (fileMentions >= 2) score += 1;
  if (fileMentions >= 5) score += 1;

  // Broad scope words
  if (/\b(all|every|entire|whole|across|throughout|each|multiple|several|many|everything)\b/i.test(prompt)) score += 1;

  return Math.min(score, 5);
}

/** Estimate duration using shrinkage quantile blending (v2 estimator) */
export function estimateTask(stats: ProjectStats, classification: string, complexity: number): TaskEstimate {
  const est = estimateInitial(stats, classification as TaskClassification, complexity);
  return toTaskEstimate(est, complexity);
}

/** Estimate from generic baselines (cold start, before real data exists) */
export function getDefaultEstimate(classification: TaskClassification, complexity: number): TaskEstimate {
  const est = estimateInitial(null, classification, complexity);
  return toTaskEstimate(est, complexity);
}

// ── Formatting ────────────────────────────────────────────────

export function fmtSec(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h${remainMin}m` : `${hr}h`;
}

/** Format stats as a concise context string for Claude injection */
export function formatStatsContext(stats: ProjectStats, estimate?: TaskEstimate): string {
  const lines: string[] = [
    `[claude-eta] Project velocity (${stats.totalCompleted} completed tasks):`,
    `Overall: median ${fmtSec(stats.overall.median)}, range ${fmtSec(stats.overall.p25)}–${fmtSec(stats.overall.p75)}`,
  ];

  for (const s of stats.byClassification) {
    lines.push(
      `${s.classification}: median ${fmtSec(s.median)} (${fmtSec(s.p25)}–${fmtSec(s.p75)}, ${s.volatility} volatility, ${s.count} tasks)`,
    );
  }

  if (estimate) {
    const vol = estimate.volatility === 'high' ? ' — high volatility, wide range expected' : '';
    lines.push(
      `→ Current task estimate: ${fmtSec(estimate.low)}–${fmtSec(estimate.high)} (${estimate.confidence}% confidence, ${estimate.basis}${vol})`,
    );
  }

  lines.push(
    'Use these baselines to calibrate any time estimates. Do not volunteer time estimates unless the user asks.',
  );

  return lines.join('\n');
}

/** Format context during cold start (< CALIBRATION_THRESHOLD tasks) */
export function formatColdStartContext(estimate: TaskEstimate, tasksCompleted: number): string {
  const lines: string[] = [
    `[claude-eta] Calibration: ${tasksCompleted}/${CALIBRATION_THRESHOLD} tasks recorded. Estimates become project-specific after ${CALIBRATION_THRESHOLD} tasks.`,
    `→ Current task estimate: ${fmtSec(estimate.low)}–${fmtSec(estimate.high)} (${estimate.confidence}% confidence, ${estimate.basis} — not calibrated to this project yet)`,
    'Use these baselines to calibrate any time estimates. Do not volunteer time estimates unless the user asks.',
  ];
  return lines.join('\n');
}

/** One-line recap of the last completed task */
export function formatTaskRecap(info: LastCompleted): string {
  const parts: string[] = [];
  if (info.tool_calls > 0) parts.push(`${info.tool_calls} tool calls`);
  const fileOps = info.files_read + info.files_edited + info.files_created;
  if (fileOps > 0) parts.push(`${fileOps} files`);
  const detail = parts.length > 0 ? `, ${parts.join(', ')}` : '';
  return `[claude-eta] Previous task completed: ${info.classification}, ${fmtSec(info.duration_seconds)}${detail}`;
}
