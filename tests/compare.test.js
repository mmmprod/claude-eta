import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompareRows, selectBestBaseline, selectDominantModel } from '../dist/cli/compare.js';

function makeTask(overrides = {}) {
  return {
    analytics_id: `wi-${Math.random().toString(36).slice(2)}`,
    work_item_id: `wi-${Math.random().toString(36).slice(2)}`,
    session_id: 'sess-1',
    project: 'compare-project',
    timestamp_start: '2026-03-21T10:00:00.000Z',
    timestamp_end: '2026-03-21T10:00:30.000Z',
    duration_seconds: 30,
    prompt_summary: 'fix bug',
    classification: 'bugfix',
    tool_calls: 3,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    runner_kind: 'main',
    source_turn_count: 1,
    ...overrides,
  };
}

function makeBaseline(overrides = {}) {
  return {
    task_type: 'bugfix',
    project_loc_bucket: null,
    model: null,
    sample_count: 20,
    median_seconds: 40,
    p25_seconds: 20,
    p75_seconds: 60,
    p10_seconds: 10,
    p90_seconds: 80,
    avg_tool_calls: 3,
    avg_files_edited: 1,
    volatility: 'medium',
    computed_at: '2026-03-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('selectDominantModel', () => {
  it('returns the normalized dominant model when it is clearly dominant', () => {
    const model = selectDominantModel([
      makeTask({ model: 'claude-sonnet-4-20250514' }),
      makeTask({ model: 'claude-sonnet-4-20250514' }),
      makeTask({ model: 'claude-sonnet-4-20250514' }),
      makeTask({ model: 'claude-opus-4-20250514' }),
    ]);

    assert.equal(model, 'claude-sonnet-4');
  });

  it('returns null when local tasks are too mixed for model-specific matching', () => {
    const model = selectDominantModel([
      makeTask({ model: 'claude-sonnet-4-20250514' }),
      makeTask({ model: 'claude-sonnet-4-20250514' }),
      makeTask({ model: 'claude-opus-4-20250514' }),
      makeTask({ model: 'claude-opus-4-20250514' }),
    ]);

    assert.equal(model, null);
  });
});

describe('selectBestBaseline', () => {
  it('prefers type+loc+model over every broader fallback', () => {
    const baselines = [
      makeBaseline({ median_seconds: 70 }),
      makeBaseline({ project_loc_bucket: 'small', median_seconds: 60 }),
      makeBaseline({ model: 'claude-sonnet-4', median_seconds: 50 }),
      makeBaseline({ project_loc_bucket: 'small', model: 'claude-sonnet-4', median_seconds: 40 }),
    ];

    const match = selectBestBaseline(baselines, 'bugfix', 'small', 'claude-sonnet-4');

    assert.ok(match);
    assert.equal(match.kind, 'type+loc+model');
    assert.equal(match.record.median_seconds, 40);
  });

  it('falls back to type+model when exact loc+model is unavailable', () => {
    const baselines = [
      makeBaseline({ median_seconds: 70 }),
      makeBaseline({ project_loc_bucket: 'small', median_seconds: 60 }),
      makeBaseline({ model: 'claude-sonnet-4', median_seconds: 50 }),
    ];

    const match = selectBestBaseline(baselines, 'bugfix', 'small', 'claude-sonnet-4');

    assert.ok(match);
    assert.equal(match.kind, 'type+model');
    assert.equal(match.record.median_seconds, 50);
  });

  it('falls back to type+loc when model-specific matching is not available', () => {
    const baselines = [makeBaseline({ median_seconds: 70 }), makeBaseline({ project_loc_bucket: 'small', median_seconds: 60 })];

    const match = selectBestBaseline(baselines, 'bugfix', 'small', null);

    assert.ok(match);
    assert.equal(match.kind, 'type+loc');
    assert.equal(match.record.median_seconds, 60);
  });

  it('falls back to global when no narrower bucket exists', () => {
    const match = selectBestBaseline([makeBaseline({ median_seconds: 70 })], 'bugfix', 'small', 'claude-sonnet-4');

    assert.ok(match);
    assert.equal(match.kind, 'global');
    assert.equal(match.record.median_seconds, 70);
  });
});

describe('buildCompareRows', () => {
  it('uses the dominant local model to pick the best community bucket', () => {
    const tasks = [
      makeTask({ analytics_id: 'a', work_item_id: 'a', duration_seconds: 20 }),
      makeTask({ analytics_id: 'b', work_item_id: 'b', duration_seconds: 30 }),
      makeTask({ analytics_id: 'c', work_item_id: 'c', duration_seconds: 40 }),
      makeTask({ analytics_id: 'd', work_item_id: 'd', duration_seconds: 50 }),
      makeTask({ analytics_id: 'e', work_item_id: 'e', duration_seconds: 60 }),
    ];
    const baselines = [
      makeBaseline({ median_seconds: 75 }),
      makeBaseline({ model: 'claude-sonnet-4', median_seconds: 65 }),
      makeBaseline({ project_loc_bucket: 'small', median_seconds: 55 }),
      makeBaseline({ project_loc_bucket: 'small', model: 'claude-sonnet-4', median_seconds: 45 }),
    ];

    const rows = buildCompareRows(tasks, baselines, 'small');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].task_type, 'bugfix');
    assert.equal(rows[0].community_median_seconds, 45);
    assert.equal(rows[0].baseline_match.kind, 'type+loc+model');
  });

  it('avoids model-specific baselines when local tasks are mixed across models', () => {
    const tasks = [
      makeTask({ analytics_id: 'a', work_item_id: 'a', duration_seconds: 20, model: 'claude-sonnet-4-20250514' }),
      makeTask({ analytics_id: 'b', work_item_id: 'b', duration_seconds: 30, model: 'claude-sonnet-4-20250514' }),
      makeTask({ analytics_id: 'c', work_item_id: 'c', duration_seconds: 40, model: 'claude-opus-4-20250514' }),
      makeTask({ analytics_id: 'd', work_item_id: 'd', duration_seconds: 50, model: 'claude-opus-4-20250514' }),
      makeTask({ analytics_id: 'e', work_item_id: 'e', duration_seconds: 60, model: 'claude-sonnet-4-20250514' }),
    ];
    const baselines = [
      makeBaseline({ median_seconds: 75 }),
      makeBaseline({ model: 'claude-sonnet-4', median_seconds: 65 }),
      makeBaseline({ project_loc_bucket: 'small', median_seconds: 55 }),
    ];

    const rows = buildCompareRows(tasks, baselines, 'small');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].baseline_match.kind, 'type+loc');
    assert.equal(rows[0].community_median_seconds, 55);
  });
});
