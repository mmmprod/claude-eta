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
import * as crypto from 'node:crypto';
import type { SessionMeta, ActiveTurnState, EventRecord, CompletedTurn, StopReason } from './types.js';
import {
  ensureDir,
  ensureProjectDirs,
  getActiveTurnPath,
  getEventLogPath,
  getCompletedLogPath,
  getSessionMetaPath,
  getCompletedDir,
  getActiveDir,
} from './paths.js';

// ── Session management ───────────────────────────────────────

/** Create or update session metadata */
export function upsertSession(meta: SessionMeta): void {
  const filePath = getSessionMetaPath(meta.project_fp, meta.session_id);
  ensureDir(path.dirname(filePath));
  atomicWrite(filePath, JSON.stringify(meta));
}

/** Read session metadata (returns null if not found) */
export function getSession(projectFp: string, sessionId: string): SessionMeta | null {
  try {
    const raw = fs.readFileSync(getSessionMetaPath(projectFp, sessionId), 'utf-8');
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

// ── Active turn lifecycle ────────────────────────────────────

/** Start a new turn — creates active file and appends turn_started event */
export function startTurn(state: ActiveTurnState): void {
  ensureProjectDirs(state.project_fp);
  setActiveTurn(state);
  try {
    appendEvent(state.project_fp, state.session_id, state.agent_key, {
      seq: 0,
      ts: state.started_at,
      ts_ms: state.started_at_ms,
      event: 'turn_started',
    });
  } catch {
    // Event log append failure is non-fatal — active turn is already created
  }
}

/** Read active turn state (returns null if no active turn) */
export function getActiveTurn(projectFp: string, sessionId: string, agentKey: string): ActiveTurnState | null {
  try {
    const raw = fs.readFileSync(getActiveTurnPath(projectFp, sessionId, agentKey), 'utf-8');
    return JSON.parse(raw) as ActiveTurnState;
  } catch {
    return null;
  }
}

/** Write active turn state (atomic: temp file + rename).
 *  Directories must already exist (created by startTurn → ensureProjectDirs). */
export function setActiveTurn(state: ActiveTurnState): void {
  const filePath = getActiveTurnPath(state.project_fp, state.session_id, state.agent_key);
  atomicWrite(filePath, JSON.stringify(state));
}

/** Delete active turn file */
function clearActiveTurn(projectFp: string, sessionId: string, agentKey: string): void {
  try {
    fs.unlinkSync(getActiveTurnPath(projectFp, sessionId, agentKey));
  } catch {
    // Already gone — fine
  }
}

// ── Event logging ────────────────────────────────────────────

/** Append a single event to the event log (O(1) append, no read-modify-write) */
export function appendEvent(projectFp: string, sessionId: string, agentKey: string, event: EventRecord): void {
  const filePath = getEventLogPath(projectFp, sessionId, agentKey);
  // Directory must already exist (created by startTurn → ensureProjectDirs)
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
}

// ── Turn completion ──────────────────────────────────────────

/** Close an active turn — compute duration, write completed record, delete active file */
export function closeTurn(
  projectFp: string,
  sessionId: string,
  agentKey: string,
  reason: StopReason,
  extras?: Partial<Pick<CompletedTurn, 'repo_loc_bucket' | 'repo_file_count_bucket'>>,
): CompletedTurn | null {
  const active = getActiveTurn(projectFp, sessionId, agentKey);
  if (!active) return null;

  const now = Date.now();
  const endedAt = new Date(now).toISOString();
  const wallSeconds = Math.max(0, Math.round((now - active.started_at_ms) / 1000));

  // Active seconds: time from start to last event, capped at wall
  let activeSeconds = wallSeconds;
  if (active.last_event_at_ms != null && active.tool_calls > 0) {
    activeSeconds = Math.min(
      wallSeconds,
      Math.max(1, Math.round((active.last_event_at_ms - active.started_at_ms) / 1000)),
    );
  }
  const waitSeconds = Math.max(0, wallSeconds - activeSeconds);

  const completed: CompletedTurn = {
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
    repo_loc_bucket: extras?.repo_loc_bucket ?? null,
    repo_file_count_bucket: extras?.repo_file_count_bucket ?? null,
  };

  // Append to completed JSONL
  const completedPath = getCompletedLogPath(projectFp, sessionId, agentKey);
  ensureDir(path.dirname(completedPath));
  fs.appendFileSync(completedPath, JSON.stringify(completed) + '\n');

  // Remove active file BEFORE event log — if crash happens after completed JSONL
  // is written but before active is cleared, the next closeTurn call will find
  // no active file and return null (safe, no duplicate).
  clearActiveTurn(projectFp, sessionId, agentKey);

  // Append closing event (non-fatal — completed record is already persisted)
  try {
    ensureDir(path.dirname(getEventLogPath(projectFp, sessionId, agentKey)));
    appendEvent(projectFp, sessionId, agentKey, {
      seq: active.tool_calls + 1,
      ts: endedAt,
      ts_ms: now,
      event: reason === 'stop' ? 'turn_stopped' : reason === 'stop_failure' ? 'turn_stop_failure' : 'session_ended',
    });
  } catch {
    // Event log append failure is non-fatal — completed turn is already saved
  }

  return completed;
}

/** Close all active turns for a session (used by SessionEnd) */
export function closeAllSessionTurns(projectFp: string, sessionId: string, reason: StopReason): CompletedTurn[] {
  const activeDir = getActiveDir(projectFp);
  const prefix = `${sessionId}__`;
  const results: CompletedTurn[] = [];

  try {
    const files = fs.readdirSync(activeDir);
    for (const file of files) {
      if (file.startsWith(prefix) && file.endsWith('.json')) {
        const agentKey = file.slice(prefix.length, -5); // strip prefix and .json
        const completed = closeTurn(projectFp, sessionId, agentKey, reason);
        if (completed) results.push(completed);
      }
    }
  } catch {
    // Active dir doesn't exist yet — nothing to close
  }

  return results;
}

// ── Reading completed turns ──────────────────────────────────

/** Load all completed turns for a project (reads all JSONL files) */
export function loadCompletedTurns(projectFp: string): CompletedTurn[] {
  return readAllCompletedJsonl(projectFp);
}

/** Load recent completed turns (most recent N by ended_at) */
export function loadRecentCompletedTurns(projectFp: string, limit: number): CompletedTurn[] {
  const all = readAllCompletedJsonl(projectFp);
  all.sort((a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime());
  return all.slice(0, limit);
}

// ── Internals ────────────────────────────────────────────────

/** Atomic write: write to temp file, then rename */
function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/** Read all JSONL files from the completed directory */
function readAllCompletedJsonl(projectFp: string): CompletedTurn[] {
  const dir = getCompletedDir(projectFp);
  const turns: CompletedTurn[] = [];

  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      for (const line of content.split('\n')) {
        if (line.trim()) {
          try {
            turns.push(JSON.parse(line) as CompletedTurn);
          } catch {
            // Skip malformed lines
          }
        }
      }
    }
  } catch {
    // No completed dir yet
  }

  return turns;
}
