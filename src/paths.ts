/**
 * Centralized data directory paths for claude-eta v2.
 *
 * All persistent data lives under ${CLAUDE_PLUGIN_DATA} (set by Claude Code runtime).
 * Fallback to ~/.claude/plugins/claude-eta for local development.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

const FALLBACK_DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta');

/** Root data directory — uses CLAUDE_PLUGIN_DATA if available, else dev fallback */
export function getPluginDataDir(): string {
  return process.env.CLAUDE_PLUGIN_DATA || FALLBACK_DATA_DIR;
}

/** Project-specific directory: <data>/projects/<project_fp>/ */
export function getProjectDir(projectFp: string): string {
  return path.join(getPluginDataDir(), 'projects', projectFp);
}

/** Active turn files: <project>/active/ */
export function getActiveDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'active');
}

/** Event logs: <project>/events/ */
export function getEventsDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'events');
}

/** Completed turn logs: <project>/completed/ */
export function getCompletedDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'completed');
}

/** Session metadata: <project>/sessions/ */
export function getSessionsDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'sessions');
}

/** Cache directory: <project>/cache/ */
export function getCacheDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'cache');
}

/** Global config: <data>/config/ */
export function getConfigDir(): string {
  return path.join(getPluginDataDir(), 'config');
}

/** Closing staging dir (idempotent closeTurn): <project>/closing/ */
export function getClosingDir(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'closing');
}

/** Community data: <data>/community/ */
export function getCommunityDir(): string {
  return path.join(getPluginDataDir(), 'community');
}

/** Legacy data directory (v1 compat): <data>/data/ */
export function getLegacyDataDir(): string {
  return path.join(getPluginDataDir(), 'data');
}

/** Hardcoded v1 data directory — the exact path v1 store.ts always wrote to */
export function getV1HardcodedDataDir(): string {
  return process.env.CLAUDE_ETA_V1_DATA_DIR || path.join(FALLBACK_DATA_DIR, 'data');
}

function isPlainLegacyFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename !== '.' &&
    filename !== '..' &&
    path.basename(filename) === filename &&
    path.posix.basename(filename) === filename &&
    path.win32.basename(filename) === filename
  );
}

/**
 * Search for a legacy file across both candidate directories.
 * Returns the first path where the file exists, or null if not found.
 * Uses try/catch fs.accessSync to check readability (avoids existsSync).
 */
export function findLegacyFile(filename: string): string | null {
  if (!isPlainLegacyFilename(filename)) {
    return null;
  }
  const a = getLegacyDataDir();
  const b = getV1HardcodedDataDir();
  const candidates = a === b ? [a] : [a, b];
  for (const dir of candidates) {
    const candidate = path.join(dir, filename);
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // Not found here, try next
    }
  }
  return null;
}

// ── File paths ───────────────────────────────────────────────

/** Active turn file for a specific (session, agent) pair */
export function getActiveTurnPath(projectFp: string, sessionId: string, agentKey: string): string {
  return path.join(getActiveDir(projectFp), `${sessionId}__${agentKey}.json`);
}

/** Event log for a specific (session, agent) pair */
export function getEventLogPath(projectFp: string, sessionId: string, agentKey: string): string {
  return path.join(getEventsDir(projectFp), `${sessionId}__${agentKey}.jsonl`);
}

/** Completed turns log for a specific (session, agent) pair */
export function getCompletedLogPath(projectFp: string, sessionId: string, agentKey: string): string {
  return path.join(getCompletedDir(projectFp), `${sessionId}__${agentKey}.jsonl`);
}

/** Session metadata file */
export function getSessionMetaPath(projectFp: string, sessionId: string): string {
  return path.join(getSessionsDir(projectFp), `${sessionId}.json`);
}

/** Project meta.json */
export function getProjectMetaPath(projectFp: string): string {
  return path.join(getProjectDir(projectFp), 'meta.json');
}

/** Schema version file at data root */
export function getSchemaVersionPath(): string {
  return path.join(getPluginDataDir(), 'schema-version.json');
}

// ── Directory creation ───────────────────────────────────────

/** Ensure a directory exists (recursive, no-op if exists) */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** Atomic write: write to temp file, then rename (prevents corruption from concurrent access) */
export function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/** Atomic create: writes only when the target file does not already exist. */
export function atomicWriteIfAbsent(filePath: string, data: string): boolean {
  try {
    fs.writeFileSync(filePath, data, { flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/** Ensure all project subdirectories exist */
export function ensureProjectDirs(projectFp: string): void {
  ensureDir(getActiveDir(projectFp));
  ensureDir(getEventsDir(projectFp));
  ensureDir(getCompletedDir(projectFp));
  ensureDir(getSessionsDir(projectFp));
  ensureDir(getCacheDir(projectFp));
}
