---
description: Show task duration stats — current session, history, or project averages
argument-hint: [session|history|stats|inspect|compare|export|contribute|auto|insights|recap|admin-export|help]
allowed-tools: [Bash]
disable-model-invocation: true
---

# /claude-eta:eta — Task Duration Tracker

Run the eta CLI script and show its output to the user verbatim:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/cli/eta.js" $ARGUMENTS "$(pwd)"
```

Available commands:
- `/claude-eta:eta` — Current session stats
- `/claude-eta:eta history` — Last 20 tasks with durations
- `/claude-eta:eta stats` — Averages by task type
- `/claude-eta:eta inspect` — What data is stored
- `/claude-eta:eta compare` — Your stats vs community baselines (fetches from network)
- `/claude-eta:eta export` — Anonymize & save to local JSON
- `/claude-eta:eta contribute` — Preview what would be shared (add `--confirm` to upload)
- `/claude-eta:eta auto` — Auto-ETA status (accuracy per type)
- `/claude-eta:eta auto on` — Enable Auto-ETA
- `/claude-eta:eta auto off` — Disable Auto-ETA
- `/claude-eta:eta insights` — Deep pattern analysis
- `/claude-eta:eta recap` — Today's activity summary
- `/claude-eta:eta admin-export` — Full admin dashboard JSON (6 sections, all projects)
- `/claude-eta:eta help` — List all commands

If the script fails, explain that claude-eta might need to be rebuilt (`npm run build` in the plugin directory).
