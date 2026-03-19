import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { insertVelocityRecords, fetchBaselines } from '../dist/supabase.js';

let originalFetch;

describe('supabase', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('insertVelocityRecords', () => {
    it('returns null error on success', async () => {
      global.fetch = async () => new Response('', { status: 201 });
      const result = await insertVelocityRecords([{ task_type: 'other', duration_seconds: 30 }]);
      assert.equal(result.error, null);
    });

    it('returns error string on HTTP 400', async () => {
      global.fetch = async () => new Response('Bad Request', { status: 400 });
      const result = await insertVelocityRecords([{ task_type: 'other' }]);
      assert.ok(result.error);
      assert.ok(result.error.includes('400'));
    });

    it('returns error string on HTTP 500', async () => {
      global.fetch = async () => new Response('Internal Server Error', { status: 500 });
      const result = await insertVelocityRecords([]);
      assert.ok(result.error);
      assert.ok(result.error.includes('500'));
    });

    it('returns error on network failure', async () => {
      global.fetch = async () => {
        throw new Error('Network error');
      };
      const result = await insertVelocityRecords([]);
      assert.ok(result.error);
      assert.ok(result.error.includes('Network error'));
    });

    it('returns error on timeout', async () => {
      global.fetch = async () => {
        throw new Error('The operation was aborted');
      };
      const result = await insertVelocityRecords([]);
      assert.ok(result.error);
      assert.ok(result.error.includes('aborted'));
    });
  });

  describe('fetchBaselines', () => {
    it('returns data array on success', async () => {
      const mockData = [{ task_type: 'other', median_seconds: 30 }];
      global.fetch = async () =>
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const result = await fetchBaselines();
      assert.equal(result.error, null);
      assert.deepEqual(result.data, mockData);
    });

    it('returns error on HTTP 500', async () => {
      global.fetch = async () => new Response('Internal Server Error', { status: 500 });
      const result = await fetchBaselines();
      assert.ok(result.error);
      assert.ok(result.error.includes('500'));
      assert.equal(result.data, null);
    });

    it('returns error on network failure', async () => {
      global.fetch = async () => {
        throw new Error('ECONNREFUSED');
      };
      const result = await fetchBaselines();
      assert.ok(result.error);
      assert.equal(result.data, null);
    });

    it('returns error on malformed JSON', async () => {
      global.fetch = async () => new Response('not valid json', { status: 200 });
      const result = await fetchBaselines();
      assert.ok(result.error);
      assert.equal(result.data, null);
    });
  });
});
