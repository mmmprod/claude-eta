/**
 * Ephemeral state v2 — scoped by (project_fp, session_id).
 *
 * Replaces v1 _last_eta.json and _last_completed.json from store.ts.
 * Each session gets its own ephemeral file under projects/<fp>/cache/.
 */
import * as fs from 'node:fs';
import { getCacheDir, ensureDir, atomicWrite } from './paths.js';
function getEphemeralPath(fp, sessionId) {
    return `${getCacheDir(fp)}/ephemeral-${sessionId}.json`;
}
function readEphemeral(fp, sessionId) {
    try {
        const content = fs.readFileSync(getEphemeralPath(fp, sessionId), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { last_eta: null, last_completed: null, updated_at: new Date().toISOString() };
    }
}
function writeEphemeral(fp, sessionId, state) {
    ensureDir(getCacheDir(fp));
    atomicWrite(getEphemeralPath(fp, sessionId), JSON.stringify(state));
}
// ── Last ETA ──────────────────────────────────────────────────
export function setLastEtaV2(fp, sessionId, prediction) {
    const state = readEphemeral(fp, sessionId);
    state.last_eta = prediction;
    state.updated_at = new Date().toISOString();
    writeEphemeral(fp, sessionId, state);
}
/** Read and consume (clear) the last ETA prediction */
export function consumeLastEtaV2(fp, sessionId) {
    const state = readEphemeral(fp, sessionId);
    if (!state.last_eta)
        return null;
    const eta = state.last_eta;
    state.last_eta = null;
    state.updated_at = new Date().toISOString();
    writeEphemeral(fp, sessionId, state);
    return eta;
}
// ── Last Completed ────────────────────────────────────────────
export function setLastCompletedV2(fp, sessionId, info) {
    const state = readEphemeral(fp, sessionId);
    state.last_completed = info;
    state.updated_at = new Date().toISOString();
    writeEphemeral(fp, sessionId, state);
}
/** Read and consume (clear) the last completed recap. Stale entries (>30min) are discarded. */
export function consumeLastCompletedV2(fp, sessionId, maxAgeMs = 30 * 60 * 1000) {
    const state = readEphemeral(fp, sessionId);
    if (!state.last_completed)
        return null;
    // Use updated_at from the JSON (not filesystem mtime) to avoid TOCTOU
    const age = Date.now() - new Date(state.updated_at).getTime();
    if (age > maxAgeMs)
        return null;
    const completed = state.last_completed;
    state.last_completed = null;
    state.updated_at = new Date().toISOString();
    writeEphemeral(fp, sessionId, state);
    return completed;
}
//# sourceMappingURL=ephemeral.js.map