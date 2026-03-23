import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { baselinesToPriors, loadCachedBaselines, isCacheFresh } from '../dist/baselines-cache.js';

// ── Test fixtures ────────────────────────────────────────────

function makeBaseline(taskType, overrides = {}) {
  return {
    task_type: taskType,
    project_loc_bucket: null,
    model: null,
    sample_count: 50,
    median_seconds: 120,
    p25_seconds: 60,
    p75_seconds: 240,
    p10_seconds: 30,
    p90_seconds: 360,
    avg_tool_calls: 8,
    avg_files_edited: 3,
    volatility: 'medium',
    computed_at: '2026-03-20T00:00:00Z',
    ...overrides,
  };
}

// ── baselinesToPriors (pure) ─────────────────────────────────

describe('baselinesToPriors', () => {
  it('maps baselines to priors using p25/median/p75', () => {
    const baselines = [makeBaseline('bugfix', { p25_seconds: 15, median_seconds: 35, p75_seconds: 77 })];
    const priors = baselinesToPriors(baselines, null, null);
    assert.deepEqual(priors.bugfix, {
      low: 15,
      median: 35,
      high: 77,
      sample_count: 50,
      match_kind: 'global',
    });
  });

  it('returns partial map — only classifications with matching baselines', () => {
    const baselines = [makeBaseline('bugfix'), makeBaseline('feature')];
    const priors = baselinesToPriors(baselines, null, null);
    assert.ok(priors.bugfix);
    assert.ok(priors.feature);
    assert.equal(priors.refactor, undefined);
    assert.equal(priors.docs, undefined);
  });

  it('returns empty map when no baselines match', () => {
    const priors = baselinesToPriors([], null, null);
    assert.deepEqual(priors, {});
  });

  it('prefers type+model over global when model matches', () => {
    const baselines = [
      makeBaseline('bugfix', { model: null, median_seconds: 100 }),
      makeBaseline('bugfix', { model: 'claude-opus-4-6', median_seconds: 50 }),
    ];
    const priors = baselinesToPriors(baselines, null, 'claude-opus-4-6');
    assert.equal(priors.bugfix?.median, 50);
    assert.equal(priors.bugfix?.match_kind, 'type+model');
  });

  it('prefers type+loc+model when both match', () => {
    const baselines = [
      makeBaseline('feature', { model: null, project_loc_bucket: null, median_seconds: 200 }),
      makeBaseline('feature', { model: 'claude-opus-4-6', project_loc_bucket: 'medium', median_seconds: 80 }),
    ];
    const priors = baselinesToPriors(baselines, 'medium', 'claude-opus-4-6');
    assert.equal(priors.feature?.median, 80);
    assert.equal(priors.feature?.match_kind, 'type+loc+model');
  });

  it('falls back to global when model does not match', () => {
    const baselines = [
      makeBaseline('bugfix', { model: 'claude-sonnet-4-6', median_seconds: 50 }),
      makeBaseline('bugfix', { model: null, median_seconds: 100 }),
    ];
    const priors = baselinesToPriors(baselines, null, 'claude-opus-4-6');
    assert.equal(priors.bugfix?.median, 100);
    assert.equal(priors.bugfix?.match_kind, 'global');
  });

  it('maps all 9 classifications when baselines exist', () => {
    const allTypes = ['bugfix', 'feature', 'refactor', 'config', 'docs', 'test', 'debug', 'review', 'other'];
    const baselines = allTypes.map((t) => makeBaseline(t));
    const priors = baselinesToPriors(baselines, null, null);
    for (const t of allTypes) {
      assert.ok(priors[t], `missing prior for ${t}`);
    }
  });
});

// ── loadCachedBaselines / isCacheFresh (I/O) ─────────────────

describe('loadCachedBaselines', () => {
  let tmpDir;
  let origEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-cache-test-'));
    origEnv = process.env.CLAUDE_PLUGIN_DATA;
    process.env.CLAUDE_PLUGIN_DATA = tmpDir;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.CLAUDE_PLUGIN_DATA = origEnv;
    } else {
      delete process.env.CLAUDE_PLUGIN_DATA;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when cache file does not exist', () => {
    assert.equal(loadCachedBaselines(), null);
  });

  it('returns records from valid cache file', () => {
    const cacheDir = path.join(tmpDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cache = { fetched_at: new Date().toISOString(), records: [makeBaseline('bugfix')] };
    fs.writeFileSync(path.join(cacheDir, 'baselines.json'), JSON.stringify(cache));
    const result = loadCachedBaselines();
    assert.equal(result?.length, 1);
    assert.equal(result?.[0].task_type, 'bugfix');
  });

  it('returns null on corrupt JSON', () => {
    const cacheDir = path.join(tmpDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'baselines.json'), '{corrupt');
    assert.equal(loadCachedBaselines(), null);
  });

  it('isCacheFresh returns true for recent cache', () => {
    const cacheDir = path.join(tmpDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cache = { fetched_at: new Date().toISOString(), records: [] };
    fs.writeFileSync(path.join(cacheDir, 'baselines.json'), JSON.stringify(cache));
    assert.equal(isCacheFresh(), true);
  });

  it('isCacheFresh returns false for stale cache', () => {
    const cacheDir = path.join(tmpDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(); // 7h ago
    const cache = { fetched_at: staleDate, records: [] };
    fs.writeFileSync(path.join(cacheDir, 'baselines.json'), JSON.stringify(cache));
    assert.equal(isCacheFresh(), false);
  });

  it('isCacheFresh returns false when cache missing', () => {
    assert.equal(isCacheFresh(), false);
  });
});
