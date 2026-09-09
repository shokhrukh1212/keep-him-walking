-- Season 1 reactions and crowd-scheduled actions (P8 / 04 §3–5).
-- Reactions are enums. No visitor free text reaches this schema.
-- v5 remains callable as the rollback contract.

create type public.reaction_kind as enum ('wave', 'water', 'photo');

create table public.reaction_windows (
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  kind public.reaction_kind not null,
  bucket_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (country_day_id, kind, bucket_start)
);

alter table public.reaction_windows enable row level security;
revoke all on public.reaction_windows from anon, authenticated;

create table public.scheduled_actions (
  id bigserial primary key,
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  kind text not null check (kind in ('wave', 'drink', 'photo')),
  at_active_second integer not null check (at_active_second >= 0),
  source text not null default 'crowd' check (source in ('crowd', 'beat', 'system')),
  created_at timestamptz not null default now(),
  -- One action per second per day: two crowds can never fight over one footfall.
  unique (country_day_id, at_active_second)
);

alter table public.scheduled_actions enable row level security;
revoke all on public.scheduled_actions from anon, authenticated;

create index scheduled_actions_recent_idx
  on public.scheduled_actions (country_day_id, at_active_second desc);

create table public.day_photos (
  id bigserial primary key,
  country_day_id uuid not null references public.country_days(id) on delete cascade,
  at_active_second integer not null check (at_active_second >= 0),
  at_distance_metres double precision not null check (at_distance_metres >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  -- One photograph per scheduled moment, whoever uploads first.
  unique (country_day_id, at_active_second)
);

alter table public.day_photos enable row level security;
revoke all on public.day_photos from anon, authenticated;

create index day_photos_recent_idx
  on public.day_photos (country_day_id, at_active_second desc);

-- The threshold the browser mirrors in the "3/5" counter.
create or replace function public.reaction_threshold(p_live_watchers bigint)
returns integer
language sql
immutable
as $$
  select greatest(2, ceil(0.3 * greatest(coalesce(p_live_watchers, 0), 0))::integer);
$$;

create or replace function public.submit_reaction(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_kind public.reaction_kind,
  p_now timestamptz,
  p_ttl_seconds integer
)
returns table (
  out_count integer,
  out_threshold integer,
  out_scheduled_at integer,
  out_rate_limited boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.journey_runtime%rowtype;
  v_bucket_start timestamptz;
  v_count integer;
  v_watchers bigint;
  v_threshold integer;
  v_active_second integer;
  v_motion_kind text;
  v_candidate integer;
  v_scheduled integer := null;
begin
  if p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'invalid presence ttl' using errcode = '22023';
  end if;

  v_bucket_start := to_timestamp(floor(extract(epoch from p_now) / 30) * 30);
  v_motion_kind := case p_kind when 'water' then 'drink' else p_kind::text end;

  -- One reaction per kind per visitor per minute, enforced by the same limiter
  -- every mutating route already uses.
  if not public.consume_mutation_rate_limit(
    p_visitor_hash, 'reaction:' || p_kind::text, 1, 60, p_now
  ) then
    select coalesce(rw.count, 0) into v_count
    from public.reaction_windows rw
    where rw.country_day_id = p_country_day_id
      and rw.kind = p_kind
      and rw.bucket_start = v_bucket_start;

    select count(distinct pl.visitor_hash) into v_watchers
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visible
      and pl.scene_ready
      and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;

    return query select
      coalesce(v_count, 0),
      public.reaction_threshold(coalesce(v_watchers, 0)),
      null::integer,
      true;
    return;
  end if;

  -- The authority row orders every reaction for this day against every heartbeat.
  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  if not found then
    return query select 0, 2, null::integer, false;
    return;
  end if;

  select count(distinct pl.visitor_hash) into v_watchers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > p_now;

  v_threshold := public.reaction_threshold(coalesce(v_watchers, 0));
  v_active_second := floor(v_runtime.global_active_seconds)::integer;

  insert into public.reaction_windows as rw (
    country_day_id, kind, bucket_start, count, updated_at
  ) values (p_country_day_id, p_kind, v_bucket_start, 1, p_now)
  on conflict (country_day_id, kind, bucket_start) do update set
    count = rw.count + 1,
    updated_at = p_now
  returning rw.count into v_count;

  if v_count >= v_threshold and not exists (
    select 1
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.kind = v_motion_kind
      and sa.at_active_second > v_active_second - 120
  ) then
    -- He acts two seconds from now. The unique constraint owns the footfall, so
    -- a colliding second steps forward rather than replacing another action.
    v_candidate := v_active_second + 2;
    while v_candidate <= v_active_second + 6 and v_scheduled is null loop
      insert into public.scheduled_actions (country_day_id, kind, at_active_second, source)
      values (p_country_day_id, v_motion_kind, v_candidate, 'crowd')
      on conflict (country_day_id, at_active_second) do nothing;
      if found then
        v_scheduled := v_candidate;
      end if;
      v_candidate := v_candidate + 1;
    end loop;

    if v_scheduled is not null then
      -- The bucket resets so the next action needs a fresh crowd.
      update public.reaction_windows rw
      set count = 0, updated_at = p_now
      where rw.country_day_id = p_country_day_id
        and rw.kind = p_kind
        and rw.bucket_start = v_bucket_start;
      v_count := 0;
    end if;
  end if;

  return query select v_count, v_threshold, v_scheduled, false;
end;
$$;

-- Bucket counts and the actions the client needs in order to play them. The
-- recent window exists because a heartbeat may only arrive after an action has
-- already been committed.
create or replace function public.read_day_reactions(
  p_country_day_id uuid,
  p_now timestamptz,
  p_global_active_seconds numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket_start timestamptz;
  v_active_second integer;
  v_counts jsonb;
  v_scheduled jsonb;
  v_next jsonb;
  v_photos jsonb;
begin
  v_bucket_start := to_timestamp(floor(extract(epoch from p_now) / 30) * 30);
  v_active_second := floor(greatest(coalesce(p_global_active_seconds, 0), 0))::integer;

  select jsonb_build_object(
    'wave', coalesce(max(case when rw.kind = 'wave' then rw.count end), 0),
    'water', coalesce(max(case when rw.kind = 'water' then rw.count end), 0),
    'photo', coalesce(max(case when rw.kind = 'photo' then rw.count end), 0)
  )
  into v_counts
  from public.reaction_windows rw
  where rw.country_day_id = p_country_day_id
    and rw.bucket_start = v_bucket_start;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('kind', rows.kind, 'atActiveSecond', rows.at_active_second)
      order by rows.at_active_second
    ),
    '[]'::jsonb
  )
  into v_scheduled
  from (
    select sa.kind, sa.at_active_second
    from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.at_active_second > v_active_second - 180
    order by sa.at_active_second desc
    limit 8
  ) rows;

  select jsonb_build_object('kind', sa.kind, 'atActiveSecond', sa.at_active_second)
  into v_next
  from public.scheduled_actions sa
  where sa.country_day_id = p_country_day_id
    and sa.at_active_second >= v_active_second
  order by sa.at_active_second
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'atActiveSecond', rows.at_active_second,
        'storagePath', rows.storage_path
      )
      order by rows.at_active_second desc
    ),
    '[]'::jsonb
  )
  into v_photos
  from (
    select dp.at_active_second, dp.storage_path
    from public.day_photos dp
    where dp.country_day_id = p_country_day_id
    order by dp.at_active_second desc
    limit 6
  ) rows;

  return jsonb_build_object(
    'counts', coalesce(v_counts, jsonb_build_object('wave', 0, 'water', 0, 'photo', 0)),
    'scheduled', v_scheduled,
    'nextScheduledAction', v_next,
    'photos', v_photos
  );
end;
$$;

create or replace function public.record_presence_heartbeat_v6(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_session_hash text,
  p_state text,
  p_scene_ready boolean,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real,
  p_first_watcher_gap_seconds integer,
  p_country_code text
)
returns table (
  out_active_viewers bigint,
  out_global_steps bigint,
  out_visitor_active_seconds numeric,
  out_accounted_at timestamptz,
  out_global_active_seconds numeric,
  out_global_distance_metres double precision,
  out_pace_rate real,
  out_waiting_since timestamptz,
  out_woke_him boolean,
  out_country_code char(2),
  out_reactions jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
begin
  select * into v_result
  from public.record_presence_heartbeat_v5(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap,
    p_first_watcher_gap_seconds,
    p_country_code
  );

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_result.out_global_distance_metres,
    v_result.out_pace_rate,
    v_result.out_waiting_since,
    v_result.out_woke_him,
    v_result.out_country_code,
    public.read_day_reactions(
      p_country_day_id,
      v_result.out_accounted_at,
      v_result.out_global_active_seconds
    );
end;
$$;

create or replace function public.read_bootstrap_bundle_v7(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_pace_cap real
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_bundle jsonb;
  v_country_day_id uuid;
  v_reactions jsonb;
begin
  v_result := public.read_bootstrap_bundle_v6(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_rate_limit,
    p_rate_window_seconds,
    p_pace_cap
  );

  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;

  v_bundle := v_result -> 'bundle';
  v_country_day_id := (v_bundle #>> '{country_day,id}')::uuid;
  v_reactions := public.read_day_reactions(
    v_country_day_id,
    p_real_now,
    coalesce((v_bundle #>> '{runtime,out_global_active_seconds}')::numeric, 0)
  );

  v_bundle := jsonb_set(v_bundle, '{reactions}', coalesce(v_reactions, '{}'::jsonb), true);
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

-- Records an uploaded photograph for a scheduled photo moment. Returns false
-- when the moment was never scheduled or has already been photographed.
create or replace function public.record_day_photo(
  p_country_day_id uuid,
  p_at_active_second integer,
  p_at_distance_metres double precision,
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  if not exists (
    select 1 from public.scheduled_actions sa
    where sa.country_day_id = p_country_day_id
      and sa.kind = 'photo'
      and abs(sa.at_active_second - p_at_active_second) <= 3
  ) then
    return false;
  end if;

  insert into public.day_photos (
    country_day_id, at_active_second, at_distance_metres, storage_path
  ) values (
    p_country_day_id, p_at_active_second, greatest(p_at_distance_metres, 0), p_storage_path
  )
  on conflict (country_day_id, at_active_second) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.reaction_threshold(bigint)
  from public, anon, authenticated;
revoke all on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.read_day_reactions(uuid, timestamptz, numeric)
  from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v6(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v7(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;
revoke all on function public.record_day_photo(uuid, integer, double precision, text)
  from public, anon, authenticated;

grant execute on function public.reaction_threshold(bigint) to service_role;
grant execute on function public.submit_reaction(uuid, text, public.reaction_kind, timestamptz, integer)
  to service_role;
grant execute on function public.read_day_reactions(uuid, timestamptz, numeric)
  to service_role;
grant execute on function public.record_presence_heartbeat_v6(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.read_bootstrap_bundle_v7(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
grant execute on function public.record_day_photo(uuid, integer, double precision, text)
  to service_role;
