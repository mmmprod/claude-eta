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
import { randomUUID } from 'node:crypto';
import { loadProjectMeta } from './project-meta.js';
import { ensureDir, ensureProjectDirs, getActiveTurnPath, getEventLogPath, getCompletedLogPath, getSessionMetaPath, getCompletedDir, getActiveDir, getClosingDir, getLocksDir, atomicWrite, atomicWriteIfAbsent, } from './paths.js';
/** Canonical mapping from StopReason to TurnEventType */
const STOP_REASON_TO_EVENT = {
    stop: 'turn_stopped',
    stop_failure: 'turn_stop_failure',
    session_end: 'session_ended',
    replaced_by_new_prompt: 'turn_replaced',
    subagent_stop: 'subagent_stopped',
    migrated: 'turn_migrated',
};
function normalizeActiveTurnState(raw) {
    return {
        ...raw,
        status: raw.status === 'stop_blocked' ? 'stop_blocked' : 'active',
        path_fps: Array.isArray(raw.path_fps) ? raw.path_fps.filter((value) => typeof value === 'string') : [],
        error_fingerprints: Array.isArray(raw.error_fingerprints)
            ? raw.error_fingerprints.filter((value) => value != null &&
                typeof value === 'object' &&
                typeof value.fp === 'string' &&
                typeof value.preview === 'string')
            : [],
    };
}
function normalizeCompletedTurn(raw) {
    const wallSeconds = Math.max(0, raw.wall_seconds ?? 0);
    const promptComplexity = Number.isFinite(raw.prompt_complexity) ? Math.max(0, Math.min(5, raw.prompt_complexity)) : 0;
    const firstEditOffsetSeconds = typeof raw.first_edit_offset_seconds === 'number' && Number.isFinite(raw.first_edit_offset_seconds)
        ? Math.min(wallSeconds, Math.max(0, raw.first_edit_offset_seconds))
        : null;
    const firstBashOffsetSeconds = typeof raw.first_bash_offset_seconds === 'number' && Number.isFinite(raw.first_bash_offset_seconds)
        ? Math.min(wallSeconds, Math.max(0, raw.first_bash_offset_seconds))
        : null;
    const spanUntilLastEventSeconds = Math.min(wallSeconds, Math.max(0, raw.span_until_last_event_seconds ?? raw.active_seconds ?? wallSeconds));
    const tailAfterLastEventSeconds = Math.min(Math.max(0, wallSeconds - spanUntilLastEventSeconds), Math.max(0, raw.tail_after_last_event_seconds ?? raw.wait_seconds ?? (wallSeconds - spanUntilLastEventSeconds)));
    return {
        ...raw,
        prompt_complexity: promptComplexity,
        wall_seconds: wallSeconds,
        first_edit_offset_seconds: firstEditOffsetSeconds,
        first_bash_offset_seconds: firstBashOffsetSeconds,
        span_until_last_event_seconds: spanUntilLastEventSeconds,
        tail_after_last_event_seconds: tailAfterLastEventSeconds,
        // Legacy aliases kept for backward compatibility with existing exports and fixtures.
        active_seconds: spanUntilLastEventSeconds,
        wait_seconds: tailAfterLastEventSeconds,
    };
}
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
    const created = setActiveTurn(state, { createIfAbsent: true });
    if (!created)
        return false;
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
    return true;
}
/** Read active turn state (returns null if no active turn) */
export function getActiveTurn(projectFp, sessionId, agentKey) {
    try {
        const raw = fs.readFileSync(getActiveTurnPath(projectFp, sessionId, agentKey), 'utf-8');
        return normalizeActiveTurnState(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
/** Write active turn state (atomic: temp file + rename).
 *  Directories must already exist (created by startTurn → ensureProjectDirs). */
export function setActiveTurn(state, options = {}) {
    const filePath = getActiveTurnPath(state.project_fp, state.session_id, state.agent_key);
    const payload = JSON.stringify(normalizeActiveTurnState(state));
    if (options.createIfAbsent)
        return atomicWriteIfAbsent(filePath, payload);
    atomicWrite(filePath, payload);
    return true;
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
    let spanUntilLastEventSeconds = wallSeconds;
    if (active.last_event_at_ms != null && active.tool_calls > 0) {
        spanUntilLastEventSeconds = Math.min(wallSeconds, Math.max(1, Math.round((active.last_event_at_ms - active.started_at_ms) / 1000)));
    }
    const tailAfterLastEventSeconds = Math.max(0, wallSeconds - spanUntilLastEventSeconds);
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
    const firstEditOffsetSeconds = active.first_edit_at_ms != null
        ? Math.min(wallSeconds, Math.max(0, Math.round((active.first_edit_at_ms - active.started_at_ms) / 1000)))
        : null;
    const firstBashOffsetSeconds = active.first_bash_at_ms != null
        ? Math.min(wallSeconds, Math.max(0, Math.round((active.first_bash_at_ms - active.started_at_ms) / 1000)))
        : null;
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
        first_edit_offset_seconds: firstEditOffsetSeconds,
        first_bash_offset_seconds: firstBashOffsetSeconds,
        span_until_last_event_seconds: spanUntilLastEventSeconds,
        tail_after_last_event_seconds: tailAfterLastEventSeconds,
        active_seconds: spanUntilLastEventSeconds,
        wait_seconds: tailAfterLastEventSeconds,
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
/** Stale lock threshold: 60 seconds */
const STALE_LOCK_MS = 60_000;
/** O_EXCL open flags — atomic "create only if not exists" on POSIX */
const LOCK_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
function createLockOwner() {
    return {
        pid: process.pid,
        token: randomUUID(),
        created_at_ms: Date.now(),
    };
}
function parseLockOwner(raw) {
    try {
        const parsed = JSON.parse(raw);
        const pid = parsed.pid;
        const token = parsed.token;
        const createdAtMs = parsed.created_at_ms;
        if (!Number.isInteger(pid) || pid == null || pid <= 0)
            return null;
        if (typeof token !== 'string' || token.length === 0)
            return null;
        if (typeof createdAtMs !== 'number' || !Number.isFinite(createdAtMs))
            return null;
        return {
            pid,
            token,
            created_at_ms: createdAtMs,
        };
    }
    catch {
        return null;
    }
}
function sameLockOwner(left, right) {
    if (!left || !right)
        return left === right;
    return left.pid === right.pid && left.token === right.token && left.created_at_ms === right.created_at_ms;
}
function readLockOwner(lockPath) {
    try {
        return parseLockOwner(fs.readFileSync(lockPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid == null || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
function sameFileIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino && left.mtimeMs === right.mtimeMs && left.size === right.size;
}
/** Try to open a lock file with O_EXCL; returns handle or null */
function tryOpenLock(lockPath) {
    const owner = createLockOwner();
    let fd = null;
    try {
        fd = fs.openSync(lockPath, LOCK_FLAGS);
        fs.writeFileSync(fd, JSON.stringify(owner), 'utf-8');
        fs.fsyncSync(fd);
        return { fd, owner };
    }
    catch (error) {
        if (error.code === 'EEXIST') {
            return null;
        }
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            }
            catch {
                /* best-effort cleanup */
            }
            try {
                fs.unlinkSync(lockPath);
            }
            catch {
                /* best-effort cleanup */
            }
        }
        throw error;
    }
}
function compareStringKey(left, right) {
    return (left ?? '').localeCompare(right ?? '');
}
function compareCompletedTurns(left, right) {
    const startedAt = left.started_at.localeCompare(right.started_at);
    if (startedAt !== 0)
        return startedAt;
    const sessionId = compareStringKey(left.session_id, right.session_id);
    if (sessionId !== 0)
        return sessionId;
    const agentKey = compareStringKey(left.agent_key, right.agent_key);
    if (agentKey !== 0)
        return agentKey;
    return compareStringKey(left.turn_id, right.turn_id);
}
/**
 * Try to acquire an advisory lock file using O_EXCL (atomic on POSIX).
 * Returns the file descriptor on success, or null if lock is held.
 * Recovers stale locks older than STALE_LOCK_MS.
 */
function acquireLock(lockPath) {
    ensureDir(path.dirname(lockPath));
    const handle = tryOpenLock(lockPath);
    if (handle !== null)
        return handle;
    // Lock file exists — check for staleness and only recover if the recorded owner is dead.
    try {
        const snapshotStat = fs.statSync(lockPath);
        if (Date.now() - snapshotStat.mtimeMs <= STALE_LOCK_MS) {
            return null;
        }
        const snapshotOwner = readLockOwner(lockPath);
        if (snapshotOwner && isProcessAlive(snapshotOwner.pid)) {
            return null;
        }
        const currentStat = fs.statSync(lockPath);
        const currentOwner = readLockOwner(lockPath);
        if (!sameFileIdentity(snapshotStat, currentStat) || !sameLockOwner(snapshotOwner, currentOwner)) {
            return null;
        }
        fs.unlinkSync(lockPath);
        return tryOpenLock(lockPath);
    }
    catch {
        // stat failed — lock was just released, retry once
        return tryOpenLock(lockPath);
    }
}
/** Release an advisory lock: close fd + unlink file */
function releaseLock(lock, lockPath) {
    const shouldUnlink = sameLockOwner(readLockOwner(lockPath), lock.owner);
    try {
        fs.closeSync(lock.fd);
    }
    catch {
        /* */
    }
    if (shouldUnlink) {
        try {
            fs.unlinkSync(lockPath);
        }
        catch {
            /* */
        }
    }
}
/**
 * Idempotent close turn — guaranteed to produce at most one completed record.
 *
 * Protocol:
 * 0. Acquire advisory lock (O_EXCL) — prevents concurrent closeTurn race
 * 1. Read active file → if missing, check closing/ for crash recovery
 * 2. Rename active → closing (atomic staging)
 * 3. Dedup check: if turn_id already in completed JSONL, delete closing and return
 * 4. Append completed record to JSONL
 * 5. Append closing event to event log
 * 6. Delete closing file
 * 7. Release lock
 */
export function closeTurn(projectFp, sessionId, agentKey, reason, extras) {
    // Step 0: Acquire advisory lock
    const lockPath = path.join(getLocksDir(projectFp), `${sessionId}__${agentKey}.lock`);
    const lock = acquireLock(lockPath);
    if (lock === null) {
        // Lock already held — another process is closing this turn. Bail.
        return null;
    }
    try {
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
                // Rename failed — if closing exists (concurrent call), treat as recovery; otherwise bail
                try {
                    fs.statSync(closingPath);
                    recoveredFromClosing = true;
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
    finally {
        // Step 7: Always release the lock
        releaseLock(lock, lockPath);
    }
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
/** Read all JSONL files from the completed directory, sorted by started_at ascending */
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
                        turns.push(normalizeCompletedTurn(JSON.parse(line)));
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
    // Sort by started_at ascending with stable tie-breakers for deterministic output.
    turns.sort(compareCompletedTurns);
    return turns;
}
//# sourceMappingURL=event-store.js.map