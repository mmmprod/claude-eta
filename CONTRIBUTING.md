# Contributing to claude-eta

## Setup

```bash
git clone https://github.com/mmmprod/claude-eta.git
cd claude-eta
npm install
npm run build
claude plugin marketplace add ./
claude plugin install claude-eta --scope local
```

## Development workflow

1. Make changes in `src/`
2. `npm run build` (TypeScript → `dist/`)
3. `npm run test:unit`
4. `npm run test:integration`

After code changes, rebuild and restart Claude Code for hooks to pick up changes.

## Testing

```bash
npm run test:unit         # Unit tests only
npm run test:integration  # Local integration tests (spawn hooks/CLI, may touch legacy v1 data path)
npm test                  # Unit + local integration
npm run test:remote       # Live Supabase contract test
```

Unit tests avoid spawned hook/CLI processes and do not require `.git`.

Integration tests (`plugin-package.test.js`, `stop-hook.test.js`, `prompt-hook.test.js`, etc.) spawn real processes and exercise filesystem behavior.
The remote test hits the public Supabase backend and is intentionally separated from the default contributor loop.

## Test conventions

- Tests are plain JS using `node:test` + `assert/strict`
- Tests import from `dist/` (build first!)
- One test file per module: `tests/{module-name}.test.js`
- Test names: `describe("moduleName") > it("does specific thing")`

## Code conventions

- No `existsSync` — always try/catch
- PostToolUse is hot path — no heavy I/O, no stats computation
- New fields on `ActiveTurnState` or `CompletedTurn` must have defaults in normalization
- Pure functions go in dedicated modules (no I/O). Hooks orchestrate.

## Where to start

- Loop detector improvements: `src/loop-detector.ts`
- Classifier improvements: `src/classify.ts`
- New insights: `src/insights/`
- Bug fixes: check issues tagged `good first issue`

## Pull requests

- `npm run build && npm run test:unit` must pass
- `npm run lint` must pass (`tsc --noEmit` strict)
- Update tests for changed behavior
- Commit `dist/` (required for plugin distribution)
