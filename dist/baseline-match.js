export function selectBestBaseline(baselines, taskType, projectLocBucket, model) {
    const exact = (loc, candidateModel) => baselines.find((baseline) => baseline.task_type === taskType && baseline.project_loc_bucket === loc && baseline.model === candidateModel) ?? null;
    if (projectLocBucket && model) {
        const hit = exact(projectLocBucket, model);
        if (hit)
            return { kind: 'type+loc+model', record: hit };
    }
    if (model) {
        const hit = exact(null, model);
        if (hit)
            return { kind: 'type+model', record: hit };
    }
    if (projectLocBucket) {
        const hit = exact(projectLocBucket, null);
        if (hit)
            return { kind: 'type+loc', record: hit };
    }
    const hit = exact(null, null);
    return hit ? { kind: 'global', record: hit } : null;
}
//# sourceMappingURL=baseline-match.js.map