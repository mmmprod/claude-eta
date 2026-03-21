-- Add server-side deduplication key to velocity_records.
-- Prevents duplicate inserts from retries, second machines, or local state resets.
-- Nullable: existing records without dedup_key remain valid.

ALTER TABLE public.velocity_records ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_velocity_dedup
  ON public.velocity_records (dedup_key)
  WHERE dedup_key IS NOT NULL;
