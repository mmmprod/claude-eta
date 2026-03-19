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
  A Claude Code plugin that tracks real task durations, learns your velocity,<br/>
  and injects that data back into Claude so it stops hallucinating time estimates.
</p>

---

## The problem

Claude says *"this should take about 2 days."*
You finish in 12 minutes.

Every. Single. Time.

LLMs have zero feedback loop between what they promise and what actually happens. They estimate based on perceived complexity of text, not empirical data. **claude-eta creates the data that doesn't exist.**

## Install

Works the same on **macOS, Windows, and Linux**. One prerequisite: [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) (which requires [Node.js >= 18](https://nodejs.org)).

```bash
# 1. If you don't have Claude Code yet
npm install -g @anthropic-ai/claude-code

# 2. Add the plugin source
claude plugin marketplace add mmmprod/claude-eta

# 3. Install claude-eta
claude plugin install claude-eta

# 4. Verify
claude plugin list
# You should see: claude-eta  ✔ enabled
```

That's it. No account, no API key, no config file. Launch `claude` and start working. claude-eta activates automatically and begins learning your pace after the first few tasks.

## What happens next

Nothing visible. That's the design.

claude-eta hooks into Claude Code's lifecycle and works in the background. Every prompt starts a timer. Every tool call is counted. Every completed task records the real duration. After a few tasks, Claude starts receiving your actual velocity data as context before it responds.

When you ask *"how long will this take?"*, Claude answers with your real numbers. Not a guess.

And when Claude still says something absurd? claude-eta catches it, corrects it inline, and Claude fixes itself. You never see the intervention.

## Commands

| Command | What it does |
|---|---|
| `/eta` | Current session stats: tasks completed, total time, tool calls |
| `/eta history` | Recent tasks with real durations, types, and prompts |
| `/eta stats` | Your averages by task type across all sessions |
| `/eta inspect` | Show exactly what data is stored (transparency first) |

## How it works

```
                    ┌─────────────────────────────┐
                    │       You type a prompt      │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    claude-eta intercepts     │
                    │                              │
                    │  · classifies the task       │
                    │  · scores prompt complexity   │
                    │  · looks up your history      │
                    │  · injects velocity context   │
                    │    into Claude's prompt       │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      Claude works.           │
                    │  claude-eta counts every      │
                    │  tool call silently.          │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    Task complete.             │
                    │  Real duration recorded.      │
                    │  Model recalibrated.          │
                    │                              │
                    │  Next estimate = more         │
                    │  accurate. Every task makes   │
                    │  the next one better.         │
                    └─────────────────────────────┘
```

The key insight: claude-eta doesn't just correct Claude after the fact. It **calibrates Claude before it responds** by injecting real project statistics (medians, confidence intervals, volatility per task type) as context. Claude integrates these naturally. The hallucinated estimates simply stop.

## Architecture

claude-eta is designed in layers, shipped incrementally:

**Layer 0 / Feedback Loop** *(shipped)* — Every completed task recalibrates the model. Medians, interquartile ranges, and volatility per task type are recomputed on every session close. This is the foundation everything else builds on.

**Layer 1 / Static Estimation** *(shipped)* — At session start, you get passive velocity context for the project. At each prompt, a composite triage score (prompt complexity + historical lookup) produces a confidence interval, not a point estimate. Claude receives this as `additionalContext` and self-calibrates.

**Layer 2 / Live Refinement** *(next)* — After the first 10 tool calls, real-time velocity data triggers ETA recalculation. Phase detection (explore → edit → test) splits the task like a speedrun timer. Early warning fires when drift exceeds 2x the median.

**Layer 3 / Collective Intelligence** *(future)* — Opt-in anonymized velocity dataset across users. Your local history bootstraps the model; the community makes initial estimates accurate for everyone. Think Waze, but for dev tasks.

**Bullshit Detector** *(transversal)* — Scans Claude's output for temporal patterns ("should take about 2 days") and injects corrections when the claim conflicts with historical data. Annotation, not interruption.

## Privacy

**Everything stays on your machine.** No cloud. No telemetry. No tracking. No analytics.

```
~/.claude/plugins/claude-eta/data/
  └── my-project.json       ← human-readable JSON. That's all there is.
```

Run `/eta inspect` or `cat` the file directly. What you see is what exists. There is nothing else.

Layer 3 (community data) will be strictly opt-in with `--dry-run` to preview exactly what would be shared before anything leaves your machine.

## Requirements

| Dependency | Version |
|---|---|
| Node.js | >= 18 |
| Claude Code | >= 2.0.12 |

## Uninstall

```
claude plugin remove claude-eta
```

Your data stays in `~/.claude/plugins/claude-eta/data/` in case you come back. To remove everything:

```
rm -rf ~/.claude/plugins/claude-eta/data/
```

## Troubleshooting

**"command not found: claude"**
Claude Code isn't installed. See the [Install](#install) section above.

**"command not found: node"**
Node.js isn't installed. Get it at [nodejs.org](https://nodejs.org).

**"error: unknown command" or install fails**
Make sure you ran `claude plugin marketplace add mmmprod/claude-eta` first. The marketplace command must come before the install.

**Plugin doesn't appear in `claude plugin list`**
Try reinstalling: `claude plugin uninstall claude-eta && claude plugin install claude-eta`

**`/eta` shows nothing**
Normal on first use. Complete a few tasks first — claude-eta needs data before it can show stats.

## Update

```
claude plugin update claude-eta
```

## Contributing

claude-eta is built by one person, but the roadmap is ambitious. If you care about making LLM time estimates not suck, there's room to contribute.

```bash
git clone https://github.com/mmmprod/claude-eta
cd claude-eta
npm install
npm run build
npm test
```

**Where to start:**

The [Architecture](#architecture) section maps the layers. Layer 2 (live refinement) and the Bullshit Detector are the next frontiers. Open an issue if something interests you, or just send a PR. Code quality matters more than volume.

**What makes a good contribution:**

Real data that challenges assumptions. A better heuristic for the triage score. A hook you didn't think we needed. A use case we missed. If your PR includes a test, you're already ahead.

## License

MIT

---

<p align="center">
  <sub>Built by <a href="https://github.com/mmmprod">@mmmprod</a></sub><br/>
  <sub>Claude guesses. We measure.</sub>
</p>
