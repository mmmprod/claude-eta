import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEMP_DIRS = [];

function makeTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-eta-alias-'));
  TEMP_DIRS.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of TEMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('eta command alias', () => {
  it('creates a managed /eta shortcut when missing', async () => {
    const homeDir = makeTempHome();
    const { ensureEtaCommandAlias, getEtaCommandPath } = await import('../dist/command-alias.js');

    const status = ensureEtaCommandAlias('/tmp/claude-eta-plugin', homeDir);
    const aliasPath = getEtaCommandPath(homeDir);
    const content = fs.readFileSync(aliasPath, 'utf-8');

    assert.equal(status, 'created');
    assert.match(content, /claude-eta-managed-alias/);
    assert.match(content, /# \/eta — claude-eta global shortcut/);
    assert.match(content, /\/tmp\/claude-eta-plugin\/dist\/cli\/eta\.js/);
  });

  it('does not overwrite a user-owned /eta command', async () => {
    const homeDir = makeTempHome();
    const { ensureEtaCommandAlias, getEtaCommandPath } = await import('../dist/command-alias.js');
    const aliasPath = getEtaCommandPath(homeDir);

    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    fs.writeFileSync(aliasPath, '# custom eta command\n', 'utf-8');

    const status = ensureEtaCommandAlias('/tmp/claude-eta-plugin', homeDir);

    assert.equal(status, 'skipped');
    assert.equal(fs.readFileSync(aliasPath, 'utf-8'), '# custom eta command\n');
  });

  it('updates an existing managed alias to the current plugin root', async () => {
    const homeDir = makeTempHome();
    const { ensureEtaCommandAlias, getEtaCommandPath, buildEtaCommandAlias } = await import('../dist/command-alias.js');
    const aliasPath = getEtaCommandPath(homeDir);

    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    fs.writeFileSync(aliasPath, buildEtaCommandAlias('/old/plugin/root'), 'utf-8');

    const status = ensureEtaCommandAlias('/new/plugin/root', homeDir);
    const content = fs.readFileSync(aliasPath, 'utf-8');

    assert.equal(status, 'updated');
    assert.match(content, /\/new\/plugin\/root\/dist\/cli\/eta\.js/);
    assert.doesNotMatch(content, /\/old\/plugin\/root\/dist\/cli\/eta\.js/);
  });
});
