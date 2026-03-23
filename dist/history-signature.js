/**
 * O(1) history signature for completed-turn stats invalidation.
 *
 * The signature is updated on managed write paths (closeTurn, migration).
 * When absent, callers may bootstrap it by scanning existing completed logs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, ensureDir, getCacheDir } from './paths.js';
const HISTORY_SIGNATURE_FILENAME = 'completed-history-signature.json';
function getHistorySignaturePath(projectFp) {
    return path.join(getCacheDir(projectFp), HISTORY_SIGNATURE_FILENAME);
}
export function readHistorySignature(projectFp) {
    try {
        const raw = fs.readFileSync(getHistorySignaturePath(projectFp), 'utf-8');
        const parsed = JSON.parse(raw);
        return typeof parsed.signature === 'string' && parsed.signature.length > 0 ? parsed.signature : null;
    }
    catch {
        return null;
    }
}
function writeHistorySignature(projectFp, signature, source) {
    ensureDir(getCacheDir(projectFp));
    atomicWrite(getHistorySignaturePath(projectFp), JSON.stringify({
        signature,
        updated_at: new Date().toISOString(),
        source,
    }));
}
/** Best-effort bootstrap for existing projects that predate managed signatures. */
export function bootstrapHistorySignature(projectFp, signature) {
    try {
        writeHistorySignature(projectFp, signature, 'bootstrap');
    }
    catch {
        // Bootstrap failure is non-fatal; callers can fall back to scanning.
    }
}
/** Mark completed history as changed using a unique token. */
export function markProjectHistoryChanged(projectFp) {
    const signature = `v2rev:${Date.now()}:${randomUUID()}`;
    try {
        writeHistorySignature(projectFp, signature, 'write_path');
        return signature;
    }
    catch {
        try {
            fs.unlinkSync(getHistorySignaturePath(projectFp));
        }
        catch {
            // If we cannot clear the signature either, later callers may see stale cache.
        }
        return null;
    }
}
//# sourceMappingURL=history-signature.js.map