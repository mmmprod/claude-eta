/**
 * Anonymization utilities for Layer 3 community contributions.
 * All hashing is one-way SHA-256. No PII ever leaves the machine.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const CONTRIBUTOR_ID_PATH = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', '.contributor_id');
/** Persistent random UUID, generated once per machine. No link to any PII. */
function getContributorId() {
    try {
        return fs.readFileSync(CONTRIBUTOR_ID_PATH, 'utf-8').trim();
    }
    catch {
        const id = crypto.randomUUID();
        fs.mkdirSync(path.dirname(CONTRIBUTOR_ID_PATH), { recursive: true });
        fs.writeFileSync(CONTRIBUTOR_ID_PATH, id, 'utf-8');
        return id;
    }
}
/** One-way hash of the contributor UUID. */
export function contributorHash() {
    return crypto.createHash('sha256').update(getContributorId()).digest('hex');
}
/** One-way hash of the project name. */
export function projectHash(projectName) {
    return crypto.createHash('sha256').update(projectName).digest('hex');
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