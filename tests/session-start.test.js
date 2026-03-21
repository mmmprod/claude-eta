import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let TEST_DATA_DIR;
let TEST_CWD;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-session-start-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-session-start-cwd-'));
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
});

function runSessionStart(stdin) {
  return execFileSync('node', ['dist/hooks/on-session-start.js'], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

describe('SessionStart hook onboarding', () => {
  it('shows the local-vs-community choice on first run and persists that it was shown', () => {
    const output = runSessionStart({
      cwd: TEST_CWD,
      session_id: 'sess-1',
      source: 'startup',
      model: 'claude-sonnet-4-20250514',
    });

    assert.match(output, /Data is 100% local/);
    assert.match(output, /Privacy: local-only by default/);
    assert.match(output, /`\/eta community on`/);
    assert.match(output, /`\/eta compare` is read-only/);

    const prefsPath = path.join(TEST_DATA_DIR, 'config', 'preferences.json');
    const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    assert.equal(prefs.community_onboarding_seen, true);
  });

  it('does not repeat the onboarding note after the first display', () => {
    runSessionStart({
      cwd: TEST_CWD,
      session_id: 'sess-1',
      source: 'startup',
      model: 'claude-sonnet-4-20250514',
    });

    const secondOutput = runSessionStart({
      cwd: TEST_CWD,
      session_id: 'sess-2',
      source: 'startup',
      model: 'claude-sonnet-4-20250514',
    });

    assert.match(secondOutput, /Calibration: 0\/5 tasks/);
    assert.doesNotMatch(secondOutput, /Privacy: local-only by default/);
  });
});
