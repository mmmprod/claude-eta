/** Classification of a task */
export type TaskClassification = 'feature' | 'bugfix' | 'refactor' | 'config' | 'docs' | 'review' | 'debug' | 'test' | 'other';
/** A single tracked task entry */
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
/** Project-level data file */
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
/** Active task tracker (stored in _active.json) */
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
/** Common fields shared by all hook events */
interface HookStdinBase {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    permission_mode?: string;
    hook_event_name?: string;
    model?: {
        id?: string;
        display_name?: string;
    };
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
/** Stop hook stdin */
export interface StopStdin extends HookStdinBase {
    stop_hook_active?: boolean;
    last_assistant_message?: string;
}
export {};
//# sourceMappingURL=types.d.ts.map