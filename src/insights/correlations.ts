/**
 * Correlation-based insights: error-duration, context-switch cost, volatility root causes.
 */
import type {
  CompletedTask,
  ErrorDurationResult,
  ContextSwitchResult,
  VolatilityCausesResult,
} from './types.js';
import { median, groupBy } from './types.js';

// ── Helpers ──────────────────────────────────────────────────

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx,
      y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/** Sort by timestamp using a Schwartzian transform (avoids repeated new Date() in comparator) */
function sortByTimestamp(tasks: CompletedTask[]): CompletedTask[] {
  return tasks
    .map((t) => ({ t, ts: new Date(t.timestamp_start).getTime() }))
    .sort((a, b) => a.ts - b.ts)
    .map((x) => x.t);
}

// ── Insights ─────────────────────────────────────────────────

/** Insight 1: Do tasks with errors take longer? */
export function errorDurationCorrelation(tasks: CompletedTask[]): ErrorDurationResult | null {
  if (tasks.length < 10) return null;

  const withErrors = tasks.filter((t) => (t.errors ?? 0) > 0);
  const withoutErrors = tasks.filter((t) => (t.errors ?? 0) === 0);

  if (withErrors.length < 3 || withoutErrors.length < 3) return null;

  const medWith = median(
    withErrors.map((t) => t.duration_seconds).sort((a, b) => a - b),
  );
  const medWithout = median(
    withoutErrors.map((t) => t.duration_seconds).sort((a, b) => a - b),
  );

  const overheadPct = medWithout === 0 ? 0 : Math.round(((medWith - medWithout) / medWithout) * 100);

  return {
    kind: 'error-duration',
    medianWithErrors: medWith,
    medianWithoutErrors: medWithout,
    overheadPct,
    tasksWithErrors: withErrors.length,
    sampleSize: tasks.length,
  };
}

/** Insight 6: Does switching task type cost time? */
export function contextSwitchCost(tasks: CompletedTask[]): ContextSwitchResult | null {
  if (tasks.length < 2) return null;

  const sorted = sortByTimestamp(tasks);

  const sameDurations: number[] = [];
  const diffDurations: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].classification === sorted[i - 1].classification) {
      sameDurations.push(sorted[i].duration_seconds);
    } else {
      diffDurations.push(sorted[i].duration_seconds);
    }
  }

  const totalPairs = sameDurations.length + diffDurations.length;
  if (totalPairs < 10 || sameDurations.length < 3 || diffDurations.length < 3) return null;

  const medSame = median(sameDurations.sort((a, b) => a - b));
  const medDiff = median(diffDurations.sort((a, b) => a - b));
  const overheadPct = medSame === 0 ? 0 : Math.round(((medDiff - medSame) / medSame) * 100);

  return {
    kind: 'context-switch',
    medianSameType: medSame,
    medianDiffType: medDiff,
    overheadPct,
    sameTypeCount: sameDurations.length,
    diffTypeCount: diffDurations.length,
    sampleSize: totalPairs,
  };
}

/** Insight 7: What drives duration volatility in the most volatile classification? */
export function volatilityRootCauses(tasks: CompletedTask[]): VolatilityCausesResult | null {
  const groups = groupBy(tasks, (t) => t.classification);

  // Find the classification with highest IQR/median ratio, min 10 tasks
  let bestCls = '';
  let bestRatio = -1;
  let bestTasks: CompletedTask[] = [];

  for (const [cls, entries] of groups) {
    if (entries.length < 10) continue;
    const sorted = entries.map((t) => t.duration_seconds).sort((a, b) => a - b);
    const med = median(sorted);
    if (med === 0) continue;
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const ratio = (q3 - q1) / med;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestCls = cls;
      bestTasks = entries;
    }
  }

  if (!bestCls || bestTasks.length < 10) return null;

  const durations = bestTasks.map((t) => t.duration_seconds);

  const factorDefs: { name: string; values: number[] }[] = [
    { name: 'prompt_length', values: bestTasks.map((t) => t.prompt_summary.length) },
    { name: 'tool_calls', values: bestTasks.map((t) => t.tool_calls) },
    { name: 'errors', values: bestTasks.map((t) => t.errors ?? 0) },
    {
      name: 'files_changed',
      values: bestTasks.map((t) => t.files_edited + t.files_created),
    },
  ];

  const factors = factorDefs
    .map(({ name, values }) => {
      const r = pearsonR(values, durations);
      return {
        factor: name,
        correlation: Math.round(r * 100) / 100,
        direction: r > 0.1 ? 'positive' : r < -0.1 ? 'negative' : 'none',
      };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  return {
    kind: 'volatility-causes',
    classification: bestCls,
    factors,
    sampleSize: bestTasks.length,
  };
}
