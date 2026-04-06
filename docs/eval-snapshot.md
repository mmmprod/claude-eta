# Eval Snapshot — v1.3.13

Generated with `/eta eval` on the claude-eta repository.

## Summary

- Work items: 285

- p80 coverage at prompt: 76.8%

- MdAPE at prompt: 79.0%

## Full report

| Stage | MdAPE | p80 coverage |
|-------|-------|--------------|
| At prompt | 79.0% | 76.8% |
| After first edit | 82.3% | 66.0% |
| After first bash | 87.0% | 72.5% |

## Reproduce

Run from the `claude-eta` repository root.

```bash
npm run build
node dist/cli/eta.js eval "$(pwd)"
```

Results depend on local per-project completed task history under the data directory resolved by `src/paths.ts`:
`${CLAUDE_PLUGIN_DATA}/projects/` when `CLAUDE_PLUGIN_DATA` is set, otherwise the auto-detected runtime path under `~/.claude/plugins/data/claude-eta*/projects/`, with `~/.claude/plugins/claude-eta/projects/` as the local-dev fallback.

These numbers come from the author's development history on this repository.
