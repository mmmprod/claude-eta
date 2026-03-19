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
    plugin_version: string;
    contributor_hash: string;
}
export declare function anonymizeProject(projName: string, pluginVersion: string): AnonymizedRecord[];
export declare function exportToFile(projName: string, pluginVersion: string): {
    path: string;
    count: number;
};
export declare function showExport(projName: string, pluginVersion: string): void;
//# sourceMappingURL=export.d.ts.map