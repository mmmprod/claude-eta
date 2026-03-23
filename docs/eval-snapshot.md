# Eval Snapshot — v1.3.5

Generated with `/eta eval` on the claude-eta project itself.

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

## How to reproduce

```bash
cd claude-eta
npm run build
node dist/cli/eta.js eval $(pwd)
```

Note: results depend on the local completed task history in
`${CLAUDE_PLUGIN_DATA}/projects/`. These numbers come from the
author's development history on this repository.
