import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let TEST_DATA_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-accuracy-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

// Dynamic import to pick up fresh env each time
async function loadProjectMetaModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/project-meta.js?t=${ts}`);
}

async function loadAutoEtaModule() {
  const ts = Date.now() + Math.random();
  return await import(`../dist/auto-eta.js?t=${ts}`);
}

function createMeta(fp) {
  const meta = {
    project_fp: fp,
    display_name: 'test-project',
    cwd_realpath: '/tmp/test',
    created: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    legacy_slug: null,
    file_count: null,
    file_count_bucket: null,
    loc_bucket: null,
    repo_metrics_updated_at: null,
    eta_accuracy: null,
  };
  return meta;
}

// -- updateEtaAccuracy tests --

describe('updateEtaAccuracy', () => {
  it('creates accuracy entry for new classification', async () => {
    const { loadProjectMeta, saveProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'abcdef1234567890';
    saveProjectMeta(fp, createMeta(fp));

    updateEtaAccuracy(fp, 'bugfix', true);

    const meta = loadProjectMeta(fp);
    assert.ok(meta.eta_accuracy);
    assert.ok(meta.eta_accuracy.by_classification.bugfix);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_hits, 1);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_total, 1);
  });

  it('increments hits correctly', async () => {
    const { loadProjectMeta, saveProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'abcdef1234567891';
    saveProjectMeta(fp, createMeta(fp));

    updateEtaAccuracy(fp, 'bugfix', true);
    updateEtaAccuracy(fp, 'bugfix', true);
    updateEtaAccuracy(fp, 'bugfix', true);

    const meta = loadProjectMeta(fp);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_hits, 3);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_total, 3);
  });

  it('increments total but not hits for misses', async () => {
    const { loadProjectMeta, saveProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'abcdef1234567892';
    saveProjectMeta(fp, createMeta(fp));

    updateEtaAccuracy(fp, 'bugfix', true);
    updateEtaAccuracy(fp, 'bugfix', false);
    updateEtaAccuracy(fp, 'bugfix', false);

    const meta = loadProjectMeta(fp);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_hits, 1);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_total, 3);
  });

  it('does nothing when meta does not exist', async () => {
    const { loadProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'nonexistent0000000';

    // Should not throw
    updateEtaAccuracy(fp, 'bugfix', true);

    const meta = loadProjectMeta(fp);
    assert.equal(meta, null);
  });

  it('tracks multiple classifications independently', async () => {
    const { loadProjectMeta, saveProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'abcdef1234567893';
    saveProjectMeta(fp, createMeta(fp));

    updateEtaAccuracy(fp, 'bugfix', true);
    updateEtaAccuracy(fp, 'refactor', false);
    updateEtaAccuracy(fp, 'bugfix', false);

    const meta = loadProjectMeta(fp);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_hits, 1);
    assert.equal(meta.eta_accuracy.by_classification.bugfix.interval80_total, 2);
    assert.equal(meta.eta_accuracy.by_classification.refactor.interval80_hits, 0);
    assert.equal(meta.eta_accuracy.by_classification.refactor.interval80_total, 1);
  });
});

// -- Round-trip: on-stop format -> on-prompt format --

describe('accuracy round-trip', () => {
  it('persisted accuracy transforms correctly for evaluateAutoEta', async () => {
    const { loadProjectMeta, saveProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const fp = 'abcdef1234567894';
    saveProjectMeta(fp, createMeta(fp));

    // Simulate on-stop persisting: 7 hits, 3 misses for bugfix
    for (let i = 0; i < 7; i++) updateEtaAccuracy(fp, 'bugfix', true);
    for (let i = 0; i < 3; i++) updateEtaAccuracy(fp, 'bugfix', false);

    // Simulate on-prompt reading and transforming
    const meta = loadProjectMeta(fp);
    const rawAccuracy = meta.eta_accuracy.by_classification;
    const etaAccuracy = {};
    for (const [cls, entry] of Object.entries(rawAccuracy)) {
      etaAccuracy[cls] = {
        hits: entry.interval80_hits,
        misses: entry.interval80_total - entry.interval80_hits,
      };
    }

    assert.deepEqual(etaAccuracy.bugfix, { hits: 7, misses: 3 });
  });
});

// -- Accuracy gate integration --

describe('accuracy gate fires with persisted data', () => {
  it('gate fires when accuracy drops below threshold (>=10 predictions, >50% misses)', async () => {
    const { saveProjectMeta, loadProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const { evaluateAutoEta, ACCURACY_MIN_PREDICTIONS } = await loadAutoEtaModule();
    const fp = 'abcdef1234567895';
    saveProjectMeta(fp, createMeta(fp));

    // Record 4 hits and 7 misses (11 total, >50% miss rate)
    for (let i = 0; i < 4; i++) updateEtaAccuracy(fp, 'bugfix', true);
    for (let i = 0; i < 7; i++) updateEtaAccuracy(fp, 'bugfix', false);

    // Transform like on-prompt does
    const meta = loadProjectMeta(fp);
    const rawAccuracy = meta.eta_accuracy.by_classification;
    const etaAccuracy = {};
    for (const [cls, entry] of Object.entries(rawAccuracy)) {
      etaAccuracy[cls] = {
        hits: entry.interval80_hits,
        misses: entry.interval80_total - entry.interval80_hits,
      };
    }

    // Verify threshold
    const total = etaAccuracy.bugfix.hits + etaAccuracy.bugfix.misses;
    assert.ok(total >= ACCURACY_MIN_PREDICTIONS, `total ${total} >= ${ACCURACY_MIN_PREDICTIONS}`);
    assert.ok(etaAccuracy.bugfix.misses / total > 0.5, 'miss rate > 50%');

    // Evaluate — should skip due to accuracy gate
    const decision = evaluateAutoEta({
      prefs: { auto_eta: true, prompts_since_last_eta: 0, last_eta_task_id: 'old' },
      stats: {
        totalCompleted: 20,
        overall: { median: 60, p25: 50, p75: 80, p80: 86 },
        byClassification: [{ classification: 'bugfix', count: 10, median: 60, p25: 50, p75: 80, p80: 86, volatility: 'medium' }],
      },
      etaAccuracy,
      classification: 'bugfix',
      prompt: 'fix the authentication bug in login handler',
      taskId: 'new-task',
    });

    assert.equal(decision.action, 'skip');
  });

  it('gate does not fire when accuracy is good', async () => {
    const { saveProjectMeta, loadProjectMeta, updateEtaAccuracy } = await loadProjectMetaModule();
    const { evaluateAutoEta } = await loadAutoEtaModule();
    const fp = 'abcdef1234567896';
    saveProjectMeta(fp, createMeta(fp));

    // Record 8 hits and 2 misses (10 total, 20% miss rate — below 50%)
    for (let i = 0; i < 8; i++) updateEtaAccuracy(fp, 'bugfix', true);
    for (let i = 0; i < 2; i++) updateEtaAccuracy(fp, 'bugfix', false);

    const meta = loadProjectMeta(fp);
    const rawAccuracy = meta.eta_accuracy.by_classification;
    const etaAccuracy = {};
    for (const [cls, entry] of Object.entries(rawAccuracy)) {
      etaAccuracy[cls] = {
        hits: entry.interval80_hits,
        misses: entry.interval80_total - entry.interval80_hits,
      };
    }

    const decision = evaluateAutoEta({
      prefs: { auto_eta: true, prompts_since_last_eta: 0, last_eta_task_id: 'old' },
      stats: {
        totalCompleted: 20,
        overall: { median: 60, p25: 50, p75: 80, p80: 86 },
        byClassification: [{ classification: 'bugfix', count: 10, median: 60, p25: 50, p75: 80, p80: 86, volatility: 'medium' }],
      },
      etaAccuracy,
      classification: 'bugfix',
      prompt: 'fix the authentication bug in login handler',
      taskId: 'new-task',
    });

    assert.equal(decision.action, 'inject');
  });
});
