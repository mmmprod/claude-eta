import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';

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

function getEventStoreModuleUrl() {
  const ts = Date.now() + Math.random();
  return `${pathToFileURL(path.resolve('dist/event-store.js')).href}?t=${ts}`;
}

function runConcurrentCloseTurnWorkers(projectFp, sessionId, agentKey, reason) {
  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const workerPath = new URL('./helpers/event-store-close-worker.mjs', import.meta.url);
  const workerData = {
    gate,
    moduleUrl: getEventStoreModuleUrl(),
    projectFp,
    sessionId,
    agentKey,
    reason,
  };

  const runWorker = () =>
    new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, { workerData });
      let ready = false;
      let finished = false;

      worker.on('message', (message) => {
        if (message?.type === 'ready') {
          ready = true;
          resolve({ worker, waitForResult });
          return;
        }
        if (message?.type === 'error') {
          finished = true;
          reject(new Error(message.error));
          return;
        }
        if (message?.type === 'result') {
          finished = true;
          waitForResult.resolve(message.result);
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (!finished && !ready) {
          reject(new Error(`Worker exited before becoming ready (${code})`));
        } else if (!finished && code !== 0) {
          waitForResult.reject(new Error(`Worker exited with code ${code}`));
        }
      });

      const waitForResult = {};
      waitForResult.promise = new Promise((resultResolve, resultReject) => {
        waitForResult.resolve = resultResolve;
        waitForResult.reject = resultReject;
      }).finally(() => worker.terminate());
    });

  return Promise.all([runWorker(), runWorker()]).then((workers) => {
    const gateView = new Int32Array(gate);
    Atomics.store(gateView, 0, 1);
    Atomics.notify(gateView, 0, workers.length);
    return Promise.all(workers.map((entry) => entry.waitForResult.promise));
  });
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
    error_fingerprints: [],
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

  it('does not overwrite an existing turn on a second startTurn', async () => {
    const { startTurn, getActiveTurn } = await loadModule();
    const original = makeActiveTurn();
    const competing = makeActiveTurn({
      session_id: original.session_id,
      agent_key: original.agent_key,
      agent_id: original.agent_id,
      turn_id: 'turn-competing',
      work_item_id: 'turn-competing',
    });

    assert.equal(startTurn(original), true);
    assert.equal(startTurn(competing), false);

    const loaded = getActiveTurn(original.project_fp, original.session_id, original.agent_key);
    assert.equal(loaded.turn_id, original.turn_id);
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

  it('normalizes missing array fields when reading a legacy active turn', async () => {
    const { getActiveTurn } = await loadModule();
    const { getActiveTurnPath, ensureDir } = await import('../dist/paths.js');

    const state = makeActiveTurn();
    const activePath = getActiveTurnPath(state.project_fp, state.session_id, state.agent_key);
    ensureDir(path.dirname(activePath));

    const { error_fingerprints, ...legacyState } = state;
    fs.writeFileSync(activePath, JSON.stringify(legacyState), 'utf8');

    const loaded = getActiveTurn(state.project_fp, state.session_id, state.agent_key);
    assert.deepEqual(loaded.path_fps, []);
    assert.deepEqual(loaded.error_fingerprints, []);
  });

  it('persists normalized array fields on write', async () => {
    const { startTurn, getActiveTurn } = await loadModule();
    const state = makeActiveTurn();

    delete state.error_fingerprints;

    startTurn(state);

    const loaded = getActiveTurn(state.project_fp, state.session_id, state.agent_key);
    assert.deepEqual(loaded.error_fingerprints, []);
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

  it('updates the managed history signature when completed history changes', async () => {
    const { startTurn, closeTurn } = await loadModule();
    const { readHistorySignature } = await import('../dist/history-signature.js');

    const firstState = makeActiveTurn({ project_fp: 'historyfp1234567', session_id: 'sess-history-1' });
    const secondState = makeActiveTurn({ project_fp: 'historyfp1234567', session_id: 'sess-history-2' });

    assert.equal(readHistorySignature(firstState.project_fp), null);

    startTurn(firstState);
    closeTurn(firstState.project_fp, firstState.session_id, firstState.agent_key, 'stop');
    const firstSignature = readHistorySignature(firstState.project_fp);

    assert.match(firstSignature, /^v2rev:/);

    startTurn(secondState);
    closeTurn(secondState.project_fp, secondState.session_id, secondState.agent_key, 'stop');
    const secondSignature = readHistorySignature(secondState.project_fp);

    assert.match(secondSignature, /^v2rev:/);
    assert.notEqual(secondSignature, firstSignature);
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
    assert.equal(completed.span_until_last_event_seconds, 3);
    assert.ok(completed.tail_after_last_event_seconds >= 7);
    assert.equal(completed.active_seconds, 3);
    assert.ok(completed.wait_seconds >= 7);
  });

  it('records first edit and first bash offsets on completion', async () => {
    const { startTurn, setActiveTurn, closeTurn } = await loadModule();

    const startMs = Date.now() - 10000;
    const state = makeActiveTurn({
      started_at_ms: startMs,
      started_at: new Date(startMs).toISOString(),
      first_edit_at_ms: startMs + 2000,
      first_bash_at_ms: startMs + 6000,
      tool_calls: 2,
      last_event_at_ms: startMs + 6000,
    });
    startTurn(state);
    setActiveTurn(state);

    const completed = closeTurn(state.project_fp, state.session_id, state.agent_key, 'stop');
    assert.ok(completed);
    assert.equal(completed.first_edit_offset_seconds, 2);
    assert.equal(completed.first_bash_offset_seconds, 6);
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

  it('loadCompletedTurns returns turns sorted by started_at ascending', async () => {
    const { startTurn, closeTurn, loadCompletedTurns } = await loadModule();

    const fp = 'sortfp12345678901';
    const baseTimes = [
      Date.now() - 30000, // oldest
      Date.now() - 10000, // newest
      Date.now() - 20000, // middle
    ];

    // Create turns in non-chronological order across different session files
    for (let i = 0; i < 3; i++) {
      const state = makeActiveTurn({
        project_fp: fp,
        session_id: `sess-sort-${i}`,
        agent_key: 'main',
        started_at_ms: baseTimes[i],
        started_at: new Date(baseTimes[i]).toISOString(),
      });
      startTurn(state);
      closeTurn(fp, `sess-sort-${i}`, 'main', 'stop');
    }

    const turns = loadCompletedTurns(fp);
    assert.equal(turns.length, 3);

    // Verify ascending order by started_at
    for (let i = 1; i < turns.length; i++) {
      const prev = new Date(turns[i - 1].started_at).getTime();
      const curr = new Date(turns[i].started_at).getTime();
      assert.ok(
        prev <= curr,
        `Turn ${i - 1} (${turns[i - 1].started_at}) should be <= Turn ${i} (${turns[i].started_at})`,
      );
    }
  });

  it('loadCompletedTurns uses deterministic tie-breakers when started_at is identical', async () => {
    const { startTurn, closeTurn, loadCompletedTurns } = await loadModule();

    const fp = 'sorttie1234567890';
    const startedAtMs = Date.now() - 15000;
    const startedAt = new Date(startedAtMs).toISOString();
    const states = [
      makeActiveTurn({
        project_fp: fp,
        session_id: 'sess-b',
        agent_key: 'main',
        turn_id: 'turn-b',
        started_at_ms: startedAtMs,
        started_at: startedAt,
      }),
      makeActiveTurn({
        project_fp: fp,
        session_id: 'sess-a',
        agent_key: 'worker',
        turn_id: 'turn-c',
        started_at_ms: startedAtMs,
        started_at: startedAt,
      }),
      makeActiveTurn({
        project_fp: fp,
        session_id: 'sess-a',
        agent_key: 'main',
        turn_id: 'turn-a',
        started_at_ms: startedAtMs,
        started_at: startedAt,
      }),
    ];

    for (const state of states) {
      startTurn(state);
      closeTurn(fp, state.session_id, state.agent_key, 'stop');
    }

    const turns = loadCompletedTurns(fp);
    assert.equal(turns.length, 3);
    assert.deepEqual(
      turns.map((turn) => [turn.session_id, turn.agent_key, turn.turn_id]),
      [
        ['sess-a', 'main', 'turn-a'],
        ['sess-a', 'worker', 'turn-c'],
        ['sess-b', 'main', 'turn-b'],
      ],
    );
  });

  it('normalizes legacy completed turns missing proxy timing fields on read', async () => {
    const { loadCompletedTurns } = await loadModule();
    const { getCompletedLogPath } = await import('../dist/paths.js');

    const fp = 'legacycompleted123';
    const completedPath = getCompletedLogPath(fp, 'sess-legacy', 'main');
    fs.mkdirSync(path.dirname(completedPath), { recursive: true });
    fs.writeFileSync(
      completedPath,
      JSON.stringify({
        turn_id: 'turn-legacy',
        work_item_id: 'wi-legacy',
        session_id: 'sess-legacy',
        agent_key: 'main',
        agent_id: null,
        agent_type: null,
        runner_kind: 'main',
        project_fp: fp,
        project_display_name: 'legacy-project',
        classification: 'bugfix',
        prompt_summary: 'legacy fix',
        prompt_complexity: 1,
        started_at: '2026-03-21T10:00:00.000Z',
        ended_at: '2026-03-21T10:00:10.000Z',
        wall_seconds: 10,
        first_edit_offset_seconds: null,
        first_bash_offset_seconds: null,
        active_seconds: 6,
        wait_seconds: 4,
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
      }) + '\n',
    );

    const turns = loadCompletedTurns(fp);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].span_until_last_event_seconds, 6);
    assert.equal(turns[0].tail_after_last_event_seconds, 4);
    assert.equal(turns[0].active_seconds, 6);
    assert.equal(turns[0].wait_seconds, 4);
  });
});

// ── closeTurn lock file ──────────────────────────────────────

describe('closeTurn lock file', () => {
  it('returns null when closeTurn is called twice sequentially on the same turn', async () => {
    const { startTurn, closeTurn } = await loadModule();
    const { getCompletedLogPath } = await import('../dist/paths.js');

    const fp = 'lockfp12345678901';
    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-lock', agent_key: 'main' });
    startTurn(state);

    // First close should succeed
    const first = closeTurn(fp, 'sess-lock', 'main', 'stop');
    assert.ok(first);

    // Second close should return null (turn already closed, no active file)
    const second = closeTurn(fp, 'sess-lock', 'main', 'stop');
    assert.equal(second, null);

    // Verify only one record in completed JSONL
    const completedPath = getCompletedLogPath(fp, 'sess-lock', 'main');
    const content = fs.readFileSync(completedPath, 'utf-8').trim();
    const lines = content.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 1, 'Expected exactly one completed record');
  });

  it('allows only one overlapping closeTurn caller to complete the turn', async () => {
    const { startTurn } = await loadModule();
    const { getCompletedLogPath } = await import('../dist/paths.js');

    const fp = 'lockrace123456789';
    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-race', agent_key: 'main' });
    startTurn(state);

    const [first, second] = await runConcurrentCloseTurnWorkers(fp, 'sess-race', 'main', 'stop');
    const successes = [first, second].filter(Boolean);
    const misses = [first, second].filter((result) => result === null);

    assert.equal(successes.length, 1, 'Exactly one overlapping closeTurn call should succeed');
    assert.equal(misses.length, 1, 'Exactly one overlapping closeTurn call should bail on the lock');

    const completedPath = getCompletedLogPath(fp, 'sess-race', 'main');
    const content = fs.readFileSync(completedPath, 'utf-8').trim();
    const lines = content.split('\n').filter((l) => l.trim());
    assert.equal(lines.length, 1, 'Expected exactly one completed record after overlapping closeTurn calls');
  });

  it('recovers stale lock files older than 60s', async () => {
    const { startTurn, closeTurn } = await loadModule();
    const { getLocksDir } = await import('../dist/paths.js');

    const fp = 'stalefp1234567890';
    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-stale', agent_key: 'main' });
    startTurn(state);

    // Create a stale lock file manually (mtime in the past)
    const locksDir = getLocksDir(fp);
    fs.mkdirSync(locksDir, { recursive: true });
    const lockPath = path.join(locksDir, 'sess-stale__main.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: -1, token: 'stale-token', created_at_ms: Date.now() - 90_000 }));
    // Set mtime to 90 seconds ago (beyond the 60s stale threshold)
    const staleTime = new Date(Date.now() - 90_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    // closeTurn should recover the stale lock and succeed
    const result = closeTurn(fp, 'sess-stale', 'main', 'stop');
    assert.ok(result, 'closeTurn should succeed after recovering stale lock');
    assert.equal(result.stop_reason, 'stop');

    // Lock file should be cleaned up
    assert.equal(fs.existsSync(lockPath), false, 'Lock file should be removed after close');
  });

  it('bails when lock is held by another process (fresh lock)', async () => {
    const { startTurn, closeTurn } = await loadModule();
    const { getLocksDir } = await import('../dist/paths.js');

    const fp = 'heldlkfp123456789';
    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-held', agent_key: 'main' });
    startTurn(state);

    // Create a fresh lock file (not stale)
    const locksDir = getLocksDir(fp);
    fs.mkdirSync(locksDir, { recursive: true });
    const lockPath = path.join(locksDir, 'sess-held__main.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token: 'live-token', created_at_ms: Date.now() }));

    try {
      // closeTurn should bail because lock is held
      const result = closeTurn(fp, 'sess-held', 'main', 'stop');
      assert.equal(result, null, 'closeTurn should return null when lock is held');
    } finally {
      fs.unlinkSync(lockPath);
    }
  });
});

// ── findActiveMainTurn ───────────────────────────────────────

describe('findActiveMainTurn', () => {
  it('returns null when no active directory exists', async () => {
    const { findActiveMainTurn } = await loadModule();
    assert.equal(findActiveMainTurn('nonexistentfp12345'), null);
  });

  it('returns null when active directory is empty', async () => {
    const { findActiveMainTurn } = await loadModule();
    const { getActiveDir, ensureDir } = await import('../dist/paths.js');
    const fp = 'emptyactivefp1234';
    ensureDir(getActiveDir(fp));
    assert.equal(findActiveMainTurn(fp), null);
  });

  it('returns the active main-runner turn', async () => {
    const { startTurn, findActiveMainTurn } = await loadModule();
    const fp = 'findmainfp12345678';
    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-find', agent_key: 'main' });
    startTurn(state);

    const found = findActiveMainTurn(fp);
    assert.ok(found);
    assert.equal(found.turn_id, state.turn_id);
    assert.equal(found.runner_kind, 'main');
    assert.equal(found.status, 'active');
  });

  it('returns the most recent active main turn when multiple exist', async () => {
    const { startTurn, findActiveMainTurn } = await loadModule();
    const fp = 'multimain12345678';
    const now = Date.now();

    const older = makeActiveTurn({
      project_fp: fp,
      session_id: 'sess-old',
      agent_key: 'main',
      started_at_ms: now - 10000,
      started_at: new Date(now - 10000).toISOString(),
    });
    const newer = makeActiveTurn({
      project_fp: fp,
      session_id: 'sess-new',
      agent_key: 'main',
      started_at_ms: now - 1000,
      started_at: new Date(now - 1000).toISOString(),
    });

    startTurn(older);
    startTurn(newer);

    const found = findActiveMainTurn(fp);
    assert.ok(found);
    assert.equal(found.session_id, 'sess-new');
  });

  it('ignores subagent turns', async () => {
    const { startTurn, findActiveMainTurn } = await loadModule();
    const fp = 'ignoresub12345678';

    const sub = makeActiveTurn({
      project_fp: fp,
      session_id: 'sess-sub',
      agent_key: 'agent-1',
      agent_id: 'agent-1',
      runner_kind: 'subagent',
    });
    startTurn(sub);

    assert.equal(findActiveMainTurn(fp), null);
  });

  it('ignores stop_blocked turns', async () => {
    const { startTurn, setActiveTurn, findActiveMainTurn } = await loadModule();
    const fp = 'blocked123456789a';

    const state = makeActiveTurn({ project_fp: fp, session_id: 'sess-blk', agent_key: 'main' });
    startTurn(state);
    state.status = 'stop_blocked';
    setActiveTurn(state);

    assert.equal(findActiveMainTurn(fp), null);
  });
});
