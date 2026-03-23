/**
 * Pure baseline matching logic — no I/O, no imports from baselines-cache or cli/compare.
 * Extracted to break the circular dependency: baselines-cache ↔ cli/compare.
 */
import type { BaselineRecord } from './supabase.js';

export type BaselineMatchKind = 'type+loc+model' | 'type+model' | 'type+loc' | 'global';

export interface BaselineMatch {
  kind: BaselineMatchKind;
  record: BaselineRecord;
}

export function selectBestBaseline(
  baselines: BaselineRecord[],
  taskType: string,
  projectLocBucket: string | null,
  model: string | null,
): BaselineMatch | null {
  const exact = (loc: string | null, candidateModel: string | null) =>
    baselines.find(
      (baseline) =>
        baseline.task_type === taskType && baseline.project_loc_bucket === loc && baseline.model === candidateModel,
    ) ?? null;

  if (projectLocBucket && model) {
    const hit = exact(projectLocBucket, model);
    if (hit) return { kind: 'type+loc+model', record: hit };
  }

  if (model) {
    const hit = exact(null, model);
    if (hit) return { kind: 'type+model', record: hit };
  }

  if (projectLocBucket) {
    const hit = exact(projectLocBucket, null);
    if (hit) return { kind: 'type+loc', record: hit };
  }

  const hit = exact(null, null);
  return hit ? { kind: 'global', record: hit } : null;
}
