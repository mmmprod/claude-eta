import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, formatStatsContext } from '../dist/stats.js';

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-1',
    project: 'test',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 60,
    prompt_summary: 'test',
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

describe('computeStats', () => {
  it('returns null with fewer than 5 tasks', () => {
    const tasks = [makeTask(), makeTask(), makeTask()];
    assert.equal(computeStats(tasks), null);
  });

  it('returns stats with 5+ completed tasks', () => {
    const tasks = [
      makeTask({ duration_seconds: 60 }),
      makeTask({ duration_seconds: 120 }),
      makeTask({ duration_seconds: 180 }),
      makeTask({ duration_seconds: 240 }),
      makeTask({ duration_seconds: 300 }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);
    assert.equal(stats.totalCompleted, 5);
    assert.equal(stats.overall.median, 180); // 3 minutes
  });

  it('skips tasks with null duration', () => {
    const tasks = [
      makeTask({ duration_seconds: 60 }),
      makeTask({ duration_seconds: 120 }),
      makeTask({ duration_seconds: null }), // active task
      makeTask({ duration_seconds: 180 }),
      makeTask({ duration_seconds: 240 }),
      makeTask({ duration_seconds: 300 }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);
    assert.equal(stats.totalCompleted, 5);
  });

  it('groups by classification', () => {
    const tasks = [
      makeTask({ classification: 'bugfix', duration_seconds: 60 }),
      makeTask({ classification: 'bugfix', duration_seconds: 120 }),
      makeTask({ classification: 'bugfix', duration_seconds: 180 }),
      makeTask({ classification: 'feature', duration_seconds: 600 }),
      makeTask({ classification: 'feature', duration_seconds: 900 }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);
    assert.equal(stats.byClassification.length, 2);

    const bugfix = stats.byClassification.find((s) => s.classification === 'bugfix');
    assert.ok(bugfix);
    assert.equal(bugfix.count, 3);
    assert.equal(bugfix.median, 120);

    const feature = stats.byClassification.find((s) => s.classification === 'feature');
    assert.ok(feature);
    assert.equal(feature.count, 2);
  });

  it('calculates volatility correctly', () => {
    // Low volatility: tight cluster
    const lowVol = [
      makeTask({ classification: 'config', duration_seconds: 100 }),
      makeTask({ classification: 'config', duration_seconds: 110 }),
      makeTask({ classification: 'config', duration_seconds: 105 }),
      makeTask({ classification: 'config', duration_seconds: 108 }),
      makeTask({ classification: 'config', duration_seconds: 103 }),
    ];
    const stats = computeStats(lowVol);
    assert.ok(stats);
    const config = stats.byClassification.find((s) => s.classification === 'config');
    assert.ok(config);
    assert.equal(config.volatility, 'low');
  });

  it('sorts byClassification by count descending', () => {
    const tasks = [
      ...Array.from({ length: 5 }, () => makeTask({ classification: 'bugfix', duration_seconds: 100 })),
      ...Array.from({ length: 3 }, () => makeTask({ classification: 'feature', duration_seconds: 200 })),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);
    assert.equal(stats.byClassification[0].classification, 'bugfix');
  });
});

describe('formatStatsContext', () => {
  it('produces readable context string', () => {
    const stats = {
      totalCompleted: 20,
      overall: { median: 480, p25: 120, p75: 900 },
      byClassification: [
        { classification: 'bugfix', count: 8, median: 300, p25: 120, p75: 600, volatility: 'medium' },
        { classification: 'feature', count: 5, median: 900, p25: 600, p75: 1500, volatility: 'medium' },
      ],
    };
    const ctx = formatStatsContext(stats);
    assert.ok(ctx.includes('[claude-eta]'));
    assert.ok(ctx.includes('20 completed tasks'));
    assert.ok(ctx.includes('bugfix'));
    assert.ok(ctx.includes('feature'));
    assert.ok(ctx.includes('calibrate'));
  });
});
