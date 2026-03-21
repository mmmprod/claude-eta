/**
 * /eta compare — Compare local stats against community baselines.
 * Fetches from Supabase with a local 6h cache fallback.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeModel } from '../anonymize.js';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from '../compat.js';
import { consumeCommunityConsentPrompt } from '../community-consent.js';
import { resolveProjectIdentity } from '../identity.js';
import { getPluginDataDir } from '../paths.js';
import { loadPreferencesV2 } from '../preferences.js';
import { loadProjectMeta } from '../project-meta.js';
import { computeStats, fmtSec } from '../stats.js';
import { fetchBaselines, type BaselineRecord } from '../supabase.js';
import type { AnalyticsTask, TaskClassification } from '../types.js';

const CACHE_PATH = path.join(getPluginDataDir(), 'cache', 'baselines.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CachedBaselines {
  fetched_at: string;
  records: BaselineRecord[];
}

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

function loadCache(): CachedBaselines | null {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as CachedBaselines;
  } catch {
    return null;
  }
}

function saveCache(records: BaselineRecord[]): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetched_at: new Date().toISOString(), records }, null, 2), 'utf-8');
}

async function getBaselines(): Promise<BaselineRecord[] | null> {
  const cache = loadCache();

  // Use cache if fresh (skip unnecessary network call)
  if (cache && Date.now() - new Date(cache.fetched_at).getTime() < CACHE_TTL_MS) {
    return cache.records;
  }

  // Cache stale or missing — fetch
  const { data, error } = await fetchBaselines();
  if (data && !error) {
    saveCache(data);
    return data;
  }

  // Network failed — stale cache as last resort
  if (cache) return cache.records;

  return null;
}

function ratio(local: number, community: number): string {
  if (community === 0) return '-';
  const r = local / community;
  if (r < 0.8) return `**${r.toFixed(2)}x faster**`;
  if (r > 1.2) return `${r.toFixed(2)}x slower`;
  return '~same';
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
    console.log('Not enough local data yet (need 5+ completed tasks).');
    console.log('`/eta compare` is read-only and never uploads your task data.');
    if (consentPrompt) console.log(`\n${consentPrompt}`);
    return;
  }

  const baselines = await getBaselines();

  if (!baselines || baselines.length === 0) {
    console.log('Community baselines unavailable. Try again later.');
    return;
  }
  const rows = buildCompareRows(tasks, baselines, projectLocBucket);
  const localTypes = new Set(rows.map((row) => row.task_type));
  const communityOnly = pickCommunityOnlyBaselines(baselines, localTypes, projectLocBucket);

  if (rows.length === 0 && communityOnly.length === 0) {
    console.log('Community baselines available but no compatible aggregates yet.');
    return;
  }

  console.log(`## Your Stats vs Community\n`);
  console.log('Read-only fetch: this command never uploads your task data.');
  console.log(`Community upload switch: **${prefs.community_sharing ? 'enabled' : 'disabled'}**.`);
  console.log(
    `Matching order: \`type+loc+model\` → \`type+model\` → \`type+loc\` → \`global\`${projectLocBucket ? ` (local repo bucket: \`${projectLocBucket}\`)` : ''}.\n`,
  );

  if (rows.length > 0) {
    console.log(`| Type      | Your Median | Community | Ratio           | Baseline              | Community N |`);
    console.log(`|-----------|-------------|-----------|-----------------|-----------------------|-------------|`);

    for (const row of rows) {
      console.log(
        `| ${row.task_type.padEnd(9)} | ${fmtSec(row.local_median_seconds).padEnd(11)} | ${fmtSec(row.community_median_seconds).padEnd(9)} | ${ratio(row.local_median_seconds, row.community_median_seconds).padEnd(15)} | ${scopeLabel(row.baseline_match).padEnd(21)} | ${String(row.community_sample_count).padEnd(11)} |`,
      );
    }
  }

  if (communityOnly.length > 0) {
    console.log(`\n### Community baselines (no robust local baseline)`);
    for (const baseline of communityOnly) {
      console.log(
        `- **${baseline.task_type}**: median ${fmtSec(baseline.match.record.median_seconds)} (${baseline.match.record.sample_count} samples, ${scopeLabel(baseline.match)})`,
      );
    }
  }

  if (consentPrompt) {
    console.log(`\n${consentPrompt}`);
  }
}
