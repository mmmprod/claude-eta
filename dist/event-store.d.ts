import type { SessionMeta, ActiveTurnState, EventRecord, CompletedTurn, StopReason } from './types.js';
/** Create or update session metadata */
export declare function upsertSession(meta: SessionMeta): void;
/** Read session metadata (returns null if not found) */
export declare function getSession(projectFp: string, sessionId: string): SessionMeta | null;
/** Start a new turn — creates active file and appends turn_started event */
export declare function startTurn(state: ActiveTurnState): boolean;
/** Read active turn state (returns null if no active turn) */
export declare function getActiveTurn(projectFp: string, sessionId: string, agentKey: string): ActiveTurnState | null;
/** Write active turn state (atomic: temp file + rename).
 *  Directories must already exist (created by startTurn → ensureProjectDirs). */
export declare function setActiveTurn(state: ActiveTurnState, options?: {
    createIfAbsent?: boolean;
}): boolean;
/** Append a single event to the event log (O(1) append, no read-modify-write) */
export declare function appendEvent(projectFp: string, sessionId: string, agentKey: string, event: EventRecord): void;
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
export declare function closeTurn(projectFp: string, sessionId: string, agentKey: string, reason: StopReason, extras?: Partial<Pick<CompletedTurn, 'repo_loc_bucket' | 'repo_file_count_bucket'>>): CompletedTurn | null;
/** Close all active turns for a session (used by SessionEnd) */
export declare function closeAllSessionTurns(projectFp: string, sessionId: string, reason: StopReason): CompletedTurn[];
/** Load all completed turns for a project (reads all JSONL files) */
export declare function loadCompletedTurns(projectFp: string): CompletedTurn[];
/** Load recent completed turns (most recent N by ended_at) */
export declare function loadRecentCompletedTurns(projectFp: string, limit: number): CompletedTurn[];
//# sourceMappingURL=event-store.d.ts.map