import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionFatigue,
  timeOfDayPatterns,
  weeklyTrends,
} from '../dist/insights/temporal.js';

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

// ── sessionFatigue ───────────────────────────────────────────

describe('sessionFatigue', () => {
  it('returns null with fewer than 3 qualified sessions', () => {
    // Only 2 sessions with 3+ tasks
    const tasks = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeTask({
          session_id: 'sess-1',
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeTask({
          session_id: 'sess-2',
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        }),
      ),
    ];
    assert.equal(sessionFatigue(tasks), null);
  });

  it('ignores sessions with fewer than 3 tasks', () => {
    const tasks = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeTask({
          session_id: 'sess-1',
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeTask({
          session_id: 'sess-2',
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        }),
      ),
      // Session with only 1 task — should be ignored
      makeTask({ session_id: 'sess-short' }),
      ...Array.from({ length: 3 }, (_, i) =>
        makeTask({
          session_id: 'sess-3',
          timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
        }),
      ),
    ];
    const result = sessionFatigue(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'session-fatigue');
  });

  it('detects increasing fatigue', () => {
    const sessions = ['sess-a', 'sess-b', 'sess-c'];
    const tasks = [];
    for (const sid of sessions) {
      for (let i = 0; i < 4; i++) {
        tasks.push(
          makeTask({
            session_id: sid,
            timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
            duration_seconds: 50 + i * 40, // 50, 90, 130, 170
          }),
        );
      }
    }
    const result = sessionFatigue(tasks);
    assert.ok(result);
    assert.ok(result.fatigueRatio > 1); // Later tasks are longer
  });

  it('groups position 5+ together', () => {
    const tasks = [];
    for (const sid of ['sess-1', 'sess-2', 'sess-3']) {
      for (let i = 0; i < 7; i++) {
        tasks.push(
          makeTask({
            session_id: sid,
            timestamp_start: new Date(Date.now() + i * 60000).toISOString(),
            duration_seconds: 60,
          }),
        );
      }
    }
    const result = sessionFatigue(tasks);
    assert.ok(result);
    // Should have positions 1-5 (5 being "5+")
    const positions = result.avgByPosition.map((p) => p.position);
    assert.ok(positions.includes(5));
    assert.ok(!positions.includes(6));
    assert.ok(!positions.includes(7));
  });
});

// ── timeOfDayPatterns ────────────────────────────────────────

describe('timeOfDayPatterns', () => {
  it('returns null with fewer than 15 tasks', () => {
    const tasks = Array.from({ length: 10 }, () => makeTask());
    assert.equal(timeOfDayPatterns(tasks), null);
  });

  it('returns null with only one time bucket', () => {
    // All at 10am (morning only)
    const tasks = Array.from({ length: 20 }, () =>
      makeTask({
        timestamp_start: '2025-01-15T10:00:00.000Z',
      }),
    );
    assert.equal(timeOfDayPatterns(tasks), null);
  });

  it('assigns correct periods', () => {
    const tasks = [
      ...Array.from({ length: 8 }, () =>
        makeTask({
          timestamp_start: '2025-01-15T08:00:00.000Z', // morning
          duration_seconds: 50,
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        makeTask({
          timestamp_start: '2025-01-15T14:00:00.000Z', // afternoon
          duration_seconds: 100,
        }),
      ),
    ];
    const result = timeOfDayPatterns(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'time-of-day');
    assert.equal(result.fastestPeriod, 'morning');
    assert.ok(result.byPeriod.length >= 2);
  });

  it('identifies fastest period correctly', () => {
    const tasks = [
      ...Array.from({ length: 8 }, () =>
        makeTask({
          timestamp_start: '2025-01-15T20:00:00.000Z', // evening
          duration_seconds: 30,
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        makeTask({
          timestamp_start: '2025-01-15T09:00:00.000Z', // morning
          duration_seconds: 120,
        }),
      ),
    ];
    const result = timeOfDayPatterns(tasks);
    assert.ok(result);
    assert.equal(result.fastestPeriod, 'evening');
  });
});

// ── weeklyTrends ─────────────────────────────────────────────

describe('weeklyTrends', () => {
  it('returns null with fewer than 4 distinct weeks', () => {
    // All in same week
    const tasks = Array.from({ length: 10 }, () =>
      makeTask({
        timestamp_start: '2025-01-15T12:00:00.000Z',
      }),
    );
    assert.equal(weeklyTrends(tasks), null);
  });

  it('detects improving trend', () => {
    const tasks = [];
    // Week 1-2: slow (200s median), Week 3-4: fast (50s median)
    for (let week = 0; week < 4; week++) {
      const dur = week < 2 ? 200 : 50;
      for (let j = 0; j < 3; j++) {
        const day = 6 + week * 7 + j; // spread across Jan
        tasks.push(
          makeTask({
            timestamp_start: `2025-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
            duration_seconds: dur,
          }),
        );
      }
    }
    const result = weeklyTrends(tasks);
    assert.ok(result);
    assert.equal(result.kind, 'trends');
    assert.equal(result.direction, 'improving');
    assert.ok(result.changeRate < -10);
  });

  it('detects degrading trend', () => {
    const tasks = [];
    // Week 1-2: fast, Week 3-4: slow
    for (let week = 0; week < 4; week++) {
      const dur = week < 2 ? 50 : 200;
      for (let j = 0; j < 3; j++) {
        const day = 6 + week * 7 + j;
        tasks.push(
          makeTask({
            timestamp_start: `2025-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
            duration_seconds: dur,
          }),
        );
      }
    }
    const result = weeklyTrends(tasks);
    assert.ok(result);
    assert.equal(result.direction, 'degrading');
    assert.ok(result.changeRate > 10);
  });

  it('detects stable trend', () => {
    const tasks = [];
    for (let week = 0; week < 4; week++) {
      for (let j = 0; j < 3; j++) {
        const day = 6 + week * 7 + j;
        tasks.push(
          makeTask({
            timestamp_start: `2025-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
            duration_seconds: 100, // same every week
          }),
        );
      }
    }
    const result = weeklyTrends(tasks);
    assert.ok(result);
    assert.equal(result.direction, 'stable');
  });

  it('includes partial weeks', () => {
    const tasks = [];
    for (let week = 0; week < 5; week++) {
      const count = week === 4 ? 1 : 3; // Last week has only 1 task
      for (let j = 0; j < count; j++) {
        const day = 6 + week * 7 + j;
        tasks.push(
          makeTask({
            timestamp_start: `2025-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
            duration_seconds: 100,
          }),
        );
      }
    }
    const result = weeklyTrends(tasks);
    assert.ok(result);
    assert.equal(result.weeks.length, 5);
  });
});
