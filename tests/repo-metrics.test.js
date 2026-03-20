import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let TEST_DATA_DIR;
let TEST_REPO_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-metrics-'));
  TEST_REPO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-repo-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;

  // Create some test files in the repo
  fs.writeFileSync(path.join(TEST_REPO_DIR, 'index.ts'), 'console.log("hello");\n'.repeat(10));
  fs.writeFileSync(path.join(TEST_REPO_DIR, 'utils.ts'), 'export const x = 1;\n'.repeat(5));
  fs.mkdirSync(path.join(TEST_REPO_DIR, 'src'));
  fs.writeFileSync(path.join(TEST_REPO_DIR, 'src', 'app.ts'), 'import {} from "x";\n'.repeat(20));
  // Binary file (should not count toward LOC)
  fs.writeFileSync(path.join(TEST_REPO_DIR, 'logo.png'), Buffer.alloc(1000));
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

async function loadModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/repo-metrics.js?t=${ts}`);
}

describe('computeRepoMetrics', () => {
  it('counts files and estimates LOC', async () => {
    const { computeRepoMetrics } = await loadModule();
    const metrics = computeRepoMetrics(TEST_REPO_DIR);
    assert.equal(metrics.fileCount, 4); // 3 .ts + 1 .png
    assert.ok(metrics.estimatedLoc > 0);
    assert.ok(metrics.locBucketValue);
    assert.ok(metrics.computedAt);
  });

  it('excludes binary files from LOC estimation', async () => {
    const { computeRepoMetrics } = await loadModule();
    // Create a large binary file
    fs.writeFileSync(path.join(TEST_REPO_DIR, 'big.wasm'), Buffer.alloc(100000));
    const metrics = computeRepoMetrics(TEST_REPO_DIR);
    // LOC should be based only on text files, not the 100KB wasm
    assert.ok(metrics.estimatedLoc < 500);
  });

  it('skips node_modules', async () => {
    const { computeRepoMetrics } = await loadModule();
    const nmDir = path.join(TEST_REPO_DIR, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(path.join(nmDir, `file${i}.js`), 'x');
    }
    const metrics = computeRepoMetrics(TEST_REPO_DIR);
    assert.equal(metrics.fileCount, 4); // Only the original 4 files
  });
});

describe('fileCountBucket', () => {
  it('returns correct buckets', async () => {
    const { fileCountBucket } = await loadModule();
    assert.equal(fileCountBucket(10), 'tiny');
    assert.equal(fileCountBucket(200), 'small');
    assert.equal(fileCountBucket(2000), 'medium');
    assert.equal(fileCountBucket(10000), 'large');
    assert.equal(fileCountBucket(50000), 'huge');
  });
});

describe('getRepoMetrics (cached)', () => {
  it('returns fresh metrics on first call', async () => {
    const { getRepoMetrics } = await loadModule();
    const metrics = getRepoMetrics(TEST_REPO_DIR, 'testfp1234567890');
    assert.equal(metrics.fileCount, 4);
    assert.ok(metrics.computedAt);
  });

  it('returns cached metrics on second call', async () => {
    const { getRepoMetrics } = await loadModule();
    const fp = 'cachefp123456789';
    const first = getRepoMetrics(TEST_REPO_DIR, fp);

    // Add a file — should not be seen if cache is used
    fs.writeFileSync(path.join(TEST_REPO_DIR, 'new.ts'), 'new file');
    const second = getRepoMetrics(TEST_REPO_DIR, fp);

    assert.equal(first.fileCount, second.fileCount);
    assert.equal(first.computedAt, second.computedAt);
  });

  it('cache file is written to project cache dir', async () => {
    const { getRepoMetrics } = await loadModule();
    const fp = 'diskfp12345678901';
    getRepoMetrics(TEST_REPO_DIR, fp);

    const cachePath = path.join(TEST_DATA_DIR, 'projects', fp, 'cache', 'repo-metrics.json');
    assert.ok(fs.existsSync(cachePath));
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    assert.equal(cached.fileCount, 4);
  });
});
