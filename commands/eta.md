---
description: Show task duration stats — current session, history, or project averages
argument-hint: [history|stats]
allowed-tools: [Read, Bash]
---

# /eta — Task Duration Tracker

Show task timing information from claude-eta.

## Arguments

$ARGUMENTS

## Behavior

- **No argument**: Show current session stats (tasks completed, total time, avg per task)
- **`history`**: Show last 20 tasks with actual durations
- **`stats`**: Show averages by task type for this project

## Instructions

1. Read the claude-eta data file at `~/.claude/plugins/claude-eta/data/{project-slug}.json`
2. If `$ARGUMENTS` is empty, summarize the current session
3. If `$ARGUMENTS` is "history", show the last 20 entries as a table
4. If `$ARGUMENTS` is "stats", group by classification and show averages
5. Format durations as human-readable (e.g., "3m 42s", "12m 8s")
6. If no data exists yet, say "No tasks tracked yet. claude-eta is recording — data will appear after your first completed task."
