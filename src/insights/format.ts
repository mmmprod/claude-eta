/**
 * Markdown formatting for insight results.
 */
import type {
  InsightResult,
  ErrorDurationResult,
  ContextSwitchResult,
  VolatilityCausesResult,
  FileOpsResult,
  ModelComparisonResult,
  EfficiencyResult,
  SessionFatigueResult,
  TimeOfDayResult,
  WeeklyTrendsResult,
} from './types.js';

// ── Helpers ──────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`;
}

function col(s: string, len: number, align: 'left' | 'right' = 'left'): string {
  const truncated = s.length > len ? s.slice(0, len) : s;
  return align === 'left' ? truncated.padEnd(len) : truncated.padStart(len);
}

function sign(n: number): string {
  return n > 0 ? `+${n}%` : `${n}%`;
}

// ── Formatters per kind ──────────────────────────────────────

function fmtErrorDuration(r: ErrorDurationResult): string {
  const lines: string[] = [
    `### Errors vs Duration`,
    '',
    `Tasks with errors take **${r.overheadPct > 0 ? sign(r.overheadPct) : `${r.overheadPct}%`}** ${r.overheadPct > 0 ? 'longer' : 'shorter'} (median).`,
    '',
    `| Group            | Median   | Tasks |`,
    `|------------------|----------|-------|`,
    `| Without errors   | ${col(fmtDuration(r.medianWithoutErrors), 8)} | ${col(String(r.sampleSize - r.tasksWithErrors), 5, 'right')} |`,
    `| With errors      | ${col(fmtDuration(r.medianWithErrors), 8)} | ${col(String(r.tasksWithErrors), 5, 'right')} |`,
  ];
  return lines.join('\n');
}

function fmtContextSwitch(r: ContextSwitchResult): string {
  const verb = r.overheadPct > 0 ? 'slower' : 'faster';
  const lines: string[] = [
    `### Context-Switch Cost`,
    '',
    `Switching task type is **${sign(r.overheadPct)}** ${verb} than staying on the same type.`,
    '',
    `| Transition       | Median   | Pairs |`,
    `|------------------|----------|-------|`,
    `| Same type        | ${col(fmtDuration(r.medianSameType), 8)} | ${col(String(r.sameTypeCount), 5, 'right')} |`,
    `| Different type   | ${col(fmtDuration(r.medianDiffType), 8)} | ${col(String(r.diffTypeCount), 5, 'right')} |`,
  ];
  return lines.join('\n');
}

function fmtVolatilityCauses(r: VolatilityCausesResult): string {
  const lines: string[] = [
    `### Volatility Root Causes (${r.classification})`,
    '',
    `Correlation with duration in the most volatile type (${r.sampleSize} tasks):`,
    '',
    `| Factor          | Correlation | Direction |`,
    `|-----------------|-------------|-----------|`,
  ];
  for (const f of r.factors) {
    lines.push(
      `| ${col(f.factor, 15)} | ${col(String(f.correlation), 11, 'right')} | ${col(f.direction, 9)} |`,
    );
  }
  return lines.join('\n');
}

function fmtFileOps(r: FileOpsResult): string {
  const lines: string[] = [
    `### File Operation Ratios`,
    '',
    `| Type      | Tasks | Avg Reads | Avg Edits | Avg Creates | Exploration |`,
    `|-----------|-------|-----------|-----------|-------------|-------------|`,
  ];
  for (const c of r.byClassification) {
    lines.push(
      `| ${col(c.classification, 9)} | ${col(String(c.count), 5, 'right')} | ${col(String(c.avgReads), 9, 'right')} | ${col(String(c.avgEdits), 9, 'right')} | ${col(String(c.avgCreates), 11, 'right')} | ${col(String(c.explorationIndex), 11, 'right')} |`,
    );
  }
  lines.push('', '_Exploration index = reads / writes. Higher = more reading before editing._');
  return lines.join('\n');
}

function fmtModelComparison(r: ModelComparisonResult): string {
  const lines: string[] = [
    `### Model Comparison`,
    '',
    `Fastest model: **${r.fastestModel}**`,
    '',
    `| Model                    | Tasks | Median Duration | Median Tools |`,
    `|--------------------------|-------|-----------------|--------------|`,
  ];
  for (const m of r.byModel) {
    lines.push(
      `| ${col(m.model, 24)} | ${col(String(m.count), 5, 'right')} | ${col(fmtDuration(m.medianDuration), 15)} | ${col(String(m.medianToolCalls), 12, 'right')} |`,
    );
  }
  return lines.join('\n');
}

function fmtEfficiency(r: EfficiencyResult): string {
  const lines: string[] = [
    `### Efficiency by Type`,
    '',
    `| Type      | Tasks | Secs/Tool | Tools/File |`,
    `|-----------|-------|-----------|------------|`,
  ];
  for (const c of r.byClassification) {
    lines.push(
      `| ${col(c.classification, 9)} | ${col(String(c.count), 5, 'right')} | ${col(String(c.medianSecsPerTool), 9, 'right')} | ${col(String(c.medianToolsPerFile), 10, 'right')} |`,
    );
  }
  return lines.join('\n');
}

function fmtSessionFatigue(r: SessionFatigueResult): string {
  const trend =
    r.fatigueRatio > 1.1
      ? 'Tasks take longer later in sessions'
      : r.fatigueRatio < 0.9
        ? 'Tasks get faster later in sessions'
        : 'Duration stays stable across sessions';
  const lines: string[] = [
    `### Session Fatigue`,
    '',
    `${trend} (ratio: **${r.fatigueRatio}x**).`,
    '',
    `| Position | Avg Duration | Tasks |`,
    `|----------|--------------|-------|`,
  ];
  for (const p of r.avgByPosition) {
    const label = p.position >= 5 ? '5+' : String(p.position);
    lines.push(
      `| ${col(label, 8)} | ${col(fmtDuration(p.avgDuration), 12)} | ${col(String(p.count), 5, 'right')} |`,
    );
  }
  return lines.join('\n');
}

function fmtTimeOfDay(r: TimeOfDayResult): string {
  const lines: string[] = [
    `### Time of Day`,
    '',
    `Fastest period: **${r.fastestPeriod}**`,
    '',
    `| Period     | Hours | Tasks | Median Duration |`,
    `|------------|-------|-------|-----------------|`,
  ];
  for (const p of r.byPeriod) {
    lines.push(
      `| ${col(p.period, 10)} | ${col(p.hours, 5)} | ${col(String(p.count), 5, 'right')} | ${col(fmtDuration(p.medianDuration), 15)} |`,
    );
  }
  return lines.join('\n');
}

function fmtWeeklyTrends(r: WeeklyTrendsResult): string {
  const dirLabel =
    r.direction === 'improving'
      ? 'Getting faster'
      : r.direction === 'degrading'
        ? 'Getting slower'
        : 'Stable';
  const lines: string[] = [
    `### Weekly Trends`,
    '',
    `Direction: **${dirLabel}** (${sign(r.changeRate)} change in median duration).`,
    '',
    `| Week    | Tasks | Median   | Total    |`,
    `|---------|-------|----------|----------|`,
  ];
  for (const w of r.weeks) {
    lines.push(
      `| ${col(w.label, 7)} | ${col(String(w.count), 5, 'right')} | ${col(fmtDuration(w.medianDuration), 8)} | ${col(fmtDuration(w.totalDuration), 8)} |`,
    );
  }
  return lines.join('\n');
}

// ── Main formatter ───────────────────────────────────────────

/** Format a single insight result to markdown */
function formatInsight(r: InsightResult): string {
  switch (r.kind) {
    case 'error-duration': return fmtErrorDuration(r);
    case 'context-switch': return fmtContextSwitch(r);
    case 'volatility-causes': return fmtVolatilityCauses(r);
    case 'file-ops': return fmtFileOps(r);
    case 'model-comparison': return fmtModelComparison(r);
    case 'efficiency': return fmtEfficiency(r);
    case 'session-fatigue': return fmtSessionFatigue(r);
    case 'time-of-day': return fmtTimeOfDay(r);
    case 'trends': return fmtWeeklyTrends(r);
  }
}

/** Format all insight results into a markdown report */
export function formatInsightsReport(results: InsightResult[]): string {
  if (results.length === 0) {
    return 'Not enough data for insights yet. Keep working and check back when you have more task history.';
  }

  const sections: string[] = [`## Insights (${results.length} of 9 available)\n`];

  for (const r of results) {
    sections.push(formatInsight(r));
  }

  return sections.join('\n\n');
}
