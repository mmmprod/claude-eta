/**
 * /eta admin-export — Full admin dashboard data as a single JSON.
 * Output: <plugin_data>/export/admin-export.json
 *
 * 6 sections:
 * 1. Health: uptime, active turns, last events, stop_reason distribution
 * 2. ETA Accuracy: hits/misses by project×type, auto-disabled types
 * 3. Data Quality: turns by project/week, classification distribution, coverage, time ratios
 * 4. Supabase: baselines availability, last refresh
 * 5. Insights: 9 deep analyses (reuse existing)
 * 6. Subagents: main vs subagent breakdown
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getPluginDataDir,
  getActiveDir,
  getSessionsDir,
  getLegacyDataDir,
} from '../paths.js';
import { loadCompletedTurns } from '../event-store.js';
import { turnsToTaskEntries } from '../compat.js';
import { computeAllInsights } from '../insights/index.js';
import { median, groupBy } from '../insights/types.js';
import { isoWeekLabel } from '../insights/temporal.js';
import { fetchBaselines } from '../supabase.js';
import type { CompletedTurn, TaskClassification, RunnerKind } from '../types.js';
import type { InsightResult } from '../insights/types.js';

// ── Helpers ──────────────────────────────────────────────────

function sortedWallSeconds(turns: CompletedTurn[]): number[] {
  return turns.map((t) => t.wall_seconds).sort((a, b) => a - b);
}

function isThisWeek(iso: string): boolean {
  return isoWeekLabel(iso) === isoWeekLabel(new Date().toISOString());
}

// ── Project discovery ────────────────────────────────────────

interface ActiveTurnSummary {
  session_id: string;
  agent_key: string;
  classification: TaskClassification;
  runner_kind: RunnerKind;
  started_at: string;
  tool_calls: number;
}

interface ProjectInfo {
  fp: string;
  displayName: string;
  turns: CompletedTurn[];
  activeTurns: ActiveTurnSummary[];
  lastEventAt: string | null;
}

function discoverProjects(): ProjectInfo[] {
  const projectsDir = path.join(getPluginDataDir(), 'projects');
  const projects: ProjectInfo[] = [];

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fp = entry.name;
      const turns = loadCompletedTurns(fp);
      const activeTurns = scanActiveTurns(fp);

      // Display name from turns or session metadata
      let displayName = fp;
      if (turns.length > 0) {
        displayName = turns[0].project_display_name || fp;
      } else {
        try {
          const sessDir = getSessionsDir(fp);
          const sessFiles = fs.readdirSync(sessDir).filter((f) => f.endsWith('.json'));
          if (sessFiles.length > 0) {
            const meta = JSON.parse(fs.readFileSync(path.join(sessDir, sessFiles[0]), 'utf-8'));
            displayName = meta.project_display_name || fp;
          }
        } catch {
          /* no sessions */
        }
      }

      // Most recent event timestamp
      let lastEventAt: string | null = null;
      if (turns.length > 0) {
        lastEventAt = turns.reduce(
          (latest, t) => (t.ended_at > latest ? t.ended_at : latest),
          turns[0].ended_at,
        );
      }
      for (const at of activeTurns) {
        if (!lastEventAt || at.started_at > lastEventAt) lastEventAt = at.started_at;
      }

      projects.push({ fp, displayName, turns, activeTurns, lastEventAt });
    }
  } catch {
    /* no projects dir */
  }

  return projects;
}

function scanActiveTurns(projectFp: string): ActiveTurnSummary[] {
  const activeDir = getActiveDir(projectFp);
  const results: ActiveTurnSummary[] = [];
  try {
    const files = fs.readdirSync(activeDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf-8'));
        results.push({
          session_id: s.session_id ?? '',
          agent_key: s.agent_key ?? '',
          classification: s.classification ?? 'other',
          runner_kind: s.runner_kind ?? 'main',
          started_at: s.started_at ?? '',
          tool_calls: s.tool_calls ?? 0,
        });
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* no active dir */
  }
  return results;
}

// ── Section 1: Health ────────────────────────────────────────

function buildHealth(allTurns: CompletedTurn[], projects: ProjectInfo[], pluginVersion: string) {
  const allActive = projects.flatMap((p) => p.activeTurns);

  // Earliest turn = plugin uptime start
  let uptimeSince: string | null = null;
  for (const t of allTurns) {
    if (!uptimeSince || t.started_at < uptimeSince) uptimeSince = t.started_at;
  }
  const uptimeDays = uptimeSince
    ? Math.floor((Date.now() - new Date(uptimeSince).getTime()) / 86_400_000)
    : 0;

  // Stop reason distribution
  const stopReasons: Record<string, number> = {};
  for (const t of allTurns) {
    stopReasons[t.stop_reason] = (stopReasons[t.stop_reason] ?? 0) + 1;
  }

  // Stop failure rate
  const totalStops = allTurns.length || 1;
  const failures = stopReasons['stop_failure'] ?? 0;
  const failureRate = Math.round((failures / totalStops) * 100);

  // Last event by project (sorted most recent first)
  const lastEventByProject = projects
    .filter((p) => p.lastEventAt)
    .map((p) => {
      const hoursSince = (Date.now() - new Date(p.lastEventAt!).getTime()) / 3_600_000;
      return {
        project_fp: p.fp,
        display_name: p.displayName,
        last_event_at: p.lastEventAt!,
        hours_since: Math.round(hoursSince * 10) / 10,
        stale: hoursSince > 72,
      };
    })
    .sort((a, b) => a.hours_since - b.hours_since);

  return {
    plugin_version: pluginVersion,
    uptime_since: uptimeSince,
    uptime_days: uptimeDays,
    total_turns_alltime: allTurns.length,
    active_turns_count: allActive.length,
    active_turns: allActive,
    last_event_by_project: lastEventByProject,
    stop_reasons: stopReasons,
    stop_failure_rate_pct: failureRate,
  };
}

// ── Section 2: ETA Accuracy ──────────────────────────────────

function buildEtaAccuracy() {
  const legacyDir = getLegacyDataDir();
  const byProjectType: Array<{
    project: string;
    classification: string;
    hits: number;
    misses: number;
    total: number;
    rate_pct: number;
  }> = [];
  const autoDisabledTypes: string[] = [];

  try {
    const files = fs
      .readdirSync(legacyDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('test-'));

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(legacyDir, file), 'utf-8'));
        const accuracy: Record<string, { hits: number; misses: number }> = data.eta_accuracy ?? {};
        const project: string = data.project ?? file.replace('.json', '');

        for (const [cls, { hits, misses }] of Object.entries(accuracy)) {
          const total = hits + misses;
          if (total === 0) continue;
          const rate = Math.round((hits / total) * 100);
          byProjectType.push({ project, classification: cls, hits, misses, total, rate_pct: rate });

          if (total >= 10 && misses / total > 0.5) {
            autoDisabledTypes.push(`${project}/${cls}`);
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no legacy dir */
  }

  // Global aggregation
  const globalByType = new Map<string, { hits: number; misses: number }>();
  for (const entry of byProjectType) {
    const prev = globalByType.get(entry.classification) ?? { hits: 0, misses: 0 };
    globalByType.set(entry.classification, {
      hits: prev.hits + entry.hits,
      misses: prev.misses + entry.misses,
    });
  }
  const globalAccuracy = [...globalByType.entries()].map(([cls, { hits, misses }]) => {
    const total = hits + misses;
    return { classification: cls, hits, misses, total, rate_pct: total > 0 ? Math.round((hits / total) * 100) : 0 };
  });

  return { by_project_type: byProjectType, global: globalAccuracy, auto_disabled_types: autoDisabledTypes };
}

// ── Section 3: Data Quality ──────────────────────────────────

function buildDataQuality(projects: ProjectInfo[], allTurns: CompletedTurn[]) {
  const total = allTurns.length || 1;

  // By project
  const byProject = projects
    .filter((p) => p.turns.length > 0)
    .map((p) => ({
      project: p.displayName,
      project_fp: p.fp,
      total: p.turns.length,
      this_week: p.turns.filter((t) => isThisWeek(t.ended_at)).length,
    }))
    .sort((a, b) => b.total - a.total);

  // Classification distribution
  const clsCounts = new Map<string, number>();
  for (const t of allTurns) clsCounts.set(t.classification, (clsCounts.get(t.classification) ?? 0) + 1);

  const classificationDistribution = [...clsCounts.entries()]
    .map(([cls, count]) => ({ classification: cls, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  // Type coverage
  const typeCoverage = [...clsCounts.entries()]
    .map(([cls, count]) => ({
      classification: cls,
      count,
      auto_eta_eligible: count >= 5,
      robust: count >= 10,
    }))
    .sort((a, b) => b.count - a.count);

  // Time ratios per project — single pass per project
  const timeRatios = projects
    .filter((p) => p.turns.length > 0)
    .map((p) => {
      let sumWall = 0, sumActive = 0, sumWait = 0;
      for (const t of p.turns) {
        sumWall += t.wall_seconds;
        sumActive += t.active_seconds;
        sumWait += t.wait_seconds;
      }
      const n = p.turns.length;
      return {
        project: p.displayName,
        avg_wall_seconds: Math.round(sumWall / n),
        avg_active_seconds: Math.round(sumActive / n),
        avg_wait_seconds: Math.round(sumWait / n),
        wait_ratio_pct: sumWall > 0 ? Math.round((sumWait / sumWall) * 100) : 0,
      };
    });

  // Weekly volume
  const weekCounts = new Map<string, number>();
  for (const t of allTurns) {
    const wk = isoWeekLabel(t.ended_at);
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1);
  }
  const weeklyVolume = [...weekCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  return { by_project: byProject, classification_distribution: classificationDistribution, type_coverage: typeCoverage, time_ratios: timeRatios, weekly_volume: weeklyVolume };
}

// ── Section 4: Supabase ──────────────────────────────────────

async function buildSupabase() {
  try {
    const result = await fetchBaselines();
    if (result.error || !result.data) {
      return { available: false, error: result.error };
    }

    const baselines = result.data;
    const computedAts = baselines.map((b) => b.computed_at).filter(Boolean);
    const lastRefresh = computedAts.length > 0
      ? computedAts.reduce((a, b) => (b > a ? b : a))
      : null;
    const types = [...new Set(baselines.map((b) => b.task_type))];
    const totalSamples = baselines.reduce((s, b) => s + b.sample_count, 0);

    return {
      available: true,
      baselines_count: baselines.length,
      last_baseline_refresh: lastRefresh,
      types_with_baselines: types,
      total_community_samples: totalSamples,
    };
  } catch {
    return { available: false, error: 'fetch failed' };
  }
}

// ── Section 5: Insights (reuse existing) ─────────────────────
// Built inline in main function using computeAllInsights()

// ── Section 6: Subagents ─────────────────────────────────────

function buildSubagents(allTurns: CompletedTurn[]) {
  const main = allTurns.filter((t) => t.runner_kind === 'main');
  const sub = allTurns.filter((t) => t.runner_kind === 'subagent');

  const byType = groupBy(sub, (t) => t.agent_type || 'unknown');

  return {
    main_turns: main.length,
    subagent_turns: sub.length,
    ratio: main.length > 0 ? Math.round((sub.length / main.length) * 100) / 100 : 0,
    median_main_seconds: median(sortedWallSeconds(main)),
    median_subagent_seconds: median(sortedWallSeconds(sub)),
    by_agent_type: [...byType.entries()]
      .map(([type, turns]) => ({
        agent_type: type,
        count: turns.length,
        median_seconds: median(sortedWallSeconds(turns)),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Main ─────────────────────────────────────────────────────

export async function buildAdminExport(pluginVersion: string) {
  // Start Supabase fetch concurrently with local I/O
  const supabasePromise = buildSupabase();

  const projects = discoverProjects();
  const allTurns = projects.flatMap((p) => p.turns);
  const allTasks = turnsToTaskEntries(allTurns);

  const supabase = await supabasePromise;

  return {
    generated_at: new Date().toISOString(),
    plugin_version: pluginVersion,
    health: buildHealth(allTurns, projects, pluginVersion),
    eta_accuracy: buildEtaAccuracy(),
    data_quality: buildDataQuality(projects, allTurns),
    supabase,
    insights: computeAllInsights(allTasks) as InsightResult[],
    subagents: buildSubagents(allTurns),
  };
}

export async function showAdminExport(pluginVersion: string): Promise<void> {
  const data = await buildAdminExport(pluginVersion);

  const exportDir = path.join(getPluginDataDir(), 'export');
  fs.mkdirSync(exportDir, { recursive: true });
  const outputPath = path.join(exportDir, 'admin-export.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(1);
  const projCount = data.health.last_event_by_project.length;

  console.log(`## Admin Export\n`);
  console.log(`Exported to: \`${outputPath}\`\n`);
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| File size | ${sizeKb} KB |`);
  console.log(`| Projects | ${projCount} |`);
  console.log(`| Total turns (all-time) | ${data.health.total_turns_alltime} |`);
  console.log(`| Active turns now | ${data.health.active_turns_count} |`);
  console.log(`| Uptime | ${data.health.uptime_days} days (since ${data.health.uptime_since?.slice(0, 10) ?? 'n/a'}) |`);
  console.log(`| Insights computed | ${data.insights.length}/9 |`);
  console.log(`| Supabase | ${data.supabase.available ? 'connected' : 'offline'} |`);
  console.log(`| Subagent ratio | ${data.subagents.ratio} (${data.subagents.subagent_turns} sub / ${data.subagents.main_turns} main) |`);
  console.log(`\nDrop this JSON into your admin dashboard HTML to visualize.`);
}
