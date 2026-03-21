/**
 * Anonymization utilities for Layer 3 community contributions.
 * All hashing is one-way SHA-256. No PII ever leaves the machine.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCommunityDir, ensureDir, atomicWrite } from './paths.js';
import { hashWithLocalSalt } from './identity.js';

const OLD_CONTRIBUTOR_ID_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', '.contributor_id');

/** Return the persisted contributor ID file path in the plugin data directory. */
function getContributorIdPath(): string {
  return path.join(getCommunityDir(), '.contributor_id');
}

let _contributorId: string | undefined;

/** Persistent random UUID, generated once per machine. No link to any PII. */
function getContributorId(): string {
  if (_contributorId) return _contributorId;

  const newPath = getContributorIdPath();

  // Try new location first
  try {
    _contributorId = fs.readFileSync(newPath, 'utf-8').trim();
    return _contributorId;
  } catch {
    /* not found at new path */
  }

  // Try old location (auto-migrate)
  try {
    const id = fs.readFileSync(OLD_CONTRIBUTOR_ID_PATH, 'utf-8').trim();
    ensureDir(path.dirname(newPath));
    atomicWrite(newPath, id);
    try {
      fs.unlinkSync(OLD_CONTRIBUTOR_ID_PATH);
    } catch {
      // Migration already succeeded once the new file exists.
    }
    _contributorId = id;
    return _contributorId;
  } catch {
    /* not found at old path either */
  }

  // Generate new
  _contributorId = crypto.randomUUID();
  ensureDir(path.dirname(newPath));
  atomicWrite(newPath, _contributorId);
  return _contributorId;
}

/** One-way hash of the contributor UUID. */
export function contributorHash(): string {
  return crypto.createHash('sha256').update(getContributorId()).digest('hex');
}

/** One-way hash of the project name, salted with a local machine secret. */
export function projectHash(projectName: string): string {
  return hashWithLocalSalt(projectName);
}

/** Normalize model ID: strip bracket suffixes and date suffixes, pass through everything else.
 *  "claude-sonnet-4-6" → "claude-sonnet-4-6"
 *  "claude-opus-4-6[1m]" → "claude-opus-4-6"
 *  "claude-sonnet-4-5-20250929" → "claude-sonnet-4-5"
 *  "claude-sonnet-4-20250514" → "claude-sonnet-4"
 *  "gpt-4" → "gpt-4"
 */
export function normalizeModel(model: string): string {
  // 1. Strip bracket suffix (e.g. [1m])
  let cleaned = model.replace(/\[.*\]$/, '');
  // 2. Strip trailing -YYYYMMDD date suffix (exactly 8 digits at end)
  cleaned = cleaned.replace(/-\d{8}$/, '');
  return cleaned;
}

/** Deterministic dedup key: sha256(contributorHash + ":" + taskId), truncated to 32 hex chars.
 *  Stable across retries for the same task. Not linkable across contributors. */
export function dedupKey(contribHash: string, taskId: string): string {
  return crypto.createHash('sha256').update(`${contribHash}:${taskId}`).digest('hex').slice(0, 32);
}

/** Map lines of code to a privacy-safe bucket. */
export function locBucket(loc: number): string {
  if (loc < 1000) return 'tiny';
  if (loc < 10000) return 'small';
  if (loc < 50000) return 'medium';
  if (loc < 200000) return 'large';
  return 'huge';
}
