import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let TEST_DATA_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-debug-log-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

async function loadModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/debug-log.js?t=${ts}`);
}

describe('appendProjectDebugLog', () => {
  it('writes a debug line into the project cache directory', async () => {
    const { appendProjectDebugLog } = await loadModule();
    appendProjectDebugLog('fp-debug-123456', 'stop-hook-errors.log', 'hello debug');

    const logPath = path.join(TEST_DATA_DIR, 'projects', 'fp-debug-123456', 'cache', 'stop-hook-errors.log');
    assert.ok(fs.existsSync(logPath));
    assert.ok(fs.readFileSync(logPath, 'utf-8').includes('hello debug'));
  });
});
