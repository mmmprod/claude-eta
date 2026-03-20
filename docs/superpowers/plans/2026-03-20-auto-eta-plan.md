# Auto-ETA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in Auto-ETA feature that injects time estimates at the start of Claude's response, based on historical project data.

**Architecture:** New pure module `auto-eta.ts` (mirrors `detector.ts` pattern) handles decision logic. Hook `on-prompt.ts` orchestrates I/O. Self-check in `on-stop.ts` tracks accuracy per classification. Preferences in `_preferences.json`, predictions in ephemeral `_last_eta.json`.

**Tech Stack:** TypeScript, node:test, zero new dependencies. Build: `npm run build`. Test: `npm test`. Lint: `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-03-20-auto-eta-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Add `UserPreferences`, `LastEtaPrediction` interfaces. Add `eta_accuracy` to `ProjectData`. |
| `src/store.ts` | Add `loadPreferences`, `savePreferences`, `setLastEta`, `consumeLastEta`. Normalize `eta_accuracy` in `loadProject`. |
| `src/auto-eta.ts` | **NEW.** Pure decision module: `checkDisableRequest`, `evaluateAutoEta`, constants. Zero I/O. |
| `src/detector.ts` | Add line-based pre-filter in `extractDurations` to skip plugin-injected lines. |
| `src/hooks/on-prompt.ts` | Orchestrate auto-eta: load prefs, check disable, evaluate, write ephemeral files. |
| `src/hooks/on-stop.ts` | Self-check accuracy in `main()` after `flushAndRecord()`, guarded by `stop_hook_active`. |
| `src/cli/eta.ts` | Add `auto` mode (status/on/off). |
| `commands/eta.md` | Add `auto` to argument-hint. |
| `CLAUDE.md` | Add Auto-ETA to "Key modules" section. |
| `tests/auto-eta.test.js` | **NEW.** 31 tests covering disable, conditions, cooldown, self-check, store, format. |
| `tests/detector.test.js` | Add 2 tests for line filter guard. |
| `tests/store.test.js` | Add 1 test for `eta_accuracy` normalization. |

---

## Task 1: Types + Store foundations

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store.ts`
- Modify: `tests/store.test.js`

- [ ] **Step 1: Add types to `src/types.ts`**

Append after the `LastCompleted` type:

```typescript
/** User preferences for Auto-ETA (stored in _preferences.json) */
export interface UserPreferences {
  auto_eta: boolean;
  prompts_since_last_eta: number;
  last_eta_task_id?: string;
}

/** Prediction snapshot for self-check (stored in _last_eta.json) */
export interface LastEtaPrediction {
  low: number;
  high: number;
  classification: string;
  task_id: string;
  timestamp: string;
}
```

Add `eta_accuracy` to `ProjectData`:

```typescript
export interface ProjectData {
  project: string;
  created: string;
  tasks: TaskEntry[];
  file_count?: number;
  loc_bucket?: string;
  eta_accuracy?: Record<string, { hits: number; misses: number }>;
}
```

- [ ] **Step 2: Normalize `eta_accuracy` in `loadProject` (`src/store.ts`)**

After `data.tasks = data.tasks.map(normalizeTask);` (line 46), add:

```typescript
data.eta_accuracy = data.eta_accuracy ?? {};
```

In the catch fallback (line 49), change to:

```typescript
return { project, created: new Date().toISOString(), tasks: [], eta_accuracy: {} };
```

- [ ] **Step 3: Add store functions to `src/store.ts`**

Add imports at top:

```typescript
import type { ProjectData, TaskEntry, ActiveTask, LastCompleted, UserPreferences, LastEtaPrediction } from './types.js';
```

Add after `consumeLastCompleted`:

```typescript
// -- Preferences (_preferences.json) --

function getPreferencesPath(): string {
  return path.join(DATA_DIR, '_preferences.json');
}

export function loadPreferences(): UserPreferences {
  try {
    const content = fs.readFileSync(getPreferencesPath(), 'utf-8');
    const prefs = JSON.parse(content) as Partial<UserPreferences>;
    return {
      auto_eta: prefs.auto_eta ?? false,
      prompts_since_last_eta: prefs.prompts_since_last_eta ?? 0,
      last_eta_task_id: prefs.last_eta_task_id,
    };
  } catch {
    return { auto_eta: false, prompts_since_last_eta: 0 };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  ensureDataDir();
  fs.writeFileSync(getPreferencesPath(), JSON.stringify(prefs, null, 2), 'utf-8');
}

// -- Last ETA prediction (_last_eta.json) --

function getLastEtaPath(): string {
  return path.join(DATA_DIR, '_last_eta.json');
}

export function setLastEta(prediction: LastEtaPrediction): void {
  ensureDataDir();
  fs.writeFileSync(getLastEtaPath(), JSON.stringify(prediction), 'utf-8');
}

/** Read and delete in one shot. No maxAge -- task_id mismatch guards stale files. */
export function consumeLastEta(): LastEtaPrediction | null {
  const p = getLastEtaPath();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as LastEtaPrediction;
    fs.unlinkSync(p);
    return data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write store tests**

Add to `tests/store.test.js` (import `savePreferences`, `loadPreferences`, `setLastEta`, `consumeLastEta` from `../dist/store.js`):

```javascript
describe('preferences', () => {
  it('load/save roundtrip', () => {
    const prefs = { auto_eta: true, prompts_since_last_eta: 3, last_eta_task_id: 'abc' };
    savePreferences(prefs);
    const loaded = loadPreferences();
    assert.deepEqual(loaded, prefs);
  });

  it('returns defaults when file missing', () => {
    const loaded = loadPreferences();
    assert.equal(loaded.auto_eta, false);
    assert.equal(loaded.prompts_since_last_eta, 0);
    assert.equal(loaded.last_eta_task_id, undefined);
  });

  it('consumeLastEta reads and deletes', () => {
    const pred = { low: 10, high: 60, classification: 'bugfix', task_id: 'x', timestamp: new Date().toISOString() };
    setLastEta(pred);
    const result = consumeLastEta();
    assert.deepEqual(result, pred);
    assert.equal(consumeLastEta(), null);
  });
});

describe('loadProject eta_accuracy normalization', () => {
  it('normalizes missing eta_accuracy to empty object', () => {
    const project = 'test-norm-' + Date.now();
    const raw = { project, created: new Date().toISOString(), tasks: [] };
    const fs = require('node:fs');
    const path = require('node:path');
    const os = require('node:os');
    const filePath = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data', project + '.json');
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');
    const loaded = loadProject(project);
    assert.deepEqual(loaded.eta_accuracy, {});
    fs.unlinkSync(filePath);
  });
});
```

- [ ] **Step 5: Build and run tests**

Run: `npm run build && npm test`
Expected: all existing tests pass + 4 new store tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/store.ts tests/store.test.js
git commit -m "feat(auto-eta): add types, store functions, eta_accuracy normalization"
```

---

## Task 2: `auto-eta.ts` decision module

**Files:**
- Create: `src/auto-eta.ts`
- Create: `tests/auto-eta.test.js`

- [ ] **Step 1: Create `src/auto-eta.ts` with constants and `checkDisableRequest`**

```typescript
/**
 * Auto-ETA decision module -- pure functions, zero I/O.
 * Mirrors detector.ts pattern: called by on-prompt.ts hook.
 */
import type { UserPreferences, LastEtaPrediction } from './types.js';
import type { ProjectStats } from './stats.js';
import { estimateTask, scorePromptComplexity, fmtSec } from './stats.js';

export const MIN_TYPE_TASKS = 5;
export const HIGH_VOL_INTERVAL_MULT = 1.5;
export const HIGH_VOL_CONFIDENCE = 60;
export const NORMAL_CONFIDENCE = 80;
export const MAX_INTERVAL_RATIO = 5;
export const COOLDOWN_INTERVAL = 5;
export const ACCURACY_MIN_PREDICTIONS = 10;
export const ACCURACY_MIN_RATE = 0.5;

export const CONVERSATIONAL_PATTERNS =
  /^(merci|thanks|ok|oui|yes|non|no|continue|go|sure|d'accord|parfait|cool|nice|got it|understood|tell me about|what is a |how does .{0,10} work)/i;

export const DISABLE_PATTERNS =
  /^.{0,50}\b(stop|disable|remove|hide|arr\u00eate|d\u00e9sactive|enl\u00e8ve)\b.{0,20}\bauto.?eta\b/i;

const CODING_TERMS = /\b(implement|refactor|code|module|function|file)\b/i;

export type AutoEtaDecision =
  | { action: 'inject'; injection: string; prediction: LastEtaPrediction }
  | { action: 'cooldown' }
  | { action: 'skip' };

export function checkDisableRequest(prompt: string): boolean {
  return DISABLE_PATTERNS.test(prompt) && !CODING_TERMS.test(prompt);
}

export function evaluateAutoEta(params: {
  prefs: UserPreferences;
  stats: ProjectStats;
  etaAccuracy: Record<string, { hits: number; misses: number }>;
  classification: string;
  prompt: string;
  taskId: string;
}): AutoEtaDecision {
  const { prefs, stats, etaAccuracy, classification, prompt, taskId } = params;

  if (!prefs.auto_eta) return { action: 'skip' };
  if (classification === 'other') return { action: 'skip' };

  const clsStats = stats.byClassification.find((s) => s.classification === classification);
  if (!clsStats || clsStats.count < MIN_TYPE_TASKS) return { action: 'skip' };

  if (prompt.length < 20 || CONVERSATIONAL_PATTERNS.test(prompt)) return { action: 'skip' };

  const complexity = scorePromptComplexity(prompt);
  const estimate = estimateTask(stats, classification, complexity);

  const adjusted =
    clsStats.volatility === 'high'
      ? {
          ...estimate,
          low: Math.max(1, Math.round(estimate.low / HIGH_VOL_INTERVAL_MULT)),
          high: Math.round(estimate.high * HIGH_VOL_INTERVAL_MULT),
        }
      : estimate;
  const confidence = clsStats.volatility === 'high' ? HIGH_VOL_CONFIDENCE : NORMAL_CONFIDENCE;

  if (adjusted.high > adjusted.low * MAX_INTERVAL_RATIO) return { action: 'skip' };

  const acc = etaAccuracy[classification];
  if (acc) {
    const total = acc.hits + acc.misses;
    if (total >= ACCURACY_MIN_PREDICTIONS && acc.misses / total > ACCURACY_MIN_RATE) {
      return { action: 'skip' };
    }
  }

  const isNewTask = prefs.last_eta_task_id !== taskId;
  if (!isNewTask && prefs.prompts_since_last_eta < COOLDOWN_INTERVAL) {
    return { action: 'cooldown' };
  }

  const injection =
    `[claude-eta auto-eta] At the very start of your response, display a single ETA line in the SAME LANGUAGE as the user's prompt:\n` +
    `"\u23F1 Estimated: ${fmtSec(adjusted.low)}\u2013${fmtSec(adjusted.high)} (${confidence}%, based on ${clsStats.count} similar ${classification} tasks)"\n` +
    `Adapt the word "Estimated" to the user's language (e.g. "Estim\u00e9" in French, "Gesch\u00e4tzt" in German).\n` +
    `Do not elaborate on it, do not caveat it, do not discuss it unless the user asks.`;

  const prediction: LastEtaPrediction = {
    low: adjusted.low,
    high: adjusted.high,
    classification,
    task_id: taskId,
    timestamp: new Date().toISOString(),
  };

  return { action: 'inject', injection, prediction };
}
```

- [ ] **Step 2: Create `tests/auto-eta.test.js` with all 22 pure-function tests**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDisableRequest, evaluateAutoEta, MIN_TYPE_TASKS, COOLDOWN_INTERVAL } from '../dist/auto-eta.js';
import { fmtSec } from '../dist/stats.js';

// -- Helpers --

function makeStats(cls, count, volatility = 'medium') {
  return {
    totalCompleted: count + 10,
    overall: { median: 30, p25: 15, p75: 60 },
    byClassification: [{ classification: cls, count, median: 30, p25: 15, p75: 60, volatility }],
  };
}

function baseParams(overrides = {}) {
  return {
    prefs: { auto_eta: true, prompts_since_last_eta: 0, last_eta_task_id: 'old-task' },
    stats: makeStats('bugfix', 10),
    etaAccuracy: {},
    classification: 'bugfix',
    prompt: 'fix the authentication bug in login handler',
    taskId: 'new-task',
    ...overrides,
  };
}

// -- checkDisableRequest (tests 1-6) --

describe('checkDisableRequest', () => {
  it('detects "stop auto-eta"', () => {
    assert.equal(checkDisableRequest('stop auto-eta'), true);
  });
  it('detects French disable', () => {
    assert.equal(checkDisableRequest("d\u00e9sactive l'auto eta"), true);
  });
  it('ignores "explain what eta means"', () => {
    assert.equal(checkDisableRequest('explain what eta means'), false);
  });
  it('ignores "what is the eta for this"', () => {
    assert.equal(checkDisableRequest('what is the eta for this'), false);
  });
  it('rejects coding task with auto-eta mention', () => {
    assert.equal(checkDisableRequest('remove the auto-eta module from the codebase'), false);
  });
  it('accepts simple disable request', () => {
    assert.equal(checkDisableRequest('stop auto-eta please'), true);
  });
});

// -- evaluateAutoEta conditions (tests 7-16) --

describe('evaluateAutoEta conditions', () => {
  it('skips when master switch off', () => {
    const r = evaluateAutoEta(baseParams({ prefs: { auto_eta: false, prompts_since_last_eta: 0 } }));
    assert.equal(r.action, 'skip');
  });
  it('skips when < MIN_TYPE_TASKS', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 3) }));
    assert.equal(r.action, 'skip');
  });
  it('does not skip when >= MIN_TYPE_TASKS', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', MIN_TYPE_TASKS) }));
    assert.notEqual(r.action, 'skip');
  });
  it('injects for high volatility (not skip)', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
  });
  it('skips for classification "other"', () => {
    const r = evaluateAutoEta(baseParams({ classification: 'other', stats: makeStats('other', 10) }));
    assert.equal(r.action, 'skip');
  });
  it('skips for short prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'fix it' }));
    assert.equal(r.action, 'skip');
  });
  it('skips for conversational prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'merci beaucoup pour ton aide' }));
    assert.equal(r.action, 'skip');
  });
  it('skips when interval too wide', () => {
    const r = evaluateAutoEta(baseParams({
      stats: { totalCompleted: 20, overall: { median: 30, p25: 1, p75: 100 },
        byClassification: [{ classification: 'bugfix', count: 10, median: 30, p25: 1, p75: 100, volatility: 'high' }] },
    }));
    assert.equal(r.action, 'skip');
  });
  it('skips when type auto-disabled by accuracy', () => {
    const r = evaluateAutoEta(baseParams({ etaAccuracy: { bugfix: { hits: 4, misses: 7 } } }));
    assert.equal(r.action, 'skip');
  });
  it('injects when all conditions pass', () => {
    const r = evaluateAutoEta(baseParams());
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('[claude-eta auto-eta]'));
  });
});

// -- High volatility values (test 17) --

describe('high volatility adjustment', () => {
  it('uses 60% confidence and widens interval', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('60%'));
  });
});

// -- Cooldown (tests 18-21) --

describe('cooldown', () => {
  it('injects on first prompt of new task', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 3, last_eta_task_id: 'old' }, taskId: 'new' }));
    assert.equal(r.action, 'inject');
  });
  it('returns cooldown on 2nd prompt same task', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 1, last_eta_task_id: 'same' }, taskId: 'same' }));
    assert.equal(r.action, 'cooldown');
  });
  it('injects when cooldown reached', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: COOLDOWN_INTERVAL, last_eta_task_id: 'same' }, taskId: 'same' }));
    assert.equal(r.action, 'inject');
  });
  it('resets cooldown when task changes', () => {
    const r = evaluateAutoEta(baseParams({
      prefs: { auto_eta: true, prompts_since_last_eta: 2, last_eta_task_id: 'a' }, taskId: 'b' }));
    assert.equal(r.action, 'inject');
  });
});

// -- Format (test 30) --

describe('injection format', () => {
  it('contains formatted low, high, type, count', () => {
    const stats = makeStats('config', 8, 'low');
    const r = evaluateAutoEta(baseParams({ stats, classification: 'config' }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('config'));
    assert.ok(r.injection.includes('8 similar'));
    assert.ok(r.injection.includes(fmtSec(r.prediction.low)));
    assert.ok(r.injection.includes(fmtSec(r.prediction.high)));
  });
});
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build && npm test`
Expected: 22 new tests pass. All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/auto-eta.ts tests/auto-eta.test.js
git commit -m "feat(auto-eta): add decision module with 22 tests"
```

---

## Task 3: Detector guard

**Files:**
- Modify: `src/detector.ts`
- Modify: `tests/detector.test.js`

- [ ] **Step 1: Write failing tests (tests 32-33)**

Add to `tests/detector.test.js`:

```javascript
it('ignores lines with clock symbol', () => {
  const text = '\u23F1 Estimated: 2m\u201318m (60%, based on 7 similar bugfix tasks)\nThis will take about 3 hours';
  const d = extractDurations(text, { estimatesOnly: true });
  assert.equal(d.length, 1);
  assert.equal(d[0].seconds, 10800);
});

it('ignores lines with [claude-eta prefix', () => {
  const text = '[claude-eta] correction: 5 minutes\nShould take roughly 2 hours';
  const d = extractDurations(text, { estimatesOnly: true });
  assert.equal(d.length, 1);
  assert.equal(d[0].seconds, 7200);
});
```

- [ ] **Step 2: Build and verify tests fail**

Run: `npm run build && npm test`
Expected: 2 new tests FAIL.

- [ ] **Step 3: Add pre-filter to `extractDurations`**

In `src/detector.ts`, at the start of `extractDurations`, before the regex loop:

```typescript
const filteredText = text
  .split('\n')
  .filter((line) => !line.includes('\u23F1') && !line.includes('[claude-eta'))
  .join('\n');
```

Change `DURATION_RE.exec(text)` to `DURATION_RE.exec(filteredText)` and update all `text` references inside the function to `filteredText`.

- [ ] **Step 4: Build and verify tests pass**

Run: `npm run build && npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/detector.ts tests/detector.test.js
git commit -m "feat(auto-eta): detector guard skips plugin-injected lines"
```

---

## Task 4: Hook integration -- `on-prompt.ts`

**Files:**
- Modify: `src/hooks/on-prompt.ts`

- [ ] **Step 1: Add imports**

```typescript
import { loadPreferences, savePreferences, setLastEta } from '../store.js';
import { checkDisableRequest, evaluateAutoEta } from '../auto-eta.js';
```

- [ ] **Step 2: Add auto-eta orchestration**

After the existing stats/cold-start block and before `respond(contextParts.join('\n'))`:

```typescript
  // Auto-ETA evaluation (only when calibrated)
  if (stats) {
    const prefs = loadPreferences();

    if (checkDisableRequest(prompt)) {
      prefs.auto_eta = false;
      savePreferences(prefs);
      contextParts.push('[claude-eta] Auto-ETA disabled. Re-enable anytime with /eta auto on.');
    } else {
      const decision = evaluateAutoEta({
        prefs,
        stats,
        etaAccuracy: data.eta_accuracy ?? {},
        classification: task.classification,
        prompt,
        taskId,
      });

      switch (decision.action) {
        case 'inject':
          contextParts.push(decision.injection);
          setLastEta(decision.prediction);
          prefs.prompts_since_last_eta = 0;
          prefs.last_eta_task_id = taskId;
          savePreferences(prefs);
          break;
        case 'cooldown':
          prefs.prompts_since_last_eta++;
          savePreferences(prefs);
          break;
      }
    }
  }
```

- [ ] **Step 3: Build, lint, test**

Run: `npm run build && npm run lint && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/on-prompt.ts
git commit -m "feat(auto-eta): wire orchestration into on-prompt hook"
```

---

## Task 5: Self-check in `on-stop.ts`

**Files:**
- Modify: `src/hooks/on-stop.ts`
- Modify: `tests/auto-eta.test.js`

- [ ] **Step 1: Write self-check tests (tests 22-26)**

Add to `tests/auto-eta.test.js`:

```javascript
import { loadProject, saveProject, setLastEta, consumeLastEta } from '../dist/store.js';

describe('self-check accuracy', () => {
  it('increments hits when in interval', () => {
    const project = 'test-hit-' + Date.now();
    const data = loadProject(project);
    data.tasks.push({
      task_id: 't1', session_id: 's', project,
      timestamp_start: new Date().toISOString(), timestamp_end: new Date().toISOString(),
      duration_seconds: 30, prompt_summary: 'test', classification: 'bugfix',
      tool_calls: 1, files_read: 0, files_edited: 0, files_created: 0, errors: 0, model: 'test',
    });
    saveProject(data);
    setLastEta({ low: 10, high: 60, classification: 'bugfix', task_id: 't1', timestamp: new Date().toISOString() });
    const eta = consumeLastEta();
    const reloaded = loadProject(project);
    const last = reloaded.tasks[reloaded.tasks.length - 1];
    const hit = last.duration_seconds >= eta.low && last.duration_seconds <= eta.high;
    assert.equal(hit, true);
    reloaded.eta_accuracy[eta.classification] ??= { hits: 0, misses: 0 };
    reloaded.eta_accuracy[eta.classification].hits++;
    saveProject(reloaded);
    assert.equal(loadProject(project).eta_accuracy.bugfix.hits, 1);
  });

  it('increments misses when outside interval', () => {
    const project = 'test-miss-' + Date.now();
    const data = loadProject(project);
    data.tasks.push({
      task_id: 't2', session_id: 's', project,
      timestamp_start: new Date().toISOString(), timestamp_end: new Date().toISOString(),
      duration_seconds: 120, prompt_summary: 'test', classification: 'bugfix',
      tool_calls: 1, files_read: 0, files_edited: 0, files_created: 0, errors: 0, model: 'test',
    });
    saveProject(data);
    setLastEta({ low: 10, high: 30, classification: 'bugfix', task_id: 't2', timestamp: new Date().toISOString() });
    const eta = consumeLastEta();
    const reloaded = loadProject(project);
    const last = reloaded.tasks[reloaded.tasks.length - 1];
    const hit = last.duration_seconds >= eta.low && last.duration_seconds <= eta.high;
    assert.equal(hit, false);
    reloaded.eta_accuracy[eta.classification] ??= { hits: 0, misses: 0 };
    reloaded.eta_accuracy[eta.classification].misses++;
    saveProject(reloaded);
    assert.equal(loadProject(project).eta_accuracy.bugfix.misses, 1);
  });

  it('auto-disables type at >50% misses on 10+', () => {
    const r = evaluateAutoEta(baseParams({ etaAccuracy: { bugfix: { hits: 4, misses: 6 } } }));
    assert.equal(r.action, 'skip');
  });

  it('stays active at exactly 50%', () => {
    const r = evaluateAutoEta(baseParams({ etaAccuracy: { bugfix: { hits: 5, misses: 5 } } }));
    assert.notEqual(r.action, 'skip');
  });

  it('skips silently when no _last_eta.json', () => {
    assert.equal(consumeLastEta(), null);
  });
});
```

- [ ] **Step 2: Build and verify tests pass**

Run: `npm run build && npm test`
Expected: 5 new tests pass.

- [ ] **Step 3: Add self-check to `on-stop.ts`**

Add import:

```typescript
import { loadProject, flushActiveTask, getActiveTask, setLastCompleted, consumeLastEta, saveProject } from '../store.js';
```

Restructure `main()`: save `active = getActiveTask()` before the normal flush path. After `flushAndRecord()`, add self-check:

```typescript
  // Self-check Auto-ETA accuracy (in main, not flushAndRecord)
  if (stdin?.stop_hook_active) {
    consumeLastEta(); // cleanup, don't score (BS detector inflated duration)
  } else if (active) {
    const lastEta = consumeLastEta();
    if (lastEta) {
      const projectData = loadProject(active.project);
      const lastTask = projectData.tasks[projectData.tasks.length - 1];
      if (lastTask?.task_id === lastEta.task_id && lastTask.duration_seconds != null) {
        const hit = lastTask.duration_seconds >= lastEta.low && lastTask.duration_seconds <= lastEta.high;
        projectData.eta_accuracy ??= {};
        projectData.eta_accuracy[lastEta.classification] ??= { hits: 0, misses: 0 };
        if (hit) projectData.eta_accuracy[lastEta.classification].hits++;
        else projectData.eta_accuracy[lastEta.classification].misses++;
        saveProject(projectData);
      }
    }
  }
```

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/on-stop.ts tests/auto-eta.test.js
git commit -m "feat(auto-eta): self-check accuracy in on-stop, guarded by stop_hook_active"
```

---

## Task 6: CLI + command file + docs

**Files:**
- Modify: `src/cli/eta.ts`
- Modify: `commands/eta.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add auto mode to `src/cli/eta.ts`**

Import `loadPreferences`, `savePreferences` from `../store.js`.

Add `showAuto` function and wire into main switch before `default`. Handle the extra argument (`on`/`off`) by checking `process.argv[3]`. Update help table.

- [ ] **Step 2: Update `commands/eta.md` argument-hint**

Add `auto` and add 3 lines to the commands list (`/eta auto`, `/eta auto on`, `/eta auto off`).

- [ ] **Step 3: Update `CLAUDE.md` Key modules**

Add Auto-ETA description.

- [ ] **Step 4: Build, lint, test**

Run: `npm run build && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/eta.ts commands/eta.md CLAUDE.md
git commit -m "feat(auto-eta): /eta auto CLI, command docs, CLAUDE.md"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full build + lint + test**

Run: `npm run build && npm run lint && npm test`
Expected: 0 errors, all ~130+ tests pass.

- [ ] **Step 2: Verify hot path untouched**

Run: `git diff HEAD~6 -- src/hooks/on-tool-use.ts`
Expected: no output.

- [ ] **Step 3: Rebuild dist and commit**

```bash
npm run build
git add dist/
git commit -m "chore: rebuild dist for auto-eta feature"
```
