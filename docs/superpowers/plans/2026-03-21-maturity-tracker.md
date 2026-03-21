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

## Final Review

- [x] Run a targeted final review on commit `150ffeb` with focus on:
  - ETA evaluation semantics
  - phase-aware estimator behavior
  - hook perf gate correctness
  - CI gating coverage
- [x] Record findings and residual risks after the review pass.

### Findings

- `P1` CI umbrella job `required-ci` does not depend on `supabase-integration`, so a red schema/integration job can still merge if branch protection only requires the umbrella check.
- `P2` `/eta eval` drops valid `first_edit` and `first_bash` observations when the phase offset is exactly `0`, which biases calibration samples toward slower-starting tasks.
- `P2` `scripts/bench-hooks.mjs` reports a `p95` computed with a floor index on 10 samples, which underestimates the advertised percentile and weakens the perf gate.

### Follow-up Fixes

- [x] Add `supabase-integration` to the `required-ci` umbrella gate.
- [x] Count `0s` phase offsets as valid observations in `/eta eval`.
- [x] Switch hook bench `p95` to a nearest-rank calculation and raise CI samples to `20`.

## GUI Follow-up

- Scope note: `admin/dashboard.html` remains an internal operator GUI only. It is not the future end-user product surface.
- [x] Surface predictor evaluation inside `/eta admin-export`.
- [x] Add a dedicated predictor calibration section to `admin/dashboard.html`.
- [x] Align the admin GUI time-ratio table with the renamed proxy timing fields.
- [x] Hide maintainer-only surfaces from normal `/eta help` and gate them behind `CLAUDE_ETA_INTERNAL=1`.
