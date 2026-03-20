import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Must set env BEFORE importing the module
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-paths-'));
process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;

const {
  getPluginDataDir,
  getProjectDir,
  getActiveDir,
  getEventsDir,
  getCompletedDir,
  getSessionsDir,
  getCacheDir,
  getCommunityDir,
  getLegacyDataDir,
  getActiveTurnPath,
  getEventLogPath,
  getCompletedLogPath,
  getSessionMetaPath,
  getProjectMetaPath,
  getSchemaVersionPath,
  ensureDir,
  ensureProjectDirs,
} = await import('../dist/paths.js');

after(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe('getPluginDataDir', () => {
  it('returns CLAUDE_PLUGIN_DATA when set', () => {
    assert.equal(getPluginDataDir(), TEST_DATA_DIR);
  });
});

describe('directory helpers', () => {
  it('builds correct project dir', () => {
    const dir = getProjectDir('abc123');
    assert.ok(dir.includes('projects'));
    assert.ok(dir.endsWith('abc123'));
  });

  it('builds correct subdirectories', () => {
    const fp = 'deadbeef';
    assert.ok(getActiveDir(fp).endsWith(path.join(fp, 'active')));
    assert.ok(getEventsDir(fp).endsWith(path.join(fp, 'events')));
    assert.ok(getCompletedDir(fp).endsWith(path.join(fp, 'completed')));
    assert.ok(getSessionsDir(fp).endsWith(path.join(fp, 'sessions')));
    assert.ok(getCacheDir(fp).endsWith(path.join(fp, 'cache')));
  });

  it('builds correct community dir', () => {
    assert.ok(getCommunityDir().endsWith('community'));
  });

  it('builds correct legacy data dir', () => {
    assert.ok(getLegacyDataDir().endsWith('data'));
  });
});

describe('file path helpers', () => {
  it('builds active turn path with session__agent pattern', () => {
    const p = getActiveTurnPath('fp1', 'sess-abc', 'main');
    assert.ok(p.endsWith('sess-abc__main.json'));
    assert.ok(p.includes('active'));
  });

  it('builds event log path', () => {
    const p = getEventLogPath('fp1', 'sess-abc', 'agent-1');
    assert.ok(p.endsWith('sess-abc__agent-1.jsonl'));
    assert.ok(p.includes('events'));
  });

  it('builds completed log path', () => {
    const p = getCompletedLogPath('fp1', 'sess-abc', 'main');
    assert.ok(p.endsWith('sess-abc__main.jsonl'));
    assert.ok(p.includes('completed'));
  });

  it('builds session meta path', () => {
    const p = getSessionMetaPath('fp1', 'sess-abc');
    assert.ok(p.endsWith('sess-abc.json'));
    assert.ok(p.includes('sessions'));
  });

  it('builds project meta path', () => {
    const p = getProjectMetaPath('fp1');
    assert.ok(p.endsWith('meta.json'));
  });

  it('builds schema version path at data root', () => {
    const p = getSchemaVersionPath();
    assert.ok(p.endsWith('schema-version.json'));
    assert.ok(p.startsWith(TEST_DATA_DIR));
  });
});

describe('ensureDir', () => {
  it('creates nested directories', () => {
    const deep = path.join(TEST_DATA_DIR, 'a', 'b', 'c');
    ensureDir(deep);
    assert.ok(fs.existsSync(deep));
  });

  it('is idempotent', () => {
    const deep = path.join(TEST_DATA_DIR, 'a', 'b', 'c');
    ensureDir(deep);
    ensureDir(deep); // no throw
    assert.ok(fs.existsSync(deep));
  });
});

describe('ensureProjectDirs', () => {
  it('creates all subdirectories for a project', () => {
    ensureProjectDirs('test-proj');
    const base = getProjectDir('test-proj');
    assert.ok(fs.existsSync(path.join(base, 'active')));
    assert.ok(fs.existsSync(path.join(base, 'events')));
    assert.ok(fs.existsSync(path.join(base, 'completed')));
    assert.ok(fs.existsSync(path.join(base, 'sessions')));
    assert.ok(fs.existsSync(path.join(base, 'cache')));
  });
});
