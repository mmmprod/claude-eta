import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function extractHookTargets() {
  const hooksConfig = readJson('hooks/hooks.json');
  const targets = [];

  for (const entries of Object.values(hooksConfig.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        if (hook.type !== 'command') continue;
        const match = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s]+)/);
        if (match) targets.push(match[1]);
      }
    }
  }

  return targets;
}

describe('plugin packaging', () => {
  it('keeps manifest versions aligned', () => {
    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');
    const pluginJson = readJson('.claude-plugin/plugin.json');
    const marketplaceJson = readJson('.claude-plugin/marketplace.json');

    assert.equal(packageLock.version, packageJson.version);
    assert.equal(packageLock.packages[''].version, packageJson.version);
    assert.equal(pluginJson.version, packageJson.version);
    assert.equal(marketplaceJson.metadata.version, packageJson.version);
  });

  it('ships every runtime file referenced by hook commands', () => {
    for (const relativePath of extractHookTargets()) {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      assert.ok(fs.existsSync(absolutePath), `Missing hook runtime file: ${relativePath}`);
    }
  });

  it('keeps dist committed and in sync after build', () => {
    const status = git(['status', '--porcelain', '--untracked-files=all', '--', 'dist']).trim();
    assert.equal(
      status,
      '',
      `dist/ is missing, uncommitted, or stale after build:\n${status}`,
    );
  });
});
