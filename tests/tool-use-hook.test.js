import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;
const SESSION_ID = 'sess-tool-use';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-tool-use-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-tool-use-cwd-'));
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
    turn_id: 'turn-live',
    work_item_id: 'wi-live',
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
    tool_calls: 1,
    files_read: 0,
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
    live_remaining_p50: 80,
    live_remaining_p80: 140,
    live_phase: 'edit',
    last_phase: 'edit',
    refined_eta: null,
    files_edited_after_first_failure: 0,
    first_bash_failure_at_ms: null,
    cumulative_work_item_seconds: 0,
    ...overrides,
  };

  const activePath = path.join(activeDir, `${SESSION_ID}__main.json`);
  fs.writeFileSync(activePath, JSON.stringify(state));
  return activePath;
}

function runToolUse(stdin) {
  return execFileSync('node', ['dist/hooks/on-tool-use.js'], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

describe('PostToolUse hook live ETA countdown', () => {
  it('recomputes live remaining inside the same phase on each tool event', () => {
    const activePath = seedActiveTurn();

    runToolUse({
      cwd: TEST_CWD,
      session_id: SESSION_ID,
      tool_name: 'Read',
      tool_input: { file_path: path.join(TEST_CWD, 'src', 'auth.ts') },
    });

    const state = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(state.live_phase, 'edit');
    assert.ok(state.live_remaining_p50 >= 19 && state.live_remaining_p50 <= 21, JSON.stringify(state));
    assert.ok(state.live_remaining_p80 >= 79 && state.live_remaining_p80 <= 81, JSON.stringify(state));
  });
});
