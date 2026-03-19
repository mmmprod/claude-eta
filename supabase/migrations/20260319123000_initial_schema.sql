-- =============================================================
-- claude-eta Layer 3 — Collective Intelligence
-- Initial schema for community velocity data
-- =============================================================

-- TABLE : velocity_records — anonymised individual task records
create table if not exists public.velocity_records (
  id uuid primary key default gen_random_uuid(),

  task_type text not null check (task_type in (
    'feature', 'bugfix', 'refactor', 'config', 'docs',
    'test', 'debug', 'review', 'other'
  )),

  duration_seconds integer not null check (duration_seconds > 0 and duration_seconds < 86400),

  tool_calls integer not null default 0 check (tool_calls >= 0),
  files_read integer not null default 0 check (files_read >= 0),
  files_edited integer not null default 0 check (files_edited >= 0),
  files_created integer not null default 0 check (files_created >= 0),
  errors integer not null default 0 check (errors >= 0),

  model text check (model ~ '^claude-(opus|sonnet|haiku)-[0-9]'),
  project_hash text not null,
  project_file_count integer,
  project_loc_bucket text check (project_loc_bucket in (
    'tiny', 'small', 'medium', 'large', 'huge'
  )),

  plugin_version text not null,
  contributed_at timestamptz not null default now(),
  contributor_hash text not null
);

create index if not exists idx_velocity_task_type on public.velocity_records (task_type);
create index if not exists idx_velocity_contributed_at on public.velocity_records (contributed_at);
create index if not exists idx_velocity_model on public.velocity_records (model);
create index if not exists idx_velocity_project_loc on public.velocity_records (project_loc_bucket);

-- TABLE : contribution_counts — atomic rate limiting
create table if not exists public.contribution_counts (
  contributor_hash text not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (contributor_hash, day)
);

-- TABLE : baselines_cache — pre-computed aggregate statistics
create table if not exists public.baselines_cache (
  id serial primary key,

  task_type text not null,
  project_loc_bucket text,
  model text,

  sample_count integer not null,
  median_seconds integer not null,
  p25_seconds integer not null,
  p75_seconds integer not null,
  p10_seconds integer not null,
  p90_seconds integer not null,
  avg_tool_calls numeric(6,1),
  avg_files_edited numeric(6,1),
  volatility text check (volatility in ('low', 'medium', 'high')),

  computed_at timestamptz not null default now(),

  unique (task_type, project_loc_bucket, model)
);

-- TRIGGER : Rate limit (500 records/day/contributor, atomic)
create or replace function public.check_contribution_rate()
returns trigger as $$
begin
  insert into public.contribution_counts (contributor_hash, day, count)
  values (NEW.contributor_hash, current_date, 1)
  on conflict (contributor_hash, day)
  do update set count = public.contribution_counts.count + 1;

  if (
    select count from public.contribution_counts
    where contributor_hash = NEW.contributor_hash
    and day = current_date
  ) > 500 then
    raise exception 'Rate limit exceeded: max 500 contributions per day';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_rate_limit on public.velocity_records;
create trigger trg_rate_limit
  before insert on public.velocity_records
  for each row
  execute function public.check_contribution_rate();

-- FUNCTION : Refresh baselines (atomic delete + insert)
create or replace function public.refresh_baselines()
returns void as $$
begin
  delete from public.baselines_cache;

  -- Aggregate by task_type (all sizes, all models)
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
  from public.velocity_records
  where contributed_at > now() - interval '90 days'
  group by task_type
  having count(*) >= 10;

  -- Aggregate by task_type x project_loc_bucket
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
  from public.velocity_records
  where contributed_at > now() - interval '90 days'
    and project_loc_bucket is not null
  group by task_type, project_loc_bucket
  having count(*) >= 5;
end;
$$ language plpgsql security definer;

-- RLS POLICIES
alter table public.velocity_records enable row level security;
alter table public.baselines_cache enable row level security;
alter table public.contribution_counts enable row level security;

-- velocity_records : INSERT only for anon
create policy "anon_insert_only"
  on public.velocity_records for insert to anon
  with check (true);

-- baselines_cache : SELECT only for anon
create policy "anon_read_baselines"
  on public.baselines_cache for select to anon
  using (true);

-- contribution_counts : no anon access (internal to security definer trigger)

-- Service role : full access
create policy "service_full_velocity"
  on public.velocity_records for all to service_role
  using (true) with check (true);

create policy "service_full_baselines"
  on public.baselines_cache for all to service_role
  using (true) with check (true);

create policy "service_full_counts"
  on public.contribution_counts for all to service_role
  using (true) with check (true);
