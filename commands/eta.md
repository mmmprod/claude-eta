---
description: Show task duration stats — current session, history, or project averages
argument-hint: [session|history|stats|inspect|compare|community|export|contribute|eval|auto|insights|recap|admin-export|help]
allowed-tools: [Bash]
disable-model-invocation: true
---

# /eta — Task Duration Tracker

Run the eta CLI script and show its output to the user verbatim:

```bash
FORCE_COLOR=1 node "${CLAUDE_PLUGIN_ROOT}/dist/cli/eta.js" $ARGUMENTS "$(pwd)"
```

Available commands:
- `/eta` — Current session stats
- `/eta history` — Last 20 tasks with durations
- `/eta stats` — Averages by task type
- `/eta inspect` — What data is stored
- `/eta compare` — Your stats vs community baselines (fetches from network)
- `/eta community` — Community sharing status and consent flow
- `/eta export` — Anonymize & save to local JSON
- `/eta contribute` — Preview what would be shared (add `--confirm` to upload)
- `/eta eval` — Walk-forward ETA calibration report
- `/eta auto` — Auto-ETA status (accuracy per type)
- `/eta auto on` — Enable Auto-ETA
- `/eta auto off` — Disable Auto-ETA
- `/eta insights` — Deep pattern analysis
- `/eta recap` — Today's activity summary
- `/eta admin-export` — Full admin dashboard JSON (7 sections, all projects)
- `/eta help` — List all commands

If the script fails, explain that claude-eta might need to be rebuilt (`npm run build` in the plugin directory).
