import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let TEST_DATA_DIR;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-prefs-v2-'));
  process.env.CLAUDE_PLUGIN_DATA = TEST_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe('preferences v2', () => {
  it('defaults community sharing to disabled', async () => {
    const ts = Date.now() + Math.random();
    const { loadPreferencesV2 } = await import(`../dist/preferences.js?t=${ts}`);

    const prefs = loadPreferencesV2();

    assert.equal(prefs.auto_eta, false);
    assert.equal(prefs.community_sharing, false);
    assert.equal(prefs.community_onboarding_seen, false);
    assert.equal(prefs.prompts_since_last_eta, 0);
    assert.equal(prefs.last_eta_task_id, null);
  });

  it('persists community sharing on save/load roundtrip', async () => {
    const ts = Date.now() + Math.random();
    const { loadPreferencesV2, savePreferencesV2 } = await import(`../dist/preferences.js?t=${ts}`);

    savePreferencesV2({
      auto_eta: true,
      community_sharing: true,
      community_onboarding_seen: true,
      prompts_since_last_eta: 2,
      last_eta_task_id: 'task-123',
      updated_at: '2026-03-21T12:00:00.000Z',
    });

    const prefs = loadPreferencesV2();

    assert.equal(prefs.auto_eta, true);
    assert.equal(prefs.community_sharing, true);
    assert.equal(prefs.community_onboarding_seen, true);
    assert.equal(prefs.prompts_since_last_eta, 2);
    assert.equal(prefs.last_eta_task_id, 'task-123');
  });

  it('migrates legacy preferences and defaults community sharing to disabled', async () => {
    const legacyDir = path.join(TEST_DATA_DIR, 'data');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, '_preferences.json'),
      JSON.stringify({
        auto_eta: true,
        prompts_since_last_eta: 4,
        last_eta_task_id: 'legacy-task',
      }),
      'utf-8',
    );

    const ts = Date.now() + Math.random();
    const { loadPreferencesV2 } = await import(`../dist/preferences.js?t=${ts}`);

    const prefs = loadPreferencesV2();

    assert.equal(prefs.auto_eta, true);
    assert.equal(prefs.community_sharing, false);
    assert.equal(prefs.community_onboarding_seen, false);
    assert.equal(prefs.prompts_since_last_eta, 4);
    assert.equal(prefs.last_eta_task_id, 'legacy-task');
  });
});
