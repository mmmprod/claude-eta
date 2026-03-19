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
}

/** Stdin data from Claude Code hooks */
export interface HookStdinData {
  session_id?: string;
  cwd?: string;
  model?: {
    id?: string;
    display_name?: string;
  };
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  transcript_path?: string;
}
