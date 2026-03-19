// Deno Edge Function — refreshes community baselines aggregate cache.
// Called by GitHub Actions cron every 6 hours.
// Auth: shared secret in x-refresh-secret header (Authorization is used by Supabase JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REFRESH_SECRET = Deno.env.get('REFRESH_SECRET')

Deno.serve(async (req) => {
  const secret = req.headers.get('x-refresh-secret')
  if (secret !== REFRESH_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase.rpc('refresh_baselines')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({ status: 'ok', refreshed_at: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
