/**
 * Repository metrics: file count, LOC estimation, buckets.
 * Cached per-project with 24h TTL to avoid expensive file walks on every SessionStart.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { locBucket } from './anonymize.js';
import { getCacheDir, ensureDir } from './paths.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILENAME = 'repo-metrics.json';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  'vendor',
  '.cache',
  '.turbo',
  '.output',
]);

const MAX_FILES = 50_000;

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.wasm', '.o', '.so', '.dylib', '.dll', '.exe', '.bin',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.mp3', '.mp4', '.wav', '.mov', '.avi', '.webm', '.ogg',
  '.sqlite', '.db',
]);

export interface RepoMetrics {
  fileCount: number;
  fileCountBucket: string;
  estimatedLoc: number;
  locBucketValue: string;
  computedAt: string;
}

/** Map file count to a privacy-safe bucket */
export function fileCountBucket(count: number): string {
  if (count < 50) return 'tiny';
  if (count < 500) return 'small';
  if (count < 5000) return 'medium';
  if (count < 20000) return 'large';
  return 'huge';
}

/**
 * Get repo metrics with caching.
 * Returns cached metrics if fresh (< 24h), otherwise recomputes.
 */
export function getRepoMetrics(dir: string, projectFp: string): RepoMetrics {
  // Try cache first
  const cached = readCache(projectFp);
  if (cached) return cached;

  // Compute fresh metrics
  const metrics = computeRepoMetrics(dir);

  // Write to cache
  writeCache(projectFp, metrics);

  return metrics;
}

/** Force-compute metrics without cache (for /eta inspect etc.) */
export function computeRepoMetrics(dir: string): RepoMetrics {
  const { fileCount, totalBytes } = walkSourceFiles(dir);
  const estimatedLoc = Math.round(totalBytes / 40);

  return {
    fileCount,
    fileCountBucket: fileCountBucket(fileCount),
    estimatedLoc,
    locBucketValue: locBucket(estimatedLoc),
    computedAt: new Date().toISOString(),
  };
}

/** Backward-compat: same signature as before for callers that don't need caching */
export function countSourceFiles(dir: string): RepoMetrics {
  return computeRepoMetrics(dir);
}

// ── Cache I/O ────────────────────────────────────────────────

function getCachePath(projectFp: string): string {
  return path.join(getCacheDir(projectFp), CACHE_FILENAME);
}

function readCache(projectFp: string): RepoMetrics | null {
  try {
    const raw = fs.readFileSync(getCachePath(projectFp), 'utf-8');
    const data = JSON.parse(raw) as RepoMetrics;
    const age = Date.now() - new Date(data.computedAt).getTime();
    if (age < CACHE_TTL_MS) return data;
    return null; // Stale
  } catch {
    return null;
  }
}

function writeCache(projectFp: string, metrics: RepoMetrics): void {
  try {
    const cachePath = getCachePath(projectFp);
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, JSON.stringify(metrics));
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── File system walk ─────────────────────────────────────────

function walkSourceFiles(dir: string): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;

  function walk(d: string): void {
    if (fileCount >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (fileCount >= MAX_FILES) return;
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(d, entry.name));
        }
      } else if (entry.isFile()) {
        fileCount++;
        const ext = path.extname(entry.name).toLowerCase();
        if (!BINARY_EXTENSIONS.has(ext)) {
          try {
            totalBytes += fs.statSync(path.join(d, entry.name)).size;
          } catch {
            /* skip unreadable files */
          }
        }
      }
    }
  }

  walk(dir);
  return { fileCount, totalBytes };
}
