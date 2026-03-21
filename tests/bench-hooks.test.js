import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize } from '../scripts/bench-hooks.mjs';

describe('bench-hooks percentile', () => {
  it('uses nearest-rank selection for high percentiles', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
    assert.equal(
      percentile(
        Array.from({ length: 20 }, (_, index) => index + 1),
        95,
      ),
      19,
    );
  });

  it('reports p95 from the percentile helper', () => {
    const summary = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(summary.p95_ms, 10);
  });
});
