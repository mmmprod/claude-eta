import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;
const SESSION_ID = 'sess-tool-failure';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-tool-failure-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-tool-failure-cwd-'));
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
});

function getProjectFp(cwd) {
  let resolved;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    resolved = cwd;
  }
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
}

function seedLegacyActiveTurn(overrides = {}) {
  const fp = getProjectFp(TEST_CWD);
  const activeDir = path.join(TEST_DATA_DIR, 'projects', fp, 'active');
  fs.mkdirSync(activeDir, { recursive: true });

  const state = {
    turn_id: 'turn-legacy',
    work_item_id: 'turn-legacy',
    session_id: SESSION_ID,
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: fp,
    project_display_name: path.basename(TEST_CWD),
    classification: 'bugfix',
    prompt_summary: 'legacy active turn',
    prompt_complexity: 2,
    started_at: new Date(Date.now() - 5000).toISOString(),
    started_at_ms: Date.now() - 5000,
    tool_calls: 0,
    files_read: 0,
    files_edited: 0,
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
    last_event_at_ms: null,
    last_assistant_message: null,
    model: null,
    source: null,
    status: 'active',
    path_fps: [],
    ...overrides,
  };

  fs.writeFileSync(path.join(activeDir, `${SESSION_ID}__main.json`), JSON.stringify(state));
  return { fp, activePath: path.join(activeDir, `${SESSION_ID}__main.json`) };
}

function runToolFailure(stdin) {
  return execFileSync('node', ['dist/hooks/on-tool-failure.js'], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

function runStop(stdin) {
  return execFileSync('node', ['dist/hooks/on-stop.js'], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

describe('PostToolUseFailure hook', () => {
  it('normalizes a legacy active turn missing error_fingerprints', () => {
    const { activePath } = seedLegacyActiveTurn();

    runToolFailure({
      cwd: TEST_CWD,
      session_id: SESSION_ID,
      tool_name: 'Bash',
      error: 'boom',
    });

    const state = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(state.errors, 1);
    assert.equal(state.bash_calls, 1);
    assert.equal(state.bash_failures, 1);
    assert.equal(Array.isArray(state.error_fingerprints), true);
    assert.equal(state.error_fingerprints.length, 1);
  });

  it('does not add repair-loop fingerprints for non-Bash tool failures', () => {
    const { activePath } = seedLegacyActiveTurn({ error_fingerprints: [] });

    runToolFailure({
      cwd: TEST_CWD,
      session_id: SESSION_ID,
      tool_name: 'Read',
      error: 'permission denied',
    });

    const state = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(state.errors, 1);
    assert.equal(state.bash_failures, 0);
    assert.deepEqual(state.error_fingerprints, []);
  });

  it('does not trigger a repair-loop block after repeated non-Bash failures', () => {
    seedLegacyActiveTurn({ error_fingerprints: [] });

    for (let i = 0; i < 5; i++) {
      runToolFailure({
        cwd: TEST_CWD,
        session_id: SESSION_ID,
        tool_name: 'Read',
        error: 'permission denied',
      });
    }

    const output = runStop({
      cwd: TEST_CWD,
      session_id: SESSION_ID,
      last_assistant_message: 'Done.',
    });

    assert.equal(output.includes('Repair loop detected'), false);
  });

  it('allows Stop to close a legacy active turn missing error_fingerprints', () => {
    seedLegacyActiveTurn();

    const output = runStop({
      cwd: TEST_CWD,
      session_id: SESSION_ID,
      last_assistant_message: 'Done.',
    });

    assert.equal(output.includes('Repair loop detected'), false);
  });
});
