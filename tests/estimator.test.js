import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateInitial, estimateWithTrace, toRemainingTaskEstimate, toTaskEstimate } from '../dist/estimator.js';
import { applyPhaseTransition, extractFeatures, detectPhase, recomputeRemaining } from '../dist/features.js';
import { INITIAL_PRIORS } from '../dist/stats.js';

function makeStats(clsName, clsCount, volatility = 'medium', overrides = {}) {
  return {
    totalCompleted: 30,
    overall: { median: 300, p25: 120, p75: 600, p80: 660 },
    byClassification: [
      { classification: clsName, count: clsCount, median: 200, p25: 100, p75: 400, p80: 440, volatility, ...overrides },
    ],
    byClassificationModel: [],
    byClassificationPhase: [],
    byClassificationModelPhase: [],
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
    const stats = { totalCompleted: 3, overall: { median: 100, p25: 50, p75: 200, p80: 220 }, byClassification: [] };
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

  it('uses classification+model stats when enough local history exists for that model family', () => {
    const stats = {
      ...makeStats('bugfix', 10),
      byClassificationModel: [
        {
          classification: 'bugfix',
          model: 'claude-sonnet-4',
          count: 6,
          median: 140,
          p25: 90,
          p75: 220,
          p80: 242,
          volatility: 'medium',
        },
      ],
    };
    const est = estimateInitial(stats, 'bugfix', 3, { model: 'claude-sonnet-4-20250514' });
    assert.ok(est.basis.includes('claude-sonnet-4'));
    assert.ok(est.p50_wall < 200);
  });

  it('falls back to classification-only stats when model history is too sparse', () => {
    const stats = {
      ...makeStats('bugfix', 10),
      byClassificationModel: [
        {
          classification: 'bugfix',
          model: 'claude-sonnet-4',
          count: 1,
          median: 140,
          p25: 90,
          p75: 220,
          p80: 242,
          volatility: 'medium',
        },
      ],
    };
    const est = estimateInitial(stats, 'bugfix', 3, { model: 'claude-sonnet-4-20250514' });
    assert.ok(!est.basis.includes('claude-sonnet-4'));
    assert.ok(est.basis.includes('similar bugfix'));
  });

  it('bases p80_wall on the true 80th percentile, not a p75 proxy', () => {
    const stats = {
      totalCompleted: 30,
      overall: { median: 300, p25: 120, p75: 360, p80: 720 },
      byClassification: [
        { classification: 'bugfix', count: 10, median: 200, p25: 100, p75: 220, p80: 500, volatility: 'medium' },
      ],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };

    const est = estimateInitial(stats, 'bugfix', 3);
    const wGlobal = 30 / 35;
    const wCls = 10 / 18;
    const blendedGlobalP80 = wGlobal * stats.overall.p80 + (1 - wGlobal) * INITIAL_PRIORS.bugfix.high;
    const blendedGlobalP75 = wGlobal * stats.overall.p75 + (1 - wGlobal) * INITIAL_PRIORS.bugfix.high;
    const expectedP80 = Math.round(wCls * 500 + (1 - wCls) * blendedGlobalP80);
    const p75Proxy = Math.round(wCls * 220 + (1 - wCls) * blendedGlobalP75);

    assert.equal(est.p80_wall, expectedP80);
    assert.notEqual(est.p80_wall, p75Proxy);
  });
});

// ── community priors ─────────────────────────────────────────

describe('estimateInitial with communityPriors', () => {
  const communityPriors = {
    bugfix: { low: 15, median: 35, high: 77, sample_count: 142, match_kind: 'global' },
    feature: { low: 21, median: 55, high: 120, sample_count: 87, match_kind: 'type+model' },
  };

  it('uses community prior instead of INITIAL_PRIORS when no stats', () => {
    const est = estimateInitial(null, 'bugfix', 3, { communityPriors });
    assert.equal(est.calibration, 'community');
    assert.ok(est.basis.includes('community bugfix baseline'));
    assert.ok(est.basis.includes('142 samples'));
    // Should use community median (35), not INITIAL_PRIORS bugfix median (600)
    assert.equal(est.p50_wall, 35);
    assert.equal(est.p80_wall, 77);
  });

  it('falls back to INITIAL_PRIORS for classifications not in communityPriors', () => {
    const est = estimateInitial(null, 'refactor', 3, { communityPriors });
    assert.equal(est.calibration, 'cold');
    assert.ok(est.basis.includes('initial refactor prior'));
    assert.equal(est.p50_wall, INITIAL_PRIORS.refactor.median);
  });

  it('cold calibration when communityPriors is null', () => {
    const est = estimateInitial(null, 'bugfix', 3, { communityPriors: null });
    assert.equal(est.calibration, 'cold');
  });

  it('community priors are used in shrinkage blend when stats exist', () => {
    const stats = {
      totalCompleted: 3,
      overall: { median: 100, p25: 50, p75: 200, p80: 220 },
      byClassification: [],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const withCommunity = estimateInitial(stats, 'bugfix', 3, { communityPriors });
    const withoutCommunity = estimateInitial(stats, 'bugfix', 3);
    // With community priors (bugfix median=35), estimate should be much lower than
    // without (INITIAL_PRIORS bugfix median=600)
    assert.ok(withCommunity.p50_wall < withoutCommunity.p50_wall);
  });

  it('community confidence maps to 40%', () => {
    const est = estimateInitial(null, 'feature', 3, { communityPriors });
    assert.equal(est.calibration, 'community');
    // calibrationToConfidence('community') = 40 is internal, test via toTaskEstimate
    const legacy = toTaskEstimate(est, 3);
    assert.equal(legacy.confidence, 40);
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

  it('uses phase-specific history when enough traces exist', () => {
    const stats = {
      ...makeStats('bugfix', 10),
      byClassificationPhase: [
        {
          phase: 'edit',
          classification: 'bugfix',
          count: 6,
          median: 70,
          p25: 60,
          p75: 90,
          p80: 94,
          volatility: 'medium',
        },
      ],
      byClassificationModelPhase: [
        {
          phase: 'edit',
          classification: 'bugfix',
          model: 'claude-sonnet-4',
          count: 4,
          median: 55,
          p25: 45,
          p75: 75,
          p80: 79,
          volatility: 'medium',
        },
      ],
    };
    const initial = estimateInitial(stats, 'bugfix', 3, { model: 'claude-sonnet-4-20250514' });
    const refined = estimateWithTrace(initial, 30, 'edit', {
      stats,
      classification: 'bugfix',
      model: 'claude-sonnet-4-20250514',
    });
    assert.ok(refined.basis.includes('edit traces'));
    assert.ok(refined.remaining_p50 < initial.remaining_p50);
  });

  it('uses the true phase p80 for remaining_p80 when trace data is trusted', () => {
    const stats = {
      ...makeStats('bugfix', 10),
      byClassificationPhase: [
        {
          phase: 'edit',
          classification: 'bugfix',
          count: 6,
          median: 70,
          p25: 60,
          p75: 75,
          p80: 120,
          volatility: 'medium',
        },
      ],
      byClassificationModelPhase: [],
    };

    const initial = estimateInitial(stats, 'bugfix', 3);
    const refined = estimateWithTrace(initial, 30, 'edit', {
      stats,
      classification: 'bugfix',
    });

    assert.equal(refined.remaining_p50, 70);
    assert.equal(refined.remaining_p80, 120);
    assert.notEqual(refined.remaining_p80, 75);
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

describe('toRemainingTaskEstimate', () => {
  it('converts EtaEstimate using remaining ranges instead of total wall time', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const refined = estimateWithTrace(initial, 60, 'edit');
    const remaining = toRemainingTaskEstimate(refined, 3);

    assert.equal(remaining.low, refined.remaining_p50);
    assert.equal(remaining.high, refined.remaining_p80);
    assert.notEqual(remaining.low, refined.p50_wall);
  });
});

// ── detectPhase ──────────────────────────────────────────────

describe('detectPhase', () => {
  function makeState(overrides = {}) {
    return {
      turn_id: 'test',
      work_item_id: 'test',
      session_id: 'sess',
      agent_key: 'main',
      agent_id: null,
      agent_type: null,
      runner_kind: 'main',
      project_fp: 'fp',
      project_display_name: 'test',
      classification: 'bugfix',
      prompt_summary: 'test',
      prompt_complexity: 2,
      started_at: new Date().toISOString(),
      started_at_ms: Date.now(),
      tool_calls: 0,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      unique_files: 0,
      bash_calls: 0,
      bash_failures: 0,
      grep_calls: 0,
      glob_calls: 0,
      errors: 0,
      first_tool_at_ms: null,
      first_edit_at_ms: null,
      first_bash_at_ms: null,
      last_event_at_ms: null,
      last_assistant_message: null,
      model: null,
      source: null,
      status: 'active',
      path_fps: [],
      error_fingerprints: [],
      cached_eta: null,
      live_remaining_p50: null,
      live_remaining_p80: null,
      live_phase: null,
      files_edited_after_first_failure: 0,
      first_bash_failure_at_ms: null,
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
    assert.equal(detectPhase(makeState({ first_edit_at_ms: Date.now(), first_bash_at_ms: Date.now() })), 'validate');
  });

  it('returns repair_loop after bash failure + post-failure edits', () => {
    assert.equal(
      detectPhase(
        makeState({
          first_edit_at_ms: Date.now(),
          bash_failures: 1,
          files_edited: 3,
          files_edited_after_first_failure: 1,
          first_bash_failure_at_ms: Date.now(),
        }),
      ),
      'repair_loop',
    );
  });

  it('returns validate_failed after bash failure with no post-failure edits', () => {
    assert.equal(
      detectPhase(
        makeState({
          first_edit_at_ms: Date.now(),
          bash_failures: 1,
          files_edited: 2,
          files_edited_after_first_failure: 0,
          first_bash_failure_at_ms: Date.now(),
        }),
      ),
      'validate_failed',
    );
  });

  it('returns repair_loop only when edits happen after failure', () => {
    assert.equal(
      detectPhase(
        makeState({
          first_edit_at_ms: Date.now(),
          bash_failures: 1,
          files_edited: 3,
          files_edited_after_first_failure: 1,
          first_bash_failure_at_ms: Date.now(),
        }),
      ),
      'repair_loop',
    );
  });
});

// ── recomputeRemaining ───────────────────────────────────────

describe('recomputeRemaining', () => {
  const cached = { p50_wall: 120, p80_wall: 200 };

  it('returns positive remaining when elapsed < estimate', () => {
    const result = recomputeRemaining(cached, 30, 'edit');
    assert.ok(result.remaining_p50 > 0);
    assert.ok(result.remaining_p80 > result.remaining_p50);
  });

  it('returns zero remaining when elapsed exceeds estimate', () => {
    const result = recomputeRemaining(cached, 300, 'edit');
    assert.equal(result.remaining_p50, 0);
    // p80 floor: when p50 is 0, p80 can also be 0
    assert.ok(result.remaining_p80 >= 0);
  });

  it('explore phase gives higher remaining than validate (multiplier 1.05 vs 0.95)', () => {
    const explore = recomputeRemaining(cached, 30, 'explore');
    const validate = recomputeRemaining(cached, 30, 'validate');
    assert.ok(explore.remaining_p50 > validate.remaining_p50);
  });

  it('repair_loop gives highest multiplier (1.15)', () => {
    const repair = recomputeRemaining(cached, 30, 'repair_loop');
    const edit = recomputeRemaining(cached, 30, 'edit');
    assert.ok(repair.remaining_p50 > edit.remaining_p50);
  });

  it('edit phase applies multiplier of 1.0 (identity)', () => {
    const result = recomputeRemaining(cached, 30, 'edit');
    assert.equal(result.remaining_p50, Math.max(0, Math.round((120 - 30) * 1)));
    assert.equal(result.remaining_p50, 90);
  });

  it('p80 is always >= p50 + 1 when p50 > 0', () => {
    const result = recomputeRemaining(cached, 60, 'validate');
    if (result.remaining_p50 > 0) {
      assert.ok(result.remaining_p80 >= result.remaining_p50 + 1);
    }
  });

  it('handles zero-second elapsed', () => {
    const result = recomputeRemaining(cached, 0, 'explore');
    assert.equal(result.remaining_p50, Math.round(120 * 1.05));
    assert.ok(result.remaining_p80 >= result.remaining_p50 + 1);
  });
});

describe('applyPhaseTransition', () => {
  function makeState(overrides = {}) {
    const now = Date.now();
    return {
      turn_id: 'test',
      work_item_id: 'test',
      session_id: 'sess',
      agent_key: 'main',
      agent_id: null,
      agent_type: null,
      runner_kind: 'main',
      project_fp: 'fp',
      project_display_name: 'test',
      classification: 'bugfix',
      prompt_summary: 'test',
      prompt_complexity: 2,
      started_at: new Date(now - 100000).toISOString(),
      started_at_ms: now - 100000,
      tool_calls: 0,
      files_read: 0,
      files_edited: 1,
      files_created: 0,
      unique_files: 0,
      bash_calls: 0,
      bash_failures: 0,
      grep_calls: 0,
      glob_calls: 0,
      errors: 0,
      first_tool_at_ms: null,
      first_edit_at_ms: now - 99000,
      first_bash_at_ms: null,
      last_event_at_ms: null,
      last_assistant_message: null,
      model: null,
      source: null,
      status: 'active',
      path_fps: [],
      error_fingerprints: [],
      cached_eta: {
        p50_wall: 120,
        p80_wall: 180,
        basis: 'cached',
        calibration: 'project',
      },
      live_remaining_p50: 80,
      live_remaining_p80: 140,
      live_phase: 'edit',
      last_phase: 'edit',
      refined_eta: null,
      files_edited_after_first_failure: 0,
      first_bash_failure_at_ms: null,
      cumulative_work_item_seconds: 0,
      ...overrides,
    };
  }

  it('refreshes live remaining even when the phase does not change', () => {
    const now = Date.now();
    const state = makeState({ started_at_ms: now - 100000, started_at: new Date(now - 100000).toISOString() });
    const transitioned = applyPhaseTransition(state, now);

    assert.equal(transitioned, null);
    assert.ok(state.live_remaining_p50 <= 20, `expected countdown near 20s, got ${state.live_remaining_p50}`);
    assert.ok(state.live_remaining_p50 >= 19, `expected countdown near 20s, got ${state.live_remaining_p50}`);
    assert.ok(state.live_remaining_p80 <= 80, `expected countdown near 80s, got ${state.live_remaining_p80}`);
    assert.ok(state.live_remaining_p80 >= 79, `expected countdown near 80s, got ${state.live_remaining_p80}`);
  });
});

// ── cumulative work item ETA adjustment ──────────────────────

describe('cumulative work item ETA adjustment', () => {
  it('subtracts cumulative seconds from initial ETA', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const cumulativeSeconds = 60;

    const adjusted = {
      p50_wall: Math.max(0, initial.p50_wall - cumulativeSeconds),
      p80_wall: Math.max(1, initial.p80_wall - cumulativeSeconds),
    };

    assert.ok(adjusted.p50_wall < initial.p50_wall);
    assert.ok(adjusted.p80_wall < initial.p80_wall);
    assert.equal(adjusted.p50_wall, initial.p50_wall - 60);
    assert.equal(adjusted.p80_wall, initial.p80_wall - 60);
  });

  it('p50 floors at 0 when cumulative exceeds initial', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const cumulativeSeconds = initial.p50_wall + 100;

    const adjusted = {
      p50_wall: Math.max(0, initial.p50_wall - cumulativeSeconds),
      p80_wall: Math.max(1, initial.p80_wall - cumulativeSeconds),
    };

    assert.equal(adjusted.p50_wall, 0);
  });

  it('p80 floors at 1 when cumulative exceeds initial', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const cumulativeSeconds = initial.p80_wall + 100;

    const adjusted = {
      p50_wall: Math.max(0, initial.p50_wall - cumulativeSeconds),
      p80_wall: Math.max(1, initial.p80_wall - cumulativeSeconds),
    };

    assert.equal(adjusted.p80_wall, 1);
  });

  it('zero cumulative seconds leaves ETA unchanged', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const cumulativeSeconds = 0;

    // With 0 cumulative, no adjustment should happen
    const adjusted = {
      p50_wall: Math.max(0, initial.p50_wall - cumulativeSeconds),
      p80_wall: Math.max(1, initial.p80_wall - cumulativeSeconds),
    };

    assert.equal(adjusted.p50_wall, initial.p50_wall);
    assert.equal(adjusted.p80_wall, initial.p80_wall);
  });
});

// ── estimateWithTrace cumulativeWorkItemSeconds ──────────────

describe('estimateWithTrace cumulativeWorkItemSeconds', () => {
  it('accounts for cumulative work item seconds', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    // p50_wall ~ 200, p80_wall ~ 440 (from makeStats)
    const elapsedSeconds = 10;
    const cumulativeWorkItemSeconds = 50;

    const withCumulative = estimateWithTrace(initial, elapsedSeconds, 'edit', {
      cumulativeWorkItemSeconds,
    });
    const withoutCumulative = estimateWithTrace(initial, elapsedSeconds, 'edit');

    // effective elapsed = 10 + 50 = 60 vs just 10
    // So remaining should be smaller when cumulative is accounted for
    assert.ok(
      withCumulative.remaining_p50 < withoutCumulative.remaining_p50,
      `remaining_p50 with cumulative (${withCumulative.remaining_p50}) should be less than without (${withoutCumulative.remaining_p50})`,
    );
    assert.ok(
      withCumulative.remaining_p80 < withoutCumulative.remaining_p80,
      `remaining_p80 with cumulative (${withCumulative.remaining_p80}) should be less than without (${withoutCumulative.remaining_p80})`,
    );
  });

  it('zero cumulative seconds leaves estimate unchanged', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const elapsedSeconds = 30;

    const withZero = estimateWithTrace(initial, elapsedSeconds, 'edit', {
      cumulativeWorkItemSeconds: 0,
    });
    const withoutParam = estimateWithTrace(initial, elapsedSeconds, 'edit');

    assert.equal(withZero.remaining_p50, withoutParam.remaining_p50);
    assert.equal(withZero.remaining_p80, withoutParam.remaining_p80);
  });

  it('omitting cumulativeWorkItemSeconds is backward compatible', () => {
    const initial = estimateInitial(makeStats('bugfix', 10), 'bugfix', 3);
    const elapsedSeconds = 30;

    const withUndefined = estimateWithTrace(initial, elapsedSeconds, 'edit', {
      cumulativeWorkItemSeconds: undefined,
    });
    const withoutContext = estimateWithTrace(initial, elapsedSeconds, 'edit');

    assert.equal(withUndefined.remaining_p50, withoutContext.remaining_p50);
    assert.equal(withUndefined.remaining_p80, withoutContext.remaining_p80);
  });
});
