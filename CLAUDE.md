# CLAUDE.md — claude-eta

## What is this

A Claude Code plugin that tracks task durations and calibrates Claude's time estimates with real data. Zero runtime dependencies, local JSON storage, 4 hooks, opt-in community baselines.

## Build & Test

```bash
npm run build        # tsc → dist/
npm test             # 58 tests (node:test)
npm run lint         # tsc --noEmit (strict)
npm run format:check # prettier
```

Always build before testing — tests import from `dist/`.

## Architecture

4 hooks fire in sequence during a Claude Code session:

1. **SessionStart** (`on-session-start.ts`) — Injects project velocity context (passive, silent)
2. **UserPromptSubmit** (`on-prompt.ts`) — Classifies prompt, starts task timer, injects per-task estimate with confidence interval
3. **PostToolUse** (`on-tool-use.ts`) — Increments tool/file/error counters in `_active.json` (fires on EVERY tool call — must be fast)
4. **Stop** (`on-stop.ts`) — Bullshit detector scans Claude's last message for absurd time estimates. If found, blocks and corrects. Then flushes counters to project data.

Data flow: counters accumulate in `_active.json` (tiny file, fast I/O) during the task, then get flushed to `{project}.json` at Stop. This minimizes disk I/O on the hot path (PostToolUse).

## Key modules

- `store.ts` — JSON persistence, active task tracking, `flushActiveTask()`
- `stats.ts` — Median, percentile, IQR, volatility computation, prompt complexity scoring, task estimation, default baselines
- `classify.ts` — Keyword-based prompt classification (9 categories)
- `detector.ts` — Bullshit detector: extract time durations from text, flag outliers
- `stdin.ts` — Generic stdin reader (shared across all hooks)
- `anonymize.ts` — SHA-256 hashing for contributor/project IDs, model normalization, LOC buckets
- `supabase.ts` — Zero-dep HTTP client for PostgREST API (INSERT velocity_records, SELECT baselines_cache)
- `cli/export.ts` — Anonymize project tasks to local JSON
- `cli/contribute.ts` — Preview + upload anonymized data (opt-in, requires `--confirm`)
- `cli/compare.ts` — Fetch community baselines, compare to local stats, 6h cache

## Hook stdin/stdout protocol

Hooks receive JSON on stdin from Claude Code. Each event type has different fields:

- **UserPromptSubmit**: `{ prompt, session_id, cwd, model }` → can output `{ hookSpecificOutput: { additionalContext } }`
- **PostToolUse**: `{ tool_name, tool_input, tool_response }` → output same format
- **Stop**: `{ last_assistant_message, stop_hook_active }` → can output `{ decision: "block", reason }` to force Claude to continue
- **SessionStart**: `{ session_id, cwd }` → plain text stdout becomes context

## Critical conventions

- **PostToolUse is hot path** — spawns on every tool call (~50ms Node startup). Keep it minimal. Never read the full project JSON here — only `_active.json`.
- **TOCTOU** — Never `existsSync` then `readFileSync`. Always try/catch directly.
- **Null safety** — Fields from hook stdin can be undefined. The `ActiveTask` type has all fields required, but JSON deserialization can produce partial objects. Use `?? 0` at boundaries.
- **Backward compat** — `loadProject()` normalizes tasks with missing fields (old plugin versions). Any new field added to `TaskEntry` must have a default in `normalizeTask()`.
- **Stop hook loop prevention** — `stop_hook_active: true` means the Stop hook already fired once. Skip bullshit detection on second fire to avoid infinite loops.

## Data storage

```
~/.claude/plugins/claude-eta/
├── data/
│   ├── {project-slug}.json      # Full task history per project
│   ├── _active.json             # Current task counters (ephemeral, deleted at Stop)
│   ├── _last_completed.json     # Recap for next prompt (ephemeral, consumed once)
│   └── _contribute_state.json   # Last contribution timestamp
├── export/
│   └── velocity-YYYY-MM.json    # Anonymized export files
├── cache/
│   └── baselines.json           # Community baselines cache (6h TTL)
└── .contributor_id              # Random UUID (never sent, only hashed)
```

Data is local-only, human-readable JSON. Never committed to git.
Community features (`compare`, `contribute`) make network calls only when explicitly invoked by the user.

## Testing

Tests are plain JS using `node:test`, importing from `dist/`. Run `npm run build` first.

```
tests/
├── classify.test.js   # 16 tests — classification + summarization
├── store.test.js      # 10 tests — CRUD, active task, increments
├── stats.test.js      # 18 tests — stats, complexity scoring, estimation, formatting
├── detector.test.js   # 14 tests — duration extraction, bullshit detection
├── anonymize.test.js  # 15 tests — hashing, model normalization, LOC buckets
└── export.test.js     # 4 tests — PII stripping, null skip, hash, model normalization
```

## Install the plugin locally (for development)

```bash
npm run build
claude plugin add --local /path/to/claude-eta
```

After code changes, rebuild (`npm run build`) and restart Claude Code for hooks to pick up changes.
