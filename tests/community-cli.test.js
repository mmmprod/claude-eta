import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

let TEST_DATA_DIR;
let TEST_CWD;

beforeEach(() => {
  TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-community-cli-'));
  TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'eta-community-cwd-'));
});

afterEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
});

function runEta(args) {
  return execFileSync('node', ['dist/cli/eta.js', ...args, TEST_CWD], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: TEST_DATA_DIR },
  });
}

describe('/eta community CLI', () => {
  it('shows status and toggles the persistent sharing switch', () => {
    const initial = runEta(['community']);
    assert.match(initial, /Upload switch: \*\*disabled\*\*/);
    assert.match(initial, /Choice: \*\*pending\*\*/);
    assert.match(initial, /Keep everything private: `\/eta community off`/);
    assert.match(initial, /Allow manual anonymized uploads: `\/eta community on`/);

    const enabled = runEta(['community', 'on']);
    assert.match(enabled, /Community sharing \*\*enabled\*\*/);

    const prefsPath = path.join(TEST_DATA_DIR, 'config', 'preferences.json');
    const enabledPrefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    assert.equal(enabledPrefs.community_sharing, true);
    assert.equal(enabledPrefs.community_choice_made, true);

    const status = runEta(['community']);
    assert.match(status, /Upload switch: \*\*enabled\*\*/);
    assert.match(status, /Choice: \*\*manual uploads allowed\*\*/);
    assert.match(status, /manual `\/eta contribute --confirm`/);

    const disabled = runEta(['community', 'off']);
    assert.match(disabled, /Community sharing \*\*disabled\*\*/);

    const disabledPrefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
    assert.equal(disabledPrefs.community_sharing, false);
    assert.equal(disabledPrefs.community_choice_made, true);
  });

  it('shows current sharing state in help output', () => {
    const disabledHelp = runEta(['help']);
    assert.match(disabledHelp, /Community sharing: \*\*choice pending \(currently local-only\)\*\*/);

    runEta(['community', 'on']);

    const enabledHelp = runEta(['help']);
    assert.match(enabledHelp, /Community sharing: \*\*enabled\*\*/);
  });
});
