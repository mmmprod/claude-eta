/** Classification of a task */
export type TaskClassification =
  | 'feature'
  | 'bugfix'
  | 'refactor'
  | 'config'
  | 'docs'
  | 'review'
  | 'debug'
  | 'test'
  | 'other';

// ── v1 legacy types (kept for backward compat) ──────────────

/** A single tracked task entry (v1 legacy format) */
export interface TaskEntry {
  task_id: string;
  session_id: string;
  project: string;
  timestamp_start: string;
  timestamp_end: string | null;
  duration_seconds: number | null;
  prompt_summary: string;
  classification: TaskClassification;
  tool_calls: number;
  files_read: number;
  files_edited: number;
  files_created: number;
  errors: number;
  model: string;
}

/** Logical main-task aggregate used by v2 analytics paths. */
export interface AnalyticsTask {
  analytics_id: string;
  work_item_id: string;
  session_id: string;
  project: string;
  timestamp_start: string;
  timestamp_end: string | null;
  duration_seconds: number | null;
  prompt_summary: string;
  prompt_complexity: number;
  classification: TaskClassification;
  tool_calls: number;
  files_read: number;
  files_edited: number;
  files_created: number;
  errors: number;
  model: string;
  first_edit_offset_seconds: number | null;
  first_bash_offset_seconds: number | null;
  runner_kind: 'main';
  source_turn_count: number;
}

/** Project-level data file (v1 legacy format) */
export interface ProjectData {
  project: string;
  created: string;
  tasks: TaskEntry[];
  file_count?: number;
  loc_bucket?: string;
  eta_accuracy?: Record<string, { hits: number; misses: number }>;
}

/** @deprecated Use ActiveTurnState instead */
export interface ActiveTask {
  project: string;
  taskId: string;
  start: number;
  tool_calls: number;
  files_read: number;
  files_edited: number;
  files_created: number;
  errors: number;
}

/** Last completed task summary (ephemeral, for recap in next prompt) */
export type LastCompleted = Pick<
  TaskEntry,
  'classification' | 'tool_calls' | 'files_read' | 'files_edited' | 'files_created'
> & { duration_seconds: number; loop_error_fingerprints?: ErrorFingerprint[] };

/** Error fingerprint for loop detection */
export interface ErrorFingerprint {
  fp: string; // sha256 hash, 8 chars
  preview: string; // first 100 chars of normalized error
}

/** User preferences for Auto-ETA (stored in _preferences.json) */
export interface UserPreferences {
  auto_eta: boolean;
  prompts_since_last_eta: number;
  last_eta_task_id?: string;
}

/** Prediction snapshot for self-check (stored in _last_eta.json) */
export interface LastEtaPrediction {
  low: number;
  high: number;
  classification: TaskClassification;
  task_id: string;
  timestamp: string;
}

// ── v2 event-log types ───────────────────────────────────────

export type RunnerKind = 'main' | 'subagent';

export type StopReason =
  | 'stop'
  | 'stop_failure'
  | 'session_end'
  | 'replaced_by_new_prompt'
  | 'subagent_stop'
  | 'migrated';

export type TurnEventType =
  | 'turn_started'
  | 'tool_ok'
  | 'tool_fail'
  | 'turn_stopped'
  | 'turn_stop_failure'
  | 'turn_replaced'
  | 'turn_migrated'
  | 'session_ended'
  | 'subagent_started'
  | 'subagent_stopped';

/** Session-level metadata (one per session per project) */
export interface SessionMeta {
  session_id: string;
  project_fp: string;
  project_display_name: string;
  cwd_realpath: string;
  model: string | null;
  source: string | null;
  session_agent_type: string | null;
  started_at: string;
  last_seen_at: string;
}

/** Active turn state — one file per (session_id, agent_key) */
export interface ActiveTurnState {
  turn_id: string;
  work_item_id: string;
  session_id: string;
  agent_key: string;
  agent_id: string | null;
  agent_type: string | null;
  runner_kind: RunnerKind;
  project_fp: string;
  project_display_name: string;
  classification: TaskClassification;
  prompt_summary: string;
  prompt_complexity: number;
  started_at: string;
  started_at_ms: number;
  tool_calls: number;
  files_read: number;
  files_edited: number;
  files_created: number;
  unique_files: number;
  bash_calls: number;
  bash_failures: number;
  grep_calls: number;
  glob_calls: number;
  errors: number;
  first_tool_at_ms: number | null;
  first_edit_at_ms: number | null;
  first_bash_at_ms: number | null;
  last_event_at_ms: number | null;
  last_assistant_message: string | null;
  model: string | null;
  source: string | null;
  status: 'active' | 'stop_blocked';
  path_fps: string[];
  error_fingerprints: ErrorFingerprint[];

  // Cached ETA snapshot (set by on-prompt, read by on-tool-use)
  cached_eta: {
    p50_wall: number;
    p80_wall: number;
    basis: string;
    calibration: string;
  } | null;

  // Live remaining estimate (updated on phase transitions in on-tool-use)
  live_remaining_p50: number | null;
  live_remaining_p80: number | null;
  live_phase: string | null;
}

/** Single event in the append-only event log */
export interface EventRecord {
  seq: number;
  ts: string;
  ts_ms: number;
  event: TurnEventType;
  tool_name?: string;
  ok?: boolean;
  error?: string | null;
  is_interrupt?: boolean | null;
  exit_code?: number | null;
  file_op?: 'read' | 'edit' | 'create' | null;
  path_fp?: string | null;
}

/** A completed turn — written to completed/*.jsonl */
export interface CompletedTurn {
  turn_id: string;
  work_item_id: string;
  session_id: string;
  agent_key: string;
  agent_id: string | null;
  agent_type: string | null;
  runner_kind: RunnerKind;
  project_fp: string;
  project_display_name: string;
  classification: TaskClassification;
  prompt_summary: string;
  prompt_complexity: number;
  started_at: string;
  ended_at: string;
  wall_seconds: number;
  first_edit_offset_seconds: number | null;
  first_bash_offset_seconds: number | null;
  span_until_last_event_seconds: number;
  tail_after_last_event_seconds: number;
  active_seconds: number;
  wait_seconds: number;
  tool_calls: number;
  files_read: number;
  files_edited: number;
  files_created: number;
  unique_files: number;
  bash_calls: number;
  bash_failures: number;
  grep_calls: number;
  glob_calls: number;
  errors: number;
  model: string | null;
  source: string | null;
  stop_reason: StopReason;
  repo_loc_bucket: string | null;
  repo_file_count_bucket: string | null;
}

// ── Hook stdin types (aligned with official Claude Code spec) ─

/** Common fields shared by all hook events */
export interface HookStdinBase {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  agent_id?: string;
  agent_type?: string;
  /** Model ID — string per official spec. Legacy compat: may arrive as object. */
  model?: string | { id?: string; display_name?: string };
}

/** SessionStart hook stdin */
export interface SessionStartStdin extends HookStdinBase {
  source?: 'startup' | 'resume' | 'clear' | 'compact';
  /** Model is always a string in SessionStart per official spec */
  model?: string | { id?: string; display_name?: string };
}

/** UserPromptSubmit hook stdin */
export interface UserPromptSubmitStdin extends HookStdinBase {
  prompt?: string;
}

/** PostToolUse hook stdin */
export interface PostToolUseStdin extends HookStdinBase {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
}

/** PostToolUseFailure hook stdin — includes error info per official spec */
export interface PostToolUseFailureStdin extends HookStdinBase {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  /** Error message from the failed tool call */
  error?: string;
  /** Whether the failure was caused by a user interrupt */
  is_interrupt?: boolean;
}

/** Stop hook stdin */
export interface StopStdin extends HookStdinBase {
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

/** StopFailure hook stdin — error is an enum per official spec */
export interface StopFailureStdin extends HookStdinBase {
  error?:
    | 'rate_limit'
    | 'authentication_failed'
    | 'billing_error'
    | 'invalid_request'
    | 'server_error'
    | 'max_output_tokens'
    | 'unknown';
  error_details?: string;
  last_assistant_message?: string;
}

/** SubagentStart hook stdin */
export interface SubagentStartStdin extends HookStdinBase {
  // agent_id and agent_type come from HookStdinBase
}

/** SubagentStop hook stdin — full fields per official spec */
export interface SubagentStopStdin extends HookStdinBase {
  stop_hook_active?: boolean;
  agent_transcript_path?: string;
  last_assistant_message?: string;
}

/** SessionEnd hook stdin — includes reason per official spec */
export interface SessionEndStdin extends HookStdinBase {
  reason?: 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'bypass_permissions_disabled' | 'other';
}
