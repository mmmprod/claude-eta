# claude-eta

**Know how long your tasks actually take.** A Claude Code plugin that tracks task durations, learns your project's velocity, and calibrates Claude's time estimates with real data.

> Claude says "this will take about 2 days." Your history says it takes 12 minutes.
> claude-eta fixes that.

## What it does

claude-eta runs silently in the background and does three things:

1. **Tracks every task** — duration, tool calls, files touched, classification, errors
2. **Learns your velocity** — builds per-project stats with medians, confidence ranges, and volatility by task type
3. **Calibrates Claude** — injects your real velocity data into Claude's context so it stops hallucinating time estimates

No configuration. No interruptions. Install it and forget about it.

## Install

```bash
claude plugin add --local /path/to/claude-eta
```

Or from the marketplace:

```bash
claude plugin add claude-eta
```

## Commands

### `/eta` — Session stats

```
## Session Stats (4 tasks completed)

| Metric              | Value               |
|---------------------|---------------------|
| Tasks completed     | 4                   |
| Total time          | 18m 32s             |
| Avg per task        | 4m 38s              |
| Total tool calls    | 47                  |
| Files read          | 23                  |
| Files edited        | 11                  |
| Errors              | 1                   |
```

### `/eta history` — Recent tasks

```
## Last 10 Tasks

| Date          | Duration | Type     | Prompt                           | Tools |
|---------------|----------|----------|----------------------------------|-------|
| 19 Mar, 18:38 | 4m 12s   | bugfix   | fix the login bug in auth module |    12 |
| 19 Mar, 18:15 | 22m 8s   | feature  | implement pagination for the API |    34 |
| 19 Mar, 17:50 | 1m 42s   | config   | update eslint config             |     5 |
```

### `/eta stats` — Averages by type

```
## Stats by Task Type (47 total)

| Type      | Count | Avg Duration | Avg Tools | Avg Files |
|-----------|-------|--------------|-----------|-----------|
| feature   |    12 | 18m          |        28 |        14 |
| bugfix    |    15 | 6m           |        11 |         5 |
| refactor  |     8 | 12m          |        19 |         9 |
| config    |     6 | 3m           |         4 |         2 |
```

## How calibration works

After 5 completed tasks, claude-eta starts injecting your project's velocity data into Claude's context at every prompt:

```
[claude-eta] Project velocity (47 completed tasks):
Overall: median 8m, range 3m–22m
bugfix: median 6m (3m–12m, medium volatility, 15 tasks)
feature: median 18m (10m–35m, medium volatility, 12 tasks)
config: median 3m (1m–5m, low volatility, 6 tasks)
```

Claude reads this and calibrates automatically. When you ask "how long will this take?", the answer comes from your real data, not a hallucination.

**Silent by default.** You never see the injection. Claude just gets smarter about time.

## Architecture

```
SessionStart  →  Inject velocity context (passive awareness)
     ↓
UserPromptSubmit  →  Classify task + inject stats + start timer
     ↓
PostToolUse (×N)  →  Count tools, files, errors (in _active.json)
     ↓
Stop  →  Flush counters, record duration, recalibrate stats
```

Four hooks, zero dependencies, local JSON storage. Every task completion feeds back into the model — the more you use it, the more accurate it gets.

### Data storage

```
~/.claude/plugins/claude-eta/data/
├── my-project.json        # Task history per project
├── another-project.json
└── _active.json           # Current task counters (ephemeral)
```

Everything is local, human-readable JSON. No cloud, no telemetry, no tracking. `cat` the file to see exactly what's stored.

## Task classification

Prompts are automatically classified into 9 categories based on keyword matching:

| Type | Triggers on |
|------|-------------|
| bugfix | fix, bug, broken, crash, failing, error |
| feature | add, create, implement, build, new |
| refactor | refactor, rename, extract, simplify |
| test | test, spec, jest, playwright, e2e |
| debug | debug, investigate, diagnose, why |
| config | config, setup, install, docker, env |
| docs | doc, readme, changelog, documentation |
| review | review, PR, audit, inspect |
| other | everything else |

Classification drives per-type velocity stats and volatility regimes. A "bugfix" median of 6 minutes means something different than a "feature" median of 18 minutes.

## Roadmap

### Now (v0.1) — Tracking + Calibration
- [x] Automatic task duration tracking
- [x] Prompt classification (9 categories)
- [x] Tool call / file / error counting
- [x] `/eta`, `/eta history`, `/eta stats` commands
- [x] Pre-emptive context injection (calibrate Claude)
- [x] Passive velocity context at session start

### Next (v0.2) — Prediction Engine
- [ ] Composite triage score (APACHE-style prompt complexity scoring)
- [ ] Confidence intervals ("8-18 min, 80%") instead of point estimates
- [ ] Enriched Layer 0 recalibration (volatility by type, median, IQR)

### Later (v0.3) — Live Refinement
- [ ] Phase detection (explore → edit → test) from tool call patterns
- [ ] Early warning when task drifts beyond expected range
- [ ] Live ETA recalculation during execution
- [ ] Speedrun-style split comparison (PB vs current)

### Future (v1.0) — Community Intelligence
- [ ] Opt-in anonymized velocity sharing (inspectable, dry-run before send)
- [ ] Cross-project baselines by (task_type, tech_stack, project_size, model)
- [ ] Task similarity matching (nearest-neighbor, not just category averages)

## Development

```bash
git clone https://github.com/mmmprod/claude-eta
cd claude-eta
npm install
npm run build
npm test          # 33 tests
npm run format    # Prettier
npm run lint      # TypeScript strict check
```

### Project structure

```
src/
├── types.ts             # Type definitions (TaskEntry, ActiveTask, hook stdin)
├── store.ts             # JSON persistence + active task tracking
├── classify.ts          # Prompt classification heuristic (9 categories)
├── stats.ts             # Velocity stats (median, IQR, volatility)
├── stdin.ts             # Shared stdin reader for hooks
├── cli/
│   └── eta.ts           # /eta command CLI (session, history, stats)
└── hooks/
    ├── on-session-start.ts  # SessionStart → passive velocity context
    ├── on-prompt.ts         # UserPromptSubmit → classify + inject stats
    ├── on-tool-use.ts       # PostToolUse → increment counters
    └── on-stop.ts           # Stop → flush counters + recalibrate
```

## License

MIT
