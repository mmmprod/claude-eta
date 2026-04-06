---
description: Show task duration stats — current session, history, or project averages
argument-hint: [session|history|stats|inspect|compare|community|export|contribute|eval|auto|insights|recap|admin-export|help]
allowed-tools: Bash
disable-model-invocation: true
---

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli/eta.js" $ARGUMENTS "$(pwd)"`

The block above is the live output of the claude-eta CLI. Display it to the user exactly as printed — do not interpret, summarize, paraphrase, or add any commentary. Output the text and stop.
