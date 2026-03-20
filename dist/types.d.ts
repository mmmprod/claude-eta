/** Classification of a task */
export type TaskClassification = 'feature' | 'bugfix' | 'refactor' | 'config' | 'docs' | 'review' | 'debug' | 'test' | 'other';
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
/** Project-level data file (v1 legacy format) */
export interface ProjectData {
    project: string;
    created: string;
    tasks: TaskEntry[];
    file_count?: number;
    loc_bucket?: string;
    eta_accuracy?: Record<string, {
        hits: number;
        misses: number;
    }>;
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
export type LastCompleted = Pick<TaskEntry, 'classification' | 'tool_calls' | 'files_read' | 'files_edited' | 'files_created'> & {
    duration_seconds: number;
};
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
export type RunnerKind = 'main' | 'subagent';
export type StopReason = 'stop' | 'stop_failure' | 'session_end' | 'replaced_by_new_prompt' | 'subagent_stop' | 'migrated';
export type TurnEventType = 'turn_started' | 'tool_ok' | 'tool_fail' | 'turn_stopped' | 'turn_stop_failure' | 'session_ended' | 'subagent_started' | 'subagent_stopped';
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
/** Common fields shared by all hook events */
export interface HookStdinBase {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    permission_mode?: string;
    hook_event_name?: string;
    agent_id?: string;
    agent_type?: string;
    model?: {
        id?: string;
        display_name?: string;
    };
}
/** SessionStart hook stdin */
export interface SessionStartStdin extends HookStdinBase {
    source?: string;
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
/** PostToolUseFailure hook stdin (same shape as PostToolUse) */
export interface PostToolUseFailureStdin extends HookStdinBase {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: Record<string, unknown>;
    tool_use_id?: string;
}
/** Stop hook stdin */
export interface StopStdin extends HookStdinBase {
    stop_hook_active?: boolean;
    last_assistant_message?: string;
}
/** StopFailure hook stdin */
export interface StopFailureStdin extends HookStdinBase {
    stop_hook_active?: boolean;
    error?: string;
}
/** SubagentStart hook stdin */
export interface SubagentStartStdin extends HookStdinBase {
}
/** SubagentStop hook stdin */
export interface SubagentStopStdin extends HookStdinBase {
    stop_hook_active?: boolean;
}
/** SessionEnd hook stdin */
export interface SessionEndStdin extends HookStdinBase {
}
//# sourceMappingURL=types.d.ts.map