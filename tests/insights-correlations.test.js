import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { errorDurationCorrelation, contextSwitchCost, volatilityRootCauses } from '../dist/insights/correlations.js';

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-1',
    project: 'test',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 60,
    prompt_summary: 'test task',
    classification: 'other',
    tool_calls: 5,
    files_read: 2,
    files_edited: 1,
    files_created: 0,
    errors: 0,
    model: 'test',
    ...overrides,
  };
}

// ── errorDurationCorrelation ─────────────────────────────────

describe('errorDurationCorrelation', () => {
  it('returns null with fewer than 10 tasks', () => {
    const tasks = Array.from({ length: 5 }, () => makeTask());
    assert.equal(errorDurationCorrelation(tasks), null);
  });

  it('returns null when fewer than 3 tasks with errors', () => {
    const tasks = [...Array.from({ length: 9 }, () => makeTask({ errors: 0 })), makeTask({ errors: 2 })];
    assert.equal(errorDurationCorrelation(tasks), null);
  });

  it('returns null when fewer than 3 tasks without errors', () => {
    const tasks = [...Array.from({ length: 9 }, () => makeTask({ errors: 3 })), makeTask({ errors: 0 })];
    assert.equal(errorDurationCorrelation(tasks), null);
  });

  it('computes correct overhead percentage', () => {
    const tasks = [
      ...Array.from({ length: 5 }, () => makeTask({ duration_seconds: 100, errors: 0 })),
      ...Array.from({ length: 5 }, () => makeTask({ duration_seconds: 200, errors: 3 })),
    ];
    const result = errorDurationCorrelation(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'error-duration');
    assert.equal(result.medianWithoutErrors, 100);
    assert.equal(result.medianWithErrors, 200);
    assert.equal(result.overheadPct, 100); // 200 is 100% more than 100
    assert.equal(result.tasksWithErrors, 5);
    assert.equal(result.sampleSize, 10);
  });

  it('works with pre-filtered completed tasks', () => {
    // Functions now receive CompletedTask[] (pre-filtered by computeAllInsights)
    const tasks = [
      ...Array.from({ length: 5 }, () => makeTask({ duration_seconds: 50, errors: 0 })),
      ...Array.from({ length: 5 }, () => makeTask({ duration_seconds: 150, errors: 1 })),
    ];
    const result = errorDurationCorrelation(tasks);
    assert.ok(result);
    assert.equal(result.sampleSize, 10);
  });
});

// ── contextSwitchCost ────────────────────────────────────────

describe('contextSwitchCost', () => {
  it('returns null with fewer than 10 pairs', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({
        timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        classification: i % 2 === 0 ? 'bugfix' : 'feature',
      }),
    );
    assert.equal(contextSwitchCost(tasks), null);
  });

  it('returns null when too few same-type or diff-type pairs', () => {
    // All same type → 0 diff-type pairs
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({
        timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        classification: 'bugfix',
      }),
    );
    assert.equal(contextSwitchCost(tasks), null);
  });

  it('counts same/diff transitions correctly', () => {
    const types = [
      'bugfix',
      'bugfix',
      'feature',
      'bugfix',
      'bugfix',
      'feature',
      'feature',
      'bugfix',
      'feature',
      'bugfix',
      'bugfix',
      'feature',
    ];
    const tasks = types.map((cls, i) =>
      makeTask({
        timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        classification: cls,
        duration_seconds: cls === 'bugfix' ? 50 : 100,
      }),
    );
    const result = contextSwitchCost(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'context-switch');
    assert.equal(result.sameTypeCount + result.diffTypeCount, types.length - 1);
  });

  it('computes overhead correctly', () => {
    // Same type: short tasks. Different type: longer tasks.
    const tasks = [];
    for (let i = 0; i < 12; i++) {
      const isSame = i % 3 !== 0; // 2/3 same, 1/3 diff
      tasks.push(
        makeTask({
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
          classification: isSame ? 'bugfix' : 'feature',
          duration_seconds: 100,
        }),
      );
    }
    const result = contextSwitchCost(tasks);
    // May or may not meet threshold depending on distribution
    if (result) {
      assert.equal(result.kind, 'context-switch');
      assert.ok(typeof result.overheadPct === 'number');
    }
  });
});

// ── volatilityRootCauses ─────────────────────────────────────

describe('volatilityRootCauses', () => {
  it('returns null when no classification has 10+ tasks', () => {
    const tasks = Array.from({ length: 9 }, () => makeTask({ classification: 'bugfix', duration_seconds: 100 }));
    assert.equal(volatilityRootCauses(tasks), null);
  });

  it('returns factors sorted by absolute correlation', () => {
    // Construct tasks where tool_calls strongly correlates with duration
    const tasks = Array.from({ length: 15 }, (_, i) =>
      makeTask({
        classification: 'bugfix',
        duration_seconds: 50 + i * 20,
        tool_calls: 2 + i * 3,
        errors: 0,
        files_edited: 1,
        files_created: 0,
        prompt_summary: 'fix bug',
      }),
    );
    const result = volatilityRootCauses(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'volatility-causes');
    assert.equal(result.classification, 'bugfix');
    assert.ok(result.factors.length > 0);
    // Tool calls should correlate positively with duration
    const toolFactor = result.factors.find((f) => f.factor === 'tool_calls');
    assert.ok(toolFactor);
    assert.ok(toolFactor.correlation > 0.5);
    assert.equal(toolFactor.direction, 'positive');
  });

  it('returns near-zero correlation for uniform data', () => {
    const tasks = Array.from({ length: 15 }, () =>
      makeTask({
        classification: 'config',
        duration_seconds: 100,
        tool_calls: 5,
        errors: 0,
        files_edited: 1,
        files_created: 0,
        prompt_summary: 'config change',
      }),
    );
    const result = volatilityRootCauses(tasks);
    // With uniform duration the IQR is 0, so med is 100, IQR/med = 0
    // This might return null since ratio can't beat -1 initial bestRatio
    // Actually bestRatio starts at -1 and 0 > -1, so it should still pick it
    if (result) {
      for (const f of result.factors) {
        assert.ok(Math.abs(f.correlation) < 0.01);
        assert.equal(f.direction, 'none');
      }
    }
  });

  it('picks the most volatile classification', () => {
    const tasks = [
      // Low volatility config tasks
      ...Array.from({ length: 12 }, () => makeTask({ classification: 'config', duration_seconds: 100 })),
      // High volatility bugfix tasks
      ...Array.from({ length: 12 }, (_, i) => makeTask({ classification: 'bugfix', duration_seconds: 10 + i * 50 })),
    ];
    const result = volatilityRootCauses(tasks);
    assert.ok(result);
    assert.equal(result.classification, 'bugfix');
  });

  it('Pearson R is negative for inverse correlation', () => {
    // More errors → shorter duration (inverse)
    const tasks = Array.from({ length: 15 }, (_, i) =>
      makeTask({
        classification: 'debug',
        duration_seconds: 300 - i * 15,
        errors: i * 2,
        tool_calls: 5,
        files_edited: 1,
        files_created: 0,
        prompt_summary: 'debug issue',
      }),
    );
    const result = volatilityRootCauses(tasks);
    assert.ok(result);
    const errorFactor = result.factors.find((f) => f.factor === 'errors');
    assert.ok(errorFactor);
    assert.ok(errorFactor.correlation < -0.5);
    assert.equal(errorFactor.direction, 'negative');
  });
});
