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
    cached_eta: null,
    live_remaining_p50: null,
    live_remaining_p80: null,
    live_phase: null,
    last_phase: null,
    refined_eta: null,
    files_edited_after_first_failure: 0,
    first_bash_failure_at_ms: null,
    cumulative_work_item_seconds: 0,
    ...overrides,
  };

  fs.writeFileSync(path.join(activeDir, `${SESSION_ID}__main.json`), JSON.stringify(state));
  return { fp, activePath: path.join(activeDir, `${SESSION_ID}__main.json`) };
}

function runPrompt(prompt, overrides = {}) {
  return execFileSync('node', ['dist/hooks/on-prompt.js'], {
    input: JSON.stringify({ cwd: TEST_CWD, session_id: SESSION_ID, prompt, ...overrides }),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

function legacySlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function seedLegacyData(tasks) {
  const dataDir = path.join(TEST_DATA_DIR, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const slug = legacySlug(path.basename(TEST_CWD));
  fs.writeFileSync(
    path.join(dataDir, `${slug}.json`),
    JSON.stringify({ project: slug, created: new Date().toISOString(), tasks, eta_accuracy: {} }),
  );
}

function seedPreferences(overrides = {}) {
  const configDir = path.join(TEST_DATA_DIR, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'preferences.json'),
    JSON.stringify({
      auto_eta: false,
      auto_eta_explicitly_set: false,
      community_sharing: false,
      community_onboarding_seen: false,
      community_choice_made: false,
      community_consent_prompt_seen: false,
      prompts_since_last_eta: 0,
      last_eta_task_id: null,
      updated_at: new Date().toISOString(),
      ...overrides,
    }),
  );
}

function makeLegacyTask(overrides = {}) {
  return {
    task_id: 'task-' + Math.random().toString(36).slice(2),
    session_id: 'legacy-session',
    project: legacySlug(path.basename(TEST_CWD)),
    timestamp_start: new Date(Date.now() - 600000).toISOString(),
    timestamp_end: new Date(Date.now() - 599820).toISOString(),
    duration_seconds: 180,
    prompt_summary: 'historical bugfix',
    classification: 'bugfix',
    tool_calls: 4,
    files_read: 2,
    files_edited: 1,
    files_created: 0,
    errors: 0,
    model: 'claude-sonnet-4-20250514',
    ...overrides,
  };
}

function getAdditionalContext(output) {
  if (!output) return '';
  const parsed = JSON.parse(output);
  return parsed?.hookSpecificOutput?.additionalContext ?? '';
}

function fmtSec(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return remainMin > 0 ? `${hr}h${remainMin}m` : `${hr}h`;
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

  it('stores transcript_path on the active turn when provided by the hook runtime', () => {
    const { activePath } = seedActiveTurn();
    const transcriptPath = path.join(TEST_CWD, 'session.jsonl');
    fs.writeFileSync(transcriptPath, '');

    runPrompt('continue', { transcript_path: transcriptPath });

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.equal(active.transcript_path, transcriptPath);
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

  it('does not reuse work_item_id for weak same-pattern prompts without business overlap', () => {
    const { activePath } = seedActiveTurn({
      classification: 'bugfix',
      prompt_summary: 'fix login redirect bug in auth middleware',
    });

    runPrompt('also fix flaky payment webhook retry bug');

    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    assert.notEqual(active.work_item_id, 'wi-existing');
  });

  it('injects remaining ETA on continuation instead of the total estimate', () => {
    seedLegacyData(Array.from({ length: 5 }, () => makeLegacyTask()));
    seedActiveTurn({
      classification: 'bugfix',
      prompt_summary: 'fix auth redirect bug',
      prompt_complexity: 2,
      first_edit_at_ms: Date.now() - 20000,
      cached_eta: {
        p50_wall: 50,
        p80_wall: 90,
        basis: 'generic bugfix baseline',
        calibration: 'cold',
      },
      last_phase: 'edit',
      refined_eta: { p50: 12, p80: 34 },
    });

    const context = getAdditionalContext(runPrompt('ok'));
    assert.ok(context.includes('Current remaining estimate'), context);
  });

  it('injects remaining ETA for same_work_item prompts using the persisted remaining snapshot', () => {
    seedLegacyData(Array.from({ length: 5 }, () => makeLegacyTask()));
    const { activePath } = seedActiveTurn({
      classification: 'bugfix',
      prompt_summary: 'fix erreurs réseau dans compare',
      prompt_complexity: 2,
      started_at: new Date(Date.now() - 260000).toISOString(),
      started_at_ms: Date.now() - 260000,
      model: 'claude-sonnet-4-20250514',
    });

    const context = getAdditionalContext(runPrompt('gère aussi les erreurs réseau dans compare'));
    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));

    assert.ok(context.includes('Current remaining estimate:'), context);
    assert.ok(
      context.includes(
        `Current remaining estimate: ${fmtSec(active.cached_eta.p50_wall)}–${fmtSec(active.cached_eta.p80_wall)}`,
      ),
      context,
    );
  });

  it('does not inject Auto-ETA on ongoing work items', () => {
    seedLegacyData(Array.from({ length: 10 }, () => makeLegacyTask()));
    seedPreferences({ auto_eta: true, auto_eta_explicitly_set: true });
    const { activePath } = seedActiveTurn({
      classification: 'bugfix',
      prompt_summary: 'fix erreurs réseau dans compare',
      prompt_complexity: 2,
      started_at: new Date(Date.now() - 260000).toISOString(),
      started_at_ms: Date.now() - 260000,
      model: 'claude-sonnet-4-20250514',
    });

    const context = getAdditionalContext(
      runPrompt('gère aussi les erreurs réseau dans compare et les cas limites du parser existant'),
    );
    const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));

    assert.equal(active.work_item_id, 'wi-existing');
    assert.ok(context.includes('Current remaining estimate:'), context);
    assert.doesNotMatch(context, /⏱ Estimated:/u);
    assert.doesNotMatch(context, /\[claude-eta auto-eta]/);
  });

  it('injects Auto-ETA for short slash commands when feature history is calibrated', () => {
    seedLegacyData(
      Array.from({ length: 10 }, () =>
        makeLegacyTask({
          classification: 'feature',
          prompt_summary: '/bmad-create-story',
        }),
      ),
    );
    seedPreferences({ auto_eta: true, auto_eta_explicitly_set: true });

    const context = getAdditionalContext(runPrompt('/bmad-create-story'));

    assert.match(context, /\[claude-eta auto-eta]/);
  });
});
