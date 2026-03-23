import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

let TEST_DATA_DIR;
let TEST_CWD;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-stats-cache-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-stats-cache-cwd-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
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

function makeCompletedTurn(index, overrides = {}) {
  const started = new Date(Date.now() - (index + 1) * 60000).toISOString();
  const ended = new Date(Date.now() - index * 60000).toISOString();
  return {
    turn_id: `turn-${index}`,
    work_item_id: `wi-${index}`,
    session_id: 'sess-1',
    agent_key: 'main',
    agent_id: null,
    agent_type: null,
    runner_kind: 'main',
    project_fp: getProjectFp(TEST_CWD),
    project_display_name: path.basename(TEST_CWD),
    classification: 'bugfix',
    prompt_summary: `fix bug ${index}`,
    prompt_complexity: 2,
    started_at: started,
    ended_at: ended,
    wall_seconds: 60 + index * 30,
    first_edit_offset_seconds: 10,
    first_bash_offset_seconds: 30,
    span_until_last_event_seconds: 50 + index * 30,
    tail_after_last_event_seconds: 10,
    active_seconds: 50 + index * 30,
    wait_seconds: 10,
    tool_calls: 3,
    files_read: 1,
    files_edited: 1,
    files_created: 0,
    unique_files: 1,
    bash_calls: 1,
    bash_failures: 0,
    grep_calls: 0,
    glob_calls: 0,
    errors: 0,
    model: 'claude-sonnet-4',
    source: null,
    stop_reason: 'stop',
    repo_loc_bucket: null,
    repo_file_count_bucket: null,
    ...overrides,
  };
}

function writeCompletedTurns(turns) {
  const fp = getProjectFp(TEST_CWD);
  const completedDir = path.join(TEST_DATA_DIR, 'projects', fp, 'completed');
  fs.mkdirSync(completedDir, { recursive: true });
  fs.writeFileSync(
    path.join(completedDir, 'sess-1__main.jsonl'),
    turns.map((turn) => JSON.stringify(turn)).join('\n') + '\n',
  );
  return fp;
}

function getCachePath(fp) {
  return path.join(TEST_DATA_DIR, 'projects', fp, 'cache', 'project-stats.json');
}

async function loadModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/stats-cache.js?t=${ts}`);
}

describe('getProjectStats', () => {
  it('returns cached stats when the history signature is unchanged', async () => {
    const fp = writeCompletedTurns(Array.from({ length: 5 }, (_, index) => makeCompletedTurn(index)));
    const { getProjectStats } = await loadModule();

    const first = getProjectStats(TEST_CWD);
    assert.ok(first, 'first stats computation should succeed');

    const cachePath = getCachePath(fp);
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    cached.stats = {
      totalCompleted: 999,
      overall: { median: 1, p25: 1, p75: 1, p80: 1 },
      byClassification: [],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    fs.writeFileSync(cachePath, JSON.stringify(cached));

    const second = getProjectStats(TEST_CWD);
    assert.equal(second.totalCompleted, 999, 'second call should come from the disk cache');
  });

  it('invalidates the cache when completed history changes', async () => {
    const initialTurns = Array.from({ length: 5 }, (_, index) => makeCompletedTurn(index));
    const fp = writeCompletedTurns(initialTurns);
    const { getProjectStats } = await loadModule();

    const first = getProjectStats(TEST_CWD);
    assert.ok(first, 'first stats computation should succeed');

    const cachePath = getCachePath(fp);
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    cached.stats = {
      totalCompleted: 999,
      overall: { median: 1, p25: 1, p75: 1, p80: 1 },
      byClassification: [],
      byClassificationModel: [],
      byClassificationPhase: [],
      byClassificationModelPhase: [],
    };
    fs.writeFileSync(cachePath, JSON.stringify(cached));

    writeCompletedTurns([...initialTurns, makeCompletedTurn(5)]);

    const second = getProjectStats(TEST_CWD);
    assert.notEqual(second.totalCompleted, 999, 'cache should be recomputed when completed logs change');
    assert.equal(second.totalCompleted, 6);
  });
});
