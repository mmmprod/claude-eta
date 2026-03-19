# claude-eta

> Claude says "this will take about 2 days."
> Your history says 12 minutes.
> **claude-eta fixes that.**

A Claude Code plugin that silently tracks your real task durations, then uses that data to make Claude honest about time.

## Install

```bash
claude plugin add claude-eta
```

That's it. No config. It starts working immediately.

## What happens after install

**Nothing visible.** That's the point.

claude-eta hooks into Claude Code's lifecycle and works silently:

- Every prompt you send starts a timer
- Every tool call is counted (reads, edits, errors)
- Every task completion records the real duration
- After 5 tasks, Claude starts receiving your actual velocity data

When you eventually ask "how long will this take?", Claude answers with your real numbers — not a hallucination.

And if Claude still says something absurd like "this will take 2 days" for a 10-minute bugfix? claude-eta catches it, blocks the response, and injects a correction. Claude fixes itself. You never see the intervention.

## Three commands. That's all.

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

## How it actually works

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

Everything stays on your machine.

```
~/.claude/plugins/claude-eta/data/
  my-project.json          <- human-readable JSON, that's it
```

No cloud. No telemetry. No tracking. Run `cat` on the file if you want to see exactly what's stored.

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
