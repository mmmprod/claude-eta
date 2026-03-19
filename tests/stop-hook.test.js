import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { addTask, setActiveTask, getActiveTask } from '../dist/store.js';

const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');
const TEST_PROJECT = '_test_stop_' + Date.now();

function testProjectPath() {
  const slug = TEST_PROJECT.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return path.join(DATA_DIR, `${slug}.json`);
}

function cleanup() {
  try {
    fs.unlinkSync(testProjectPath());
  } catch {}
  try {
    fs.unlinkSync(path.join(DATA_DIR, '_active.json'));
  } catch {}
  try {
    fs.unlinkSync(path.join(DATA_DIR, '_active.json.tmp'));
  } catch {}
  try {
    fs.unlinkSync(path.join(DATA_DIR, '_last_completed.json'));
  } catch {}
}

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-1',
    project: TEST_PROJECT,
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
    });
  } catch (e) {
    return e.stdout || '';
  }
}

describe('Stop hook integration', () => {
  beforeEach(() => {
    cleanup();
    // Seed project with 10 completed tasks (need ≥5 for stats)
    for (let i = 0; i < 10; i++) {
      addTask(TEST_PROJECT, makeTask());
    }
  });

  afterEach(() => cleanup());

  it('detects BS estimate and blocks stop', () => {
    addTask(TEST_PROJECT, makeTask({ duration_seconds: null, timestamp_end: null }));
    setActiveTask(TEST_PROJECT, 'current-task');

    const output = runStopHook({
      last_assistant_message: 'This refactoring will take about 3 days to complete.',
      stop_hook_active: false,
    });

    const result = JSON.parse(output);
    assert.equal(result.decision, 'block');
    assert.ok(result.reason.includes('claude-eta'));
    // Active task should NOT be flushed (block → Claude continues)
    assert.ok(getActiveTask() !== null);
  });

  it('flushes on stop_hook_active (second fire after correction)', () => {
    addTask(TEST_PROJECT, makeTask({ duration_seconds: null, timestamp_end: null }));
    setActiveTask(TEST_PROJECT, 'current-task');

    runStopHook({ stop_hook_active: true });

    // Active task should be cleared (flushed)
    assert.equal(getActiveTask(), null);
  });

  it('flushes normally when no BS detected', () => {
    addTask(TEST_PROJECT, makeTask({ duration_seconds: null, timestamp_end: null }));
    setActiveTask(TEST_PROJECT, 'current-task');

    const output = runStopHook({
      last_assistant_message: 'Done! I fixed the bug.',
      stop_hook_active: false,
    });

    // No block decision
    assert.ok(!output.includes('"decision"'));
    // Active task should be flushed
    assert.equal(getActiveTask(), null);
  });

  it('handles undefined stop_hook_active (runs BS detection)', () => {
    addTask(TEST_PROJECT, makeTask({ duration_seconds: null, timestamp_end: null }));
    setActiveTask(TEST_PROJECT, 'current-task');

    const output = runStopHook({
      last_assistant_message: 'This will take about 5 weeks to refactor.',
      // stop_hook_active deliberately omitted
    });

    const result = JSON.parse(output);
    assert.equal(result.decision, 'block');
  });

  it('creates _last_completed.json after flush', () => {
    addTask(TEST_PROJECT, makeTask({ duration_seconds: null, timestamp_end: null }));
    setActiveTask(TEST_PROJECT, 'current-task');

    runStopHook({
      last_assistant_message: 'All done.',
      stop_hook_active: false,
    });

    const lastPath = path.join(DATA_DIR, '_last_completed.json');
    assert.ok(fs.existsSync(lastPath), '_last_completed.json should exist after flush');
    const data = JSON.parse(fs.readFileSync(lastPath, 'utf-8'));
    assert.ok('classification' in data);
    assert.ok('duration_seconds' in data);
  });
});
