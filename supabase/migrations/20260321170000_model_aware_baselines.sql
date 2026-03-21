-- =============================================================
-- claude-eta Layer 3 — model-aware community baseline refresh
-- Adds aggregates for task_type x model and task_type x loc x model
-- so `/eta compare` can fall back in this order:
--   type+loc+model -> type+model -> type+loc -> global
-- =============================================================

create or replace function public.refresh_baselines()
returns void as $$
begin
  delete from public.baselines_cache;

  -- Aggregate by task_type (all sizes, all models)
  with recent as (
    select *
    from public.velocity_records
    where contributed_at > now() - interval '90 days'
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
