/**
 * /eta compare — Compare local stats against community baselines.
 * Fetches from Supabase with a local 6h cache fallback.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadCompletedTurnsCompat, turnsToTaskEntries } from '../compat.js';
import { getPluginDataDir } from '../paths.js';
import { computeStats, fmtSec } from '../stats.js';
import { fetchBaselines, type BaselineRecord } from '../supabase.js';

const CACHE_PATH = path.join(getPluginDataDir(), 'cache', 'baselines.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CachedBaselines {
  fetched_at: string;
  records: BaselineRecord[];
}

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

export async function showCompare(cwd: string): Promise<void> {
  const turns = loadCompletedTurnsCompat(cwd);
  const tasks = turnsToTaskEntries(turns);
  const localStats = computeStats(tasks);

  if (!localStats) {
    console.log('Not enough local data yet (need 5+ completed tasks).');
    return;
  }

  const baselines = await getBaselines();

  if (!baselines || baselines.length === 0) {
    console.log('Community baselines unavailable. Try again later.');
    return;
  }

  const global = baselines.filter((b) => b.project_loc_bucket === null && b.model === null);

  if (global.length === 0) {
    console.log('Community baselines available but no global aggregates yet.');
    return;
  }

  console.log(`## Your Stats vs Community\n`);
  console.log(`| Type      | Your Median | Community | Ratio           | Community N |`);
  console.log(`|-----------|-------------|-----------|-----------------|-------------|`);

  for (const b of global) {
    const local = localStats.byClassification.find((s) => s.classification === b.task_type);
    if (!local) continue;

    console.log(
      `| ${b.task_type.padEnd(9)} | ${fmtSec(local.median).padEnd(11)} | ${fmtSec(b.median_seconds).padEnd(9)} | ${ratio(local.median, b.median_seconds).padEnd(15)} | ${String(b.sample_count).padEnd(11)} |`,
    );
  }

  const localTypes = new Set(localStats.byClassification.map((s) => s.classification));
  const communityOnly = global.filter((b) => !localTypes.has(b.task_type as never));
  if (communityOnly.length > 0) {
    console.log(`\n### Community baselines (no local data)`);
    for (const b of communityOnly) {
      console.log(`- **${b.task_type}**: median ${fmtSec(b.median_seconds)} (${b.sample_count} samples)`);
    }
  }
}
