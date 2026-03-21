-- Add source_turn_count and record_unit to velocity_records
ALTER TABLE public.velocity_records
  ADD COLUMN IF NOT EXISTS source_turn_count integer DEFAULT 1;

ALTER TABLE public.velocity_records
  ADD COLUMN IF NOT EXISTS record_unit text DEFAULT 'work_item'
    CHECK (record_unit IN ('work_item', 'turn'));
