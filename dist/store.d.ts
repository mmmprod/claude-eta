import type { ProjectData, TaskEntry, ActiveTask } from './types.js';
export declare function loadProject(project: string): ProjectData;
export declare function saveProject(data: ProjectData): void;
export declare function addTask(project: string, task: TaskEntry): void;
export declare function updateLastTask(project: string, updates: Partial<TaskEntry>): void;
export declare function setActiveTask(project: string, taskId: string): void;
export declare function getActiveTask(): ActiveTask | null;
export declare function clearActiveTask(): void;
/** Increment counters on the active task (called by PostToolUse hook) */
export declare function incrementActive(increments: Partial<Pick<ActiveTask, 'tool_calls' | 'files_read' | 'files_edited' | 'files_created' | 'errors'>>): void;
/** Close the active task: flush counters to project data, clear active file */
export declare function flushActiveTask(): void;
//# sourceMappingURL=store.d.ts.map