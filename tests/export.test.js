import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { addTask, loadProject, saveProject } from '../dist/store.js';

const PII_FIELDS = ['prompt_summary', 'session_id', 'task_id', 'timestamp_start', 'timestamp_end'];
const DATA_DIR = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');

function makeTask(overrides = {}) {
  return {
    task_id: 'test-' + Math.random().toString(36).slice(2),
    session_id: 'sess-test',
    project: 'export-test',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 120,
    prompt_summary: 'fix the secret auth bug in /home/user/code',
    classification: 'bugfix',
    tool_calls: 10,
    files_read: 3,
    files_edited: 2,
    files_created: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}

function cleanup(project) {
  try {
    fs.unlinkSync(path.join(DATA_DIR, `${project}.json`));
  } catch {
    /* ignore */
  }
}

describe('anonymizeProject', () => {
  it('strips all PII fields from output', async () => {
    const project = 'export-test-pii';
    addTask(project, makeTask({ project }));

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.ok(records.length > 0);
    for (const record of records) {
      const keys = Object.keys(record);
      for (const pii of PII_FIELDS) {
        assert.ok(!keys.includes(pii), `must not contain ${pii}`);
      }
      for (const value of Object.values(record)) {
        if (typeof value === 'string') {
          assert.ok(!value.includes('/home/'), `must not contain file paths: ${value}`);
        }
      }
    }

    cleanup(project);
  });

  it('skips tasks with null duration', async () => {
    const project = 'export-test-null';
    addTask(project, makeTask({ project, duration_seconds: null }));
    addTask(project, makeTask({ project, duration_seconds: 60 }));

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.ok(records.every((r) => r.duration_seconds > 0));
    cleanup(project);
  });

  it('hashes project name', async () => {
    const project = 'export-test-hash';
    addTask(project, makeTask({ project }));

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.ok(records.length > 0);
    assert.ok(!records[0].project_hash.includes(project));
    assert.match(records[0].project_hash, /^[a-f0-9]{64}$/);
    cleanup(project);
  });

  it('normalizes model name', async () => {
    const project = 'export-test-model';
    addTask(project, makeTask({ project, model: 'claude-sonnet-4-20250514' }));

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.equal(records[0].model, 'claude-sonnet-4');
    cleanup(project);
  });

  it('includes project_file_count and project_loc_bucket when set (F-03)', async () => {
    const project = 'export-test-meta';
    addTask(project, makeTask({ project }));

    // Set project metadata
    const data = loadProject(project);
    data.file_count = 42;
    data.loc_bucket = 'small';
    saveProject(data);

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.ok(records.length > 0);
    assert.equal(records[0].project_file_count, 42);
    assert.equal(records[0].project_loc_bucket, 'small');
    cleanup(project);
  });

  it('returns null for project metadata when not set (F-03)', async () => {
    const project = 'export-test-nometa';
    addTask(project, makeTask({ project }));

    const { anonymizeProject } = await import('../dist/cli/export.js');
    const records = anonymizeProject(project, '1.0.0');

    assert.ok(records.length > 0);
    assert.equal(records[0].project_file_count, null);
    assert.equal(records[0].project_loc_bucket, null);
    cleanup(project);
  });
});
