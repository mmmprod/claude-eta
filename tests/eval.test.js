import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTasks, formatEvaluationReport } from '../dist/eval.js';

function makeTask(index, overrides = {}) {
  const duration = overrides.duration_seconds ?? 120;
  return {
    analytics_id: `task-${index}`,
    work_item_id: `wi-${index}`,
    session_id: 'sess-1',
    project: 'eval-project',
    timestamp_start: `2026-03-21T10:${String(index).padStart(2, '0')}:00.000Z`,
    timestamp_end: `2026-03-21T10:${String(index).padStart(2, '0')}:30.000Z`,
    duration_seconds: duration,
    prompt_summary: 'fix the same class of bug',
    prompt_complexity: 3,
    classification: 'bugfix',
    tool_calls: 4,
    files_read: 2,
    files_edited: 1,
    files_created: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    first_edit_offset_seconds: Math.max(1, duration - 90),
    first_bash_offset_seconds: Math.max(1, duration - 30),
    runner_kind: 'main',
    source_turn_count: 1,
    ...overrides,
  };
}

describe('evaluateTasks', () => {
  it('computes walk-forward overall and breakdown metrics', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => makeTask(index + 1, { duration_seconds: 120 + index * 30 }));

    const report = evaluateTasks(tasks);

    assert.equal(report.total_tasks, 10);
    assert.equal(report.overall.prompt.sample_count, 5);
    assert.equal(report.overall.first_edit.sample_count, 5);
    assert.equal(report.overall.first_bash.sample_count, 5);
    assert.ok(report.overall.first_edit.mdape_pct < report.overall.prompt.mdape_pct);
    assert.ok(report.overall.first_bash.mdape_pct <= report.overall.first_edit.mdape_pct);

    const bugfix = report.byClassification.find((row) => row.key === 'bugfix');
    assert.ok(bugfix);
    assert.equal(bugfix.sample_count, 5);

    const model = report.byClassificationModel.find((row) => row.key === 'bugfix on claude-sonnet-4');
    assert.ok(model);
    assert.equal(model.sample_count, 5);
  });

  it('renders a readable report', () => {
    const report = evaluateTasks(
      Array.from({ length: 10 }, (_, index) => makeTask(index + 1, { duration_seconds: 120 + index * 30 })),
    );
    const output = formatEvaluationReport(report);
    assert.match(output, /Predictor Evaluation/);
    assert.match(output, /Walk-forward replay/);
    assert.match(output, /By Classification/);
  });
});
