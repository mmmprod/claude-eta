import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Isolate data dir for tests
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-identity-'));
process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;

const { resolveProjectIdentity, getLocalSalt, hashWithLocalSalt } = await import('../dist/identity.js');

after(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe('resolveProjectIdentity', () => {
  it('returns a 16-char hex fingerprint', () => {
    const id = resolveProjectIdentity('/tmp');
    assert.equal(id.fp.length, 16);
    assert.match(id.fp, /^[0-9a-f]{16}$/);
  });

  it('returns basename as displayName', () => {
    const id = resolveProjectIdentity('/some/path/my-project');
    assert.equal(id.displayName, 'my-project');
  });

  it('is deterministic', () => {
    const a = resolveProjectIdentity('/tmp');
    const b = resolveProjectIdentity('/tmp');
    assert.equal(a.fp, b.fp);
  });

  it('different paths produce different fingerprints', () => {
    const a = resolveProjectIdentity('/x/app');
    const b = resolveProjectIdentity('/y/app');
    assert.notEqual(a.fp, b.fp);
  });

  it('same basename but different parents do NOT collide', () => {
    // This is the key fix for defect 3
    const a = resolveProjectIdentity('/workspace/frontend/app');
    const b = resolveProjectIdentity('/workspace/backend/app');
    assert.notEqual(a.fp, b.fp);
    assert.equal(a.displayName, 'app');
    assert.equal(b.displayName, 'app');
  });

  it('resolves symlinks to canonical path', () => {
    const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-real-'));
    const linkDir = path.join(os.tmpdir(), `eta-link-${Date.now()}`);
    try {
      fs.symlinkSync(realDir, linkDir);
      const fromReal = resolveProjectIdentity(realDir);
      const fromLink = resolveProjectIdentity(linkDir);
      assert.equal(fromReal.fp, fromLink.fp);
    } finally {
      try { fs.unlinkSync(linkDir); } catch {}
      fs.rmSync(realDir, { recursive: true, force: true });
    }
  });
});

describe('getLocalSalt', () => {
  it('returns a non-empty string', () => {
    const salt = getLocalSalt();
    assert.ok(salt.length > 0);
  });

  it('is stable across calls', () => {
    const a = getLocalSalt();
    const b = getLocalSalt();
    assert.equal(a, b);
  });

  it('creates salt file on first call', () => {
    const saltPath = path.join(TEST_DATA_DIR, 'local-salt.txt');
    assert.ok(fs.existsSync(saltPath));
  });
});

describe('hashWithLocalSalt', () => {
  it('returns a 64-char hex hash', () => {
    const hash = hashWithLocalSalt('test-value');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const a = hashWithLocalSalt('same');
    const b = hashWithLocalSalt('same');
    assert.equal(a, b);
  });

  it('different inputs produce different hashes', () => {
    const a = hashWithLocalSalt('value-a');
    const b = hashWithLocalSalt('value-b');
    assert.notEqual(a, b);
  });

  it('does not contain the original value', () => {
    const hash = hashWithLocalSalt('/home/user/secret-project');
    assert.ok(!hash.includes('secret'));
    assert.ok(!hash.includes('user'));
  });
});
