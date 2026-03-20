/**
 * Anonymization utilities for Layer 3 community contributions.
 * All hashing is one-way SHA-256. No PII ever leaves the machine.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCommunityDir, ensureDir } from './paths.js';
import { hashWithLocalSalt } from './identity.js';
const OLD_CONTRIBUTOR_ID_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', '.contributor_id');
function getContributorIdPath() {
    return path.join(getCommunityDir(), '.contributor_id');
}
/** Persistent random UUID, generated once per machine. No link to any PII. */
function getContributorId() {
    const newPath = getContributorIdPath();
    // Try new location first
    try {
        return fs.readFileSync(newPath, 'utf-8').trim();
    }
    catch { /* not found at new path */ }
    // Try old location (auto-migrate)
    try {
        const id = fs.readFileSync(OLD_CONTRIBUTOR_ID_PATH, 'utf-8').trim();
        ensureDir(path.dirname(newPath));
        fs.writeFileSync(newPath, id, 'utf-8');
        return id;
    }
    catch { /* not found at old path either */ }
    // Generate new
    const id = crypto.randomUUID();
    ensureDir(path.dirname(newPath));
    fs.writeFileSync(newPath, id, 'utf-8');
    return id;
}
/** One-way hash of the contributor UUID. */
export function contributorHash() {
    return crypto.createHash('sha256').update(getContributorId()).digest('hex');
}
/** One-way hash of the project name, salted with a local machine secret. */
export function projectHash(projectName) {
    return hashWithLocalSalt(projectName);
}
/** Normalize model ID: "claude-sonnet-4-20250514" → "claude-sonnet-4" */
export function normalizeModel(model) {
    const match = model.match(/^(claude-(?:opus|sonnet|haiku)-[\d.]+)/);
    return match ? match[1] : null;
}
/** Map lines of code to a privacy-safe bucket. */
export function locBucket(loc) {
    if (loc < 1000)
        return 'tiny';
    if (loc < 10000)
        return 'small';
    if (loc < 50000)
        return 'medium';
    if (loc < 200000)
        return 'large';
    return 'huge';
}
//# sourceMappingURL=anonymize.js.map