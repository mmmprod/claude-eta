import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let TEST_DATA_DIR;
let TRANSCRIPT_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-transcript-data-'));
  TRANSCRIPT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-transcript-source-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TRANSCRIPT_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

async function loadModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/transcript-metrics.js?t=${ts}`);
}

function writeTranscript(sessionId, lines) {
  const transcriptPath = path.join(TRANSCRIPT_DIR, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  return transcriptPath;
}

function makeCompletedTurn(overrides = {}) {
  return {
    turn_id: 'turn-1',
    work_item_id: 'wi-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'proj-fp-1',
    project_display_name: 'transcript-project',
    classification: 'feature',
    prompt_summary: '/batch',
    prompt_complexity: 3,
    started_at: '2026-03-24T10:00:00.000Z',
    ended_at: '2026-03-24T10:00:15.000Z',
    wall_seconds: 15,
    first_edit_offset_seconds: null,
    first_bash_offset_seconds: null,
    span_until_last_event_seconds: 12,
    tail_after_last_event_seconds: 3,
    active_seconds: 12,
    wait_seconds: 3,
    tool_calls: 1,
    files_read: 1,
    files_edited: 0,
    files_created: 0,
    unique_files: 1,
    bash_calls: 0,
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

describe('transcript metrics', () => {
  it('summarizes turn duration, tool time, and thinking time from a transcript', async () => {
    const { loadTranscriptTurnSummaries } = await loadModule();
    const sessionId = 'sess-transcript-1';
    const transcriptPath = writeTranscript(sessionId, [
      {
        type: 'user',
        isMeta: false,
        promptId: 'prompt-1',
        timestamp: '2026-03-24T10:00:00.000Z',
        message: { role: 'user', content: 'implement the batch workflow' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:06.000Z',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }] },
      },
      {
        type: 'user',
        promptId: 'prompt-1',
        timestamp: '2026-03-24T10:00:10.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'src/index.ts' }],
        },
        toolUseResult: { durationMs: 4000, numFiles: 1, truncated: false },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:12.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:13.000Z',
        durationMs: 13000,
      },
    ]);

    const turns = loadTranscriptTurnSummaries('proj-fp-1', sessionId, transcriptPath);

    assert.equal(turns.length, 1);
    assert.equal(turns[0].duration_seconds, 13);
    assert.equal(turns[0].duration_source, 'turn_duration');
    assert.equal(turns[0].prompt_to_first_assistant_seconds, 5);
    assert.equal(turns[0].tool_seconds, 4);
    assert.equal(turns[0].thinking_seconds, 5);
  });

  it('does not double count consecutive thinking frames in the same prompt turn', async () => {
    const { loadTranscriptTurnSummaries } = await loadModule();
    const sessionId = 'sess-transcript-thinking';
    const transcriptPath = writeTranscript(sessionId, [
      {
        type: 'user',
        isMeta: false,
        timestamp: '2026-03-24T10:00:00.000Z',
        message: { role: 'user', content: 'inspect the failing parser' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-a' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:07.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-b' }] },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:08.000Z',
        message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: {} }] },
      },
      {
        type: 'user',
        timestamp: '2026-03-24T10:00:10.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'src/parser.ts' }],
        },
        toolUseResult: { durationMs: 2000, numFiles: 1, truncated: false },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:12.000Z',
        durationMs: 12000,
      },
    ]);

    const turns = loadTranscriptTurnSummaries('proj-fp-1', sessionId, transcriptPath);

    assert.equal(turns.length, 1);
    assert.equal(turns[0].thinking_seconds, 7);
    assert.equal(turns[0].tool_seconds, 2);
  });

  it('enriches completed turns with transcript-derived metrics', async () => {
    const { enrichCompletedTurnsWithTranscriptMetrics } = await loadModule();
    const sessionId = 'sess-transcript-2';
    const transcriptPath = writeTranscript(sessionId, [
      {
        type: 'user',
        isMeta: false,
        promptId: 'prompt-2',
        timestamp: '2026-03-24T10:00:00.000Z',
        message: { role: 'user', content: '/batch implement' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:03.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:09.000Z',
        durationMs: 9000,
      },
    ]);

    const turns = [
      makeCompletedTurn({
        session_id: sessionId,
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:00:12.000Z',
        wall_seconds: 12,
        transcript_path: transcriptPath,
      }),
    ];

    enrichCompletedTurnsWithTranscriptMetrics('proj-fp-1', turns);

    assert.equal(turns[0].transcript_path, transcriptPath);
    assert.equal(turns[0].transcript_duration_seconds, 9);
    assert.equal(turns[0].transcript_duration_source, 'turn_duration');
    assert.equal(turns[0].transcript_prompt_to_first_assistant_seconds, 3);
    assert.equal(turns[0].transcript_thinking_seconds, 3);
  });

  it('aggregates multiple transcript prompt turns inside the same completed turn window', async () => {
    const { enrichCompletedTurnsWithTranscriptMetrics } = await loadModule();
    const sessionId = 'sess-transcript-aggregate';
    const transcriptPath = writeTranscript(sessionId, [
      {
        type: 'user',
        isMeta: false,
        timestamp: '2026-03-24T10:00:00.000Z',
        message: { role: 'user', content: 'start the batch flow' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:02.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-1' }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:04.000Z',
        durationMs: 4000,
      },
      {
        type: 'user',
        isMeta: false,
        timestamp: '2026-03-24T10:00:08.000Z',
        message: { role: 'user', content: 'continue with the same task' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:10.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-2' }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:14.000Z',
        durationMs: 6000,
      },
      {
        type: 'user',
        isMeta: false,
        timestamp: '2026-03-24T10:00:30.000Z',
        message: { role: 'user', content: 'start a new task' },
      },
      {
        type: 'assistant',
        timestamp: '2026-03-24T10:00:31.000Z',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-3' }] },
      },
      {
        type: 'system',
        subtype: 'turn_duration',
        timestamp: '2026-03-24T10:00:35.000Z',
        durationMs: 5000,
      },
    ]);

    const turns = [
      makeCompletedTurn({
        turn_id: 'turn-agg',
        work_item_id: 'wi-agg',
        session_id: sessionId,
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:00:20.000Z',
        wall_seconds: 20,
        transcript_path: transcriptPath,
      }),
      makeCompletedTurn({
        turn_id: 'turn-next',
        work_item_id: 'wi-next',
        session_id: sessionId,
        started_at: '2026-03-24T10:00:30.000Z',
        ended_at: '2026-03-24T10:00:36.000Z',
        wall_seconds: 6,
        transcript_path: transcriptPath,
      }),
    ];

    enrichCompletedTurnsWithTranscriptMetrics('proj-fp-1', turns);

    assert.equal(turns[0].transcript_duration_seconds, 10);
    assert.equal(turns[0].transcript_duration_source, 'turn_duration');
    assert.equal(turns[0].transcript_prompt_to_first_assistant_seconds, 2);
    assert.equal(turns[0].transcript_thinking_seconds, 4);
    assert.equal(turns[1].transcript_duration_seconds, 5);
    assert.equal(turns[1].transcript_prompt_to_first_assistant_seconds, 1);
  });
});
