import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-contribute-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-contribute-cwd-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

function makeCompletedTurn(overrides = {}) {
  const now = new Date().toISOString();
  return {
    turn_id: 'turn-' + Math.random().toString(36).slice(2),
    work_item_id: 'work-1',
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: 'abcdef1234567890',
    project_display_name: 'contribute-test',
    classification: 'bugfix',
    prompt_summary: 'fix the secret auth bug',
    prompt_complexity: 2,
    started_at: now,
    ended_at: now,
    wall_seconds: 120,
    active_seconds: null,
    tool_calls: 10,
    files_read: 3,
    files_edited: 2,
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
    model: 'claude-sonnet-4-20250514',
    source: null,
    stop_reason: 'end_turn',
    path_fps: [],
    ...overrides,
  };
}

function computeTestFp(cwd) {
  let resolved;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    resolved = path.resolve(cwd);
  }
  const hash = crypto.createHash('sha256').update(resolved).digest('hex');
  return hash.slice(0, 16);
}

function writeCompletedTurns(cwd, turns) {
  const fp = computeTestFp(cwd);
  const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
  fs.mkdirSync(completedDir, { recursive: true });
  const lines = turns.map((turn) => JSON.stringify(turn)).join('\n') + '\n';
  fs.writeFileSync(path.join(completedDir, 'sess-1__main.jsonl'), lines, 'utf-8');
}

function writePreferences(overrides = {}) {
  const prefsPath = path.join(TEST_DATA_DIR, 'config', 'preferences.json');
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(
    prefsPath,
    JSON.stringify(
      {
        auto_eta: false,
        community_sharing: false,
        prompts_since_last_eta: 0,
        last_eta_task_id: null,
        updated_at: new Date().toISOString(),
        ...overrides,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

describe('showContribute', () => {
  it('blocks preview when community sharing is disabled', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const ts = Date.now() + Math.random();
      const { showContribute } = await import(`../dist/cli/contribute.js?t=${ts}`);
      await showContribute(TEST_CWD, '1.0.0');
    } finally {
      console.log = originalLog;
    }

    assert.ok(logs.some((line) => line.includes('Community sharing is disabled.')));
    assert.ok(!logs.some((line) => line.includes('new anonymized records ready to contribute')));
  });

  it('ignores malformed persisted contribution state', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);
    writePreferences({ community_sharing: true });

    const statePath = path.join(TEST_DATA_DIR, 'community', '_contribute_state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        last_contributed_at: 42,
        last_contributed_count: 'oops',
        contributed_task_ids: { broken: true },
      }),
      'utf-8',
    );

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const ts = Date.now() + Math.random();
      const { showContribute } = await import(`../dist/cli/contribute.js?t=${ts}`);
      await showContribute(TEST_CWD, '1.0.0');
    } finally {
      console.log = originalLog;
    }

    assert.ok(logs.some((line) => line.includes('new anonymized records ready to contribute')));
    assert.ok(logs.some((line) => line.includes('Sharing status: enabled (manual upload mode).')));
  });
});

describe('executeContribute', () => {
  it('does not upload when community sharing is disabled', async () => {
    writeCompletedTurns(TEST_CWD, [makeCompletedTurn()]);

    const logs = [];
    const originalLog = console.log;
    const originalFetch = global.fetch;
    let fetchCalled = false;
    console.log = (...args) => logs.push(args.join(' '));
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called');
    };

    try {
      const ts = Date.now() + Math.random();
      const { executeContribute } = await import(`../dist/cli/contribute.js?t=${ts}`);
      await executeContribute(TEST_CWD, '1.0.0');
    } finally {
      console.log = originalLog;
      global.fetch = originalFetch;
    }

    assert.equal(fetchCalled, false);
    assert.ok(logs.some((line) => line.includes('Community sharing is disabled.')));
  });
});
