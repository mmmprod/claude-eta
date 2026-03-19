<p align="center">
  <img src="https://github.com/user-attachments/assets/5f973f0a-f720-40c9-8046-f55371ededf9" alt="claude-eta" width="720" />
</p>

<p align="center">
  <a href="https://github.com/mmmprod/claude-eta/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Node >= 18" /></a>
  <a href="https://claude.com"><img src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code Plugin" /></a>
  <img src="https://img.shields.io/badge/data-100%25_local-222?style=flat-square&logo=shield&logoColor=white" alt="100% Local" />
  <a href="https://github.com/mmmprod/claude-eta/stargazers"><img src="https://img.shields.io/github/stars/mmmprod/claude-eta?style=flat-square&color=yellow" alt="Stars" /></a>
</p>

<h3 align="center">Claude guesses. claude-eta measures.</h3>

<p align="center">
  Tracks real task durations. Learns your velocity. Feeds real data<br/>
  back into Claude so it stops hallucinating time estimates.
</p>

---

Claude says *"this should take about 2 days."* You finish in 12 minutes. Every time.

claude-eta fixes this by building a feedback loop that doesn't exist: it times every task, counts every tool call, and feeds that data back to Claude before it responds.

> **Early stage.** The core works. The algorithm gets smarter with more data. Every install helps.

## Install

```bash
claude plugin marketplace add mmmprod/claude-eta
claude plugin install claude-eta
```

No account. No API key. No config. Just start working.

## How it works

1. You type a prompt
2. claude-eta classifies it, starts a timer, injects your velocity stats
3. Claude works. Tool calls are counted silently.
4. Task completes. Duration recorded. Next estimate improves.

After ~5 tasks, Claude gets your real numbers instead of guessing. When it still says something absurd, the bullshit detector catches it and corrects inline.

## Commands

| Command | Description |
|---|---|
| `/eta` | Session stats |
| `/eta history` | Last 20 tasks with real durations |
| `/eta stats` | Averages by task type |
| `/eta compare` | You vs community baselines |
| `/eta contribute` | Preview anonymized data to share |
| `/eta contribute --confirm` | Upload (opt-in) |
| `/eta export` | Save anonymized data locally |
| `/eta inspect` | See exactly what's stored |
| `/eta help` | All commands |

## Help the algorithm

The estimation engine improves with data. Three ways to help:

1. **Use it.** Every task makes your local estimates better.
2. **`/eta contribute --confirm`** shares anonymized per-task records: task type, duration, tool/file counts, model name, hashed project/contributor IDs. No code, no prompts, no file paths.
3. **Open an issue** when an estimate is way off.

## Privacy

**100% local by default.** No cloud, no telemetry, no tracking.

```
~/.claude/plugins/claude-eta/data/my-project.json
```

`/eta inspect` to see everything. `/eta export` to review before sharing.

Community features (`compare`, `contribute`) are opt-in. [Details below.](#community-baselines)

## Roadmap

| Layer | Status | What |
|---|---|---|
| 0 — Feedback Loop | Shipped | Task timing, classification, per-session recalibration |
| 1 — Static Estimation | Shipped | Confidence intervals, complexity scoring, default baselines |
| 2 — Live Refinement | Next | Mid-task ETA updates, phase detection, drift warnings |
| 3 — Collective Intelligence | Shipped | Opt-in community baselines via `/eta contribute` |
| BS Detector | Shipped | Catches absurd time claims, corrects inline |

## Community baselines

`/eta compare` fetches anonymous community averages (read-only).

`/eta contribute` previews what would be sent. Nothing leaves your machine until you run `/eta contribute --confirm`.

**Sent:** task type, duration, tool/file counts, normalized model name, project hash, contributor hash, plugin version, error count. Run `/eta export` to see the exact payload.

**Never sent:** prompts, file paths, project names, code.

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: claude` | [Install Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) |
| `/eta` shows nothing | Normal on first use. Complete a few tasks first. |
| Plugin not in `claude plugin list` | `claude plugin marketplace update claude-eta && claude plugin update claude-eta@claude-eta` |
| Need latest version | Same command as above, then restart Claude Code |

## Contributing

```bash
git clone https://github.com/mmmprod/claude-eta && cd claude-eta
npm install && npm run build && npm test
```

**Code:** better heuristics, new hooks, edge cases. PRs with tests preferred.

**Data:** `/eta contribute --confirm` after a few sessions. More data = better baselines for everyone.

The [Roadmap](#roadmap) shows what's next. Layer 2 is the frontier.

## License

MIT

---

<p align="center">
  <sub>Built by <a href="https://github.com/mmmprod">@mmmprod</a> &middot; Claude guesses. We measure.</sub>
</p>
