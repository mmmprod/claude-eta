---
description: Show task duration stats — current session, history, or project averages
argument-hint: [history|stats]
allowed-tools: [Bash]
---

# /eta — Task Duration Tracker

Run the eta CLI script and show its output to the user verbatim:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/cli/eta.js $ARGUMENTS $(pwd)
```

If the script fails, explain that claude-eta might need to be rebuilt (`npm run build` in the plugin directory).
