import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPrompt, summarizePrompt } from '../dist/classify.js';

describe('classifyPrompt', () => {
  it('classifies bugfix prompts', () => {
    assert.equal(classifyPrompt('fix the login bug'), 'bugfix');
    assert.equal(classifyPrompt('this button is broken'), 'bugfix');
    assert.equal(classifyPrompt('patch the auth issue'), 'bugfix');
    assert.equal(classifyPrompt('the build is failing'), 'bugfix');
  });

  it('classifies feature prompts', () => {
    assert.equal(classifyPrompt('add a new search component'), 'feature');
    assert.equal(classifyPrompt('create a user dashboard'), 'feature');
    assert.equal(classifyPrompt('implement pagination'), 'feature');
    assert.equal(classifyPrompt('build the API endpoint'), 'feature');
  });

  it('classifies refactor prompts', () => {
    assert.equal(classifyPrompt('refactor the auth module'), 'refactor');
    assert.equal(classifyPrompt('rename this function'), 'refactor');
    assert.equal(classifyPrompt('extract this into a helper'), 'refactor');
    assert.equal(classifyPrompt('simplify the logic'), 'refactor');
  });

  it('classifies test prompts', () => {
    assert.equal(classifyPrompt('write tests for the API'), 'test');
    assert.equal(classifyPrompt('add jest coverage'), 'test');
    assert.equal(classifyPrompt('run the e2e suite'), 'test');
  });

  it('classifies debug prompts', () => {
    assert.equal(classifyPrompt('debug this function'), 'debug');
    assert.equal(classifyPrompt('why is this slow'), 'debug');
    assert.equal(classifyPrompt('investigate the memory leak'), 'debug');
  });

  it('classifies config prompts', () => {
    assert.equal(classifyPrompt('update the eslint config'), 'config');
    assert.equal(classifyPrompt('setup docker'), 'config');
    assert.equal(classifyPrompt('install new deps'), 'config');
  });

  it('classifies docs prompts', () => {
    assert.equal(classifyPrompt('update the readme'), 'docs');
    assert.equal(classifyPrompt('add documentation'), 'docs');
    assert.equal(classifyPrompt('write a changelog entry'), 'docs');
  });

  it('classifies review prompts', () => {
    assert.equal(classifyPrompt('review this PR'), 'review');
    assert.equal(classifyPrompt('audit the security code'), 'review');
  });

  it('falls back to other', () => {
    assert.equal(classifyPrompt('hello'), 'other');
    assert.equal(classifyPrompt('what time is it'), 'other');
    assert.equal(classifyPrompt(''), 'other');
  });

  it('uses first match priority (bugfix > feature for "fix")', () => {
    // "fix" matches bugfix before feature's "add"
    assert.equal(classifyPrompt('fix and add something'), 'bugfix');
  });
});

describe('summarizePrompt', () => {
  it('returns short prompts as-is', () => {
    assert.equal(summarizePrompt('fix the bug'), 'fix the bug');
  });

  it('truncates long prompts', () => {
    const long = 'a'.repeat(100);
    const result = summarizePrompt(long);
    assert.equal(result.length, 80);
    assert.ok(result.endsWith('...'));
  });

  it('takes only the first line', () => {
    assert.equal(summarizePrompt('first line\nsecond line\nthird'), 'first line');
  });

  it('handles empty prompts', () => {
    assert.equal(summarizePrompt(''), '(empty prompt)');
  });

  it('trims whitespace', () => {
    assert.equal(summarizePrompt('  hello  '), 'hello');
  });

  it('respects custom maxLength', () => {
    const result = summarizePrompt('a'.repeat(50), 20);
    assert.equal(result.length, 20);
    assert.ok(result.endsWith('...'));
  });
});
