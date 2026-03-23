/**
 * PostToolUse hook — v2: increments counters on session-scoped active turn.
 *
 * HOT PATH — fires on every tool call. Must stay fast.
 * Reads/writes active/<session_id>__<agent_key>.json (same atomic pattern as v1).
 *
 * Phase transitions (2-3 per turn max) trigger a richer ETA recalculation
 * using estimateWithTrace, storing the result in refined_eta for on-prompt.
 */
import type { PostToolUseStdin } from '../types.js';
import { readStdin } from '../stdin.js';
import { getActiveTurn, setActiveTurn, appendEvent } from '../event-store.js';
import { resolveProjectIdentity } from '../identity.js';
import { hashWithLocalSalt } from '../identity.js';
import { buildErrorFingerprint } from '../loop-detector.js';
import { applyPhaseTransition } from '../features.js';
import { refineEtaOnTransition } from './refine-eta.js';

async function main(): Promise<void> {
  const stdin = await readStdin<PostToolUseStdin>();
  if (!stdin) return;

  const cwd = stdin.cwd;
  const sessionId = stdin.session_id;
  if (!cwd || !sessionId) return;

  const agentKey = stdin.agent_id ?? 'main';
  const { fp } = resolveProjectIdentity(cwd);

  // Read active turn — if none, silently return (no turn started yet)
  const state = getActiveTurn(fp, sessionId, agentKey);
  if (!state) return;

  const toolName = stdin.tool_name ?? '';
  const now = Date.now();

  // ── Increment counters ─────────────────────────────────────
  state.tool_calls += 1;
  state.last_event_at_ms = now;

  if (state.first_tool_at_ms === null) {
    state.first_tool_at_ms = now;
  }

  // File operations
  let fileOp: 'read' | 'edit' | 'create' | null = null;
  switch (toolName) {
    case 'Read':
    case 'NotebookRead':
      state.files_read += 1;
      fileOp = 'read';
      break;
    case 'Edit':
    case 'NotebookEdit':
      state.files_edited += 1;
      fileOp = 'edit';
      if (state.first_edit_at_ms === null) state.first_edit_at_ms = now;
      if (state.first_bash_failure_at_ms !== null) state.files_edited_after_first_failure = (state.files_edited_after_first_failure ?? 0) + 1;
      break;
    case 'Write':
      state.files_created += 1;
      fileOp = 'create';
      if (state.first_edit_at_ms === null) state.first_edit_at_ms = now;
      if (state.first_bash_failure_at_ms !== null) state.files_edited_after_first_failure = (state.files_edited_after_first_failure ?? 0) + 1;
      break;
  }

  // Tool-specific counters
  switch (toolName) {
    case 'Bash':
      state.bash_calls += 1;
      if (state.first_bash_at_ms === null) state.first_bash_at_ms = now;
      break;
    case 'Grep':
      state.grep_calls += 1;
      break;
    case 'Glob':
      state.glob_calls += 1;
      break;
  }

  // Track unique files via hashed path
  let pathFp: string | null = null;
  const filePath = (stdin.tool_input as Record<string, unknown> | undefined)?.file_path as string | undefined;
  if (filePath) {
    pathFp = hashWithLocalSalt(filePath).slice(0, 12);
    if (!state.path_fps.includes(pathFp)) {
      state.path_fps.push(pathFp);
      state.unique_files = state.path_fps.length;
    }
  }

  // Detect Bash errors
  if (toolName === 'Bash' && stdin.tool_response) {
    const resp = stdin.tool_response as Record<string, unknown>;
    if (typeof resp.exit_code === 'number' && resp.exit_code !== 0) {
      state.errors += 1;
      state.bash_failures += 1;
      if (state.first_bash_failure_at_ms === null) state.first_bash_failure_at_ms = now;
      // Loop detector: fingerprint the error output (capped to avoid unbounded growth)
      const stderr = String(resp.stderr ?? resp.stdout ?? '');
      if (stderr.length > 0 && state.error_fingerprints.length < 50) {
        state.error_fingerprints.push(buildErrorFingerprint(stderr));
      }
    }
  }

  // Phase transition: applyPhaseTransition updates live_* with lightweight multipliers
  // and returns the new phase if a transition occurred.
  // On transitions (2-3 per turn), refineEtaOnTransition runs the richer estimateWithTrace.
  const transitioned = applyPhaseTransition(state, now);
  if (transitioned) {
    refineEtaOnTransition(state, cwd, transitioned, now);
  }

  // ── Persist ────────────────────────────────────────────────
  setActiveTurn(state);

  // Append event (non-blocking for perf — errors are silent)
  try {
    appendEvent(fp, sessionId, agentKey, {
      seq: state.tool_calls,
      ts: new Date(now).toISOString(),
      ts_ms: now,
      event: 'tool_ok',
      tool_name: toolName || undefined,
      ok: true,
      file_op: fileOp,
      path_fp: pathFp,
    });
  } catch {
    // Event log append failure is non-fatal on hot path
  }
}

void main();
