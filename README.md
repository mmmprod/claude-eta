# claude-eta

<p align="center">
  <a href="https://github.com/mmmprod/claude-eta/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 18" /></a>
  <a href="https://claude.com"><img src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code Plugin" /></a>
  <img src="https://img.shields.io/badge/data-100%25_local-222?style=flat-square&logo=shield&logoColor=white" alt="100% local by default" />
  <a href="https://github.com/mmmprod/claude-eta/stargazers"><img src="https://img.shields.io/github/stars/mmmprod/claude-eta?style=flat-square&color=yellow" alt="GitHub stars" /></a>
</p>

<p align="center">
  <img src="docs/loop-detector-demo.gif" alt="claude-eta loop detector demo" width="979" />
</p>

## Claude gets stuck. claude-eta gets it unstuck.

When Claude Code hits the same error 3 times in a row, claude-eta detects the loop
and injects a correction before you even notice.

No config. No GUI. It works in the background.

### What it catches

**Repair loops**: Claude tries the same failing approach repeatedly.

claude-eta fingerprints each error. When the same error appears 3+ times:

- At 3x: injects a warning at the next prompt
- At 5x: blocks the response and forces a strategy change

**Hallucinated time estimates**: Claude says "this will take 2 days" for a 10-minute task.

claude-eta compares against your real project history and corrects inline.

### What it tracks silently

Every task gets a timer. Every tool call is counted. After a few tasks, claude-eta knows
your real velocity per task type and calibrates Claude's responses with that data.

## Install

Tested with the current Claude Code CLI. The working install flow is:

```bash
claude plugin marketplace add mmmprod/claude-eta
claude plugin install claude-eta
```

Fallback from a local checkout:

```bash
git clone https://github.com/mmmprod/claude-eta.git
cd claude-eta
claude plugin marketplace add ./
claude plugin install claude-eta --scope local
```

Current Claude Code uses `claude plugin install`, not `claude plugin add`.

## Quick proof

After 5+ completed tasks, run:

- `/eta` for session stats
- `/eta stats` for your averages by task type
- `/eta insights` for 9 analyses on your task history
- `/eta eval` for the offline walk-forward accuracy report

## How the loop detector works

```text
TDD (normal):     edit -> test fail A -> fix -> test fail B -> fix -> pass

Repair loop:      edit -> test fail A -> edit -> test fail A -> edit -> test fail A
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        claude-eta detects this pattern
```

The key difference: in a loop, the same error keeps returning. claude-eta fingerprints
error content, normalizing away paths, numbers, and quoted values so structurally identical
failures match.

## Why not just `--max-turns`?

| | `--max-turns` | claude-eta |
|---|---|---|
| Detection | Counts turns blindly | Fingerprints error content |
| Trigger | After N turns (any turns) | After 3x same error |
| Response | Kills the session | Injects correction context |
| False positives | Cuts long legitimate sessions | Only fires on repeated identical errors |
| Learning | None | Learns your project's patterns over time |

`--max-turns 20` stops Claude after 20 turns whether it's stuck or productive.

claude-eta only intervenes when the same error repeats, and instead of killing
the session, it tells Claude what's going wrong and asks it to change strategy.

They're complementary: use `--max-turns` as a hard ceiling, use claude-eta
for intelligent early intervention.

## Privacy

Everything is local by default. No cloud. No telemetry. No upload unless you explicitly opt in.

`/eta inspect` shows the current stored view.

`/eta contribute` is manual and opt-in only. It previews exactly what would be sent before upload.

See [SECURITY.md](SECURITY.md) for the full storage and community-data details.

## Advanced

<details>
<summary>Auto-ETA (opt-in estimated duration at response start)</summary>

`/eta auto on` enables automatic ETA injection when claude-eta has enough local calibration for the task type.

`/eta auto` shows whether the feature is active and how accurate its recent interval coverage has been.

</details>

<details>
<summary>Community baselines</summary>

`/eta compare` is read-only and fetches aggregate community baselines.

`/eta contribute` stays blocked until you explicitly run `/eta community on`.

Only anonymized per-task aggregates are sent. Prompts, code, file paths, event logs, and project names are not uploaded.

</details>

<details>
<summary>Self-hosting community baselines</summary>

To point `/eta compare` and `/eta contribute` at your own Supabase project, set:

- `CLAUDE_ETA_SUPABASE_URL`
- `CLAUDE_ETA_SUPABASE_KEY`

The shipped anon key is intentionally public and restricted to `INSERT velocity_records`
and `SELECT baselines_cache`.

</details>

<details>
<summary>Insights (9 analyses)</summary>

`/eta insights` surfaces deeper patterns once enough task history exists:

- task type breakdowns
- tool and file-operation correlations
- timing patterns
- model and workflow trends

</details>

<details>
<summary>All commands</summary>

`/eta`, `/eta history`, `/eta stats`, `/eta inspect`, `/eta insights`, `/eta eval`, `/eta compare`, `/eta export`, `/eta contribute`, `/eta community`, `/eta auto`, `/eta recap`, `/eta help`

</details>

## Performance

claude-eta hooks run on every Claude Code lifecycle event. Measured overhead:

| Hook | Avg latency | Frequency |
|------|-------------|-----------|
| PostToolUse | ~37ms | Every tool call |
| PostToolUseFailure | ~37ms | Every tool failure |
| UserPromptSubmit | ~42ms | Every prompt |
| Stop | ~42ms | End of response |

Benchmarked on Linux 6.6 WSL2 x86_64, 12th Gen Intel(R) Core(TM) i7-12700F, Node v20.20.0. Run `./scripts/bench-hooks.sh` to measure on yours.

PostToolUse is the hot path. It reads and writes a single small JSON file (~1KB).
No historical data is loaded. No stats are computed.

## Eval results

### How accurate is it?

Tested on 163 real completed work items from a single developer on this repository.

| Stage | MdAPE | p80 coverage |
|-------|-------|--------------|
| At prompt | 81.6% | 79.1% |
| After first edit | 100.0% | 58.8% |
| After first bash | 86.8% | 64.7% |

Loop detector: 0 reconstructed loops across 9 persisted Bash-failure histories on this project, 0 potential false positives.

These numbers come from one user on one project. They will vary across repos and improve with more local history.

Run `/eta eval` on your own data.

## License

MIT
