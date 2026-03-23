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
import { selectBestBaseline } from './cli/compare.js';
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
// ── Sync I/O — safe for on-prompt hot path ───────────────────
/** Read cached baselines from disk. Returns null if missing/corrupt. Never throws. */
export function loadCachedBaselines() {
    try {
        const raw = fs.readFileSync(getCachePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.records) ? parsed.records : null;
    }
    catch {
        return null;
    }
}
/** Check whether the cache file exists and is fresh (< TTL). */
export function isCacheFresh() {
    try {
        const raw = fs.readFileSync(getCachePath(), 'utf-8');
        const parsed = JSON.parse(raw);
        return Date.now() - new Date(parsed.fetched_at).getTime() < CACHE_TTL_MS;
    }
    catch {
        return false;
    }
}
function saveCache(records) {
    const cachePath = getCachePath();
    ensureDir(path.dirname(cachePath));
    atomicWrite(cachePath, JSON.stringify({ fetched_at: new Date().toISOString(), records }, null, 2));
}
// ── Async I/O — for session-start and compare ────────────────
/**
 * Refresh the baselines cache if stale (>6h) or missing.
 * Uses a short timeout to avoid blocking session start.
 * Returns records on success, null on failure. Never throws.
 */
export async function refreshBaselinesCache() {
    // Skip fetch if cache is fresh
    if (isCacheFresh()) {
        return loadCachedBaselines();
    }
    try {
        const { data, error } = await fetchBaselines(REFRESH_TIMEOUT_MS);
        if (data && !error) {
            saveCache(data);
            return data;
        }
    }
    catch {
        // Network failure — swallow
    }
    // Fall back to stale cache if available
    return loadCachedBaselines();
}
/**
 * Get baselines with cache — async variant for compare CLI.
 * Same logic as refreshBaselinesCache but uses the default fetch timeout.
 */
export async function getBaselinesWithCache() {
    if (isCacheFresh()) {
        return loadCachedBaselines();
    }
    try {
        const { data, error } = await fetchBaselines();
        if (data && !error) {
            saveCache(data);
            return data;
        }
    }
    catch {
        // Network failure — swallow
    }
    return loadCachedBaselines();
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