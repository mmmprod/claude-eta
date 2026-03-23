/**
 * Shared baselines cache — fetches community baselines from Supabase,
 * caches locally, and maps to estimation priors.
 *
 * Used by:
 * - on-session-start.ts (async refresh)
 * - on-prompt.ts (sync read from disk)
 * - compare.ts (async read with refresh)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPluginDataDir, ensureDir, atomicWrite } from './paths.js';
import { fetchBaselines } from './supabase.js';
import { selectBestBaseline } from './baseline-match.js';
// ── Constants ────────────────────────────────────────────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_TIMEOUT_MS = 3_000; // 3s timeout for session-start refresh
const ALL_CLASSIFICATIONS = [
    'bugfix',
    'feature',
    'refactor',
    'config',
    'docs',
    'test',
    'debug',
    'review',
    'other',
];
// ── Cache path ───────────────────────────────────────────────
function getCachePath() {
    return path.join(getPluginDataDir(), 'cache', 'baselines.json');
}
// ── Internal cache read (single file read) ───────────────────
/** Read + parse cache file once. Returns null if missing/corrupt. */
function loadCache() {
    try {
        const raw = fs.readFileSync(getCachePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.records))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
// ── Public sync I/O — safe for on-prompt hot path ────────────
/** Read cached baselines from disk. Returns null if missing/corrupt. Never throws. */
export function loadCachedBaselines() {
    return loadCache()?.records ?? null;
}
/** Check whether the cache file exists and is fresh (< TTL). */
export function isCacheFresh() {
    const cached = loadCache();
    if (!cached)
        return false;
    return Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;
}
function saveCache(records) {
    try {
        const cachePath = getCachePath();
        ensureDir(path.dirname(cachePath));
        atomicWrite(cachePath, JSON.stringify({ fetched_at: new Date().toISOString(), records }, null, 2));
    }
    catch {
        // Non-fatal: cache write failure should not crash hooks
    }
}
// ── Async I/O — for session-start and compare ────────────────
/**
 * Fetch baselines with cache. Reads cache once, fetches if stale.
 * @param timeoutMs — fetch timeout (default: Supabase default 10s)
 */
async function fetchWithCache(timeoutMs) {
    const cached = loadCache();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
        return cached.records;
    }
    try {
        const { data, error } = await fetchBaselines(timeoutMs);
        if (data && !error) {
            saveCache(data);
            return data;
        }
    }
    catch {
        // Network failure — swallow
    }
    // Fall back to stale cache if available
    return cached?.records ?? null;
}
/** Refresh cache with short timeout (3s) — for session-start hook. */
export async function refreshBaselinesCache() {
    return fetchWithCache(REFRESH_TIMEOUT_MS);
}
/** Get baselines with cache — for compare CLI (uses default 10s timeout). */
export async function getBaselinesWithCache() {
    return fetchWithCache();
}
// ── Pure functions — no I/O ──────────────────────────────────
/**
 * Map baselines → per-classification priors using the selectBestBaseline() hierarchy.
 * Returns a partial map — only classifications with matching baselines are included.
 */
export function baselinesToPriors(baselines, locBucket, model) {
    const priors = {};
    for (const classification of ALL_CLASSIFICATIONS) {
        const match = selectBestBaseline(baselines, classification, locBucket, model);
        if (match) {
            priors[classification] = {
                low: match.record.p25_seconds,
                median: match.record.median_seconds,
                high: match.record.p75_seconds,
                sample_count: match.record.sample_count,
                match_kind: match.kind,
            };
        }
    }
    return priors;
}
//# sourceMappingURL=baselines-cache.js.map