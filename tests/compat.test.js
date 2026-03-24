import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { turnsToAnalyticsTasks, mainTurnsToTaskEntries } from '../dist/compat.js';

function makeTurn(overrides = {}) {
  return {
    turn_id: 'turn-' + Math.random().toString(36).slice(2),
    work_item_id: 'wi-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'fp-1',
    project_display_name: 'compat-project',
    classification: 'bugfix',
    prompt_summary: 'fix auth bug',
    prompt_complexity: 2,
    started_at: '2026-03-21T10:00:00.000Z',
    ended_at: '2026-03-21T10:00:30.000Z',
    wall_seconds: 30,
    first_edit_offset_seconds: null,
    first_bash_offset_seconds: null,
    span_until_last_event_seconds: 25,
    tail_after_last_event_seconds: 5,
    active_seconds: 25,
    wait_seconds: 5,
    tool_calls: 3,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
    bash_calls: 1,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    model: 'claude-sonnet-4',
    source: null,
    stop_reason: 'stop',
    repo_loc_bucket: null,
    repo_file_count_bucket: null,
    ...overrides,
  };
}

describe('turnsToAnalyticsTasks', () => {
  it('aggregates multiple main turns from the same work item', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-a',
        work_item_id: 'wi-123',
        classification: 'bugfix',
        prompt_summary: 'fix auth bug',
        started_at: '2026-03-21T10:00:00.000Z',
        ended_at: '2026-03-21T10:00:30.000Z',
        wall_seconds: 30,
        tool_calls: 2,
        files_read: 1,
        files_edited: 1,
      }),
      makeTurn({
        turn_id: 'turn-b',
        work_item_id: 'wi-123',
        classification: 'test',
        prompt_summary: 'add tests for the same fix',
        started_at: '2026-03-21T10:01:00.000Z',
        ended_at: '2026-03-21T10:01:45.000Z',
        wall_seconds: 45,
        tool_calls: 4,
        files_read: 2,
        files_edited: 1,
        files_created: 1,
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].analytics_id, 'wi-123');
    assert.equal(tasks[0].work_item_id, 'wi-123');
    assert.equal(tasks[0].duration_seconds, 75);
    assert.equal(tasks[0].tool_calls, 6);
    assert.equal(tasks[0].files_read, 3);
    assert.equal(tasks[0].files_edited, 2);
    assert.equal(tasks[0].files_created, 1);
    assert.equal(tasks[0].classification, 'bugfix');
    assert.equal(tasks[0].prompt_summary, 'fix auth bug');
    assert.equal(tasks[0].source_turn_count, 2);
  });

  it('prefers transcript duration when it is coherent with phase offsets', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-transcript',
        work_item_id: 'wi-transcript',
        wall_seconds: 30,
        tool_calls: 0,
        files_read: 0,
        files_edited: 0,
        files_created: 0,
        bash_calls: 0,
        span_until_last_event_seconds: 30,
        transcript_duration_seconds: 12,
        transcript_duration_source: 'turn_duration',
        transcript_prompt_to_first_assistant_seconds: 4,
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].duration_seconds, 12);
  });

  it('falls back to wall_seconds when transcript duration is shorter than observed tool span', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-transcript-short',
        work_item_id: 'wi-transcript-short',
        wall_seconds: 30,
        span_until_last_event_seconds: 25,
        transcript_duration_seconds: 12,
        transcript_duration_source: 'turn_duration',
        transcript_prompt_to_first_assistant_seconds: 3,
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].duration_seconds, 30);
  });

  it('aggregates first observed phase offsets across the whole work item', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-a',
        work_item_id: 'wi-phase',
        wall_seconds: 30,
        first_edit_offset_seconds: null,
        first_bash_offset_seconds: null,
      }),
      makeTurn({
        turn_id: 'turn-b',
        work_item_id: 'wi-phase',
        started_at: '2026-03-21T10:01:00.000Z',
        ended_at: '2026-03-21T10:01:30.000Z',
        wall_seconds: 30,
        first_edit_offset_seconds: 5,
        first_bash_offset_seconds: 20,
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].prompt_complexity, 2);
    assert.equal(tasks[0].first_edit_offset_seconds, 35);
    assert.equal(tasks[0].first_bash_offset_seconds, 50);
  });

  it('excludes single turn with replaced_by_new_prompt stop reason', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-partial',
        work_item_id: 'wi-partial',
        stop_reason: 'replaced_by_new_prompt',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 0);
  });

  it('includes single turn with stop stop reason', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-done',
        work_item_id: 'wi-done',
        stop_reason: 'stop',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].analytics_id, 'wi-done');
  });

  it('includes multi-turn group where last turn has terminal stop reason', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-a',
        work_item_id: 'wi-multi',
        started_at: '2026-03-21T10:00:00.000Z',
        ended_at: '2026-03-21T10:00:30.000Z',
        wall_seconds: 30,
        stop_reason: 'replaced_by_new_prompt',
      }),
      makeTurn({
        turn_id: 'turn-b',
        work_item_id: 'wi-multi',
        started_at: '2026-03-21T10:01:00.000Z',
        ended_at: '2026-03-21T10:01:45.000Z',
        wall_seconds: 45,
        stop_reason: 'stop',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].analytics_id, 'wi-multi');
    assert.equal(tasks[0].duration_seconds, 75);
    assert.equal(tasks[0].source_turn_count, 2);
  });

  it('excludes multi-turn group where last turn has replaced_by_new_prompt', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-a',
        work_item_id: 'wi-incomplete',
        started_at: '2026-03-21T10:00:00.000Z',
        ended_at: '2026-03-21T10:00:30.000Z',
        wall_seconds: 30,
        stop_reason: 'stop',
      }),
      makeTurn({
        turn_id: 'turn-b',
        work_item_id: 'wi-incomplete',
        started_at: '2026-03-21T10:01:00.000Z',
        ended_at: '2026-03-21T10:01:45.000Z',
        wall_seconds: 45,
        stop_reason: 'replaced_by_new_prompt',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 0);
  });

  it('excludes subagent turns from analytics tasks', () => {
    const turns = [
      makeTurn({ turn_id: 'turn-main', work_item_id: 'wi-main', runner_kind: 'main' }),
      makeTurn({
        turn_id: 'turn-sub',
        work_item_id: 'wi-sub',
        runner_kind: 'subagent',
        agent_key: 'agent-1',
        agent_id: 'agent-1',
        agent_type: 'Explore',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].analytics_id, 'wi-main');
  });

  it('reclassifies stored slash-command history previously saved as other', () => {
    const turns = [
      makeTurn({
        turn_id: 'turn-batch',
        work_item_id: 'wi-batch',
        classification: 'other',
        prompt_summary: '/batch',
      }),
      makeTurn({
        turn_id: 'turn-plan',
        work_item_id: 'wi-plan',
        classification: 'other',
        prompt_summary: '/bmad-bmm-sprint-planning',
      }),
    ];

    const tasks = turnsToAnalyticsTasks(turns);

    assert.equal(tasks.length, 2);
    assert.equal(tasks.find((task) => task.work_item_id === 'wi-batch')?.classification, 'feature');
    assert.equal(tasks.find((task) => task.work_item_id === 'wi-plan')?.classification, 'docs');
  });
});

describe('mainTurnsToTaskEntries', () => {
  it('keeps main turns only for raw turn-based exports', () => {
    const turns = [
      makeTurn({ turn_id: 'turn-main', work_item_id: 'wi-main', runner_kind: 'main' }),
      makeTurn({
        turn_id: 'turn-sub',
        work_item_id: 'wi-sub',
        runner_kind: 'subagent',
        agent_key: 'agent-1',
        agent_id: 'agent-1',
        agent_type: 'Explore',
      }),
    ];

    const tasks = mainTurnsToTaskEntries(turns);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].task_id, 'turn-main');
  });
});
