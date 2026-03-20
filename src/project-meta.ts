/**
 * Project metadata v2 — stored at projects/<fp>/meta.json.
 *
 * Provides atomic CRUD for project-level metadata including
 * repo metrics, accuracy tracking, and display info.
 */
import * as fs from 'node:fs';
import { getProjectMetaPath, ensureDir, getProjectDir, atomicWrite } from './paths.js';

export interface EtaAccuracyV2 {
  by_classification: Record<
    string,
    {
      interval80_hits: number;
      interval80_total: number;
    }
  >;
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

export function loadProjectMeta(fp: string): ProjectMeta | null {
  try {
    const content = fs.readFileSync(getProjectMetaPath(fp), 'utf-8');
    return JSON.parse(content) as ProjectMeta;
  } catch {
    return null;
  }
}

export function saveProjectMeta(fp: string, meta: ProjectMeta): void {
  ensureDir(getProjectDir(fp));
  atomicWrite(getProjectMetaPath(fp), JSON.stringify(meta, null, 2));
}

/** Update ETA accuracy for a classification (hit or miss) */
export function updateEtaAccuracy(fp: string, classification: string, hit: boolean): void {
  const meta = loadProjectMeta(fp);
  if (!meta) return;

  const now = new Date().toISOString();
  const accuracy: EtaAccuracyV2 = meta.eta_accuracy ?? {
    by_classification: {},
    updated_at: now,
  };

  const entry = accuracy.by_classification[classification] ?? {
    interval80_hits: 0,
    interval80_total: 0,
  };

  entry.interval80_total++;
  if (hit) entry.interval80_hits++;

  accuracy.by_classification[classification] = entry;
  accuracy.updated_at = now;

  saveProjectMeta(fp, { ...meta, eta_accuracy: accuracy, updated_at: now });
}

/** Create or update project meta — merges with existing if present */
export function upsertProjectMeta(
  fp: string,
  updates: Partial<ProjectMeta> & Pick<ProjectMeta, 'project_fp' | 'display_name' | 'cwd_realpath'>,
): ProjectMeta {
  const existing = loadProjectMeta(fp);
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
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
