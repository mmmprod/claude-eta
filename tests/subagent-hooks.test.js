import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
const TEST_CWD = '/tmp/test-subagent-hooks-project';
const SESSION_ID = 'sess-subagent-test';
const AGENT_ID = 'agent-sub-001';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-subagent-hooks-'));
  fs.mkdirSync(TEST_CWD, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  try {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  } catch {}
});

/** Get the project fingerprint for TEST_CWD (must match what resolveProjectIdentity produces) */
function getTestFp() {
  let resolved;
  try {
    resolved = fs.realpathSync(TEST_CWD);
  } catch {
    resolved = TEST_CWD;
  }
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
}

/** Create a v2 active turn file directly */
function seedActiveTurn(projectFp, sessionId, agentKey, overrides = {}) {
  const activeDir = path.join(TEST_DATA_DIR, 'projects', projectFp, 'active');
  fs.mkdirSync(activeDir, { recursive: true });
  const state = {
    turn_id: 'turn-existing',
    work_item_id: 'turn-existing',
    session_id: sessionId,
    agent_key: agentKey,
    agent_id: agentKey,
    agent_type: 'general-purpose',
    runner_kind: 'subagent',
    project_fp: projectFp,
    project_display_name: 'test-subagent-hooks-project',
    classification: 'other',
    prompt_summary: 'subagent:general-purpose',
    prompt_complexity: 1,
    started_at: new Date(Date.now() - 5000).toISOString(),
    started_at_ms: Date.now() - 5000,
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
    ...overrides,
  };
  fs.writeFileSync(path.join(activeDir, `${sessionId}__${agentKey}.json`), JSON.stringify(state));
  return state;
}

function runSubagentStart(stdin) {
  try {
    return execFileSync('node', ['dist/hooks/on-subagent-start.js'], {
      input: JSON.stringify(stdin),
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
    });
  } catch (e) {
    return e.stdout || '';
  }
}

function runSubagentStop(stdin) {
  try {
    return execFileSync('node', ['dist/hooks/on-subagent-stop.js'], {
      input: JSON.stringify(stdin),
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
    });
  } catch (e) {
    return e.stdout || '';
  }
}

describe('SubagentStart hook', () => {
  it('creates an active turn file for (session, agent_id)', () => {
    const fp = getTestFp();

    runSubagentStart({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      agent_type: 'general-purpose',
      cwd: TEST_CWD,
    });

    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__${AGENT_ID}.json`);
    assert.ok(fs.existsSync(activePath), 'active turn file should be created');

    const state = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.equal(state.session_id, SESSION_ID);
    assert.equal(state.agent_key, AGENT_ID);
    assert.equal(state.agent_id, AGENT_ID);
    assert.equal(state.runner_kind, 'subagent');
    assert.equal(state.classification, 'other');
    assert.equal(state.prompt_summary, 'subagent:general-purpose');
    assert.equal(state.status, 'active');
    assert.equal(state.agent_type, 'general-purpose');
    assert.ok(state.turn_id, 'turn_id should be set');
    assert.equal(state.turn_id, state.work_item_id, 'turn_id and work_item_id should match');
  });

  it('is a no-op if a turn already exists', () => {
    const fp = getTestFp();
    const existing = seedActiveTurn(fp, SESSION_ID, AGENT_ID);

    runSubagentStart({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      agent_type: 'general-purpose',
      cwd: TEST_CWD,
    });

    // Active file should still contain the original turn_id (not overwritten)
    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__${AGENT_ID}.json`);
    const state = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.equal(state.turn_id, existing.turn_id, 'should not overwrite existing turn');
  });

  it('handles missing cwd gracefully', () => {
    // Should not throw
    runSubagentStart({ session_id: SESSION_ID, agent_id: AGENT_ID });
  });

  it('handles missing session_id gracefully', () => {
    runSubagentStart({ cwd: TEST_CWD, agent_id: AGENT_ID });
  });

  it('handles missing agent_id gracefully', () => {
    runSubagentStart({ session_id: SESSION_ID, cwd: TEST_CWD });
  });

  it('uses "unknown" when agent_type is not provided', () => {
    const fp = getTestFp();

    runSubagentStart({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      cwd: TEST_CWD,
    });

    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__${AGENT_ID}.json`);
    const state = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    assert.equal(state.prompt_summary, 'subagent:unknown');
    assert.equal(state.agent_type, null);
  });
});

describe('SubagentStop hook', () => {
  it('closes the turn and produces a completed JSONL record', () => {
    const fp = getTestFp();
    seedActiveTurn(fp, SESSION_ID, AGENT_ID);

    runSubagentStop({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      cwd: TEST_CWD,
    });

    // Active file should be gone
    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__${AGENT_ID}.json`);
    assert.ok(!fs.existsSync(activePath), 'active turn file should be removed after stop');

    // Completed JSONL should exist
    const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
    const files = fs.readdirSync(completedDir).filter((f) => f.endsWith('.jsonl'));
    assert.ok(files.length > 0, 'completed JSONL should exist after stop');

    const content = fs.readFileSync(path.join(completedDir, files[0]), 'utf-8').trim();
    const turn = JSON.parse(content);
    assert.equal(turn.stop_reason, 'subagent_stop');
    assert.equal(turn.runner_kind, 'subagent');
    assert.equal(turn.agent_key, AGENT_ID);
    assert.ok(turn.wall_seconds >= 0, 'wall_seconds should be non-negative');
  });

  it('is a no-op if no active turn exists', () => {
    const fp = getTestFp();

    // Should not throw
    runSubagentStop({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      cwd: TEST_CWD,
    });

    // No completed dir should be created
    const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
    try {
      const files = fs.readdirSync(completedDir).filter((f) => f.endsWith('.jsonl'));
      assert.equal(files.length, 0, 'no completed JSONL should exist');
    } catch {
      // completedDir doesn't exist — expected
    }
  });

  it('handles missing fields gracefully', () => {
    // Should not throw for any of these
    runSubagentStop({ session_id: SESSION_ID, agent_id: AGENT_ID });
    runSubagentStop({ cwd: TEST_CWD, agent_id: AGENT_ID });
    runSubagentStop({ session_id: SESSION_ID, cwd: TEST_CWD });
  });
});

describe('Subagent full lifecycle', () => {
  it('start -> simulate tool use -> stop -> verify completed turn', () => {
    const fp = getTestFp();

    // Step 1: SubagentStart creates the turn
    runSubagentStart({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      agent_type: 'code-review',
      cwd: TEST_CWD,
    });

    // Verify active turn exists
    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__${AGENT_ID}.json`);
    assert.ok(fs.existsSync(activePath), 'active turn should exist after start');

    // Step 2: Simulate tool use by modifying active file directly
    const state = JSON.parse(fs.readFileSync(activePath, 'utf-8'));
    state.tool_calls = 5;
    state.files_read = 3;
    state.files_edited = 1;
    state.last_event_at_ms = Date.now();
    fs.writeFileSync(activePath, JSON.stringify(state));

    // Step 3: SubagentStop closes the turn
    runSubagentStop({
      session_id: SESSION_ID,
      agent_id: AGENT_ID,
      cwd: TEST_CWD,
    });

    // Step 4: Verify completed turn
    assert.ok(!fs.existsSync(activePath), 'active turn should be gone after stop');

    const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
    const files = fs.readdirSync(completedDir).filter((f) => f.endsWith('.jsonl'));
    assert.ok(files.length > 0, 'completed JSONL should exist');

    const content = fs.readFileSync(path.join(completedDir, files[0]), 'utf-8').trim();
    const turn = JSON.parse(content);
    assert.equal(turn.stop_reason, 'subagent_stop');
    assert.equal(turn.runner_kind, 'subagent');
    assert.equal(turn.tool_calls, 5, 'tool_calls should reflect simulated use');
    assert.equal(turn.files_read, 3, 'files_read should reflect simulated use');
    assert.equal(turn.files_edited, 1, 'files_edited should reflect simulated use');
    assert.equal(turn.prompt_summary, 'subagent:code-review');
    assert.equal(turn.agent_type, 'code-review');
    assert.ok(turn.wall_seconds >= 0);
  });
});
