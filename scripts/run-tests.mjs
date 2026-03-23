#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(REPO_ROOT, 'tests');

const LOCAL_INTEGRATION_TESTS = [
  'tests/auto-eta.test.js',
  'tests/community-cli.test.js',
  'tests/eta-cli.test.js',
  'tests/plugin-package.test.js',
  'tests/prompt-hook.test.js',
  'tests/session-start.test.js',
  'tests/stop-hook.test.js',
  'tests/store.test.js',
  'tests/subagent-hooks.test.js',
  'tests/tool-failure-hook.test.js',
  'tests/tool-use-hook.test.js',
];

const REMOTE_TESTS = ['tests/supabase-integration.test.js'];

function listTopLevelTests() {
  return fs
    .readdirSync(TEST_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => `tests/${entry.name}`)
    .sort();
}

function validateDeclaredTests(allTests) {
  const allSet = new Set(allTests);
  const declared = [...LOCAL_INTEGRATION_TESTS, ...REMOTE_TESTS];

  for (const testPath of declared) {
    if (!allSet.has(testPath)) {
      throw new Error(`Declared test group entry does not exist: ${testPath}`);
    }
  }

  const overlap = LOCAL_INTEGRATION_TESTS.filter((testPath) => REMOTE_TESTS.includes(testPath));
  if (overlap.length > 0) {
    throw new Error(`Test files cannot belong to both local integration and remote groups: ${overlap.join(', ')}`);
  }
}

function selectTests(mode, allTests) {
  const localIntegrationSet = new Set(LOCAL_INTEGRATION_TESTS);
  const remoteSet = new Set(REMOTE_TESTS);

  switch (mode) {
    case 'unit':
      return allTests.filter((testPath) => !localIntegrationSet.has(testPath) && !remoteSet.has(testPath));
    case 'integration':
      return [...LOCAL_INTEGRATION_TESTS];
    case 'remote':
      return [...REMOTE_TESTS];
    case 'local':
      return allTests.filter((testPath) => !remoteSet.has(testPath));
    default:
      throw new Error(`Unknown test mode: ${mode}`);
  }
}

function main() {
  const mode = process.argv[2];
  if (!mode) {
    throw new Error('Usage: node scripts/run-tests.mjs <unit|integration|remote|local>');
  }

  const allTests = listTopLevelTests();
  validateDeclaredTests(allTests);

  const selected = selectTests(mode, allTests);
  if (selected.length === 0) {
    throw new Error(`No tests selected for mode: ${mode}`);
  }

  execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

main();
