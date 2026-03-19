/**
 * Project velocity statistics — computes medians, IQR, and volatility
 * per task classification from historical data.
 */
import type { TaskEntry, TaskClassification } from './types.js';

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

function sortedDurations(tasks: TaskEntry[]): number[] {
  return tasks
    .filter(t => t.duration_seconds != null && t.duration_seconds > 0)
    .map(t => t.duration_seconds as number)
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

function fmtSec(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h${remainMin}m` : `${hr}h`;
}

/** Format stats as a concise context string for Claude injection */
export function formatStatsContext(stats: ProjectStats): string {
  const lines: string[] = [
    `[claude-eta] Project velocity (${stats.totalCompleted} completed tasks):`,
    `Overall: median ${fmtSec(stats.overall.median)}, range ${fmtSec(stats.overall.p25)}–${fmtSec(stats.overall.p75)}`,
  ];

  for (const s of stats.byClassification) {
    lines.push(
      `${s.classification}: median ${fmtSec(s.median)} (${fmtSec(s.p25)}–${fmtSec(s.p75)}, ${s.volatility} volatility, ${s.count} tasks)`
    );
  }

  lines.push('Use these baselines to calibrate any time estimates. Do not volunteer time estimates unless the user asks.');

  return lines.join('\n');
}
