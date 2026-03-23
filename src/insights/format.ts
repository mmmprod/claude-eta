/**
 * Markdown formatting for insight results.
 */
import { c } from '../cli/colors.js';
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

function pctColor(n: number): (text: string) => string {
  if (n >= 0) return c.yellow;
  return c.green;
}

// ── Formatters per kind ──────────────────────────────────────

function fmtErrorDuration(r: ErrorDurationResult): string {
  const lines: string[] = [
    c.bold(`Errors vs Duration`),
    '',
    `Tasks with errors take ${pctColor(r.overheadPct)(r.overheadPct > 0 ? sign(r.overheadPct) : `${r.overheadPct}%`)} ${r.overheadPct > 0 ? 'longer' : 'shorter'} (median).`,
    '',
    c.dim(`| Group            | Median   | Tasks |`),
    c.dim(`|------------------|----------|-------|`),
    `| Without errors   | ${c.cyan(col(fmtDuration(r.medianWithoutErrors), 8))} | ${c.dim(col(String(r.sampleSize - r.tasksWithErrors), 5, 'right'))} |`,
    `| With errors      | ${c.cyan(col(fmtDuration(r.medianWithErrors), 8))} | ${c.dim(col(String(r.tasksWithErrors), 5, 'right'))} |`,
  ];
  return lines.join('\n');
}

function fmtContextSwitch(r: ContextSwitchResult): string {
  const verb = r.overheadPct > 0 ? 'slower' : 'faster';
  const lines: string[] = [
    c.bold(`Context-Switch Cost`),
    '',
    `Switching task type is ${pctColor(r.overheadPct)(sign(r.overheadPct))} ${verb} than staying on the same type.`,
    '',
    c.dim(`| Transition       | Median   | Pairs |`),
    c.dim(`|------------------|----------|-------|`),
    `| Same type        | ${c.cyan(col(fmtDuration(r.medianSameType), 8))} | ${c.dim(col(String(r.sameTypeCount), 5, 'right'))} |`,
    `| Different type   | ${c.cyan(col(fmtDuration(r.medianDiffType), 8))} | ${c.dim(col(String(r.diffTypeCount), 5, 'right'))} |`,
  ];
  return lines.join('\n');
}

function fmtVolatilityCauses(r: VolatilityCausesResult): string {
  const lines: string[] = [
    `${c.bold('Volatility Root Causes')} ${c.dim(`(${r.classification})`)}`,
    '',
    `Correlation with duration in the most volatile type (${r.sampleSize} tasks):`,
    '',
    c.dim(`| Factor          | Correlation | Direction |`),
    c.dim(`|-----------------|-------------|-----------|`),
  ];
  for (const f of r.factors) {
    lines.push(
      `| ${c.bold(col(f.factor, 15))} | ${c.cyan(col(String(f.correlation), 11, 'right'))} | ${c.dim(col(f.direction, 9))} |`,
    );
  }
  return lines.join('\n');
}

function fmtFileOps(r: FileOpsResult): string {
  const lines: string[] = [
    c.bold(`File Operation Ratios`),
    '',
    c.dim(`| Type      | Tasks | Avg Reads | Avg Edits | Avg Creates | Exploration |`),
    c.dim(`|-----------|-------|-----------|-----------|-------------|-------------|`),
  ];
  for (const row of r.byClassification) {
    lines.push(
      `| ${c.bold(col(row.classification, 9))} | ${c.dim(col(String(row.count), 5, 'right'))} | ${c.cyan(col(String(row.avgReads), 9, 'right'))} | ${c.cyan(col(String(row.avgEdits), 9, 'right'))} | ${c.cyan(col(String(row.avgCreates), 11, 'right'))} | ${c.cyan(col(String(row.explorationIndex), 11, 'right'))} |`,
    );
  }
  lines.push('', '_Exploration index = reads / writes. Higher = more reading before editing._');
  return lines.join('\n');
}

function fmtModelComparison(r: ModelComparisonResult): string {
  const lines: string[] = [
    c.bold(`Model Comparison`),
    '',
    `Fastest model: ${c.green(r.fastestModel)}`,
    '',
    c.dim(`| Model                    | Tasks | Median Duration | Median Tools |`),
    c.dim(`|--------------------------|-------|-----------------|--------------|`),
  ];
  for (const m of r.byModel) {
    lines.push(
      `| ${c.bold(col(m.model, 24))} | ${c.dim(col(String(m.count), 5, 'right'))} | ${c.cyan(col(fmtDuration(m.medianDuration), 15))} | ${c.cyan(col(String(m.medianToolCalls), 12, 'right'))} |`,
    );
  }
  return lines.join('\n');
}

function fmtEfficiency(r: EfficiencyResult): string {
  const lines: string[] = [
    c.bold(`Efficiency by Type`),
    '',
    c.dim(`| Type      | Tasks | Secs/Tool | Tools/File |`),
    c.dim(`|-----------|-------|-----------|------------|`),
  ];
  for (const row of r.byClassification) {
    lines.push(
      `| ${c.bold(col(row.classification, 9))} | ${c.dim(col(String(row.count), 5, 'right'))} | ${c.cyan(col(String(row.medianSecsPerTool), 9, 'right'))} | ${c.cyan(col(String(row.medianToolsPerFile), 10, 'right'))} |`,
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
    c.bold(`Session Fatigue`),
    '',
    `${trend} (ratio: ${c.cyan(`${r.fatigueRatio}x`)}).`,
    '',
    c.dim(`| Position | Avg Duration | Tasks |`),
    c.dim(`|----------|--------------|-------|`),
  ];
  for (const p of r.avgByPosition) {
    const label = p.position >= 5 ? '5+' : String(p.position);
    lines.push(
      `| ${c.bold(col(label, 8))} | ${c.cyan(col(fmtDuration(p.avgDuration), 12))} | ${c.dim(col(String(p.count), 5, 'right'))} |`,
    );
  }
  return lines.join('\n');
}

function fmtTimeOfDay(r: TimeOfDayResult): string {
  const lines: string[] = [
    c.bold(`Time of Day`),
    '',
    `Fastest period: ${c.green(r.fastestPeriod)}`,
    '',
    c.dim(`| Period     | Hours | Tasks | Median Duration |`),
    c.dim(`|------------|-------|-------|-----------------|`),
  ];
  for (const p of r.byPeriod) {
    lines.push(
      `| ${c.bold(col(p.period, 10))} | ${c.dim(col(p.hours, 5))} | ${c.dim(col(String(p.count), 5, 'right'))} | ${c.cyan(col(fmtDuration(p.medianDuration), 15))} |`,
    );
  }
  return lines.join('\n');
}

function fmtWeeklyTrends(r: WeeklyTrendsResult): string {
  const dirLabel =
    r.direction === 'improving' ? 'Getting faster' : r.direction === 'degrading' ? 'Getting slower' : 'Stable';
  const lines: string[] = [
    c.bold(`Weekly Trends`),
    '',
    `Direction: ${r.direction === 'improving' ? c.green(dirLabel) : r.direction === 'degrading' ? c.red(dirLabel) : c.dim(dirLabel)} (${pctColor(r.changeRate)(sign(r.changeRate))} change in median duration).`,
    '',
    c.dim(`| Week    | Tasks | Median   | Total    |`),
    c.dim(`|---------|-------|----------|----------|`),
  ];
  for (const w of r.weeks) {
    lines.push(
      `| ${c.bold(col(w.label, 7))} | ${c.dim(col(String(w.count), 5, 'right'))} | ${c.cyan(col(fmtDuration(w.medianDuration), 8))} | ${c.cyan(col(fmtDuration(w.totalDuration), 8))} |`,
    );
  }
  return lines.join('\n');
}

// ── Main formatter ───────────────────────────────────────────

/** Format a single insight result to markdown */
function formatInsight(r: InsightResult): string {
  switch (r.kind) {
    case 'error-duration':
      return fmtErrorDuration(r);
    case 'context-switch':
      return fmtContextSwitch(r);
    case 'volatility-causes':
      return fmtVolatilityCauses(r);
    case 'file-ops':
      return fmtFileOps(r);
    case 'model-comparison':
      return fmtModelComparison(r);
    case 'efficiency':
      return fmtEfficiency(r);
    case 'session-fatigue':
      return fmtSessionFatigue(r);
    case 'time-of-day':
      return fmtTimeOfDay(r);
    case 'trends':
      return fmtWeeklyTrends(r);
  }
}

/** Format all insight results into a markdown report */
export function formatInsightsReport(results: InsightResult[]): string {
  if (results.length === 0) {
    return 'Not enough data for insights yet. Keep working and check back when you have more task history.';
  }

  const sections: string[] = [`${c.bold('Insights')} ${c.dim(`(${results.length} of 9 available)`)}\n`];

  for (const r of results) {
    sections.push(formatInsight(r));
  }

  return sections.join('\n\n');
}
