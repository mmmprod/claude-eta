/**
 * /eta compare — Compare local stats against community baselines.
 * Fetches from Supabase with a local 6h cache fallback.
 */
import { normalizeModel } from '../anonymize.js';
import { getBaselinesWithCache } from '../baselines-cache.js';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from '../compat.js';
import { consumeCommunityConsentPrompt } from '../community-consent.js';
import { resolveProjectIdentity } from '../identity.js';
import { loadPreferencesV2 } from '../preferences.js';
import { loadProjectMeta } from '../project-meta.js';
import { computeStats, fmtSec } from '../stats.js';
import type { BaselineRecord } from '../supabase.js';
import type { AnalyticsTask, TaskClassification } from '../types.js';
import { c } from './colors.js';

export type BaselineMatchKind = 'type+loc+model' | 'type+model' | 'type+loc' | 'global';

export interface BaselineMatch {
  kind: BaselineMatchKind;
  record: BaselineRecord;
}

interface CommunityOnlyBaseline {
  task_type: string;
  match: BaselineMatch;
}

export interface CompareRow {
  task_type: TaskClassification;
  local_median_seconds: number;
  local_count: number;
  community_median_seconds: number;
  community_sample_count: number;
  baseline_match: BaselineMatch;
}

const DOMINANT_MODEL_MIN_SHARE = 0.75;

function col(s: string, len: number, align: 'left' | 'right' = 'left'): string {
  const truncated = s.length > len ? s.slice(0, len) : s;
  return align === 'left' ? truncated.padEnd(len) : truncated.padStart(len);
}

function ratio(local: number, community: number): string {
  if (community === 0) return '-';
  const r = local / community;
  if (r < 0.8) return `${r.toFixed(2)}x faster`;
  if (r > 1.2) return `${r.toFixed(2)}x slower`;
  return '~same';
}

function ratioColor(local: number, community: number): (text: string) => string {
  if (community === 0) return (text: string) => text;
  const r = local / community;
  if (r < 1.2) return c.green;
  if (r < 2) return c.yellow;
  return c.red;
}

function groupTasksByClassification(tasks: AnalyticsTask[]): Map<TaskClassification, AnalyticsTask[]> {
  const groups = new Map<TaskClassification, AnalyticsTask[]>();
  for (const task of tasks) {
    if (task.duration_seconds == null || task.duration_seconds <= 0) continue;
    const list = groups.get(task.classification) ?? [];
    list.push(task);
    groups.set(task.classification, list);
  }
  return groups;
}

export function selectDominantModel(tasks: Pick<AnalyticsTask, 'model'>[]): string | null {
  if (tasks.length === 0) return null;

  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!task.model) continue;
    const normalized = normalizeModel(task.model);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const ranked = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
  const [topModel, topCount] = ranked[0];
  return topCount / tasks.length >= DOMINANT_MODEL_MIN_SHARE ? topModel : null;
}

export function selectBestBaseline(
  baselines: BaselineRecord[],
  taskType: string,
  projectLocBucket: string | null,
  model: string | null,
): BaselineMatch | null {
  const exact = (loc: string | null, candidateModel: string | null) =>
    baselines.find(
      (baseline) =>
        baseline.task_type === taskType && baseline.project_loc_bucket === loc && baseline.model === candidateModel,
    ) ?? null;

  if (projectLocBucket && model) {
    const hit = exact(projectLocBucket, model);
    if (hit) return { kind: 'type+loc+model', record: hit };
  }

  if (model) {
    const hit = exact(null, model);
    if (hit) return { kind: 'type+model', record: hit };
  }

  if (projectLocBucket) {
    const hit = exact(projectLocBucket, null);
    if (hit) return { kind: 'type+loc', record: hit };
  }

  const hit = exact(null, null);
  return hit ? { kind: 'global', record: hit } : null;
}

export function buildCompareRows(
  tasks: AnalyticsTask[],
  baselines: BaselineRecord[],
  projectLocBucket: string | null,
): CompareRow[] {
  const stats = computeStats(tasks);
  if (!stats) return [];

  const byClassification = groupTasksByClassification(tasks);
  return stats.byClassification
    .map((local) => {
      const group = byClassification.get(local.classification) ?? [];
      const dominantModel = selectDominantModel(group);
      const match = selectBestBaseline(baselines, local.classification, projectLocBucket, dominantModel);
      if (!match) return null;

      return {
        task_type: local.classification,
        local_median_seconds: local.median,
        local_count: local.count,
        community_median_seconds: match.record.median_seconds,
        community_sample_count: match.record.sample_count,
        baseline_match: match,
      };
    })
    .filter((row): row is CompareRow => row !== null);
}

function scopeLabel(match: BaselineMatch): string {
  switch (match.kind) {
    case 'type+loc+model':
      return `${match.record.project_loc_bucket} + ${match.record.model}`;
    case 'type+model':
      return match.record.model ?? 'model';
    case 'type+loc':
      return match.record.project_loc_bucket ?? 'loc';
    case 'global':
      return 'global';
  }
}

function pickCommunityOnlyBaselines(
  baselines: BaselineRecord[],
  localTypes: Set<string>,
  projectLocBucket: string | null,
): CommunityOnlyBaseline[] {
  const taskTypes = [
    ...new Set(baselines.map((baseline) => baseline.task_type).filter((taskType) => !localTypes.has(taskType))),
  ].sort();
  return taskTypes
    .map((taskType) => {
      const match = selectBestBaseline(baselines, taskType, projectLocBucket, null);
      return match ? { task_type: taskType, match } : null;
    })
    .filter((row): row is CommunityOnlyBaseline => row !== null);
}

export async function showCompare(cwd: string): Promise<void> {
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToAnalyticsTasks(turns);
  const localStats = computeStats(tasks);
  const prefs = loadPreferencesV2();
  const consentPrompt = consumeCommunityConsentPrompt();
  const { fp } = resolveProjectIdentity(cwd);
  const projectLocBucket = loadProjectMeta(fp)?.loc_bucket ?? null;

  if (!localStats) {
    console.log(c.yellow('Not enough local data yet (need 5+ completed tasks).'));
    console.log('`/eta compare` is read-only and never uploads your task data.');
    if (consentPrompt) console.log(`\n${consentPrompt}`);
    return;
  }

  const baselines = await getBaselinesWithCache();

  if (!baselines || baselines.length === 0) {
    console.log(c.red('Community baselines unavailable. Try again later.'));
    return;
  }
  const rows = buildCompareRows(tasks, baselines, projectLocBucket);
  const localTypes = new Set(rows.map((row) => row.task_type));
  const communityOnly = pickCommunityOnlyBaselines(baselines, localTypes, projectLocBucket);

  if (rows.length === 0 && communityOnly.length === 0) {
    console.log(c.yellow('Community baselines available but no compatible aggregates yet.'));
    return;
  }

  console.log(`\n${c.bold('Your Stats vs Community')}\n`);
  console.log('Read-only fetch: this command never uploads your task data.');
  console.log(`Community upload switch: ${prefs.community_sharing ? c.green('enabled') : c.yellow('disabled')}.`);
  console.log(
    `Matching order: \`type+loc+model\` -> \`type+model\` -> \`type+loc\` -> \`global\`${projectLocBucket ? ` (local repo bucket: \`${projectLocBucket}\`)` : ''}.\n`,
  );

  if (rows.length > 0) {
    console.log(
      `  ${c.dim(col('Type', 9))}  ${c.dim(col('Your median', 11))}  ${c.dim(col('Community', 9))}  ${c.dim(col('Ratio', 15))}  ${c.dim(col('Baseline', 21))}  ${c.dim(col('N', 5))}`,
    );

    for (const row of rows) {
      const ratioText = ratio(row.local_median_seconds, row.community_median_seconds);
      console.log(
        `  ${c.bold(col(row.task_type, 9))}  ${c.cyan(col(fmtSec(row.local_median_seconds), 11))}  ${c.cyan(col(fmtSec(row.community_median_seconds), 9))}  ${ratioColor(row.local_median_seconds, row.community_median_seconds)(col(ratioText, 15))}  ${c.dim(col(scopeLabel(row.baseline_match), 21))}  ${c.dim(col(String(row.community_sample_count), 5, 'right'))}`,
      );
    }
  }

  if (communityOnly.length > 0) {
    console.log(`\n${c.bold('Community Baselines')} ${c.dim('(no robust local baseline)')}`);
    for (const baseline of communityOnly) {
      console.log(
        `- ${c.bold(baseline.task_type)}: median ${c.cyan(fmtSec(baseline.match.record.median_seconds))} ${c.dim(`(${baseline.match.record.sample_count} samples, ${scopeLabel(baseline.match)})`)}`,
      );
    }
  }

  if (consentPrompt) {
    console.log(`\n${consentPrompt}`);
  }
}
