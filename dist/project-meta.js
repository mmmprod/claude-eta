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
/** Update ETA accuracy for a classification (hit or miss) */
export function updateEtaAccuracy(fp, classification, hit) {
    const meta = loadProjectMeta(fp);
    if (!meta)
        return;
    const now = new Date().toISOString();
    const accuracy = meta.eta_accuracy ?? {
        by_classification: {},
        updated_at: now,
    };
    const entry = accuracy.by_classification[classification] ?? {
        interval80_hits: 0,
        interval80_total: 0,
    };
    entry.interval80_total++;
    if (hit)
        entry.interval80_hits++;
    accuracy.by_classification[classification] = entry;
    accuracy.updated_at = now;
    saveProjectMeta(fp, { ...meta, eta_accuracy: accuracy, updated_at: now });
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