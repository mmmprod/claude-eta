import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

const PII_FIELDS = ['prompt_summary', 'session_id', 'task_id', 'timestamp_start', 'timestamp_end'];

let TEST_DATA_DIR;
let TEST_CWD;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-export-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-export-cwd-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

function makeCompletedTurn(overrides = {}) {
  const now = new Date().toISOString();
  return {
    turn_id: 'turn-' + Math.random().toString(36).slice(2),
    work_item_id: 'work-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'abcdef1234567890',
    project_display_name: 'export-test',
    classification: 'bugfix',
    prompt_summary: 'fix the secret auth bug in /home/user/code',
    prompt_complexity: 2,
    started_at: now,
    ended_at: now,
    wall_seconds: 120,
    active_seconds: null,
    tool_calls: 10,
    files_read: 3,
    files_edited: 2,
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
    model: 'claude-sonnet-4-20250514',
    source: null,
    stop_reason: 'end_turn',
    path_fps: [],
    ...overrides,
  };
}

/** Compute project fingerprint the same way identity.ts does */
function computeTestFp(cwd) {
  let resolved;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    resolved = path.resolve(cwd);
  }
  const hash = crypto.createHash('sha256').update(resolved).digest('hex');
  return { fp: hash.slice(0, 16), resolved };
}

/** Write completed turns directly to JSONL for a given cwd */
function writeCompletedTurns(cwd, turns) {
  const { fp } = computeTestFp(cwd);
  const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
  fs.mkdirSync(completedDir, { recursive: true });

  const lines = turns.map((t) => JSON.stringify(t)).join('\n') + '\n';
  fs.writeFileSync(path.join(completedDir, 'sess-1__main.jsonl'), lines, 'utf-8');
}

/** Write project meta for a given cwd */
function writeProjectMeta(cwd, meta) {
  const { fp, resolved } = computeTestFp(cwd);
  const projectDir = path.join(TEST_DATA_DIR, 'projects', fp);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'meta.json'),
    JSON.stringify({
      project_fp: fp,
      display_name: path.basename(resolved),
      cwd_realpath: resolved,
      created: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      legacy_slug: null,
      file_count: meta.file_count ?? null,
      file_count_bucket: null,
      loc_bucket: meta.loc_bucket ?? null,
      repo_metrics_updated_at: null,
      eta_accuracy: null,
    }),
    'utf-8',
  );
}

describe('anonymizeTask', () => {
  it('strips all PII fields from output', async () => {
    const ts = Date.now() + Math.random();
    const { anonymizeTask } = await import(`../dist/cli/export.js?t=${ts}`);
    const task = {
      task_id: 'task-1',
      session_id: 'sess-1',
      project: 'test',
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
    };

    const record = anonymizeTask(task, 'test-project', '1.0.0');
    assert.ok(record);
    const keys = Object.keys(record);
    for (const pii of PII_FIELDS) {
      assert.ok(!keys.includes(pii), `must not contain ${pii}`);
    }
    for (const value of Object.values(record)) {
      if (typeof value === 'string') {
        assert.ok(!value.includes('/home/'), `must not contain file paths: ${value}`);
      }
    }
  });

  it('skips tasks with null duration', async () => {
    const ts = Date.now() + Math.random();
    const { anonymizeTask } = await import(`../dist/cli/export.js?t=${ts}`);
    const task = {
      task_id: 'task-1',
      session_id: 'sess-1',
      project: 'test',
      timestamp_start: new Date().toISOString(),
      timestamp_end: new Date().toISOString(),
      duration_seconds: null,
      prompt_summary: 'test',
      classification: 'bugfix',
      tool_calls: 0,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'claude-sonnet-4-20250514',
    };

    const record = anonymizeTask(task, 'test-project', '1.0.0');
    assert.equal(record, null);
  });

  it('normalizes model name', async () => {
    const ts = Date.now() + Math.random();
    const { anonymizeTask } = await import(`../dist/cli/export.js?t=${ts}`);
    const task = {
      task_id: 'task-1',
      session_id: 'sess-1',
      project: 'test',
      timestamp_start: new Date().toISOString(),
      timestamp_end: new Date().toISOString(),
      duration_seconds: 60,
      prompt_summary: 'test',
      classification: 'bugfix',
      tool_calls: 0,
      files_read: 0,
      files_edited: 0,
      files_created: 0,
      errors: 0,
      model: 'claude-sonnet-4-20250514',
    };

    const record = anonymizeTask(task, 'test-project', '1.0.0');
    assert.equal(record.model, 'claude-sonnet-4');
  });
});

describe('anonymizeProject (v2 compat)', () => {
  it('hashes project name in output', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);

    const ts = Date.now() + Math.random();
    const { anonymizeProject } = await import(`../dist/cli/export.js?t=${ts}`);
    const records = anonymizeProject(TEST_CWD, '1.0.0');

    assert.ok(records.length > 0);
    assert.match(records[0].project_hash, /^[a-f0-9]{64}$/);
  });

  it('does not collide for different paths that share the same basename', async () => {
    const sharedName = 'shared-project';
    const projectA = path.join(TEST_CWD, 'team-a', sharedName);
    const projectB = path.join(TEST_CWD, 'team-b', sharedName);

    fs.mkdirSync(projectA, { recursive: true });
    fs.mkdirSync(projectB, { recursive: true });
    writeCompletedTurns(projectA, [makeCompletedTurn()]);
    writeCompletedTurns(projectB, [makeCompletedTurn()]);

    const ts = Date.now() + Math.random();
    const { anonymizeProject } = await import(`../dist/cli/export.js?t=${ts}`);
    const recordsA = anonymizeProject(projectA, '1.0.0');
    const recordsB = anonymizeProject(projectB, '1.0.0');

    assert.ok(recordsA.length > 0);
    assert.ok(recordsB.length > 0);
    assert.notEqual(recordsA[0].project_hash, recordsB[0].project_hash);
    assert.notEqual(recordsA[0].project_hash, sharedName);
    assert.notEqual(recordsB[0].project_hash, sharedName);
  });

  it('includes project_file_count and project_loc_bucket when set (F-03)', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);
    writeProjectMeta(TEST_CWD, { file_count: 42, loc_bucket: 'small' });

    const ts = Date.now() + Math.random();
    const { anonymizeProject } = await import(`../dist/cli/export.js?t=${ts}`);
    const records = anonymizeProject(TEST_CWD, '1.0.0');

    assert.ok(records.length > 0);
    assert.equal(records[0].project_file_count, 42);
    assert.equal(records[0].project_loc_bucket, 'small');
  });

  it('returns null for project metadata when not set (F-03)', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);

    const ts = Date.now() + Math.random();
    const { anonymizeProject } = await import(`../dist/cli/export.js?t=${ts}`);
    const records = anonymizeProject(TEST_CWD, '1.0.0');

    assert.ok(records.length > 0);
    assert.equal(records[0].project_file_count, null);
    assert.equal(records[0].project_loc_bucket, null);
  });

  it('excludes subagent turns from anonymized export', async () => {
    writeCompletedTurns(TEST_CWD, [
      makeCompletedTurn({ turn_id: 'turn-main', work_item_id: 'wi-main', runner_kind: 'main' }),
      makeCompletedTurn({
        turn_id: 'turn-sub',
        work_item_id: 'wi-sub',
        runner_kind: 'subagent',
        agent_key: 'agent-1',
        agent_id: 'agent-1',
        agent_type: 'Explore',
      }),
    ]);

    const ts = Date.now() + Math.random();
    const { anonymizeProject } = await import(`../dist/cli/export.js?t=${ts}`);
    const records = anonymizeProject(TEST_CWD, '1.0.0');

    assert.equal(records.length, 1);
    assert.equal(records[0].dedup_key.length, 32);
  });
});
