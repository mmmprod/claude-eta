# Eval Snapshot — v1.3.6

Generated with `/eta eval` on the claude-eta repository.

## Summary

- Work items: 217

- p80 coverage at prompt: 77.9%

- MdAPE at prompt: 79.6%

## Full report

| Stage | MdAPE | p80 coverage |
|-------|-------|--------------|
| At prompt | 79.6% | 77.9% |
| After first edit | 95.0% | 67.6% |
| After first bash | 80.4% | 74.4% |

## Reproduce

```bash
npm run build
node dist/cli/eta.js eval $(pwd)
```

Results depend on local completed task history under `${CLAUDE_PLUGIN_DATA}`.

These numbers come from the author's development history on this repository.
