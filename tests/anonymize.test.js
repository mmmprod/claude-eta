import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Isolate data dir for tests
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-anon-'));
process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;

const { contributorHash, projectHash, normalizeModel, locBucket } = await import('../dist/anonymize.js');
const { hashWithLocalSalt } = await import('../dist/identity.js');

after(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe('contributorHash', () => {
  it('returns a 64-char hex string', () => {
    assert.match(contributorHash(), /^[a-f0-9]{64}$/);
  });

  it('is stable between calls', () => {
    assert.equal(contributorHash(), contributorHash());
  });

  it('does not contain the hostname', () => {
    assert.ok(!contributorHash().includes(os.hostname()));
  });

  it('stores contributor ID under CLAUDE_PLUGIN_DATA/community/', () => {
    const idPath = path.join(TEST_DATA_DIR, 'community', '.contributor_id');
    assert.ok(fs.existsSync(idPath), 'contributor ID file should exist in community dir');
    const id = fs.readFileSync(idPath, 'utf-8').trim();
    assert.ok(id.length > 0, 'contributor ID should be non-empty');
  });

  it('migrates contributor ID from old path to new path', () => {
    const migrationHome = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-home-'));
    const migrationDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-data-'));
    const oldId = crypto.randomUUID();
    const oldPath = path.join(migrationHome, '.claude', 'plugins', 'claude-eta', '.contributor_id');
    const newPath = path.join(migrationDataDir, 'community', '.contributor_id');
    const script = `
      const { contributorHash } = await import('./dist/anonymize.js');
      process.stdout.write(contributorHash());
    `;

    try {
      fs.mkdirSync(path.dirname(oldPath), { recursive: true });
      fs.writeFileSync(oldPath, oldId, 'utf-8');

      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: migrationHome,
          CLAUDE_PLUGIN_DATA: migrationDataDir,
        },
      });

      assert.ok(fs.existsSync(newPath), 'new path should exist after migration');
      assert.equal(fs.readFileSync(newPath, 'utf-8').trim(), oldId);
      assert.ok(!fs.existsSync(oldPath), 'old path should be removed after migration');
    } finally {
      fs.rmSync(migrationHome, { recursive: true, force: true });
      fs.rmSync(migrationDataDir, { recursive: true, force: true });
    }
  });
});

describe('projectHash', () => {
  it('never returns the project name in cleartext', () => {
    const hash = projectHash('my-secret-project');
    assert.ok(!hash.includes('my-secret-project'));
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    assert.equal(projectHash('foo'), projectHash('foo'));
  });

  it('differs for different projects', () => {
    assert.notEqual(projectHash('foo'), projectHash('bar'));
  });

  it('uses local salt instead of raw SHA-256', () => {
    const name = 'my-project';
    const salted = projectHash(name);
    const unsalted = crypto.createHash('sha256').update(name).digest('hex');
    assert.equal(salted, hashWithLocalSalt(name));
    assert.notEqual(salted, unsalted, 'projectHash should not match the unsalted project name hash');
  });
});

describe('normalizeModel', () => {
  it('normalizes claude-sonnet-4-20250514', () => {
    assert.equal(normalizeModel('claude-sonnet-4-20250514'), 'claude-sonnet-4');
  });

  it('normalizes claude-opus-4-20250514', () => {
    assert.equal(normalizeModel('claude-opus-4-20250514'), 'claude-opus-4');
  });

  it('normalizes claude-haiku-4.5-20250514', () => {
    assert.equal(normalizeModel('claude-haiku-4.5-20250514'), 'claude-haiku-4.5');
  });

  it('rejects gpt-4', () => {
    assert.equal(normalizeModel('gpt-4'), null);
  });

  it('rejects unknown model', () => {
    assert.equal(normalizeModel('unknown'), null);
  });
});

describe('locBucket', () => {
  it('returns tiny for < 1000', () => {
    assert.equal(locBucket(500), 'tiny');
  });

  it('returns small for 1000-9999', () => {
    assert.equal(locBucket(5000), 'small');
  });

  it('returns medium for 10000-49999', () => {
    assert.equal(locBucket(30000), 'medium');
  });

  it('returns large for 50000-199999', () => {
    assert.equal(locBucket(100000), 'large');
  });

  it('returns huge for >= 200000', () => {
    assert.equal(locBucket(500000), 'huge');
  });
});
