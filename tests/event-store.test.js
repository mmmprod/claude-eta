import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let TEST_DATA_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-eventstore-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

// Dynamic import to pick up fresh env each time
async function loadModule() {
  // Force fresh import by adding cache-busting query
  const ts = Date.now() + Math.random();
  return await import(`../dist/event-store.js?t=${ts}`);
}

function makeActiveTurn(overrides = {}) {
  const now = Date.now();
  return {
    turn_id: 'turn-' + Math.random().toString(36).slice(2),
    work_item_id: 'work-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'abcdef1234567890',
    project_display_name: 'test-project',
    classification: 'other',
    prompt_summary: 'test task',
    prompt_complexity: 2,
    started_at: new Date(now).toISOString(),
    started_at_ms: now,
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
    model: 'test-model',
    source: null,
    status: 'active',
    path_fps: [],
    ...overrides,
  };
}

function makeSessionMeta(overrides = {}) {
  return {
    session_id: 'sess-1',
    project_fp: 'abcdef1234567890',
    project_display_name: 'test-project',
    cwd_realpath: '/tmp/test',
    model: 'test-model',
    source: null,
    session_agent_type: null,
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Session management ───────────────────────────────────────

describe('upsertSession / getSession', () => {
  it('creates and reads session metadata', async () => {
    const { upsertSession, getSession } = await loadModule();
    const meta = makeSessionMeta();
    upsertSession(meta);
    const loaded = getSession(meta.project_fp, meta.session_id);
    assert.deepEqual(loaded, meta);
  });

  it('returns null for missing session', async () => {
    const { getSession } = await loadModule();
    assert.equal(getSession('nonexistent', 'sess-x'), null);
  });

  it('updates session on second upsert', async () => {
    const { upsertSession, getSession } = await loadModule();
    const meta = makeSessionMeta();
    upsertSession(meta);
    const updated = { ...meta, last_seen_at: new Date().toISOString(), model: 'new-model' };
    upsertSession(updated);
    const loaded = getSession(meta.project_fp, meta.session_id);
    assert.equal(loaded.model, 'new-model');
  });
});

// ── Active turn lifecycle ────────────────────────────────────

describe('startTurn / getActiveTurn / setActiveTurn', () => {
  it('starts a turn and reads it back', async () => {
    const { startTurn, getActiveTurn } = await loadModule();
    const state = makeActiveTurn();
    startTurn(state);
    const loaded = getActiveTurn(state.project_fp, state.session_id, state.agent_key);
    assert.equal(loaded.turn_id, state.turn_id);
    assert.equal(loaded.session_id, state.session_id);
  });

  it('returns null when no active turn', async () => {
    const { getActiveTurn } = await loadModule();
    assert.equal(getActiveTurn('fp', 'sess', 'main'), null);
  });

  it('overwrites on setActiveTurn', async () => {
    const { startTurn, setActiveTurn, getActiveTurn } = await loadModule();
    const state = makeActiveTurn();
    startTurn(state);
    state.tool_calls = 42;
    setActiveTurn(state);
    const loaded = getActiveTurn(state.project_fp, state.session_id, state.agent_key);
    assert.equal(loaded.tool_calls, 42);
  });

  it('creates turn_started event on startTurn', async () => {
    const { startTurn } = await loadModule();
    const { getEventLogPath } = await import('../dist/paths.js');
    const state = makeActiveTurn();
    startTurn(state);
    const logPath = getEventLogPath(state.project_fp, state.session_id, state.agent_key);
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    const event = JSON.parse(content);
    assert.equal(event.event, 'turn_started');
    assert.equal(event.seq, 0);
  });
});

// ── Event logging ────────────────────────────────────────────

describe('appendEvent', () => {
  it('appends events to JSONL file', async () => {
    const { startTurn, appendEvent } = await loadModule();
    const { getEventLogPath } = await import('../dist/paths.js');
    const state = makeActiveTurn();
    startTurn(state);

    appendEvent(state.project_fp, state.session_id, state.agent_key, {
      seq: 1,
      ts: new Date().toISOString(),
      ts_ms: Date.now(),
      event: 'tool_ok',
      tool_name: 'Read',
    });

    appendEvent(state.project_fp, state.session_id, state.agent_key, {
      seq: 2,
      ts: new Date().toISOString(),
      ts_ms: Date.now(),
      event: 'tool_ok',
      tool_name: 'Edit',
    });

    const logPath = getEventLogPath(state.project_fp, state.session_id, state.agent_key);
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 3); // turn_started + 2 tool events
    assert.equal(JSON.parse(lines[1]).tool_name, 'Read');
    assert.equal(JSON.parse(lines[2]).tool_name, 'Edit');
  });
});

// ── Turn completion ──────────────────────────────────────────

describe('closeTurn', () => {
  it('computes wall_seconds and writes completed JSONL', async () => {
    const { startTurn, closeTurn } = await loadModule();
    const { getCompletedLogPath, getActiveTurnPath } = await import('../dist/paths.js');

    const startMs = Date.now() - 5000; // 5 seconds ago
    const state = makeActiveTurn({ started_at_ms: startMs, started_at: new Date(startMs).toISOString() });
    startTurn(state);

    const completed = closeTurn(state.project_fp, state.session_id, state.agent_key, 'stop');
    assert.ok(completed);
    assert.ok(completed.wall_seconds >= 4); // at least 4s given timing
    assert.equal(completed.stop_reason, 'stop');

    // Active file should be gone
    assert.equal(fs.existsSync(getActiveTurnPath(state.project_fp, state.session_id, state.agent_key)), false);

    // Completed JSONL should exist
    const logPath = getCompletedLogPath(state.project_fp, state.session_id, state.agent_key);
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    const parsed = JSON.parse(content);
    assert.equal(parsed.turn_id, state.turn_id);
  });

  it('returns null if no active turn', async () => {
    const { closeTurn } = await loadModule();
    assert.equal(closeTurn('fp', 'sess', 'main', 'stop'), null);
  });

  it('computes active_seconds from last_event_at_ms', async () => {
    const { startTurn, setActiveTurn, closeTurn } = await loadModule();

    const startMs = Date.now() - 10000; // 10 seconds ago
    const state = makeActiveTurn({
      started_at_ms: startMs,
      started_at: new Date(startMs).toISOString(),
      tool_calls: 5,
      last_event_at_ms: startMs + 3000, // last event 3s after start
    });
    startTurn(state);
    // Update with last_event_at_ms set
    setActiveTurn(state);

    const completed = closeTurn(state.project_fp, state.session_id, state.agent_key, 'stop');
    assert.ok(completed);
    assert.equal(completed.active_seconds, 3);
    assert.ok(completed.wait_seconds >= 7);
  });
});

// ── closeAllSessionTurns ─────────────────────────────────────

describe('closeAllSessionTurns', () => {
  it('closes all active turns for a session', async () => {
    const { startTurn, closeAllSessionTurns, getActiveTurn } = await loadModule();

    const fp = 'testfp1234567890';
    const sid = 'sess-multi';

    // Start main + subagent turns
    startTurn(makeActiveTurn({ project_fp: fp, session_id: sid, agent_key: 'main' }));
    startTurn(makeActiveTurn({ project_fp: fp, session_id: sid, agent_key: 'agent-1' }));
    startTurn(makeActiveTurn({ project_fp: fp, session_id: sid, agent_key: 'agent-2' }));

    const results = closeAllSessionTurns(fp, sid, 'session_end');
    assert.equal(results.length, 3);

    // All active turns should be gone
    assert.equal(getActiveTurn(fp, sid, 'main'), null);
    assert.equal(getActiveTurn(fp, sid, 'agent-1'), null);
    assert.equal(getActiveTurn(fp, sid, 'agent-2'), null);
  });

  it('does not touch other sessions', async () => {
    const { startTurn, closeAllSessionTurns, getActiveTurn } = await loadModule();

    const fp = 'testfp1234567890';
    startTurn(makeActiveTurn({ project_fp: fp, session_id: 'sess-a', agent_key: 'main' }));
    startTurn(makeActiveTurn({ project_fp: fp, session_id: 'sess-b', agent_key: 'main' }));

    closeAllSessionTurns(fp, 'sess-a', 'session_end');

    assert.equal(getActiveTurn(fp, 'sess-a', 'main'), null);
    assert.ok(getActiveTurn(fp, 'sess-b', 'main') !== null);
  });
});

// ── Concurrent sessions ──────────────────────────────────────

describe('concurrent session isolation', () => {
  it('two sessions with different tool counts do not corrupt each other', async () => {
    const { startTurn, setActiveTurn, getActiveTurn, closeTurn } = await loadModule();

    const fp = 'concurrentfp12345';
    const stateA = makeActiveTurn({ project_fp: fp, session_id: 'sess-a', agent_key: 'main' });
    const stateB = makeActiveTurn({ project_fp: fp, session_id: 'sess-b', agent_key: 'main' });

    startTurn(stateA);
    startTurn(stateB);

    // Increment session A
    stateA.tool_calls = 10;
    stateA.files_read = 5;
    setActiveTurn(stateA);

    // Increment session B differently
    stateB.tool_calls = 3;
    stateB.errors = 2;
    setActiveTurn(stateB);

    // Read back — should not be mixed
    const loadedA = getActiveTurn(fp, 'sess-a', 'main');
    const loadedB = getActiveTurn(fp, 'sess-b', 'main');

    assert.equal(loadedA.tool_calls, 10);
    assert.equal(loadedA.files_read, 5);
    assert.equal(loadedA.errors, 0);

    assert.equal(loadedB.tool_calls, 3);
    assert.equal(loadedB.errors, 2);
    assert.equal(loadedB.files_read, 0);

    // Close one, other remains
    closeTurn(fp, 'sess-a', 'main', 'stop');
    assert.equal(getActiveTurn(fp, 'sess-a', 'main'), null);
    assert.ok(getActiveTurn(fp, 'sess-b', 'main') !== null);
  });

  it('main and subagent in same session are isolated', async () => {
    const { startTurn, setActiveTurn, getActiveTurn } = await loadModule();

    const fp = 'subagentfp1234567';
    const sid = 'sess-sub';

    const mainState = makeActiveTurn({ project_fp: fp, session_id: sid, agent_key: 'main' });
    const subState = makeActiveTurn({
      project_fp: fp,
      session_id: sid,
      agent_key: 'agent-abc',
      agent_id: 'agent-abc',
      runner_kind: 'subagent',
    });

    startTurn(mainState);
    startTurn(subState);

    mainState.tool_calls = 20;
    setActiveTurn(mainState);

    subState.tool_calls = 5;
    setActiveTurn(subState);

    const loadedMain = getActiveTurn(fp, sid, 'main');
    const loadedSub = getActiveTurn(fp, sid, 'agent-abc');

    assert.equal(loadedMain.tool_calls, 20);
    assert.equal(loadedSub.tool_calls, 5);
  });
});

// ── Loading completed turns ──────────────────────────────────

describe('loadCompletedTurns / loadRecentCompletedTurns', () => {
  it('loads all completed turns from JSONL files', async () => {
    const { startTurn, closeTurn, loadCompletedTurns } = await loadModule();

    const fp = 'loadfp12345678901';
    for (let i = 0; i < 3; i++) {
      const state = makeActiveTurn({
        project_fp: fp,
        session_id: `sess-${i}`,
        agent_key: 'main',
        started_at_ms: Date.now() - 1000,
      });
      startTurn(state);
      closeTurn(fp, `sess-${i}`, 'main', 'stop');
    }

    const turns = loadCompletedTurns(fp);
    assert.equal(turns.length, 3);
  });

  it('returns empty array for missing project', async () => {
    const { loadCompletedTurns } = await loadModule();
    assert.deepEqual(loadCompletedTurns('nonexistent'), []);
  });

  it('loadRecentCompletedTurns returns limited results', async () => {
    const { startTurn, closeTurn, loadRecentCompletedTurns } = await loadModule();

    const fp = 'recentfp123456789';
    for (let i = 0; i < 5; i++) {
      const state = makeActiveTurn({
        project_fp: fp,
        session_id: `sess-${i}`,
        agent_key: 'main',
        started_at_ms: Date.now() - 1000,
      });
      startTurn(state);
      closeTurn(fp, `sess-${i}`, 'main', 'stop');
    }

    const recent = loadRecentCompletedTurns(fp, 2);
    assert.equal(recent.length, 2);
  });
});
