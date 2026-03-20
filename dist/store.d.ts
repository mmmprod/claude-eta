import type { ProjectData, TaskEntry, ActiveTask, LastCompleted, UserPreferences, LastEtaPrediction } from './types.js';
export declare function loadProject(project: string): ProjectData;
export declare function saveProject(data: ProjectData): void;
export declare function addTask(project: string, task: TaskEntry): void;
export declare function updateLastTask(project: string, updates: Partial<TaskEntry>): ProjectData;
export declare function setActiveTask(project: string, taskId: string): void;
export declare function getActiveTask(): ActiveTask | null;
export declare function clearActiveTask(): void;
/** Increment counters on the active task (called by PostToolUse hook) */
export declare function incrementActive(increments: Partial<Pick<ActiveTask, 'tool_calls' | 'files_read' | 'files_edited' | 'files_created' | 'errors'>>): void;
/** Close the active task: flush counters to project data, clear active file.
 *  Returns the updated project data (caller can reuse it). */
export declare function flushActiveTask(): ProjectData | null;
export declare function setLastCompleted(info: LastCompleted): void;
/** Read and delete in one shot. Discards stale files (e.g. from a crashed session). */
export declare function consumeLastCompleted(maxAgeMs?: number): LastCompleted | null;
export declare function loadPreferences(): UserPreferences;
export declare function savePreferences(prefs: UserPreferences): void;
export declare function setLastEta(prediction: LastEtaPrediction): void;
/** Read and delete in one shot. No maxAge — task_id mismatch guards stale files. */
export declare function consumeLastEta(): LastEtaPrediction | null;
//# sourceMappingURL=store.d.ts.map