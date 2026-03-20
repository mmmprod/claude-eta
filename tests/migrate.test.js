import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let TEST_DATA_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-migrate-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

function makeLegacyTask(overrides = {}) {
  return {
    task_id: 'task-' + Math.random().toString(36).slice(2),
    session_id: 'sess-legacy',
    project: 'test',
    timestamp_start: new Date().toISOString(),
    timestamp_end: new Date().toISOString(),
    duration_seconds: 60,
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

function writeLegacyProject(slug, tasks) {
  const dataDir = path.join(TEST_DATA_DIR, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const data = {
    project: slug,
    created: new Date().toISOString(),
    tasks,
    eta_accuracy: {},
  };
  fs.writeFileSync(path.join(dataDir, `${slug}.json`), JSON.stringify(data));
}

async function loadModules() {
  const ts = Date.now() + Math.random();
  const migrate = await import(`../dist/migrate.js?t=${ts}`);
  const eventStore = await import(`../dist/event-store.js?t=${ts}`);
  return { ...migrate, ...eventStore };
}

// ── needsMigration ───────────────────────────────────────────

describe('needsMigration', () => {
  it('returns false when no legacy file exists', async () => {
    const { needsMigration } = await loadModules();
    assert.equal(needsMigration('fp123456', 'nonexistent'), false);
  });

  it('returns true when legacy exists but not migrated', async () => {
    const { needsMigration } = await loadModules();
    writeLegacyProject('my-project', [makeLegacyTask()]);
    assert.equal(needsMigration('fp123456', 'my-project'), true);
  });

  it('returns false after migration', async () => {
    const { needsMigration, migrateLegacyProject } = await loadModules();
    writeLegacyProject('my-project', [makeLegacyTask()]);
    migrateLegacyProject('fp123456', 'my-project', 'my-project', '/tmp/test');
    assert.equal(needsMigration('fp123456', 'my-project'), false);
  });
});

// ── migrateLegacyProject ─────────────────────────────────────

describe('migrateLegacyProject', () => {
  it('migrates tasks to completed JSONL', async () => {
    const { migrateLegacyProject, loadCompletedTurns } = await loadModules();

    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeLegacyTask({ task_id: `task-${i}`, duration_seconds: 30 + i * 10 }),
    );
    writeLegacyProject('test-proj', tasks);

    const result = migrateLegacyProject('fp12345678901234', 'test-proj', 'test-proj', '/tmp/test');
    assert.equal(result.migratedCount, 5);

    const turns = loadCompletedTurns('fp12345678901234');
    assert.equal(turns.length, 5);
    assert.equal(turns[0].stop_reason, 'migrated');
    assert.equal(turns[0].runner_kind, 'main');
    assert.equal(turns[0].agent_key, 'main');
  });

  it('skips tasks with null/zero duration', async () => {
    const { migrateLegacyProject, loadCompletedTurns } = await loadModules();

    const tasks = [
      makeLegacyTask({ duration_seconds: 60 }),
      makeLegacyTask({ duration_seconds: null }),
      makeLegacyTask({ duration_seconds: 0 }),
      makeLegacyTask({ duration_seconds: 120 }),
    ];
    writeLegacyProject('partial', tasks);

    const result = migrateLegacyProject('fp_partial_12345', 'partial', 'partial', '/tmp');
    assert.equal(result.migratedCount, 2);

    const turns = loadCompletedTurns('fp_partial_12345');
    assert.equal(turns.length, 2);
  });

  it('preserves all counter fields', async () => {
    const { migrateLegacyProject, loadCompletedTurns } = await loadModules();

    const task = makeLegacyTask({
      tool_calls: 42,
      files_read: 10,
      files_edited: 5,
      files_created: 2,
      errors: 3,
      classification: 'bugfix',
      model: 'claude-sonnet-4',
    });
    writeLegacyProject('counters', [task]);

    migrateLegacyProject('fp_counters_1234', 'counters', 'counters', '/tmp');

    const turns = loadCompletedTurns('fp_counters_1234');
    assert.equal(turns[0].tool_calls, 42);
    assert.equal(turns[0].files_read, 10);
    assert.equal(turns[0].files_edited, 5);
    assert.equal(turns[0].files_created, 2);
    assert.equal(turns[0].errors, 3);
    assert.equal(turns[0].classification, 'bugfix');
    assert.equal(turns[0].model, 'claude-sonnet-4');
  });

  it('is idempotent — second call does nothing', async () => {
    const { migrateLegacyProject, loadCompletedTurns } = await loadModules();

    writeLegacyProject('idempotent', [makeLegacyTask()]);

    const r1 = migrateLegacyProject('fp_idempotent_12', 'idempotent', 'idempotent', '/tmp');
    assert.equal(r1.migratedCount, 1);

    const r2 = migrateLegacyProject('fp_idempotent_12', 'idempotent', 'idempotent', '/tmp');
    // Second call: needsMigration returns false, so migrateLegacyProject shouldn't double-write
    // But since migrateLegacyProject writes the marker, calling it again should still return 0
    // because the marker already exists. Let's check the actual behavior.

    const turns = loadCompletedTurns('fp_idempotent_12');
    // Should still be exactly 1 turn, not 2
    assert.equal(turns.length, 1);
  });

  it('handles empty project', async () => {
    const { migrateLegacyProject, loadCompletedTurns } = await loadModules();

    writeLegacyProject('empty', []);

    const result = migrateLegacyProject('fp_empty_1234567', 'empty', 'empty', '/tmp');
    assert.equal(result.migratedCount, 0);

    const turns = loadCompletedTurns('fp_empty_1234567');
    assert.equal(turns.length, 0);
  });

  it('does not delete legacy files', async () => {
    const { migrateLegacyProject } = await loadModules();

    writeLegacyProject('keep-legacy', [makeLegacyTask()]);
    const legacyPath = path.join(TEST_DATA_DIR, 'data', 'keep-legacy.json');

    migrateLegacyProject('fp_keep_legacy_12', 'keep-legacy', 'keep-legacy', '/tmp');

    assert.ok(fs.existsSync(legacyPath));
  });

  it('writes project meta.json', async () => {
    const { migrateLegacyProject } = await loadModules();
    const { getProjectMetaPath } = await import('../dist/paths.js');

    writeLegacyProject('with-meta', [makeLegacyTask()]);

    migrateLegacyProject('fp_meta_12345678', 'with-meta', 'with-meta', '/workspace/app');

    const metaPath = getProjectMetaPath('fp_meta_12345678');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    assert.equal(meta.project_fp, 'fp_meta_12345678');
    assert.equal(meta.display_name, 'with-meta');
    assert.equal(meta.cwd_realpath, '/workspace/app');
  });
});

// ── loadCompletedTurnsCompat ─────────────────────────────────

describe('loadCompletedTurnsCompat', () => {
  it('reads from legacy when not migrated', async () => {
    const ts = Date.now() + Math.random();
    const { loadCompletedTurnsCompat } = await import(`../dist/compat.js?t=${ts}`);

    // Write a legacy project under the slug that matches /tmp basename
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-compat-proj-'));
    const slug = path.basename(tmpDir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    writeLegacyProject(slug, [
      makeLegacyTask({ duration_seconds: 100 }),
      makeLegacyTask({ duration_seconds: 200 }),
    ]);

    const turns = loadCompletedTurnsCompat(tmpDir);
    assert.equal(turns.length, 2);
    assert.equal(turns[0].wall_seconds, 100);
    assert.equal(turns[0].stop_reason, 'migrated');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
