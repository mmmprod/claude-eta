import type { TaskEntry } from '../types.js';
export interface AnonymizedRecord {
    task_type: string;
    duration_seconds: number;
    tool_calls: number;
    files_read: number;
    files_edited: number;
    files_created: number;
    errors: number;
    model: string | null;
    project_hash: string;
    project_file_count: number | null;
    project_loc_bucket: string | null;
    plugin_version: string;
    contributor_hash: string;
}
export declare function anonymizeTask(task: TaskEntry, projIdentifier: string, pluginVersion: string, projectMeta?: {
    file_count?: number;
    loc_bucket?: string;
}): AnonymizedRecord | null;
export declare function anonymizeProject(cwd: string, pluginVersion: string): AnonymizedRecord[];
export declare function exportToFile(cwd: string, pluginVersion: string): {
    path: string;
    count: number;
};
export declare function showExport(cwd: string, pluginVersion: string): void;
//# sourceMappingURL=export.d.ts.map