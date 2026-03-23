import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, formatStatsContext, scorePromptComplexity, estimateTask } from '../dist/stats.js';

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-1',
    project: 'test',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 60,
    prompt_summary: 'test',
    prompt_complexity: 2,
    classification: 'other',
    tool_calls: 5,
    files_read: 2,
    files_edited: 1,
    files_created: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    first_edit_offset_seconds: 20,
    first_bash_offset_seconds: 40,
    runner_kind: 'main',
    source_turn_count: 1,
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

  it('p80 is strictly >= p75 for datasets with enough spread', () => {
    const tasks = [
      makeTask({ duration_seconds: 10 }),
      makeTask({ duration_seconds: 20 }),
      makeTask({ duration_seconds: 30 }),
      makeTask({ duration_seconds: 40 }),
      makeTask({ duration_seconds: 50 }),
      makeTask({ duration_seconds: 60 }),
      makeTask({ duration_seconds: 70 }),
      makeTask({ duration_seconds: 80 }),
      makeTask({ duration_seconds: 90 }),
      makeTask({ duration_seconds: 100 }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);
    assert.ok(
      stats.overall.p80 > stats.overall.p75,
      `p80 (${stats.overall.p80}) should be > p75 (${stats.overall.p75})`,
    );
    assert.ok('p80' in stats.overall);
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

  it('groups model-specific stats by normalized model family', () => {
    const tasks = [
      makeTask({ classification: 'bugfix', duration_seconds: 60, model: 'claude-sonnet-4-20250514' }),
      makeTask({ classification: 'bugfix', duration_seconds: 90, model: 'claude-sonnet-4-20250514' }),
      makeTask({ classification: 'bugfix', duration_seconds: 180, model: 'claude-opus-4-20250514' }),
      makeTask({ classification: 'bugfix', duration_seconds: 210, model: 'claude-opus-4-20250514' }),
      makeTask({ classification: 'feature', duration_seconds: 300, model: 'claude-sonnet-4-20250514' }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);

    const sonnet = stats.byClassificationModel.find(
      (s) => s.classification === 'bugfix' && s.model === 'claude-sonnet-4',
    );
    assert.ok(sonnet);
    assert.equal(sonnet.count, 2);

    const opus = stats.byClassificationModel.find((s) => s.classification === 'bugfix' && s.model === 'claude-opus-4');
    assert.ok(opus);
    assert.equal(opus.count, 2);
  });

  it('builds phase-specific remaining-time stats', () => {
    const tasks = [
      makeTask({
        classification: 'bugfix',
        duration_seconds: 100,
        first_edit_offset_seconds: 20,
        first_bash_offset_seconds: 60,
      }),
      makeTask({
        classification: 'bugfix',
        duration_seconds: 110,
        first_edit_offset_seconds: 25,
        first_bash_offset_seconds: 65,
      }),
      makeTask({
        classification: 'bugfix',
        duration_seconds: 120,
        first_edit_offset_seconds: 30,
        first_bash_offset_seconds: 70,
      }),
      makeTask({
        classification: 'bugfix',
        duration_seconds: 130,
        first_edit_offset_seconds: 35,
        first_bash_offset_seconds: 75,
      }),
      makeTask({
        classification: 'bugfix',
        duration_seconds: 140,
        first_edit_offset_seconds: 40,
        first_bash_offset_seconds: 80,
      }),
    ];
    const stats = computeStats(tasks);
    assert.ok(stats);

    const edit = stats.byClassificationPhase.find((s) => s.classification === 'bugfix' && s.phase === 'edit');
    assert.ok(edit);
    assert.equal(edit.count, 5);
    assert.equal(edit.median, 90);

    const validateModel = stats.byClassificationModelPhase.find(
      (s) => s.classification === 'bugfix' && s.phase === 'validate' && s.model === 'claude-sonnet-4',
    );
    assert.ok(validateModel);
    assert.equal(validateModel.count, 5);
  });
});

describe('scorePromptComplexity', () => {
  it('scores simple prompts low', () => {
    assert.equal(scorePromptComplexity('fix typo'), 1);
    assert.equal(scorePromptComplexity('add button'), 1);
  });

  it('scores long prompts higher', () => {
    const long = 'implement a feature that ' + 'does something important '.repeat(10);
    assert.ok(scorePromptComplexity(long) >= 2);
  });

  it('scores file mentions', () => {
    const withFiles = 'modify store.ts and stats.ts and types.ts';
    assert.ok(scorePromptComplexity(withFiles) >= 2);
  });

  it('scores scope words', () => {
    assert.ok(scorePromptComplexity('refactor all modules') >= 2);
    assert.ok(scorePromptComplexity('update every component') >= 2);
    assert.ok(scorePromptComplexity('change the entire auth system') >= 2);
  });

  it('caps at 5', () => {
    const maxComplexity =
      'implement the entire prediction system across all files in the codebase — you need to modify store.ts, stats.ts, types.ts, on-prompt.ts, on-stop.ts, on-tool-use.ts and several more modules throughout the project with comprehensive confidence interval calculations';
    assert.equal(scorePromptComplexity(maxComplexity), 5);
  });
});

describe('estimateTask', () => {
  const stats = {
    totalCompleted: 30,
    overall: { median: 300, p25: 120, p75: 600, p80: 660 },
    byClassification: [
      { classification: 'bugfix', count: 10, median: 200, p25: 100, p75: 400, p80: 440, volatility: 'medium' },
      { classification: 'feature', count: 8, median: 900, p25: 600, p75: 1500, p80: 1620, volatility: 'medium' },
    ],
    byClassificationModel: [
      {
        classification: 'bugfix',
        model: 'claude-sonnet-4',
        count: 6,
        median: 150,
        p25: 90,
        p75: 260,
        p80: 286,
        volatility: 'medium',
      },
    ],
    byClassificationPhase: [],
    byClassificationModelPhase: [],
  };

  it('uses classification-specific stats when available', () => {
    const est = estimateTask(stats, 'bugfix', 3);
    // v2 shrinkage estimator uses calibration levels, not hardcoded confidence
    assert.ok(est.confidence >= 50); // 'project' calibration = 75
    assert.ok(est.basis.includes('bugfix'));
    assert.ok(est.low > 0);
    assert.ok(est.high > est.low);
  });

  it('falls back to overall stats for unknown classification', () => {
    const est = estimateTask(stats, 'docs', 3);
    assert.ok(est.confidence >= 50); // 'project' or 'warming' calibration
    assert.ok(est.basis.includes('no docs-specific data'));
  });

  it('uses model-specific local stats when the model bucket has enough data', () => {
    const clsOnly = estimateTask(stats, 'bugfix', 3);
    const est = estimateTask(stats, 'bugfix', 3, { model: 'claude-sonnet-4-20250514' });
    assert.ok(est.basis.includes('claude-sonnet-4'));
    assert.ok(est.median < clsOnly.median);
  });

  it('shifts estimate up for high complexity', () => {
    const low = estimateTask(stats, 'bugfix', 1);
    const high = estimateTask(stats, 'bugfix', 5);
    assert.ok(high.median > low.median);
    assert.ok(high.high > low.high);
  });

  it('never returns negative low', () => {
    const est = estimateTask(stats, 'bugfix', 1);
    assert.ok(est.low >= 1);
  });
});

describe('formatStatsContext', () => {
  it('produces readable context string', () => {
    const stats = {
      totalCompleted: 20,
      overall: { median: 480, p25: 120, p75: 900, p80: 984 },
      byClassification: [
        { classification: 'bugfix', count: 8, median: 300, p25: 120, p75: 600, p80: 660, volatility: 'medium' },
        { classification: 'feature', count: 5, median: 900, p25: 600, p75: 1500, p80: 1620, volatility: 'medium' },
      ],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const ctx = formatStatsContext(stats);
    assert.ok(ctx.includes('[claude-eta]'));
    assert.ok(ctx.includes('20 completed tasks'));
    assert.ok(ctx.includes('bugfix'));
    assert.ok(ctx.includes('feature'));
    assert.ok(ctx.includes('calibrate'));
  });

  it('includes task estimate when provided', () => {
    const stats = {
      totalCompleted: 20,
      overall: { median: 480, p25: 120, p75: 900, p80: 984 },
      byClassification: [],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const estimate = {
      low: 120,
      high: 600,
      median: 300,
      confidence: 80,
      basis: '10 similar bugfix tasks',
      volatility: 'medium',
      complexity: 3,
    };
    const ctx = formatStatsContext(stats, estimate);
    assert.ok(ctx.includes('Current task estimate'));
    assert.ok(ctx.includes('80%'));
    assert.ok(ctx.includes('10 similar bugfix tasks'));
  });

  it('notes high volatility in estimate', () => {
    const stats = {
      totalCompleted: 20,
      overall: { median: 480, p25: 120, p75: 900, p80: 984 },
      byClassification: [],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    const estimate = {
      low: 60,
      high: 1200,
      median: 300,
      confidence: 80,
      basis: '5 similar debug tasks',
      volatility: 'high',
      complexity: 3,
    };
    const ctx = formatStatsContext(stats, estimate);
    assert.ok(ctx.includes('high volatility'));
  });
});
