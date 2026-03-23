/**
 * Project identity and privacy-safe hashing for claude-eta v2.
 *
 * Project fingerprint = sha256(realpath(cwd)), not basename(cwd).
 * This prevents collisions between /x/app and /y/app.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPluginDataDir, ensureDir } from './paths.js';

const FP_LENGTH = 16; // hex chars from sha256, gives 8 bytes = 2^64 space
const SALT_FILE = 'local-salt.txt';

export interface ProjectIdentity {
  /** SHA-256 fingerprint of the resolved absolute path (first 16 hex chars) */
  fp: string;
  /** Human-readable display name (basename of resolved path) */
  displayName: string;
  /** Resolved absolute path */
  resolvedPath: string;
}

/** Resolve a stable project identity from a working directory */
export function resolveProjectIdentity(cwd: string): ProjectIdentity {
  let resolved: string;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    // If realpath fails (e.g. broken symlink), fall back to the provided path
    resolved = path.resolve(cwd);
  }

  const hash = crypto.createHash('sha256').update(resolved).digest('hex');

  return {
    fp: hash.slice(0, FP_LENGTH),
    displayName: path.basename(resolved),
    resolvedPath: resolved,
  };
}

/**
 * Get or create a local salt for privacy-safe hashing.
 * The salt is stored at <pluginData>/local-salt.txt and never leaves the machine.
 */
export function getLocalSalt(): string {
  const saltPath = path.join(getPluginDataDir(), SALT_FILE);

  try {
    return fs.readFileSync(saltPath, 'utf-8').trim();
  } catch {
    // First run — generate a random salt (atomic to handle concurrent processes)
    const salt = crypto.randomUUID();
    ensureDir(path.dirname(saltPath));
    try {
      fs.writeFileSync(saltPath, salt, { flag: 'wx' });
      return salt;
    } catch (err) {
      // Another process won the race — read their salt
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        return fs.readFileSync(saltPath, 'utf-8').trim();
      }
      throw err;
    }
  }
}

// Module-level cache — salt never changes within a process lifetime
let _cachedSalt: string | null = null;

/** Hash a value with the local salt — one-way, privacy-safe */
export function hashWithLocalSalt(value: string): string {
  if (_cachedSalt === null) _cachedSalt = getLocalSalt();
  return crypto
    .createHash('sha256')
    .update(_cachedSalt + value)
    .digest('hex');
}
