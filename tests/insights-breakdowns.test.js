import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileOperationRatios, perModelComparison, efficiencyScoring } from '../dist/insights/breakdowns.js';

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
    model: 'test-model',
    ...overrides,
  };
}

// ── fileOperationRatios ──────────────────────────────────────

describe('fileOperationRatios', () => {
  it('returns null with fewer than 5 tasks', () => {
    const tasks = Array.from({ length: 3 }, () => makeTask());
    assert.equal(fileOperationRatios(tasks), null);
  });

  it('returns null when all file ops are zero', () => {
    const tasks = Array.from({ length: 6 }, () => makeTask({ files_read: 0, files_edited: 0, files_created: 0 }));
    assert.equal(fileOperationRatios(tasks), null);
  });

  it('computes ratios correctly', () => {
    const tasks = Array.from({ length: 6 }, () =>
      makeTask({
        classification: 'bugfix',
        files_read: 10,
        files_edited: 2,
        files_created: 0,
      }),
    );
    const result = fileOperationRatios(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'file-ops');
    assert.equal(result.byClassification.length, 1);
    assert.equal(result.byClassification[0].avgReads, 10);
    assert.equal(result.byClassification[0].avgEdits, 2);
    assert.equal(result.byClassification[0].explorationIndex, 5); // 10 / max(2, 1) = 5
  });

  it('caps exploration index at 10', () => {
    const tasks = Array.from({ length: 5 }, () =>
      makeTask({
        classification: 'review',
        files_read: 100,
        files_edited: 0,
        files_created: 0,
      }),
    );
    const result = fileOperationRatios(tasks);
    assert.ok(result);
    assert.ok(result.byClassification[0].explorationIndex <= 10);
  });

  it('skips classifications with fewer than 5 tasks', () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => makeTask({ classification: 'bugfix' })),
      ...Array.from({ length: 2 }, () => makeTask({ classification: 'feature' })),
    ];
    const result = fileOperationRatios(tasks);
    assert.ok(result);
    assert.equal(result.byClassification.length, 1);
    assert.equal(result.byClassification[0].classification, 'bugfix');
  });
});

// ── perModelComparison ───────────────────────────────────────

describe('perModelComparison', () => {
  it('returns null with fewer than 10 tasks', () => {
    const tasks = Array.from({ length: 5 }, () => makeTask());
    assert.equal(perModelComparison(tasks), null);
  });

  it('returns null with single model', () => {
    const tasks = Array.from({ length: 12 }, () => makeTask({ model: 'claude-sonnet-4' }));
    assert.equal(perModelComparison(tasks), null);
  });

  it('normalizes model names (strips date suffix)', () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-sonnet-4-20250514', duration_seconds: 50 })),
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-opus-4-20250514', duration_seconds: 100 })),
    ];
    const result = perModelComparison(tasks);
    assert.ok(result);
    assert.ok(result.byModel.some((m) => m.model === 'claude-sonnet-4'));
    assert.ok(result.byModel.some((m) => m.model === 'claude-opus-4'));
    assert.ok(!result.byModel.some((m) => m.model.includes('20250514')));
  });

  it('identifies fastest model', () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-haiku-4-5', duration_seconds: 30 })),
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-opus-4', duration_seconds: 300 })),
    ];
    const result = perModelComparison(tasks);
    assert.ok(result);
    assert.equal(result.fastestModel, 'claude-haiku-4-5');
  });

  it('skips tasks with empty model', () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-sonnet-4-5', duration_seconds: 50 })),
      ...Array.from({ length: 6 }, () => makeTask({ model: 'claude-opus-4', duration_seconds: 100 })),
      makeTask({ model: '', duration_seconds: 200 }),
    ];
    const result = perModelComparison(tasks);
    assert.ok(result);
    assert.equal(result.sampleSize, 12);
  });
});

// ── efficiencyScoring ────────────────────────────────────────

describe('efficiencyScoring', () => {
  it('returns null with fewer than 5 tasks with tool_calls > 0', () => {
    const tasks = Array.from({ length: 3 }, () => makeTask({ tool_calls: 1 }));
    assert.equal(efficiencyScoring(tasks), null);
  });

  it('ignores tasks with tool_calls === 0', () => {
    const tasks = [...Array.from({ length: 4 }, () => makeTask({ tool_calls: 5 })), makeTask({ tool_calls: 0 })];
    assert.equal(efficiencyScoring(tasks), null);
  });

  it('computes secs/tool and tools/file correctly', () => {
    const tasks = Array.from({ length: 6 }, () =>
      makeTask({
        classification: 'bugfix',
        duration_seconds: 100,
        tool_calls: 10,
        files_read: 3,
        files_edited: 2,
        files_created: 0,
      }),
    );
    const result = efficiencyScoring(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'efficiency');
    assert.equal(result.byClassification.length, 1);
    // 100 / 10 = 10 secs/tool
    assert.equal(result.byClassification[0].medianSecsPerTool, 10);
    // 10 / max(3+2+0, 1) = 2 tools/file
    assert.equal(result.byClassification[0].medianToolsPerFile, 2);
  });
});
