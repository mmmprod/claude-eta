# claude-eta

> Claude says "this will take about 2 days."
> Your history says 12 minutes.
> **claude-eta fixes that.**

A Claude Code plugin that silently tracks your real task durations, then uses that data to make Claude honest about time.

## Prerequisites

Before installing claude-eta, you need two things:

### 1. Node.js (v18 or later)

Check if you already have it:

```
node --version
```

If it prints something like `v18.x.x`, `v20.x.x`, or `v22.x.x`, you're good. Skip to step 2.

If not, install Node.js:

- **Mac** — Open Terminal and run: `brew install node` (requires [Homebrew](https://brew.sh)). Or download the installer from [nodejs.org](https://nodejs.org)
- **Windows** — Download the installer from [nodejs.org](https://nodejs.org) (choose the LTS version, click Next through everything)
- **Linux** — `sudo apt install nodejs npm` (Ubuntu/Debian) or `sudo dnf install nodejs` (Fedora)

### 2. Claude Code

Check if you already have it:

```
claude --version
```

If it prints a version number, you're good. Skip to "Install claude-eta".

If not, install Claude Code:

```
npm install -g @anthropic-ai/claude-code
```

Then run `claude` once to complete the initial setup (login, etc.).

Full guide: [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code/overview)

## Install claude-eta

Open your terminal and run:

```
claude plugin add claude-eta
```

That's it. One command. No account, no API key, no config file.

### Verify it worked

```
claude plugin list
```

You should see `claude-eta` in the list. If you do, the install is complete.

### Start using it

Launch Claude Code normally:

```
claude
```

claude-eta activates automatically. Send a few prompts, and it starts learning your pace. After ~5 tasks, Claude begins receiving your actual velocity data instead of guessing.

## What happens after install

**Nothing visible.** That's the point.

claude-eta hooks into Claude Code's lifecycle and works silently:

- Every prompt you send starts a timer
- Every tool call is counted (reads, edits, errors)
- Every task completion records the real duration
- After ~5 tasks, Claude starts receiving your actual velocity data

When you eventually ask "how long will this take?", Claude answers with your real numbers — not a hallucination.

And if Claude still says something absurd like "this will take 2 days" for a 10-minute bugfix? claude-eta catches it, blocks the response, and injects a correction. Claude fixes itself. You never see the intervention.

## Commands

**`/eta`** — What happened this session

```
Session Stats (4 tasks completed)

Tasks completed      4
Total time           18m 32s
Avg per task         4m 38s
Tool calls           47
Errors               1
```

**`/eta history`** — Your recent tasks

```
Date          Duration  Type      Prompt
19 Mar 18:38  4m 12s    bugfix    fix the login bug in auth module
19 Mar 18:15  22m 8s    feature   implement pagination for the API
19 Mar 17:50  1m 42s    config    update eslint config
```

**`/eta stats`** — Your averages by task type

```
Type       Count  Avg Duration
feature       12  18m
bugfix        15  6m
refactor       8  12m
config         6  3m
```

## How it works

```
You type a prompt
    |
    v
claude-eta classifies it (bugfix? feature? refactor?)
scores its complexity, looks up your history,
and whispers to Claude: "bugfix tasks on this project
take 3-12 min. This one looks like a 5-8 min job."
    |
    v
Claude works. claude-eta counts every tool call.
    |
    v
Claude finishes. claude-eta records the real duration.
Next time, the estimate is more accurate.
```

Every task makes the next estimate better. It's a feedback loop.

## Privacy

Everything stays on your machine. No cloud. No telemetry. No tracking.

```
~/.claude/plugins/claude-eta/data/
  my-project.json          <- human-readable JSON, that's it
```

Run `cat` on the file if you want to see exactly what's stored. There is nothing else.

## Uninstall

```
claude plugin remove claude-eta
```

This removes the plugin. Your tracking data stays in `~/.claude/plugins/claude-eta/data/` in case you reinstall later. To delete it too:

```
rm -rf ~/.claude/plugins/claude-eta/data/
```

## Troubleshooting

**"command not found: claude"**
Claude Code isn't installed. See the [Prerequisites](#prerequisites) section above.

**"command not found: node"**
Node.js isn't installed. See the [Prerequisites](#prerequisites) section above.

**Plugin doesn't appear in `claude plugin list`**
Try reinstalling: `claude plugin remove claude-eta && claude plugin add claude-eta`

**`/eta` shows nothing**
Normal on first use. Complete a few tasks first — claude-eta needs data before it can show stats.

**Estimates seem off**
They improve with more data. After 10-15 tasks, estimates become quite accurate. Each project has its own history.

## Update

```
claude plugin remove claude-eta && claude plugin add claude-eta
```

## Contributing

```bash
git clone https://github.com/mmmprod/claude-eta
cd claude-eta
npm install
npm run build
npm test
```

## License

MIT
