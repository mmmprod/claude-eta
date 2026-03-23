import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { insertVelocityRecords, fetchBaselines } from '../dist/supabase.js';

let originalFetch;
let originalSupabaseUrl;
let originalSupabaseKey;

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_MODULE_URL = pathToFileURL(path.join(TEST_DIR, '..', 'dist', 'supabase.js')).href;

async function importFreshSupabase() {
  return import(`${SUPABASE_MODULE_URL}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('supabase', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    originalSupabaseUrl = process.env.CLAUDE_ETA_SUPABASE_URL;
    originalSupabaseKey = process.env.CLAUDE_ETA_SUPABASE_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSupabaseUrl == null) delete process.env.CLAUDE_ETA_SUPABASE_URL;
    else process.env.CLAUDE_ETA_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey == null) delete process.env.CLAUDE_ETA_SUPABASE_KEY;
    else process.env.CLAUDE_ETA_SUPABASE_KEY = originalSupabaseKey;
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

    it('retries without record_unit when the server schema is older', async () => {
      const bodies = [];
      global.fetch = async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        if (bodies.length === 1) {
          return new Response(
            JSON.stringify({
              code: 'PGRST204',
              message: "Could not find the 'record_unit' column of 'velocity_records' in the schema cache",
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response('', { status: 201 });
      };

      const result = await insertVelocityRecords([
        { task_type: 'other', duration_seconds: 30, source_turn_count: 1, record_unit: 'work_item' },
      ]);

      assert.equal(result.error, null);
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0][0].record_unit, 'work_item');
      assert.equal('record_unit' in bodies[1][0], false);
      assert.equal(bodies[1][0].source_turn_count, 1);
    });
  });

  describe('fetchBaselines', () => {
    it('reads Supabase URL and anon key from env vars when present', async () => {
      process.env.CLAUDE_ETA_SUPABASE_URL = 'https://supabase.self-hosted.example';
      process.env.CLAUDE_ETA_SUPABASE_KEY = 'test-anon-key';

      const calls = [];
      global.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const { fetchBaselines: fetchBaselinesWithEnv } = await importFreshSupabase();
      const result = await fetchBaselinesWithEnv();

      assert.equal(result.error, null);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://supabase.self-hosted.example/rest/v1/baselines_cache?select=*');
      assert.equal(calls[0].options.headers.apikey, 'test-anon-key');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer test-anon-key');
    });

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
