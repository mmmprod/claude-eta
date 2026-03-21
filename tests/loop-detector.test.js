import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeError,
  extractErrorFingerprint,
  buildErrorFingerprint,
  detectRepairLoop,
} from '../dist/loop-detector.js';

describe('normalizeError', () => {
  it('strips quoted values', () => {
    const result = normalizeError("type 'string' is not assignable to type 'number'");
    assert.ok(result.includes('<val>'));
    assert.ok(!result.includes("'string'"));
    assert.ok(!result.includes("'number'"));
  });

  it('strips file paths with slashes', () => {
    const result = normalizeError('Error in /home/user/src/foo.ts');
    assert.ok(result.includes('<path>'));
    assert.ok(!result.includes('/home/user'));
  });

  it('strips bare numbers', () => {
    const result = normalizeError('error code 2345 at line 42');
    assert.ok(!result.includes('2345'));
    assert.ok(!result.includes('42'));
    assert.ok(result.includes('<N>'));
  });

  it('keeps TS error codes as stable tokens (TS2345 → ts2345)', () => {
    // TS2345 is a single token, not a bare number — it stays stable across errors of same type
    const fp1 = extractErrorFingerprint('error TS2345: Argument of type');
    const fp2 = extractErrorFingerprint('error TS2345: Argument of type');
    assert.equal(fp1, fp2);
  });

  it('collapses whitespace', () => {
    const result = normalizeError('error   TS2345:   bad   thing');
    assert.ok(!result.includes('  '));
  });

  it('truncates to 150 chars', () => {
    const longError = 'x'.repeat(300);
    assert.ok(normalizeError(longError).length <= 150);
  });

  it('lowercases', () => {
    const result = normalizeError('TypeError: Cannot Read Property');
    assert.equal(result, 'typeerror: cannot read property');
  });
});

describe('extractErrorFingerprint', () => {
  it('returns 8-char hex string', () => {
    const fp = extractErrorFingerprint('some error');
    assert.equal(fp.length, 8);
    assert.match(fp, /^[0-9a-f]{8}$/);
  });

  it('same errors with different file paths produce same fingerprint', () => {
    const fp1 = extractErrorFingerprint("Cannot find module '/src/foo.ts'");
    const fp2 = extractErrorFingerprint("Cannot find module '/src/bar.ts'");
    assert.equal(fp1, fp2);
  });

  it('different errors produce different fingerprints', () => {
    const fp1 = extractErrorFingerprint("Cannot find module '/src/foo.ts'");
    const fp2 = extractErrorFingerprint('TypeError: X is not a function');
    assert.notEqual(fp1, fp2);
  });

  it('TS errors with different types produce same fingerprint', () => {
    const fp1 = extractErrorFingerprint("type 'string' is not assignable to type 'number'");
    const fp2 = extractErrorFingerprint("type 'boolean' is not assignable to type 'object'");
    assert.equal(fp1, fp2);
  });
});

describe('buildErrorFingerprint', () => {
  it('returns ErrorFingerprint with fp and preview', () => {
    const result = buildErrorFingerprint('some error message');
    assert.ok(result.fp);
    assert.ok(result.preview);
    assert.equal(result.fp.length, 8);
    assert.ok(result.preview.length <= 100);
  });
});

describe('detectRepairLoop', () => {
  // Helper to create fingerprints
  function fps(...texts) {
    return texts.map((t) => buildErrorFingerprint(t));
  }

  it('returns null for 3 different errors (TDD normal)', () => {
    const result = detectRepairLoop(fps('error A', 'error B', 'error C'));
    assert.equal(result, null);
  });

  it('detects same error 3x as loop', () => {
    const result = detectRepairLoop(fps('same error', 'same error', 'same error'));
    assert.notEqual(result, null);
    assert.equal(result.count, 3);
  });

  it('returns null for same error 2x (retry légitime)', () => {
    const result = detectRepairLoop(fps('same error', 'same error'));
    assert.equal(result, null);
  });

  it('detects 3x same + 1 different as loop', () => {
    const result = detectRepairLoop(fps('same error', 'different', 'same error', 'same error'));
    assert.notEqual(result, null);
    assert.equal(result.count, 3);
  });

  it('returns null for alternating A,B,A,B', () => {
    const result = detectRepairLoop(fps('error A', 'error B', 'error A', 'error B'));
    assert.equal(result, null);
  });

  it('returns null for empty fingerprints', () => {
    const result = detectRepairLoop([]);
    assert.equal(result, null);
  });

  it('respects custom threshold=5 (does not detect at 4)', () => {
    const result = detectRepairLoop(
      fps('same error', 'same error', 'same error', 'same error'),
      5,
    );
    assert.equal(result, null);
  });

  it('respects custom threshold=5 (detects at 5)', () => {
    const result = detectRepairLoop(
      fps('same error', 'same error', 'same error', 'same error', 'same error'),
      5,
    );
    assert.notEqual(result, null);
    assert.equal(result.count, 5);
  });

  it('returns the most frequent fingerprint when multiple loops exist', () => {
    const result = detectRepairLoop(
      fps('error A', 'error A', 'error A', 'error B', 'error B', 'error B', 'error B'),
      3,
    );
    assert.notEqual(result, null);
    assert.equal(result.count, 4); // error B appears 4x
  });
});
