/**
 * Project metadata v2 — stored at projects/<fp>/meta.json.
 *
 * Provides atomic CRUD for project-level metadata including
 * repo metrics, accuracy tracking, and display info.
 */
import * as fs from 'node:fs';
import { getProjectMetaPath, ensureDir, getProjectDir, atomicWrite } from './paths.js';
export function loadProjectMeta(fp) {
    try {
        const content = fs.readFileSync(getProjectMetaPath(fp), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export function saveProjectMeta(fp, meta) {
    ensureDir(getProjectDir(fp));
    atomicWrite(getProjectMetaPath(fp), JSON.stringify(meta, null, 2));
}
/** Create or update project meta — merges with existing if present */
export function upsertProjectMeta(fp, updates) {
    const existing = loadProjectMeta(fp);
    const now = new Date().toISOString();
    const meta = {
        project_fp: updates.project_fp,
        display_name: updates.display_name,
        cwd_realpath: updates.cwd_realpath,
        created: existing?.created ?? now,
        updated_at: now,
        legacy_slug: updates.legacy_slug ?? existing?.legacy_slug ?? null,
        file_count: updates.file_count ?? existing?.file_count ?? null,
        file_count_bucket: updates.file_count_bucket ?? existing?.file_count_bucket ?? null,
        loc_bucket: updates.loc_bucket ?? existing?.loc_bucket ?? null,
        repo_metrics_updated_at: updates.repo_metrics_updated_at ?? existing?.repo_metrics_updated_at ?? null,
        eta_accuracy: updates.eta_accuracy ?? existing?.eta_accuracy ?? null,
    };
    saveProjectMeta(fp, meta);
    return meta;
}
//# sourceMappingURL=project-meta.js.map