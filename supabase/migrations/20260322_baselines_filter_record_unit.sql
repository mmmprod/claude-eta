-- =============================================================
-- claude-eta — filter baselines by record_unit
--
-- The refresh_baselines() function aggregates velocity_records
-- without filtering on record_unit. If any records exist with
-- record_unit = 'turn' (from old data or future code paths),
-- they would contaminate work_item-based baselines with shorter
-- turn-level durations. This migration:
--   1. Backfills any NULL record_unit values to 'work_item'
--   2. Adds AND record_unit = 'work_item' to all 4 CTE blocks
-- =============================================================

-- Safety backfill: ensure all existing records have record_unit set
UPDATE public.velocity_records
SET record_unit = 'work_item'
WHERE record_unit IS NULL;

-- Replace refresh_baselines() with record_unit-filtered version
create or replace function public.refresh_baselines()
returns void as $$
begin
  delete from public.baselines_cache;

  -- Aggregate by task_type (all sizes, all models)
  with recent as (
    select *
    from public.velocity_records
    where contributed_at > now() - interval '90 days'
      and record_unit = 'work_item'
  )
  insert into public.baselines_cache (
    task_type, project_loc_bucket, model,
    sample_count, median_seconds, p25_seconds, p75_seconds,
    p10_seconds, p90_seconds, avg_tool_calls, avg_files_edited,
    volatility
  )
  select
    task_type, null, null,
    count(*),
    percentile_cont(0.50) within group (order by duration_seconds)::integer,
    percentile_cont(0.25) within group (order by duration_seconds)::integer,
    percentile_cont(0.75) within group (order by duration_seconds)::integer,
    percentile_cont(0.10) within group (order by duration_seconds)::integer,
    percentile_cont(0.90) within group (order by duration_seconds)::integer,
    round(avg(tool_calls), 1),
    round(avg(files_edited), 1),
    case
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 1.5
      then 'high'
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 0.7
      then 'medium'
      else 'low'
    end
  from recent
  group by task_type
  having count(*) >= 10;

  -- Aggregate by task_type x model
  with recent as (
    select *
    from public.velocity_records
    where contributed_at > now() - interval '90 days'
      and record_unit = 'work_item'
      and model is not null
  )
  insert into public.baselines_cache (
    task_type, project_loc_bucket, model,
    sample_count, median_seconds, p25_seconds, p75_seconds,
    p10_seconds, p90_seconds, avg_tool_calls, avg_files_edited,
    volatility
  )
  select
    task_type, null, model,
    count(*),
    percentile_cont(0.50) within group (order by duration_seconds)::integer,
    percentile_cont(0.25) within group (order by duration_seconds)::integer,
    percentile_cont(0.75) within group (order by duration_seconds)::integer,
    percentile_cont(0.10) within group (order by duration_seconds)::integer,
    percentile_cont(0.90) within group (order by duration_seconds)::integer,
    round(avg(tool_calls), 1),
    round(avg(files_edited), 1),
    case
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 1.5
      then 'high'
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 0.7
      then 'medium'
      else 'low'
    end
  from recent
  group by task_type, model
  having count(*) >= 5;

  -- Aggregate by task_type x project_loc_bucket
  with recent as (
    select *
    from public.velocity_records
    where contributed_at > now() - interval '90 days'
      and record_unit = 'work_item'
      and project_loc_bucket is not null
  )
  insert into public.baselines_cache (
    task_type, project_loc_bucket, model,
    sample_count, median_seconds, p25_seconds, p75_seconds,
    p10_seconds, p90_seconds, avg_tool_calls, avg_files_edited,
    volatility
  )
  select
    task_type, project_loc_bucket, null,
    count(*),
    percentile_cont(0.50) within group (order by duration_seconds)::integer,
    percentile_cont(0.25) within group (order by duration_seconds)::integer,
    percentile_cont(0.75) within group (order by duration_seconds)::integer,
    percentile_cont(0.10) within group (order by duration_seconds)::integer,
    percentile_cont(0.90) within group (order by duration_seconds)::integer,
    round(avg(tool_calls), 1),
    round(avg(files_edited), 1),
    case
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 1.5
      then 'high'
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 0.7
      then 'medium'
      else 'low'
    end
  from recent
  group by task_type, project_loc_bucket
  having count(*) >= 5;

  -- Aggregate by task_type x project_loc_bucket x model
  with recent as (
    select *
    from public.velocity_records
    where contributed_at > now() - interval '90 days'
      and record_unit = 'work_item'
      and project_loc_bucket is not null
      and model is not null
  )
  insert into public.baselines_cache (
    task_type, project_loc_bucket, model,
    sample_count, median_seconds, p25_seconds, p75_seconds,
    p10_seconds, p90_seconds, avg_tool_calls, avg_files_edited,
    volatility
  )
  select
    task_type, project_loc_bucket, model,
    count(*),
    percentile_cont(0.50) within group (order by duration_seconds)::integer,
    percentile_cont(0.25) within group (order by duration_seconds)::integer,
    percentile_cont(0.75) within group (order by duration_seconds)::integer,
    percentile_cont(0.10) within group (order by duration_seconds)::integer,
    percentile_cont(0.90) within group (order by duration_seconds)::integer,
    round(avg(tool_calls), 1),
    round(avg(files_edited), 1),
    case
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 1.5
      then 'high'
      when (percentile_cont(0.75) within group (order by duration_seconds) -
            percentile_cont(0.25) within group (order by duration_seconds)) /
           nullif(percentile_cont(0.50) within group (order by duration_seconds), 0) > 0.7
      then 'medium'
      else 'low'
    end
  from recent
  group by task_type, project_loc_bucket, model
  having count(*) >= 5;
end;
$$ language plpgsql security definer;
