import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';

describe('contributorHash', () => {
  it('returns a 64-char hex string', async () => {
    const { contributorHash } = await import('../dist/anonymize.js');
    assert.match(contributorHash(), /^[a-f0-9]{64}$/);
  });

  it('is stable between calls', async () => {
    const { contributorHash } = await import('../dist/anonymize.js');
    assert.equal(contributorHash(), contributorHash());
  });

  it('does not contain the hostname', async () => {
    const { contributorHash } = await import('../dist/anonymize.js');
    assert.ok(!contributorHash().includes(os.hostname()));
  });
});

describe('projectHash', () => {
  it('never returns the project name in cleartext', async () => {
    const { projectHash } = await import('../dist/anonymize.js');
    const hash = projectHash('my-secret-project');
    assert.ok(!hash.includes('my-secret-project'));
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('is deterministic', async () => {
    const { projectHash } = await import('../dist/anonymize.js');
    assert.equal(projectHash('foo'), projectHash('foo'));
  });

  it('differs for different projects', async () => {
    const { projectHash } = await import('../dist/anonymize.js');
    assert.notEqual(projectHash('foo'), projectHash('bar'));
  });
});

describe('normalizeModel', () => {
  it('normalizes claude-sonnet-4-20250514', async () => {
    const { normalizeModel } = await import('../dist/anonymize.js');
    assert.equal(normalizeModel('claude-sonnet-4-20250514'), 'claude-sonnet-4');
  });

  it('normalizes claude-opus-4-20250514', async () => {
    const { normalizeModel } = await import('../dist/anonymize.js');
    assert.equal(normalizeModel('claude-opus-4-20250514'), 'claude-opus-4');
  });

  it('normalizes claude-haiku-4.5-20250514', async () => {
    const { normalizeModel } = await import('../dist/anonymize.js');
    assert.equal(normalizeModel('claude-haiku-4.5-20250514'), 'claude-haiku-4.5');
  });

  it('rejects gpt-4', async () => {
    const { normalizeModel } = await import('../dist/anonymize.js');
    assert.equal(normalizeModel('gpt-4'), null);
  });

  it('rejects unknown model', async () => {
    const { normalizeModel } = await import('../dist/anonymize.js');
    assert.equal(normalizeModel('unknown'), null);
  });
});

describe('locBucket', () => {
  it('returns tiny for < 1000', async () => {
    const { locBucket } = await import('../dist/anonymize.js');
    assert.equal(locBucket(500), 'tiny');
  });

  it('returns small for 1000-9999', async () => {
    const { locBucket } = await import('../dist/anonymize.js');
    assert.equal(locBucket(5000), 'small');
  });

  it('returns medium for 10000-49999', async () => {
    const { locBucket } = await import('../dist/anonymize.js');
    assert.equal(locBucket(30000), 'medium');
  });

  it('returns large for 50000-199999', async () => {
    const { locBucket } = await import('../dist/anonymize.js');
    assert.equal(locBucket(100000), 'large');
  });

  it('returns huge for >= 200000', async () => {
    const { locBucket } = await import('../dist/anonymize.js');
    assert.equal(locBucket(500000), 'huge');
  });
});
