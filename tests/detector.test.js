import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractDurations, findBullshitEstimate } from '../dist/detector.js';

describe('extractDurations', () => {
  it('finds simple English durations', () => {
    const d = extractDurations('This will take about 2 hours');
    assert.equal(d.length, 1);
    assert.equal(d[0].seconds, 7200);
    assert.equal(d[0].raw, '2 hours');
  });

  it('finds multiple durations', () => {
    const d = extractDurations('First part takes 30 minutes, second part takes 2 hours');
    assert.equal(d.length, 2);
    assert.equal(d[0].seconds, 1800);
    assert.equal(d[1].seconds, 7200);
  });

  it('finds French durations', () => {
    const d = extractDurations('Cela va prendre environ 3 jours');
    assert.equal(d.length, 1);
    assert.equal(d[0].seconds, 259200);
  });

  it('handles days and weeks', () => {
    const d = extractDurations('This could take 2 days or even 1 week');
    assert.equal(d.length, 2);
    assert.equal(d[0].seconds, 172800);
    assert.equal(d[1].seconds, 604800);
  });

  it('handles abbreviated units', () => {
    const d = extractDurations('about 5 mins or 2 hrs');
    assert.equal(d.length, 2);
    assert.equal(d[0].seconds, 300);
    assert.equal(d[1].seconds, 7200);
  });

  it('returns empty for no durations', () => {
    assert.deepEqual(extractDurations('This is just regular text'), []);
  });

  it('ignores zero or negative values', () => {
    assert.deepEqual(extractDurations('0 minutes and 0 hours'), []);
  });

  it('handles decimal values', () => {
    const d = extractDurations('about 1.5 hours');
    assert.equal(d.length, 1);
    assert.equal(d[0].seconds, 5400);
  });
});

describe('findBullshitEstimate', () => {
  it('returns null for empty durations', () => {
    assert.equal(findBullshitEstimate([], 600, 300), null);
  });

  it('returns null for reasonable estimates', () => {
    const durations = [{ raw: '10 minutes', seconds: 600 }];
    // p75 = 900 (15min), median = 600 (10min)
    // threshold = max(4500, 1200) = 4500
    // 600 < 4500 → reasonable
    assert.equal(findBullshitEstimate(durations, 900, 600), null);
  });

  it('detects wildly high estimates', () => {
    const durations = [{ raw: '2 days', seconds: 172800 }];
    // p75 = 900 (15min), median = 600 (10min)
    // threshold = max(4500, 1200) = 4500
    // 172800 >> 4500 → bullshit!
    const result = findBullshitEstimate(durations, 900, 600);
    assert.ok(result);
    assert.equal(result.raw, '2 days');
  });

  it('picks the largest duration as the offender', () => {
    const durations = [
      { raw: '5 minutes', seconds: 300 },
      { raw: '3 days', seconds: 259200 },
      { raw: '30 minutes', seconds: 1800 },
    ];
    const result = findBullshitEstimate(durations, 900, 600);
    assert.ok(result);
    assert.equal(result.raw, '3 days');
  });

  it('does not flag moderately high estimates', () => {
    const durations = [{ raw: '45 minutes', seconds: 2700 }];
    // p75 = 900, median = 600
    // threshold = max(4500, 1200) = 4500
    // 2700 < 4500 → not flagged
    assert.equal(findBullshitEstimate(durations, 900, 600), null);
  });

  it('returns null when p75 is 0', () => {
    assert.equal(findBullshitEstimate([{ raw: '1 hour', seconds: 3600 }], 0, 0), null);
  });
});
