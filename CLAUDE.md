# CLAUDE.md — claude-eta

## What is this

A Claude Code plugin that tracks task durations and calibrates Claude's time estimates with real data. Zero runtime dependencies, append-only JSONL storage, 9 hooks, opt-in community baselines.

## Build & Test

```bash
npm run build        # tsc → dist/
npm run test:unit    # fast unit suite, no spawned hooks/CLI
npm run test:integration # local integration suite
npm test             # full local suite
npm run test:remote  # live Supabase contract test
npm run lint         # tsc --noEmit (strict)
npm run format:check # prettier
```

Always build before testing — tests import from `dist/`.

## Architecture

### v2 event-log architecture

9 hooks fire during a Claude Code session:

1. **SessionStart** (`on-session-start.ts`) — Upserts session metadata (model source of truth), runs legacy migration if needed, injects velocity context
2. **UserPromptSubmit** (`on-prompt.ts`) — Classifies prompt, starts a new turn via event-store, injects per-task estimate (shrinkage quantile)
3. **PostToolUse** (`on-tool-use.ts`) — Increments tool/file/error counters on the active turn file (fires on EVERY tool call — must be fast)
4. **PostToolUseFailure** (`on-tool-failure.ts`) — Same as PostToolUse but always increments errors + bash_failures
5. **Stop** (`on-stop.ts`) — Bullshit detector (classification-specific baseline), closes turn. `stop_blocked` status prevents infinite loop.
6. **StopFailure** (`on-stop-failure.ts`) — Closes turn with `stop_reason='stop_failure'`
7. **SubagentStart** (`on-subagent-start.ts`) — Creates a subagent turn via event-store
8. **SubagentStop** (`on-subagent-stop.ts`) — Closes a subagent turn via event-store
9. **SessionEnd** (`on-session-end.ts`) — Closes all active turns for the session

Data flow: counters accumulate in `active/<session_id>__<agent_key>.json` (tiny file, fast I/O) during the turn, then get appended to `completed/<session_id>__<agent_key>.jsonl` at Stop. Each (session, agent) pair has its own files — no global `_active.json`.

### Project identity

`project_fp = sha256(realpath(cwd)).slice(0, 16)` — not `basename(cwd)`. Two projects with the same basename but different paths never collide.

## Key modules

- `paths.ts` — Centralized data directory paths, uses `${CLAUDE_PLUGIN_DATA}` or dev fallback
- `identity.ts` — Project fingerprint (sha256 of realpath), local salt for privacy hashing
- `event-store.ts` — Append-only JSONL store: upsertSession, startTurn, getActiveTurn, setActiveTurn (atomic), appendEvent, closeTurn, closeAllSessionTurns, loadCompletedTurns
- `types.ts` — All types: v1 legacy (TaskEntry, ProjectData, ActiveTask) + v2 (SessionMeta, ActiveTurnState, EventRecord, CompletedTurn, RunnerKind, StopReason) + all hook stdin types
- `migrate.ts` — Idempotent legacy→v2 migration (reads `{slug}.json`, writes `completed/*.jsonl`)
- `compat.ts` — Bridge layer: `loadCompletedTurnsCompat(cwd)` reads v2 or legacy, `turnsToTaskEntries()` for backward compat
- `stats-cache.ts` — Cached stats loader: `getProjectStats(cwd)` with signature validation
- `estimator.ts` — Shrinkage quantile ETA: blends classification→global→prior with sample-size weights
- `features.ts` — Trace feature extraction + phase detection (explore→edit→validate→repair_loop)
- `stats.ts` — Percentile, IQR, volatility computation, formatting helpers (fmtSec, formatStatsContext)
- `classify.ts` — Keyword-based prompt classification (9 categories)
- `detector.ts` — Bullshit detector: extract durations, flag outliers, `resolveDetectorReference()` for classification-first comparison
- `repo-metrics.ts` — File count + LOC estimation with 24h cache
- `stdin.ts` — Generic stdin reader (shared across all hooks)
- `anonymize.ts` — SHA-256 hashing for contributor/project IDs, model normalization, LOC buckets
- `supabase.ts` — Zero-dep HTTP client for PostgREST API
- `auto-eta.ts` — Auto-ETA decision engine (9 activation conditions, pure, zero I/O)
- `insights/` — 9 deep analyses (correlations, breakdowns, temporal patterns)
- `cli/admin-export.ts` — Maintainer-only admin dashboard JSON export (7 sections: health, eta_accuracy, data_quality, supabase, predictor_eval, insights, subagents). Scans all projects, async Supabase fetch with fallback.

## Module map — which module does what

### Data flow (runtime)

```text
Hooks → event-store.ts → paths.ts → filesystem
           ↓
       stats-cache.ts → stats.ts (pure computation)
           ↓
       estimator.ts (pure computation, uses stats)
           ↓
       auto-eta.ts (decision logic, uses estimator)
```

### Legacy (do NOT use for new code)

- `store.ts` — `@deprecated`, v1 JSON storage. Read-only, used by migrate.ts
- `compat.ts` — bridge v1↔v2, converts between formats
- `convert.ts` — format conversions
- `migrate.ts` — one-shot v1→v2 migration

### Statistics (5 modules, 2 concerns)

- `stats.ts` — core percentile/median/IQR computation (pure, no I/O)
- `stats-cache.ts` — cached wrapper around `stats.ts` (has I/O, signature-validated)
- `estimator.ts` — ETA estimation using stats output (pure, no I/O)
- `auto-eta.ts` — decision logic for auto-ETA display (pure, no I/O)
- `eval.ts` — offline backtesting of estimator accuracy (pure, no I/O)

Rule: if you need stats in a hook, call `getProjectStats(cwd)` from `stats-cache.ts`.

Never call `computeStats()` directly from a hook (bypasses cache).

### Loop detection

- `loop-detector.ts` — fingerprinting + detection (pure, no I/O)
- Integrated in: `on-tool-use.ts`, `on-tool-failure.ts` (fingerprint collection), `on-stop.ts` (5x block), `on-prompt.ts` (3x warning)

## Hook stdin/stdout protocol

Hooks receive JSON on stdin from Claude Code. Each event type has different fields:

- **SessionStart**: `{ session_id, cwd, source, agent_type, model }` → plain text stdout becomes context
- **UserPromptSubmit**: `{ prompt, session_id, cwd, agent_id, model }` → `{ hookSpecificOutput: { additionalContext } }`
- **PostToolUse**: `{ tool_name, tool_input, tool_response, session_id, cwd, agent_id }` → no output
- **PostToolUseFailure**: same shape as PostToolUse
- **Stop**: `{ last_assistant_message, stop_hook_active, session_id, cwd, agent_id }` → `{ decision: "block", reason }` or nothing
- **StopFailure**: `{ session_id, cwd, error }` → no output
- **SubagentStart**: `{ session_id, agent_id, agent_type, cwd }` → no output
- **SubagentStop**: `{ session_id, agent_id, stop_hook_active }` → no output
- **SessionEnd**: `{ session_id, cwd }` → no output

## Critical conventions

- **PostToolUse is hot path** — spawns on every tool call (~50ms Node startup). Only reads/writes the per-(session,agent) active file. Never reads completed turns or full project data here.
- **TOCTOU** — Never `existsSync` then `readFileSync`. Always try/catch directly.
- **Null safety** — Fields from hook stdin can be undefined. Use `?? 0` at boundaries.
- **Atomic writes** — Active turn files use temp+rename pattern (same as v1 `incrementActive`).
- **Stop hook loop prevention** — `stop_hook_active: true` OR `status === 'stop_blocked'` → skip BS detection, just close.
- **Model source of truth** — SessionStart stores model in SessionMeta. UserPromptSubmit reads it from there, not from stdin.model.

## Data storage

```
${CLAUDE_PLUGIN_DATA}/                    # or ~/.claude/plugins/claude-eta/ (dev fallback)
├── schema-version.json
├── local-salt.txt                        # Random salt for privacy hashing (never leaves machine)
├── projects/<project_fp>/
│   ├── meta.json                         # Project metadata
│   ├── sessions/<session_id>.json        # Session metadata (model, source, agent_type)
│   ├── active/<session_id>__<agent_key>.json   # Current turn counters (ephemeral)
│   ├── events/<session_id>__<agent_key>.jsonl  # Append-only event log
│   ├── completed/<session_id>__<agent_key>.jsonl # Finalized turns
│   └── cache/
│       ├── repo-metrics.json             # File count + LOC (24h TTL)
│       └── stats.json                    # Pre-computed stats (future)
├── data/                                 # Legacy v1 data (kept for migration)
│   ├── {project-slug}.json
│   ├── _active.json                      # (deprecated, replaced by per-session active files)
│   ├── _last_completed.json
│   └── _preferences.json
├── export/
│   ├── velocity-YYYY-MM.json
│   └── admin-export.json              # Maintainer dashboard dump (7 sections)
└── cache/
    └── baselines.json                    # Community baselines (6h TTL)
```

Data is local-only, human-readable JSON/JSONL. Never committed to git.
Community features (`compare`, `contribute`) make network calls only when explicitly invoked by the user.

## Testing

Tests are plain JS using `node:test`, importing from `dist/`. Run `npm run build` first.

```
tests/
├── classify.test.js              # 16 tests — classification + summarization
├── store.test.js                 # 10 tests — legacy CRUD, active task, increments
├── stats.test.js                 # 18 tests — stats, complexity scoring, estimation, formatting
├── detector.test.js              # 14 tests — duration extraction, bullshit detection
├── anonymize.test.js             # 15 tests — hashing, model normalization, LOC buckets
├── export.test.js                # 4 tests — PII stripping, null skip, hash
├── paths.test.js                 # 12 tests — data directory path construction
├── identity.test.js              # 15 tests — project fingerprint, salt, hashing
├── event-store.test.js           # 18 tests — turn lifecycle, concurrent sessions, JSONL
├── migrate.test.js               # 11 tests — legacy migration, idempotence, compat
├── stop-hook.test.js             # 5 tests — stop hook integration (v2 event-store)
├── estimator.test.js             # 16 tests — shrinkage quantile, phase detection
├── repo-metrics.test.js          # 7 tests — file walk, caching, buckets
├── auto-eta.test.js              # ~20 tests — activation conditions, cooldown
├── insights-*.test.js            # 48 tests — 9 deep analysis functions
├── admin-export.test.js          # admin dashboard JSON export (7 sections)
└── plugin-package.test.js        # 3 tests — manifest alignment, dist shipping
```

Maintainer-only CLI surfaces stay hidden from normal `/eta help`. Enable them locally with `CLAUDE_ETA_INTERNAL=1` to use `/eta eval` and `/eta admin-export`.

## Install the plugin locally (for development)

```bash
npm run build
claude plugin marketplace add ./
claude plugin install claude-eta --scope local
/reload-plugins
```

After code changes, rebuild (`npm run build`) and restart Claude Code for hooks to pick up changes.
