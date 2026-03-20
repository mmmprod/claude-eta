import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllInsights } from '../dist/insights/index.js';
import { formatInsightsReport } from '../dist/insights/format.js';

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

describe('computeAllInsights', () => {
  it('returns empty array with no tasks', () => {
    const results = computeAllInsights([]);
    assert.deepEqual(results, []);
  });

  it('returns empty array with insufficient data', () => {
    const tasks = Array.from({ length: 3 }, () => makeTask());
    const results = computeAllInsights(tasks);
    assert.deepEqual(results, []);
  });

  it('returns insights when data is sufficient', () => {
    // Build a rich dataset
    const tasks = [];
    const sessions = ['sess-a', 'sess-b', 'sess-c', 'sess-d'];
    const types = ['bugfix', 'feature', 'bugfix', 'config'];
    let taskIndex = 0;

    for (let week = 0; week < 5; week++) {
      for (const sid of sessions) {
        for (let i = 0; i < 4; i++) {
          const cls = types[i % types.length];
          const day = 6 + week * 7 + (taskIndex % 5);
          const hour = 8 + (taskIndex % 12);
          tasks.push(
            makeTask({
              session_id: `${sid}-w${week}`,
              classification: cls,
              timestamp_start: `2025-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`,
              duration_seconds: 30 + taskIndex * 5,
              tool_calls: 3 + (taskIndex % 10),
              errors: taskIndex % 5 === 0 ? 2 : 0,
              model: taskIndex % 2 === 0 ? 'model-a' : 'model-b',
              files_read: 2 + (taskIndex % 4),
              files_edited: 1 + (taskIndex % 2),
              files_created: taskIndex % 3 === 0 ? 1 : 0,
            }),
          );
          taskIndex++;
        }
      }
    }

    const results = computeAllInsights(tasks);
    assert.ok(results.length > 0);
    // Each result has a kind field
    for (const r of results) {
      assert.ok('kind' in r);
      assert.ok('sampleSize' in r);
    }
  });

  it('all results have unique kind values', () => {
    const tasks = Array.from({ length: 100 }, (_, i) =>
      makeTask({
        session_id: `sess-${i % 5}`,
        classification: ['bugfix', 'feature', 'config'][i % 3],
        timestamp_start: `2025-01-${String((i % 28) + 1).padStart(2, '0')}T${String(8 + (i % 14)).padStart(2, '0')}:00:00.000Z`,
        duration_seconds: 30 + i * 3,
        tool_calls: 3 + (i % 8),
        errors: i % 6 === 0 ? 1 : 0,
        model: i % 2 === 0 ? 'model-a' : 'model-b',
      }),
    );
    const results = computeAllInsights(tasks);
    const kinds = results.map((r) => r.kind);
    assert.equal(kinds.length, new Set(kinds).size);
  });
});

describe('formatInsightsReport', () => {
  it('returns message when no insights', () => {
    const output = formatInsightsReport([]);
    assert.ok(output.includes('Not enough data'));
  });

  it('formats error-duration insight', () => {
    const output = formatInsightsReport([
      {
        kind: 'error-duration',
        medianWithErrors: 200,
        medianWithoutErrors: 100,
        overheadPct: 100,
        tasksWithErrors: 5,
        sampleSize: 20,
      },
    ]);
    assert.ok(output.includes('Errors vs Duration'));
    assert.ok(output.includes('+100%'));
  });

  it('formats multiple insights', () => {
    const output = formatInsightsReport([
      {
        kind: 'error-duration',
        medianWithErrors: 200,
        medianWithoutErrors: 100,
        overheadPct: 100,
        tasksWithErrors: 5,
        sampleSize: 20,
      },
      {
        kind: 'time-of-day',
        byPeriod: [
          { period: 'morning', hours: '6-11', count: 10, medianDuration: 50 },
          { period: 'afternoon', hours: '12-17', count: 8, medianDuration: 80 },
        ],
        fastestPeriod: 'morning',
        sampleSize: 18,
      },
    ]);
    assert.ok(output.includes('Errors vs Duration'));
    assert.ok(output.includes('Time of Day'));
    assert.ok(output.includes('2 of 9'));
  });

  it('formats weekly trends with direction', () => {
    const output = formatInsightsReport([
      {
        kind: 'trends',
        weeks: [
          { label: '2025-W01', count: 5, medianDuration: 200, totalDuration: 1000 },
          { label: '2025-W02', count: 5, medianDuration: 180, totalDuration: 900 },
          { label: '2025-W03', count: 5, medianDuration: 100, totalDuration: 500 },
          { label: '2025-W04', count: 5, medianDuration: 80, totalDuration: 400 },
        ],
        direction: 'improving',
        changeRate: -52,
        sampleSize: 20,
      },
    ]);
    assert.ok(output.includes('Getting faster'));
    assert.ok(output.includes('-52%'));
  });
});
