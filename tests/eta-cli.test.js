import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;
const SESSION_ID = 'sess-eta-cli';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-cli-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-cli-cwd-'));
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

function seedActiveTurn(overrides = {}) {
  const now = Date.now();
  const fp = getProjectFp(TEST_CWD);
  const activeDir = path.join(TEST_DATA_DIR, 'projects', fp, 'active');
  fs.mkdirSync(activeDir, { recursive: true });

  const state = {
    turn_id: 'turn-active',
    work_item_id: 'wi-active',
    session_id: SESSION_ID,
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: fp,
    project_display_name: path.basename(TEST_CWD),
    classification: 'bugfix',
    prompt_summary: 'fix auth redirect bug',
    prompt_complexity: 2,
    started_at: new Date(now - 100000).toISOString(),
    started_at_ms: now - 100000,
    tool_calls: 3,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
    bash_calls: 0,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    first_tool_at_ms: now - 99000,
    first_edit_at_ms: now - 98000,
    first_bash_at_ms: null,
    last_event_at_ms: now - 1000,
    last_assistant_message: null,
    model: null,
    source: null,
    status: 'active',
    path_fps: [],
    error_fingerprints: [],
    cached_eta: {
      p50_wall: 120,
      p80_wall: 180,
      basis: 'generic bugfix baseline',
      calibration: 'cold',
    },
    live_remaining_p50: 20,
    live_remaining_p80: 80,
    live_phase: 'edit',
    last_phase: 'edit',
    refined_eta: null,
    files_edited_after_first_failure: 0,
    first_bash_failure_at_ms: null,
    cumulative_work_item_seconds: 0,
    ...overrides,
  };

  fs.writeFileSync(path.join(activeDir, `${SESSION_ID}__main.json`), JSON.stringify(state));
}

describe('/eta session first-run view', () => {
  it('shows the live active task block even when no task has completed yet', () => {
    seedActiveTurn();

    const output = execFileSync('node', ['dist/cli/eta.js', 'session', TEST_CWD], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
    });

    assert.ok(output.includes('Session Stats (0 tasks)'), output);
    assert.ok(output.includes('Active task: "fix auth redirect bug" (bugfix)'), output);
    assert.ok(output.includes('Phase: edit | Elapsed: 1m 40s | Remaining: ~20s-1m 20s'), output);
    assert.ok(output.includes('Privacy mode:'), output);
  });

  it('emits ANSI colors when FORCE_COLOR=1 is set', () => {
    seedActiveTurn();
    const env = { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR, FORCE_COLOR: '1' };
    delete env.NO_COLOR;

    const output = execFileSync('node', ['dist/cli/eta.js', 'session', TEST_CWD], {
      encoding: 'utf8',
      timeout: 5000,
      env,
    });

    assert.match(output, /\x1b\[[0-9;]*m/);
  });

  it('suppresses ANSI colors when NO_COLOR=1 is set even if FORCE_COLOR=1', () => {
    seedActiveTurn();

    const output = execFileSync('node', ['dist/cli/eta.js', 'session', TEST_CWD], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR, FORCE_COLOR: '1', NO_COLOR: '1' },
    });

    assert.doesNotMatch(output, /\x1b\[[0-9;]*m/);
  });
});
