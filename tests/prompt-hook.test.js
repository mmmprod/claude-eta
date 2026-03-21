import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;
const SESSION_ID = 'sess-prompt-hook';

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-prompt-hook-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-prompt-hook-cwd-'));
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
  const fp = getProjectFp(TEST_CWD);
  const activeDir = path.join(TEST_DATA_DIR, 'projects', fp, 'active');
  fs.mkdirSync(activeDir, { recursive: true });

  const state = {
    turn_id: 'turn-existing',
    work_item_id: 'wi-existing',
    session_id: SESSION_ID,
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: fp,
    project_display_name: path.basename(TEST_CWD),
    classification: 'bugfix',
    prompt_summary: 'fix auth bug',
    prompt_complexity: 2,
    started_at: new Date(Date.now() - 5000).toISOString(),
    started_at_ms: Date.now() - 5000,
    tool_calls: 2,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
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
    error_fingerprints: [],
    ...overrides,
  };

  fs.writeFileSync(path.join(activeDir, `${SESSION_ID}__main.json`), JSON.stringify(state));
  return { fp, activePath: path.join(activeDir, `${SESSION_ID}__main.json`) };
}

function runPrompt(prompt) {
  return execFileSync('node', ['dist/hooks/on-prompt.js'], {
    input: JSON.stringify({ cwd: TEST_CWD, session_id: SESSION_ID, prompt }),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

describe('UserPromptSubmit hook work-item continuity', () => {
  it('reuses work_item_id across same-task follow-up prompts', () => {
    const { fp, activePath } = seedActiveTurn();

    runPrompt('continue et gere aussi les cas limites du parser sans casser les hooks existants');

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(active.work_item_id, 'wi-existing');
    assert.notEqual(active.turn_id, 'turn-existing');

    const completedPath = path.join(TEST_DATA_DIR, 'projects', fp, 'completed', `${SESSION_ID}__main.jsonl`);
    const lines = fs.readFileSync(completedPath, 'utf8').trim().split('\n');
    const completed = JSON.parse(lines[0]);
    assert.equal(completed.turn_id, 'turn-existing');
    assert.equal(completed.work_item_id, 'wi-existing');
    assert.equal(completed.stop_reason, 'replaced_by_new_prompt');
  });

  it('starts a new work item for explicit topic switches', () => {
    const { activePath } = seedActiveTurn();

    runPrompt('switch to the billing issue');

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.notEqual(active.work_item_id, 'wi-existing');
  });

  it('keeps the same active turn on conversational continuation', () => {
    const { activePath } = seedActiveTurn();

    runPrompt('ok');

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(active.turn_id, 'turn-existing');
    assert.equal(active.work_item_id, 'wi-existing');
  });
});
