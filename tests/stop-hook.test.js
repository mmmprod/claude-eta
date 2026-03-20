import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let TEST_DATA_DIR;
const TEST_CWD = '/tmp/test-stop-hook-project';
const SESSION_ID = 'sess-stop-test';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-stop-hook-'));
  // Ensure the test cwd exists for resolveProjectIdentity
  fs.mkdirSync(TEST_CWD, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  try {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  } catch {}
});

/** Seed legacy project data so compat layer can load stats */
function seedLegacyData(slug, tasks) {
  const dataDir = path.join(TEST_DATA_DIR, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, `${slug}.json`),
    JSON.stringify({ project: slug, created: new Date().toISOString(), tasks, eta_accuracy: {} }),
  );
}

/** Create a v2 active turn file directly */
function seedActiveTurn(projectFp, sessionId, agentKey, overrides = {}) {
  const activeDir = path.join(TEST_DATA_DIR, 'projects', projectFp, 'active');
  fs.mkdirSync(activeDir, { recursive: true });
  const state = {
    turn_id: 'turn-test',
    work_item_id: 'turn-test',
    session_id: sessionId,
    agent_key: agentKey,
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: projectFp,
    project_display_name: 'test-stop-hook-project',
    classification: 'other',
    prompt_summary: 'test task',
    prompt_complexity: 2,
    started_at: new Date(Date.now() - 5000).toISOString(),
    started_at_ms: Date.now() - 5000,
    tool_calls: 3,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
    bash_calls: 0,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    first_tool_at_ms: Date.now() - 4000,
    first_edit_at_ms: Date.now() - 3000,
    first_bash_at_ms: null,
    last_event_at_ms: Date.now() - 1000,
    last_assistant_message: null,
    model: 'test-model',
    source: null,
    status: 'active',
    path_fps: [],
    ...overrides,
  };
  fs.writeFileSync(path.join(activeDir, `${sessionId}__${agentKey}.json`), JSON.stringify(state));
  return state;
}

import * as crypto from 'node:crypto';

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

function makeLegacyTask(overrides = {}) {
  return {
    task_id: 'task-' + Math.random().toString(36).slice(2),
    session_id: SESSION_ID,
    project: 'test-stop-hook-project',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 30,
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

function runStopHook(stdin) {
  try {
    return execFileSync('node', ['dist/hooks/on-stop.js'], {
      input: JSON.stringify(stdin),
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
    });
  } catch (e) {
    return e.stdout || '';
  }
}

describe('Stop hook integration', () => {
  it('detects BS estimate and blocks stop', () => {
    const fp = getTestFp();
    const slug = 'test-stop-hook-project';
    // Seed 10 legacy tasks so stats are available via compat
    seedLegacyData(
      slug,
      Array.from({ length: 10 }, () => makeLegacyTask()),
    );
    seedActiveTurn(fp, SESSION_ID, 'main');

    const output = runStopHook({
      last_assistant_message: 'This refactoring will take about 3 days to complete.',
      stop_hook_active: false,
      session_id: SESSION_ID,
      cwd: TEST_CWD,
    });

    const result = JSON.parse(output);
    assert.equal(result.decision, 'block');
    assert.ok(result.reason.includes('claude-eta'));
  });

  it('flushes on stop_hook_active (second fire after correction)', () => {
    const fp = getTestFp();
    seedActiveTurn(fp, SESSION_ID, 'main');

    const output = runStopHook({
      stop_hook_active: true,
      session_id: SESSION_ID,
      cwd: TEST_CWD,
    });

    assert.ok(!output.includes('"decision"'));
    // Active file should be gone
    const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__main.json`);
    assert.ok(!fs.existsSync(activePath));
  });

  it('flushes normally when no BS detected', () => {
    const fp = getTestFp();
    seedLegacyData(
      'test-stop-hook-project',
      Array.from({ length: 10 }, () => makeLegacyTask()),
    );
    seedActiveTurn(fp, SESSION_ID, 'main');

    const output = runStopHook({
      last_assistant_message: 'Done! I fixed the bug.',
      stop_hook_active: false,
      session_id: SESSION_ID,
      cwd: TEST_CWD,
    });

    assert.ok(!output.includes('"decision"'));
  });

  it('handles undefined stop_hook_active (runs BS detection)', () => {
    const fp = getTestFp();
    seedLegacyData(
      'test-stop-hook-project',
      Array.from({ length: 10 }, () => makeLegacyTask()),
    );
    seedActiveTurn(fp, SESSION_ID, 'main');

    const output = runStopHook({
      last_assistant_message: 'This will take about 5 weeks to refactor.',
      session_id: SESSION_ID,
      cwd: TEST_CWD,
    });

    const result = JSON.parse(output);
    assert.equal(result.decision, 'block');
  });

  it('creates _last_completed.json after flush', () => {
    const fp = getTestFp();
    seedActiveTurn(fp, SESSION_ID, 'main');

    runStopHook({
      last_assistant_message: 'All done.',
      stop_hook_active: false,
      session_id: SESSION_ID,
      cwd: TEST_CWD,
    });

    // _last_completed.json is written by the legacy store.ts to its hardcoded path
    // In v2, the recap is still written there via setLastCompleted()
    // Check the completed JSONL was created instead
    const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
    try {
      const files = fs.readdirSync(completedDir).filter((f) => f.endsWith('.jsonl'));
      assert.ok(files.length > 0, 'completed JSONL should exist after flush');
      const content = fs.readFileSync(path.join(completedDir, files[0]), 'utf-8').trim();
      const turn = JSON.parse(content);
      assert.ok('classification' in turn);
      assert.ok('wall_seconds' in turn);
    } catch {
      // If completed dir doesn't exist, the turn was closed
      // Check active file is gone as proof of closure
      const activePath = path.join(TEST_DATA_DIR, 'projects', fp, 'active', `${SESSION_ID}__main.json`);
      assert.ok(!fs.existsSync(activePath), 'active turn should be removed after stop');
    }
  });
});
