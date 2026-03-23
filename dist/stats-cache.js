/**
 * Project stats cache for historical ETA calibration.
 *
 * Goal: avoid reparsing all completed turns on every phase transition.
 * Cache invalidation is driven by a lightweight history signature derived from
 * completed-log metadata (or the legacy JSON file before migration).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadCompletedTurnsCompat, turnsToAnalyticsTasks } from './compat.js';
import { resolveProjectIdentity } from './identity.js';
import { needsMigration, legacySlug } from './migrate.js';
import { findLegacyFile, getCacheDir, getCompletedDir, ensureDir, atomicWrite } from './paths.js';
import { computeStats } from './stats.js';
const CACHE_FILENAME = 'project-stats.json';
function getCachePath(projectFp) {
    return path.join(getCacheDir(projectFp), CACHE_FILENAME);
}
function buildV2HistorySignature(projectFp) {
    const completedDir = getCompletedDir(projectFp);
    try {
        const entries = fs
            .readdirSync(completedDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
            .map((entry) => entry.name)
            .sort();
        if (entries.length === 0)
            return 'v2:empty';
        const parts = entries.map((name) => {
            const stat = fs.statSync(path.join(completedDir, name));
            return `${name}:${stat.size}:${Math.round(stat.mtimeMs)}`;
        });
        return `v2:${parts.join('|')}`;
    }
    catch {
        return 'v2:empty';
    }
}
function buildLegacyHistorySignature(displayName) {
    const slug = legacySlug(displayName);
    const legacyPath = findLegacyFile(`${slug}.json`);
    if (!legacyPath)
        return `legacy:${slug}:missing`;
    try {
        const stat = fs.statSync(legacyPath);
        return `legacy:${slug}:${stat.size}:${Math.round(stat.mtimeMs)}`;
    }
    catch {
        return `legacy:${slug}:unreadable`;
    }
}
function buildHistorySignature(cwd) {
    const { fp, displayName } = resolveProjectIdentity(cwd);
    const signature = needsMigration(fp, legacySlug(displayName))
        ? buildLegacyHistorySignature(displayName)
        : buildV2HistorySignature(fp);
    return { projectFp: fp, signature };
}
function readCache(projectFp) {
    try {
        const raw = fs.readFileSync(getCachePath(projectFp), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function writeCache(projectFp, cache) {
    try {
        ensureDir(getCacheDir(projectFp));
        atomicWrite(getCachePath(projectFp), JSON.stringify(cache));
    }
    catch {
        // Cache write failure is non-fatal.
    }
}
/** Return historical project stats using a signature-validated cache. */
export function getProjectStats(cwd) {
    const { projectFp, signature } = buildHistorySignature(cwd);
    const cached = readCache(projectFp);
    if (cached?.signature === signature)
        return cached.stats;
    const turns = loadCompletedTurnsCompat(cwd);
    const tasks = turnsToAnalyticsTasks(turns);
    const stats = computeStats(tasks);
    writeCache(projectFp, {
        signature,
        computed_at: new Date().toISOString(),
        stats,
    });
    return stats;
}
//# sourceMappingURL=stats-cache.js.map