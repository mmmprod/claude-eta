/**
 * Shared types for insight modules.
 */
import type { AnalyticsTask, TaskClassification } from '../types.js';

// Re-export for convenience
export type { AnalyticsTask, TaskClassification };

/** An AnalyticsTask with a guaranteed positive duration */
export type CompletedTask = AnalyticsTask & { duration_seconds: number };

// ── Utility functions (shared across modules) ────────────────

/** Filter tasks with valid positive duration */
export function completed(tasks: AnalyticsTask[]): CompletedTask[] {
  return tasks.filter((t): t is CompletedTask => t.duration_seconds != null && t.duration_seconds > 0);
}

/** Median of a pre-sorted numeric array */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Group items by a string key */
export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

// ── Insight result types (discriminated union on `kind`) ─────

export interface ErrorDurationResult {
  kind: 'error-duration';
  medianWithErrors: number;
  medianWithoutErrors: number;
  overheadPct: number;
  tasksWithErrors: number;
  sampleSize: number;
}

export interface ContextSwitchResult {
  kind: 'context-switch';
  medianSameType: number;
  medianDiffType: number;
  overheadPct: number;
  sameTypeCount: number;
  diffTypeCount: number;
  sampleSize: number;
}

export interface VolatilityCausesResult {
  kind: 'volatility-causes';
  classification: string;
  factors: { factor: string; correlation: number; direction: string }[];
  sampleSize: number;
}

export interface FileOpsResult {
  kind: 'file-ops';
  byClassification: {
    classification: string;
    count: number;
    avgReads: number;
    avgEdits: number;
    avgCreates: number;
    explorationIndex: number;
  }[];
  sampleSize: number;
}

export interface ModelComparisonResult {
  kind: 'model-comparison';
  byModel: {
    model: string;
    count: number;
    medianDuration: number;
    medianToolCalls: number;
  }[];
  fastestModel: string;
  sampleSize: number;
}

export interface EfficiencyResult {
  kind: 'efficiency';
  byClassification: {
    classification: string;
    count: number;
    medianSecsPerTool: number;
    medianToolsPerFile: number;
  }[];
  sampleSize: number;
}

export interface SessionFatigueResult {
  kind: 'session-fatigue';
  avgByPosition: { position: number; avgDuration: number; count: number }[];
  fatigueRatio: number;
  sampleSize: number;
}

export interface TimeOfDayResult {
  kind: 'time-of-day';
  byPeriod: {
    period: string;
    hours: string;
    count: number;
    medianDuration: number;
  }[];
  fastestPeriod: string;
  sampleSize: number;
}

export interface WeeklyTrendsResult {
  kind: 'trends';
  weeks: {
    label: string;
    count: number;
    medianDuration: number;
    totalDuration: number;
  }[];
  direction: 'improving' | 'degrading' | 'stable';
  changeRate: number;
  sampleSize: number;
}

export type InsightResult =
  | ErrorDurationResult
  | ContextSwitchResult
  | VolatilityCausesResult
  | FileOpsResult
  | ModelComparisonResult
  | EfficiencyResult
  | SessionFatigueResult
  | TimeOfDayResult
  | WeeklyTrendsResult;
