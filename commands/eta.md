---
description: Show task duration stats — current session, history, or project averages
argument-hint: [session|history|stats|inspect|compare|export|contribute|help]
allowed-tools: [Bash]
---

# /eta — Task Duration Tracker

Run the eta CLI script and show its output to the user verbatim:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/eta.js $ARGUMENTS $(pwd)
```

Available commands:
- `/eta` — Current session stats
- `/eta history` — Last 20 tasks with durations
- `/eta stats` — Averages by task type
- `/eta inspect` — What data is stored
- `/eta compare` — Your stats vs community baselines (fetches from network)
- `/eta export` — Anonymize & save to local JSON
- `/eta contribute` — Preview what would be shared (add `--confirm` to upload)
- `/eta help` — List all commands

If the script fails, explain that claude-eta might need to be rebuilt (`npm run build` in the plugin directory).
