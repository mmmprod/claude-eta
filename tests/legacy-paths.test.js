/**
 * Tests for multi-candidate legacy file discovery.
 *
 * Validates that v2 migration finds v1 data even when CLAUDE_PLUGIN_DATA
 * differs from the hardcoded v1 path (~/.claude/plugins/claude-eta/data).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let PLUGIN_DATA_DIR; // simulates production CLAUDE_PLUGIN_DATA (different from v1 path)
let V1_HARDCODED_DIR; // simulates the v1 hardcoded data path

beforeEach(() => {
  PLUGIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-legpaths-plugin-'));
  V1_HARDCODED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-legpaths-v1-'));
  process.env.CLAUDE_PLUGIN_DATA = PLUGIN_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(PLUGIN_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(V1_HARDCODED_DIR, { recursive: true, force: true });
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

function writeLegacyProjectAt(dir, slug, tasks) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const data = {
    project: slug,
    created: new Date().toISOString(),
    tasks,
    eta_accuracy: {},
  };
  fs.writeFileSync(path.join(dataDir, `${slug}.json`), JSON.stringify(data));
  return dataDir;
}

async function loadModules() {
  const ts = Date.now() + Math.random();
  const paths = await import(`../dist/paths.js?t=${ts}`);
  const migrate = await import(`../dist/migrate.js?t=${ts}`);
  const eventStore = await import(`../dist/event-store.js?t=${ts}`);
  return { ...paths, ...migrate, ...eventStore };
}

// ── findLegacyFile ──────────────────────────────────────────

describe('findLegacyFile', () => {
  it('finds file in CLAUDE_PLUGIN_DATA/data/ (first candidate)', async () => {
    const { findLegacyFile } = await loadModules();

    // Write legacy data under CLAUDE_PLUGIN_DATA/data/
    writeLegacyProjectAt(PLUGIN_DATA_DIR, 'my-project', [makeLegacyTask()]);

    const result = findLegacyFile('my-project.json');
    assert.ok(result !== null, 'should find the file');
    assert.ok(result.startsWith(PLUGIN_DATA_DIR), 'should be under CLAUDE_PLUGIN_DATA');
  });

  it('returns null when file exists nowhere', async () => {
    const { findLegacyFile } = await loadModules();
    const result = findLegacyFile('nonexistent.json');
    assert.equal(result, null);
  });

  it('prefers CLAUDE_PLUGIN_DATA/data/ over v1 hardcoded path', async () => {
    const { findLegacyFile, getV1HardcodedDataDir } = await loadModules();

    // Write to both locations
    writeLegacyProjectAt(PLUGIN_DATA_DIR, 'dup-project', [makeLegacyTask()]);
    const v1Dir = getV1HardcodedDataDir();
    fs.mkdirSync(v1Dir, { recursive: true });
    fs.writeFileSync(path.join(v1Dir, 'dup-project.json'), '{"project":"dup","created":"x","tasks":[]}');

    const result = findLegacyFile('dup-project.json');
    assert.ok(result !== null);
    // Should prefer CLAUDE_PLUGIN_DATA/data/
    assert.ok(result.startsWith(PLUGIN_DATA_DIR), 'should prefer CLAUDE_PLUGIN_DATA path');

    // Cleanup the v1 hardcoded dir we created
    try { fs.rmSync(v1Dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

// ── getV1HardcodedDataDir ────────────────────────────────────

describe('getV1HardcodedDataDir', () => {
  it('returns ~/.claude/plugins/claude-eta/data', async () => {
    const { getV1HardcodedDataDir } = await loadModules();
    const expected = path.join(os.homedir(), '.claude', 'plugins', 'claude-eta', 'data');
    assert.equal(getV1HardcodedDataDir(), expected);
  });

  it('is independent of CLAUDE_PLUGIN_DATA', async () => {
    const { getV1HardcodedDataDir, getLegacyDataDir } = await loadModules();
    // getLegacyDataDir uses CLAUDE_PLUGIN_DATA, getV1HardcodedDataDir does not
    assert.notEqual(getV1HardcodedDataDir(), getLegacyDataDir());
  });
});

// ── needsMigration with split paths ──────────────────────────

describe('needsMigration with v1 hardcoded path', () => {
  it('detects legacy data in CLAUDE_PLUGIN_DATA/data/', async () => {
    const { needsMigration } = await loadModules();

    writeLegacyProjectAt(PLUGIN_DATA_DIR, 'proj-in-plugin', [makeLegacyTask()]);
    assert.equal(needsMigration('fp_plugin_dir_1', 'proj-in-plugin'), true);
  });

  it('detects legacy data in v1 hardcoded path', async () => {
    const { needsMigration, getV1HardcodedDataDir } = await loadModules();

    const v1Dir = getV1HardcodedDataDir();
    fs.mkdirSync(v1Dir, { recursive: true });
    const data = {
      project: 'proj-in-v1',
      created: new Date().toISOString(),
      tasks: [makeLegacyTask()],
      eta_accuracy: {},
    };
    fs.writeFileSync(path.join(v1Dir, 'proj-in-v1.json'), JSON.stringify(data));

    try {
      assert.equal(needsMigration('fp_v1_hardcoded', 'proj-in-v1'), true);
    } finally {
      try { fs.rmSync(v1Dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('returns false when legacy data exists nowhere', async () => {
    const { needsMigration } = await loadModules();
    assert.equal(needsMigration('fp_nowhere_1234', 'ghost-project'), false);
  });
});

// ── migrateLegacyProject with v1 hardcoded path ─────────────

describe('migrateLegacyProject finds v1 data in hardcoded path', () => {
  it('migrates data from v1 hardcoded path when CLAUDE_PLUGIN_DATA differs', async () => {
    const { migrateLegacyProject, loadCompletedTurns, getV1HardcodedDataDir } = await loadModules();

    // Write legacy data ONLY in the v1 hardcoded path (not in CLAUDE_PLUGIN_DATA/data/)
    const v1Dir = getV1HardcodedDataDir();
    fs.mkdirSync(v1Dir, { recursive: true });
    const tasks = [
      makeLegacyTask({ task_id: 'v1-task-1', duration_seconds: 90 }),
      makeLegacyTask({ task_id: 'v1-task-2', duration_seconds: 120 }),
    ];
    const data = {
      project: 'v1-only-proj',
      created: new Date().toISOString(),
      tasks,
      eta_accuracy: {},
    };
    fs.writeFileSync(path.join(v1Dir, 'v1-only-proj.json'), JSON.stringify(data));

    try {
      const result = migrateLegacyProject('fp_v1only_12345', 'v1-only-proj', 'v1-only-proj', '/tmp/test');
      assert.equal(result.migratedCount, 2);

      const turns = loadCompletedTurns('fp_v1only_12345');
      assert.equal(turns.length, 2);
      assert.equal(turns[0].stop_reason, 'migrated');
    } finally {
      try { fs.rmSync(v1Dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
