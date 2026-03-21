export interface EtaAccuracyV2 {
    by_classification: Record<string, {
        interval80_hits: number;
        interval80_total: number;
    }>;
    updated_at: string;
}
export interface ProjectMeta {
    project_fp: string;
    display_name: string;
    cwd_realpath: string;
    created: string;
    updated_at: string;
    legacy_slug: string | null;
    file_count: number | null;
    file_count_bucket: string | null;
    loc_bucket: string | null;
    repo_metrics_updated_at: string | null;
    eta_accuracy: EtaAccuracyV2 | null;
}
export declare function loadProjectMeta(fp: string): ProjectMeta | null;
export declare function saveProjectMeta(fp: string, meta: ProjectMeta): void;
/** Update ETA accuracy for a classification (hit or miss) */
export declare function updateEtaAccuracy(fp: string, classification: string, hit: boolean): void;
/** Create or update project meta — merges with existing if present */
export declare function upsertProjectMeta(fp: string, updates: Partial<ProjectMeta> & Pick<ProjectMeta, 'project_fp' | 'display_name' | 'cwd_realpath'>): ProjectMeta;
//# sourceMappingURL=project-meta.d.ts.map