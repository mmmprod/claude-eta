/**
 * Append-only JSONL event store for claude-eta v2.
 *
 * Key design:
 * - One active file per (session_id, agent_key) — no global _active.json
 * - Event logs are append-only (fs.appendFileSync)
 * - Atomic writes for active state (temp + rename, same as store.ts)
 * - Completed turns are JSONL (one JSON line per turn)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadProjectMeta } from './project-meta.js';
import { ensureDir, ensureProjectDirs, getActiveTurnPath, getEventLogPath, getCompletedLogPath, getSessionMetaPath, getCompletedDir, getActiveDir, getClosingDir, atomicWrite, } from './paths.js';
/** Canonical mapping from StopReason to TurnEventType */
const STOP_REASON_TO_EVENT = {
    stop: 'turn_stopped',
    stop_failure: 'turn_stop_failure',
    session_end: 'session_ended',
    replaced_by_new_prompt: 'turn_replaced',
    subagent_stop: 'subagent_stopped',
    migrated: 'turn_migrated',
};
// ── Session management ───────────────────────────────────────
/** Create or update session metadata */
export function upsertSession(meta) {
    const filePath = getSessionMetaPath(meta.project_fp, meta.session_id);
    ensureDir(path.dirname(filePath));
    atomicWrite(filePath, JSON.stringify(meta));
}
/** Read session metadata (returns null if not found) */
export function getSession(projectFp, sessionId) {
    try {
        const raw = fs.readFileSync(getSessionMetaPath(projectFp, sessionId), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
// ── Active turn lifecycle ────────────────────────────────────
/** Start a new turn — creates active file and appends turn_started event */
export function startTurn(state) {
    ensureProjectDirs(state.project_fp);
    setActiveTurn(state);
    try {
        appendEvent(state.project_fp, state.session_id, state.agent_key, {
            seq: 0,
            ts: state.started_at,
            ts_ms: state.started_at_ms,
            event: 'turn_started',
        });
    }
    catch {
        // Event log append failure is non-fatal — active turn is already created
    }
}
/** Read active turn state (returns null if no active turn) */
export function getActiveTurn(projectFp, sessionId, agentKey) {
    try {
        const raw = fs.readFileSync(getActiveTurnPath(projectFp, sessionId, agentKey), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/** Write active turn state (atomic: temp file + rename).
 *  Directories must already exist (created by startTurn → ensureProjectDirs). */
export function setActiveTurn(state) {
    const filePath = getActiveTurnPath(state.project_fp, state.session_id, state.agent_key);
    atomicWrite(filePath, JSON.stringify(state));
}
// ── Event logging ────────────────────────────────────────────
/** Append a single event to the event log (O(1) append, no read-modify-write) */
export function appendEvent(projectFp, sessionId, agentKey, event) {
    const filePath = getEventLogPath(projectFp, sessionId, agentKey);
    // Directory must already exist (created by startTurn → ensureProjectDirs)
    fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
}
// ── Turn completion (idempotent) ─────────────────────────────
function getClosingPath(projectFp, sessionId, agentKey) {
    return path.join(getClosingDir(projectFp), `${sessionId}__${agentKey}.json`);
}
/** Check if a turn_id already exists in the completed JSONL (dedup guard) */
function isTurnAlreadyCompleted(projectFp, sessionId, agentKey, turnId) {
    const completedPath = getCompletedLogPath(projectFp, sessionId, agentKey);
    try {
        const content = fs.readFileSync(completedPath, 'utf-8');
        for (const line of content.split('\n')) {
            if (line.includes(`"turn_id":"${turnId}"`))
                return true;
        }
    }
    catch {
        // No completed file yet
    }
    return false;
}
/** Build a CompletedTurn record from an active turn state */
function buildCompletedTurn(active, reason, extras) {
    const now = Date.now();
    const endedAt = new Date(now).toISOString();
    const wallSeconds = Math.max(0, Math.round((now - active.started_at_ms) / 1000));
    let activeSeconds = wallSeconds;
    if (active.last_event_at_ms != null && active.tool_calls > 0) {
        activeSeconds = Math.min(wallSeconds, Math.max(1, Math.round((active.last_event_at_ms - active.started_at_ms) / 1000)));
    }
    const waitSeconds = Math.max(0, wallSeconds - activeSeconds);
    // Auto-fill repo buckets from project meta if not provided via extras
    let locBucket = extras?.repo_loc_bucket ?? null;
    let fileCountBucket = extras?.repo_file_count_bucket ?? null;
    if (!locBucket || !fileCountBucket) {
        const meta = loadProjectMeta(active.project_fp);
        if (meta) {
            if (!locBucket)
                locBucket = meta.loc_bucket;
            if (!fileCountBucket)
                fileCountBucket = meta.file_count_bucket;
        }
    }
    return {
        turn_id: active.turn_id,
        work_item_id: active.work_item_id,
        session_id: active.session_id,
        agent_key: active.agent_key,
        agent_id: active.agent_id,
        agent_type: active.agent_type,
        runner_kind: active.runner_kind,
        project_fp: active.project_fp,
        project_display_name: active.project_display_name,
        classification: active.classification,
        prompt_summary: active.prompt_summary,
        prompt_complexity: active.prompt_complexity,
        started_at: active.started_at,
        ended_at: endedAt,
        wall_seconds: wallSeconds,
        active_seconds: activeSeconds,
        wait_seconds: waitSeconds,
        tool_calls: active.tool_calls,
        files_read: active.files_read,
        files_edited: active.files_edited,
        files_created: active.files_created,
        unique_files: active.unique_files,
        bash_calls: active.bash_calls,
        bash_failures: active.bash_failures,
        grep_calls: active.grep_calls,
        glob_calls: active.glob_calls,
        errors: active.errors,
        model: active.model,
        source: active.source,
        stop_reason: reason,
        repo_loc_bucket: locBucket,
        repo_file_count_bucket: fileCountBucket,
    };
}
/**
 * Idempotent close turn — guaranteed to produce at most one completed record.
 *
 * Protocol:
 * 1. Read active file → if missing, check closing/ for crash recovery
 * 2. Rename active → closing (atomic staging)
 * 3. Dedup check: if turn_id already in completed JSONL, delete closing and return
 * 4. Append completed record to JSONL
 * 5. Append closing event to event log
 * 6. Delete closing file
 */
export function closeTurn(projectFp, sessionId, agentKey, reason, extras) {
    const activePath = getActiveTurnPath(projectFp, sessionId, agentKey);
    const closingPath = getClosingPath(projectFp, sessionId, agentKey);
    let active = null;
    let recoveredFromClosing = false;
    // Step 1: Try to read from active, or fall back to closing (crash recovery)
    try {
        active = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    }
    catch {
        // No active file — check closing for crash recovery
        try {
            active = JSON.parse(fs.readFileSync(closingPath, 'utf-8'));
            recoveredFromClosing = true;
        }
        catch {
            // Neither active nor closing — turn already closed or never existed
            return null;
        }
    }
    // Step 2: Stage — rename active → closing (if not already in closing)
    if (!recoveredFromClosing) {
        ensureDir(getClosingDir(projectFp));
        try {
            fs.renameSync(activePath, closingPath);
        }
        catch {
            // Rename failed — if closing exists (concurrent call), proceed; otherwise bail
            try {
                fs.statSync(closingPath);
            }
            catch {
                return null;
            }
        }
    }
    // Step 3: Dedup check — only needed during crash recovery
    if (recoveredFromClosing && isTurnAlreadyCompleted(projectFp, sessionId, agentKey, active.turn_id)) {
        try {
            fs.unlinkSync(closingPath);
        }
        catch {
            /* already gone */
        }
        return null;
    }
    // Step 4: Build and append completed record
    const completed = buildCompletedTurn(active, reason, extras);
    const completedPath = getCompletedLogPath(projectFp, sessionId, agentKey);
    ensureDir(path.dirname(completedPath));
    fs.appendFileSync(completedPath, JSON.stringify(completed) + '\n');
    // Step 5: Append closing event (non-fatal)
    try {
        ensureDir(path.dirname(getEventLogPath(projectFp, sessionId, agentKey)));
        appendEvent(projectFp, sessionId, agentKey, {
            seq: active.tool_calls + 1,
            ts: completed.ended_at,
            ts_ms: Date.now(),
            event: STOP_REASON_TO_EVENT[reason] ?? 'turn_stopped',
        });
    }
    catch {
        // Event log failure is non-fatal — completed record is already persisted
    }
    // Step 6: Clean up closing file
    try {
        fs.unlinkSync(closingPath);
    }
    catch {
        /* already gone */
    }
    return completed;
}
/** Close all active turns for a session (used by SessionEnd) */
export function closeAllSessionTurns(projectFp, sessionId, reason) {
    const activeDir = getActiveDir(projectFp);
    const prefix = `${sessionId}__`;
    const results = [];
    try {
        const files = fs.readdirSync(activeDir);
        for (const file of files) {
            if (file.startsWith(prefix) && file.endsWith('.json')) {
                const agentKey = file.slice(prefix.length, -5); // strip prefix and .json
                const completed = closeTurn(projectFp, sessionId, agentKey, reason);
                if (completed)
                    results.push(completed);
            }
        }
    }
    catch {
        // Active dir doesn't exist yet — nothing to close
    }
    return results;
}
// ── Reading completed turns ──────────────────────────────────
/** Load all completed turns for a project (reads all JSONL files) */
export function loadCompletedTurns(projectFp) {
    return readAllCompletedJsonl(projectFp);
}
/** Load recent completed turns (most recent N by ended_at) */
export function loadRecentCompletedTurns(projectFp, limit) {
    const all = readAllCompletedJsonl(projectFp);
    all.sort((a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime());
    return all.slice(0, limit);
}
// ── Internals ────────────────────────────────────────────────
/** Read all JSONL files from the completed directory */
function readAllCompletedJsonl(projectFp) {
    const dir = getCompletedDir(projectFp);
    const turns = [];
    try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            for (const line of content.split('\n')) {
                if (line.trim()) {
                    try {
                        turns.push(JSON.parse(line));
                    }
                    catch {
                        // Skip malformed lines
                    }
                }
            }
        }
    }
    catch {
        // No completed dir yet
    }
    return turns;
}
//# sourceMappingURL=event-store.js.map