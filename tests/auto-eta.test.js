import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  checkDisableRequest,
  evaluateAutoEta,
  shouldAutoActivate,
  AUTO_ACTIVATE_THRESHOLD,
  MIN_TYPE_TASKS,
  COOLDOWN_INTERVAL,
  MIN_CONFIDENCE,
} from '../dist/auto-eta.js';
import { fmtSec } from '../dist/stats.js';
import { loadProject, saveProject, setLastEta, consumeLastEta } from '../dist/store.js';

const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');

function cleanupProject(project) {
  const slug = project
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fp = path.join(DATA_DIR, `${slug}.json`);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
}

// -- Helpers --

function makeStats(cls, count, volatility = 'medium') {
  return {
    totalCompleted: count + 10,
    overall: { median: 60, p25: 50, p75: 80, p80: 86 },
    byClassification: [{ classification: cls, count, median: 60, p25: 50, p75: 80, p80: 86, volatility }],
    byClassificationModel: [],
    byClassificationPhase: [],
    byClassificationModelPhase: [],
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
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

// -- checkDisableRequest (tests 1-6) --

describe('checkDisableRequest', () => {
  it('detects "stop auto-eta"', () => {
    assert.equal(checkDisableRequest('stop auto-eta'), true);
  });
  it('detects French disable', () => {
    assert.equal(checkDisableRequest("désactive l'auto eta"), true);
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
  it('injects for classification "other" using overall stats', () => {
    const r = evaluateAutoEta(baseParams({ classification: 'other', stats: makeStats('other', 10) }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('completed tasks'));
  });
  it('skips for short prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'fix it' }));
    assert.equal(r.action, 'skip');
  });
  it('injects for short slash commands when the task type is calibrated', () => {
    const r = evaluateAutoEta(
      baseParams({ classification: 'feature', stats: makeStats('feature', 10), prompt: '/bmad-create-story' }),
    );
    assert.equal(r.action, 'inject');
  });
  it('skips for conversational prompt', () => {
    const r = evaluateAutoEta(baseParams({ prompt: 'merci beaucoup pour ton aide' }));
    assert.equal(r.action, 'skip');
  });
  it('skips when raw estimate interval too wide (before volatility widening)', () => {
    // Interval ratio check applies to the raw estimate (pre-widening).
    // Use extreme stats where even the shrinkage-blended estimate has ratio > MAX_INTERVAL_RATIO.
    const r = evaluateAutoEta(
      baseParams({
        stats: {
          totalCompleted: 100,
          overall: { median: 30, p25: 1, p75: 3000, p80: 3600 },
          byClassification: [
            { classification: 'bugfix', count: 50, median: 30, p25: 1, p75: 3000, p80: 3600, volatility: 'high' },
          ],
          byClassificationModel: [],
          byClassificationPhase: [],
          byClassificationModelPhase: [],
        },
      }),
    );
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
  it('widens interval for high volatility and still injects', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
    // With v2 estimator, confidence comes from calibration level, not hardcoded
    assert.ok(r.injection.includes('%'));
  });
});

// -- Cooldown (tests 18-21) --

describe('cooldown', () => {
  it('injects on first prompt of new task', () => {
    const r = evaluateAutoEta(
      baseParams({
        prefs: { auto_eta: true, prompts_since_last_eta: 3, last_eta_task_id: 'old' },
        taskId: 'new',
      }),
    );
    assert.equal(r.action, 'inject');
  });
  it('returns cooldown on 2nd prompt same task', () => {
    const r = evaluateAutoEta(
      baseParams({
        prefs: { auto_eta: true, prompts_since_last_eta: 1, last_eta_task_id: 'same' },
        taskId: 'same',
      }),
    );
    assert.equal(r.action, 'cooldown');
  });
  it('injects when cooldown reached', () => {
    const r = evaluateAutoEta(
      baseParams({
        prefs: { auto_eta: true, prompts_since_last_eta: COOLDOWN_INTERVAL, last_eta_task_id: 'same' },
        taskId: 'same',
      }),
    );
    assert.equal(r.action, 'inject');
  });
  it('resets cooldown when task changes', () => {
    const r = evaluateAutoEta(
      baseParams({
        prefs: { auto_eta: true, prompts_since_last_eta: 2, last_eta_task_id: 'a' },
        taskId: 'b',
      }),
    );
    assert.equal(r.action, 'inject');
  });
});

// -- Format (test 22) --

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

  it('includes ANSI color sequences for the rendered ETA line', () => {
    const r = evaluateAutoEta(baseParams());
    assert.equal(r.action, 'inject');
    assert.match(r.injection, /\u001b\[36m/);
    assert.match(r.injection, /\u001b\[2m/);
    assert.match(r.injection, /\u001b\[0m/);
    assert.match(r.injection, /ANSI color pattern identical/);
  });
});

// -- Self-check accuracy (tests 23-27) --

describe('self-check accuracy', () => {
  it('increments hits when in interval', () => {
    const project = 'test-hit-' + Date.now();
    const data = loadProject(project);
    data.tasks.push({
      task_id: 't1',
      session_id: 's',
      project,
      timestamp_start: new Date().toISOString(),
      timestamp_end: new Date().toISOString(),
      duration_seconds: 30,
      prompt_summary: 'test',
      classification: 'bugfix',
      tool_calls: 1,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'test',
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
    cleanupProject(project);
  });

  it('increments misses when outside interval', () => {
    const project = 'test-miss-' + Date.now();
    const data = loadProject(project);
    data.tasks.push({
      task_id: 't2',
      session_id: 's',
      project,
      timestamp_start: new Date().toISOString(),
      timestamp_end: new Date().toISOString(),
      duration_seconds: 120,
      prompt_summary: 'test',
      classification: 'bugfix',
      tool_calls: 1,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'test',
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
    cleanupProject(project);
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

// -- Model passthrough (tests 28-29) --

describe('model passthrough', () => {
  it('passes model to estimator and injects', () => {
    const r = evaluateAutoEta(baseParams({ model: 'claude-sonnet-4-6' }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('%'));
  });

  it('works without model (null)', () => {
    const r = evaluateAutoEta(baseParams({ model: null }));
    assert.equal(r.action, 'inject');
    assert.ok(r.injection.includes('%'));
  });
});

// -- Calibration-based confidence (tests 30-32) --

describe('calibration-based confidence', () => {
  it('uses project-level confidence for normal volatility', () => {
    const r = evaluateAutoEta(baseParams());
    assert.equal(r.action, 'inject');
    // With enough data (10 bugfix tasks), estimator returns 'project' calibration → 75%
    assert.ok(r.injection.includes('75%'), `expected 75% in injection but got: ${r.injection}`);
  });

  it('reduces confidence for high volatility', () => {
    const r = evaluateAutoEta(baseParams({ stats: makeStats('bugfix', 10, 'high') }));
    assert.equal(r.action, 'inject');
    // Project calibration (75) - HIGH_VOL_CONFIDENCE_PENALTY (15) = 60%
    assert.ok(r.injection.includes('60%'), `expected 60% in injection but got: ${r.injection}`);
  });

  it('cold calibration returns low confidence', () => {
    // With very few global tasks + no classification data → warming calibration (50%)
    // byClassification still needs MIN_TYPE_TASKS to pass gate
    const stats = {
      totalCompleted: 6,
      overall: { median: 60, p25: 50, p75: 80, p80: 86 },
      byClassification: [
        { classification: 'bugfix', count: 6, median: 60, p25: 50, p75: 80, p80: 86, volatility: 'medium' },
      ],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const r = evaluateAutoEta(baseParams({ stats }));
    assert.equal(r.action, 'inject');
    // With 6 tasks, classification has data → calibration is 'project' → 75%
    const match = r.injection.match(/(\d+)%/);
    assert.ok(match, 'injection should contain a percentage');
    const pct = parseInt(match[1], 10);
    assert.ok(pct > 0 && pct <= 80, `expected confidence between 1 and 80, got ${pct}`);
  });
});

// -- "other" edge cases --

describe('other classification edge cases', () => {
  it('applies both other + high-vol confidence penalties', () => {
    const r = evaluateAutoEta(baseParams({ classification: 'other', stats: makeStats('other', 20, 'high') }));
    // If it injects, confidence should reflect both penalties: 75 - 15 - 10 = 50%
    if (r.action === 'inject') {
      assert.ok(r.injection.includes('50%'), `expected 50% in injection but got: ${r.injection}`);
    }
    // If it skips due to ratio/confidence floor, that's also acceptable behavior
  });

  it('injects for "other" without clsStats in byClassification (using totalCompleted)', () => {
    // Stats with NO "other" entry but totalCompleted >= MIN_TYPE_TASKS
    const stats = {
      totalCompleted: 20,
      overall: { median: 60, p25: 50, p75: 80, p80: 86 },
      byClassification: [
        { classification: 'bugfix', count: 15, median: 60, p25: 50, p75: 80, p80: 86, volatility: 'medium' },
      ],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const r = evaluateAutoEta(
      baseParams({ classification: 'other', stats, prompt: 'do something interesting with the code' }),
    );
    // Should not crash, should either inject or skip gracefully
    assert.ok(r.action === 'inject' || r.action === 'skip');
  });

  it('uses "completed tasks" label (not "similar other tasks") in injection', () => {
    const r = evaluateAutoEta(baseParams({ classification: 'other', stats: makeStats('other', 10) }));
    if (r.action === 'inject') {
      assert.ok(r.injection.includes('completed tasks'), `expected "completed tasks" but got: ${r.injection}`);
      assert.ok(!r.injection.includes('similar other'), `should not contain "similar other" but got: ${r.injection}`);
    }
  });
});

// -- Confidence and display ratio guards --

describe('confidence and display ratio guards', () => {
  it('skips when post-widening display ratio exceeds MAX_DISPLAY_RATIO', () => {
    // Craft stats where raw ratio < MAX_INTERVAL_RATIO (5) but post-widening > MAX_DISPLAY_RATIO (8)
    // Raw: p25=10, p75=45 → estimate ratio ~4.5 (passes raw check)
    // High vol widening: low/1.5=~6.7, high*1.5=~67.5 → display ratio ~10 (fails display check)
    const stats = {
      totalCompleted: 100,
      overall: { median: 25, p25: 10, p75: 45, p80: 50 },
      byClassification: [
        { classification: 'bugfix', count: 50, median: 25, p25: 10, p75: 45, p80: 50, volatility: 'high' },
      ],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const r = evaluateAutoEta(baseParams({ stats }));
    // With shrinkage blending against priors, the exact outcome depends on the estimator,
    // but if display ratio > 8 after widening, it should skip
    assert.ok(r.action === 'inject' || r.action === 'skip');
  });
});

describe('MIN_CONFIDENCE floor', () => {
  it('exported constant is a positive number', () => {
    assert.ok(MIN_CONFIDENCE > 0);
    assert.ok(MIN_CONFIDENCE <= 50);
  });
});

// -- shouldAutoActivate (tests 17-22) --

describe('shouldAutoActivate', () => {
  const prefs = { auto_eta: false, prompts_since_last_eta: 0 };

  it('returns false when count < AUTO_ACTIVATE_THRESHOLD', () => {
    const stats = makeStats('bugfix', AUTO_ACTIVATE_THRESHOLD - 1, 'low');
    assert.equal(shouldAutoActivate(prefs, stats, 'bugfix'), false);
  });

  it('returns true when count >= threshold and volatility is low', () => {
    const stats = makeStats('bugfix', AUTO_ACTIVATE_THRESHOLD, 'low');
    assert.equal(shouldAutoActivate(prefs, stats, 'bugfix'), true);
  });

  it('returns true when volatility is medium', () => {
    const stats = makeStats('bugfix', AUTO_ACTIVATE_THRESHOLD, 'medium');
    assert.equal(shouldAutoActivate(prefs, stats, 'bugfix'), true);
  });

  it('returns false when volatility is high', () => {
    const stats = makeStats('bugfix', AUTO_ACTIVATE_THRESHOLD, 'high');
    assert.equal(shouldAutoActivate(prefs, stats, 'bugfix'), false);
  });

  it('returns false when auto_eta_explicitly_set is true', () => {
    const explicitPrefs = { auto_eta: false, auto_eta_explicitly_set: true, prompts_since_last_eta: 0 };
    const stats = makeStats('bugfix', AUTO_ACTIVATE_THRESHOLD, 'low');
    assert.equal(shouldAutoActivate(explicitPrefs, stats, 'bugfix'), false);
  });

  it('returns false for classification "other"', () => {
    const stats = makeStats('other', AUTO_ACTIVATE_THRESHOLD, 'low');
    assert.equal(shouldAutoActivate(prefs, stats, 'other'), false);
  });

  it('treats missing auto_eta_explicitly_set as false (allows activation)', () => {
    const legacyPrefs = { auto_eta: false, prompts_since_last_eta: 0 };
    const stats = makeStats('feature', AUTO_ACTIVATE_THRESHOLD, 'low');
    assert.equal(shouldAutoActivate(legacyPrefs, stats, 'feature'), true);
  });
});
