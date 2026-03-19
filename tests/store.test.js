import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadProject,
  saveProject,
  addTask,
  updateLastTask,
  setActiveTask,
  getActiveTask,
  clearActiveTask,
  incrementActive,
} from '../dist/store.js';

const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');
const TEST_PROJECT = '_test_project_' + Date.now();

function testProjectPath() {
  const slug = TEST_PROJECT.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return path.join(DATA_DIR, `${slug}.json`);
}

function cleanup() {
  const p = testProjectPath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
  const active = path.join(DATA_DIR, '_active.json');
  if (fs.existsSync(active)) fs.unlinkSync(active);
}

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-1',
    project: TEST_PROJECT,
    timestamp_start: new Date().toISOString(),
    timestamp_end: null,
    duration_seconds: null,
    prompt_summary: 'test task',
    classification: 'other',
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
    files_created: 0,
    errors: 0,
    model: 'test-model',
    ...overrides,
  };
}

describe('store', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  describe('loadProject', () => {
    it('returns empty project when no file exists', () => {
      const data = loadProject(TEST_PROJECT);
      assert.equal(data.project, TEST_PROJECT);
      assert.deepEqual(data.tasks, []);
    });

    it('loads saved data', () => {
      const project = { project: TEST_PROJECT, created: '2026-01-01', tasks: [makeTask()] };
      saveProject(project);
      const loaded = loadProject(TEST_PROJECT);
      assert.equal(loaded.tasks.length, 1);
      assert.equal(loaded.tasks[0].prompt_summary, 'test task');
    });
  });

  describe('addTask', () => {
    it('appends task to project', () => {
      addTask(TEST_PROJECT, makeTask({ prompt_summary: 'first' }));
      addTask(TEST_PROJECT, makeTask({ prompt_summary: 'second' }));
      const data = loadProject(TEST_PROJECT);
      assert.equal(data.tasks.length, 2);
      assert.equal(data.tasks[0].prompt_summary, 'first');
      assert.equal(data.tasks[1].prompt_summary, 'second');
    });
  });

  describe('updateLastTask', () => {
    it('updates the last task in the array', () => {
      addTask(TEST_PROJECT, makeTask({ prompt_summary: 'first' }));
      addTask(TEST_PROJECT, makeTask({ prompt_summary: 'second' }));
      updateLastTask(TEST_PROJECT, { duration_seconds: 42 });
      const data = loadProject(TEST_PROJECT);
      assert.equal(data.tasks[1].duration_seconds, 42);
      assert.equal(data.tasks[0].duration_seconds, null); // first unchanged
    });

    it('does nothing when no tasks exist', () => {
      updateLastTask(TEST_PROJECT, { duration_seconds: 42 });
      const data = loadProject(TEST_PROJECT);
      assert.equal(data.tasks.length, 0);
    });
  });

  describe('active task', () => {
    it('set/get/clear lifecycle', () => {
      assert.equal(getActiveTask(), null);

      setActiveTask(TEST_PROJECT, 'task-1');
      const active = getActiveTask();
      assert.ok(active);
      assert.equal(active.project, TEST_PROJECT);
      assert.equal(active.taskId, 'task-1');
      assert.equal(active.tool_calls, 0);

      clearActiveTask();
      assert.equal(getActiveTask(), null);
    });

    it('initializes counters to 0', () => {
      setActiveTask(TEST_PROJECT, 'task-1');
      const active = getActiveTask();
      assert.equal(active.tool_calls, 0);
      assert.equal(active.files_read, 0);
      assert.equal(active.files_edited, 0);
      assert.equal(active.files_created, 0);
      assert.equal(active.errors, 0);
    });
  });

  describe('incrementActive', () => {
    it('increments tool_calls', () => {
      setActiveTask(TEST_PROJECT, 'task-1');
      incrementActive({ tool_calls: 1 });
      incrementActive({ tool_calls: 1 });
      const active = getActiveTask();
      assert.equal(active.tool_calls, 2);
    });

    it('increments multiple counters at once', () => {
      setActiveTask(TEST_PROJECT, 'task-1');
      incrementActive({ tool_calls: 1, files_read: 1 });
      incrementActive({ tool_calls: 1, files_edited: 1 });
      incrementActive({ tool_calls: 1, errors: 1 });
      const active = getActiveTask();
      assert.equal(active.tool_calls, 3);
      assert.equal(active.files_read, 1);
      assert.equal(active.files_edited, 1);
      assert.equal(active.errors, 1);
    });

    it('does nothing when no active task', () => {
      clearActiveTask();
      incrementActive({ tool_calls: 1 }); // should not throw
      assert.equal(getActiveTask(), null);
    });
  });
});
