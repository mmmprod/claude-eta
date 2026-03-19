/**
 * Zero-dependency Supabase REST client for claude-eta.
 * Uses raw fetch against the PostgREST API. No SDK needed.
 */
// Public anon key — not a secret. Committed intentionally.
const SUPABASE_URL = 'https://wviehmnmvvekiuxtxmmd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2aWVobW5tdnZla2l1eHR4bW1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjM1MDksImV4cCI6MjA4OTQ5OTUwOX0.S6ZGSfA1WU8ec8kZtdiFIokDkutjY2Z4rDZaQ74LtIM';
function headers() {
    return {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
    };
}
const FETCH_TIMEOUT_MS = 10_000;
/** INSERT rows into velocity_records. Returns error string or null on success. */
export async function insertVelocityRecords(records) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/velocity_records`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(records),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
            const body = await res.text();
            return { data: null, error: `${res.status}: ${body}` };
        }
        return { data: null, error: null };
    }
    catch (err) {
        return { data: null, error: err.message };
    }
}
/** SELECT all rows from baselines_cache. */
export async function fetchBaselines() {
    try {
        const h = headers();
        delete h['Prefer'];
        h['Accept'] = 'application/json';
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baselines_cache?select=*`, {
            method: 'GET',
            headers: h,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
            const body = await res.text();
            return { data: null, error: `${res.status}: ${body}` };
        }
        const data = (await res.json());
        return { data, error: null };
    }
    catch (err) {
        return { data: null, error: err.message };
    }
}
//# sourceMappingURL=supabase.js.map