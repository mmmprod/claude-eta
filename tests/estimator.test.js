import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateInitial, estimateWithTrace, toTaskEstimate } from '../dist/estimator.js';
import { extractFeatures, detectPhase } from '../dist/features.js';

function makeStats(clsName, clsCount, volatility = 'medium', overrides = {}) {
  return {
    totalCompleted: 30,
    overall: { median: 300, p25: 120, p75: 600 },
    byClassification: [
      { classification: clsName, count: clsCount, median: 200, p25: 100, p75: 400, volatility, ...overrides },
    ],
  };
}

// ── estimateInitial ──────────────────────────────────────────

describe('estimateInitial', () => {
  it('returns cold calibration with null stats', () => {
    const est = estimateInitial(null, 'bugfix', 3);
    assert.equal(est.calibration, 'cold');
    assert.ok(est.p50_wall > 0);
    assert.ok(est.p80_wall > est.p50_wall);
    assert.ok(est.basis.includes('bugfix'));
  });

  it('returns warming calibration with few global tasks', () => {
    const stats = { totalCompleted: 3, overall: { median: 100, p25: 50, p75: 200 }, byClassification: [] };
    const est = estimateInitial(stats, 'bugfix', 3);
    assert.equal(est.calibration, 'warming');
  });

  it('returns project calibration with enough data', () => {
    const est = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    assert.equal(est.calibration, 'project');
    assert.ok(est.basis.includes('10 similar bugfix'));
  });

  it('shrinks toward baselines with fewer samples', () => {
    const fewSamples = estimateInitial(makeStats('bugfix', 3), 'bugfix', 3);
    const manySamples = estimateInitial(makeStats('bugfix', 50), 'bugfix', 3);
    // With many samples, estimate should be closer to the local data (median=200)
    // With few samples, it should be pulled toward the baseline (bugfix median=600)
    assert.ok(fewSamples.p50_wall > manySamples.p50_wall);
  });

  it('p50 < p80 always', () => {
    const est = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    assert.ok(est.p80_wall > est.p50_wall);
  });

  it('complexity 5 gives higher estimate than complexity 1', () => {
    const low = estimateInitial(makeStats('bugfix', 10), 'bugfix', 1);
    const high = estimateInitial(makeStats('bugfix', 10), 'bugfix', 5);
    assert.ok(high.p50_wall > low.p50_wall);
    assert.ok(high.p80_wall > low.p80_wall);
  });

  it('fallback to global when classification has no data', () => {
    const stats = makeStats('bugfix', 10);
    const est = estimateInitial(stats, 'docs', 3);
    assert.ok(est.basis.includes('no docs-specific'));
  });
});

// ── estimateWithTrace ────────────────────────────────────────

describe('estimateWithTrace', () => {
  it('reduces remaining time in validate phase', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const refined = estimateWithTrace(initial, 30, 'validate');
    assert.equal(refined.calibration, 'project+trace');
    assert.equal(refined.phase, 'validate');
    assert.ok(refined.remaining_p50 < initial.p50_wall);
  });

  it('explore phase has highest remaining', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const explore = estimateWithTrace(initial, 10, 'explore');
    const validate = estimateWithTrace(initial, 10, 'validate');
    assert.ok(explore.remaining_p50 > validate.remaining_p50);
  });

  it('repair_loop has more remaining than validate', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const repair = estimateWithTrace(initial, 10, 'repair_loop');
    const validate = estimateWithTrace(initial, 10, 'validate');
    assert.ok(repair.remaining_p50 > validate.remaining_p50);
  });
});

// ── toTaskEstimate compat ────────────────────────────────────

describe('toTaskEstimate', () => {
  it('converts EtaEstimate to legacy TaskEstimate shape', () => {
    const est = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const legacy = toTaskEstimate(est, 3);
    assert.ok('low' in legacy);
    assert.ok('high' in legacy);
    assert.ok('median' in legacy);
    assert.ok('confidence' in legacy);
    assert.ok('basis' in legacy);
    assert.ok('volatility' in legacy);
    assert.ok('complexity' in legacy);
    assert.equal(legacy.complexity, 3);
  });

  it('maps calibration to confidence range', () => {
    const cold = toTaskEstimate(estimateInitial(null, 'bugfix', 3), 3);
    const project = toTaskEstimate(estimateInitial(makeStats('bugfix', 10), 'bugfix', 3), 3);
    assert.ok(project.confidence > cold.confidence);
  });
});

// ── detectPhase ──────────────────────────────────────────────

describe('detectPhase', () => {
  function makeState(overrides = {}) {
    return {
      turn_id: 'test', work_item_id: 'test', session_id: 'sess', agent_key: 'main',
      agent_id: null, agent_type: null, runner_kind: 'main',
      project_fp: 'fp', project_display_name: 'test',
      classification: 'bugfix', prompt_summary: 'test', prompt_complexity: 2,
      started_at: new Date().toISOString(), started_at_ms: Date.now(),
      tool_calls: 0, files_read: 0, files_edited: 0, files_created: 0,
      unique_files: 0, bash_calls: 0, bash_failures: 0, grep_calls: 0, glob_calls: 0,
      errors: 0, first_tool_at_ms: null, first_edit_at_ms: null, first_bash_at_ms: null,
      last_event_at_ms: null, last_assistant_message: null,
      model: null, source: null, status: 'active', path_fps: [],
      ...overrides,
    };
  }

  it('returns explore before any edits', () => {
    assert.equal(detectPhase(makeState()), 'explore');
  });

  it('returns edit after first edit', () => {
    assert.equal(detectPhase(makeState({ first_edit_at_ms: Date.now(), files_edited: 1 })), 'edit');
  });

  it('returns validate after first bash', () => {
    assert.equal(
      detectPhase(makeState({ first_edit_at_ms: Date.now(), first_bash_at_ms: Date.now() })),
      'validate',
    );
  });

  it('returns repair_loop after bash failure + edits', () => {
    assert.equal(
      detectPhase(makeState({ first_edit_at_ms: Date.now(), bash_failures: 1, files_edited: 2 })),
      'repair_loop',
    );
  });
});
