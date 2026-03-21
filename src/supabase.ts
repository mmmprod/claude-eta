/**
 * Zero-dependency Supabase REST client for claude-eta.
 * Uses raw fetch against the PostgREST API. No SDK needed.
 */

// Public anon key — not a secret. Committed intentionally.
const SUPABASE_URL = 'https://wviehmnmvvekiuxtxmmd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2aWVobW5tdnZla2l1eHR4bW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjM1MDksImV4cCI6MjA4OTQ5OTUwOX0.S6ZGSfA1WU8ec8kZtdiFIokDkutjY2Z4rDZaQ74LtIM';

interface SupabaseResponse<T> {
  data: T | null;
  error: string | null;
}

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

const FETCH_TIMEOUT_MS = 10_000;

/** INSERT rows into velocity_records. Returns error string or null on success. */
export async function insertVelocityRecords(records: object[]): Promise<SupabaseResponse<null>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/velocity_records`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=minimal' },
      body: JSON.stringify(records),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: `${res.status}: ${body}` };
    }

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

export interface BaselineRecord {
  task_type: string;
  project_loc_bucket: string | null;
  model: string | null;
  sample_count: number;
  median_seconds: number;
  p25_seconds: number;
  p75_seconds: number;
  p10_seconds: number;
  p90_seconds: number;
  avg_tool_calls: number | null;
  avg_files_edited: number | null;
  volatility: 'low' | 'medium' | 'high' | null;
  computed_at: string;
}

/** SELECT all rows from baselines_cache. */
export async function fetchBaselines(): Promise<SupabaseResponse<BaselineRecord[]>> {
  try {
    const h = { ...headers(), Accept: 'application/json' };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/baselines_cache?select=*`, {
      method: 'GET',
      headers: h,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: `${res.status}: ${body}` };
    }

    const data = (await res.json()) as BaselineRecord[];
    return { data, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}
