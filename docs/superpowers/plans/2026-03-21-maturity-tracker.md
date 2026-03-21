# Tracker And Calibration Hardening

> Execution tracker for the post-audit hardening work. Keep this file updated when a slice is completed so the next session can resume without reconstructing state.

## Completed

- [x] Fix legacy `active/*.json` compatibility when `error_fingerprints` is missing.
- [x] Scope repair-loop detection to repeated `Bash` failures.
- [x] Preserve `work_item_id` across continuation prompts for the same logical task.
- [x] Exclude subagent runs from main-task analytics and exports.
- [x] Migrate main analytics paths off lossy `TaskEntry` conversion.
- [x] Rename timing semantics to explicit proxy fields while keeping legacy aliases.
- [x] Make community compare model-aware with fallback ordering.
- [x] Make local prompt ETA model-aware from local history.

## In Progress

- [x] Wire phase offsets and prompt complexity through `CompletedTurn -> AnalyticsTask`.
- [x] Add walk-forward predictor evaluation for prompt, first edit, and first bash stages.
- [x] Add explicit hook performance gate and CI enforcement.

## Remaining Release Blockers

- [x] Re-run full build/lint/test/perf cycle after the final slices.
- [x] Run Supabase integration against the live schema.
- [x] Satisfy the committed-`dist/` packaging guard for release-ready CI.
