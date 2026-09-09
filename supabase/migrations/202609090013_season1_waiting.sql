-- Season 1 waiting state and first-watcher award (P6).
-- The configured overload keeps the P4/P5 rollback signatures intact.

alter table public.journey_runtime
  add column waiting_since timestamptz,
  add column last_watcher_left_at timestamptz;

-- Existing stopped rows have already confirmed zero watchers at last_accounted_at.
update public.journey_runtime
set waiting_since = last_accounted_at
where active_viewers = 0
  and waiting_since is null;

create or replace function public.record_presence_heartbeat_v4(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_session_hash text,
  p_state text,
  p_scene_ready boolean,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real,
  p_first_watcher_gap_seconds integer
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
  out_woke_him boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_runtime public.journey_runtime%rowtype;
  v_effective_now timestamptz;
  v_cursor timestamptz;
  v_next_expiry timestamptz;
  v_segment_end timestamptz;
  v_last_expiry timestamptz;
  v_pre_viewers bigint;
  v_interval_viewers bigint;
  v_interval_pace real;
  v_new_pace real;
  v_distance double precision;
  v_waiting_since timestamptz;
  v_response_waiting_since timestamptz;
  v_woke_him boolean := false;
begin
  if p_pace_cap < 1 or p_pace_cap > 5 then
    raise exception 'invalid pace cap' using errcode = '22023';
  end if;
  if p_first_watcher_gap_seconds < 0 or p_first_watcher_gap_seconds > 86400 then
    raise exception 'invalid first watcher gap' using errcode = '22023';
  end if;

  -- A day with no runtime has been waiting since it began, not since the first
  -- browser happened to ask. This insert is still protected by the authority lock.
  insert into public.journey_runtime (
    country_day_id,
    last_accounted_at,
    active_viewers,
    global_active_seconds,
    global_steps,
    waiting_since
  )
  select cd.id, p_now, 0, 0, 0, least(cd.starts_at, p_now)
  from public.country_days cd
  where cd.id = p_country_day_id
  on conflict (country_day_id) do nothing;

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  v_effective_now := greatest(p_now, v_runtime.last_accounted_at);
  v_cursor := v_runtime.last_accounted_at;
  v_interval_viewers := v_runtime.active_viewers;
  v_interval_pace := v_runtime.pace_rate;
  v_distance := v_runtime.global_distance_metres;
  v_waiting_since := v_runtime.waiting_since;

  -- Count the live crowd before mutating the caller. When the persisted count
  -- was positive but every lease has expired, derive the zero-watcher boundary
  -- from the final lease expiry instead of stamping the later arrival time.
  select count(distinct pl.visitor_hash)
    into v_pre_viewers
  from public.presence_leases pl
  where pl.country_day_id = p_country_day_id
    and pl.visible
    and pl.scene_ready
    and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_effective_now;

  if v_pre_viewers = 0 and v_waiting_since is null then
    if v_runtime.active_viewers > 0 then
      select max(pl.last_seen_at + make_interval(secs => p_ttl_seconds))
        into v_last_expiry
      from public.presence_leases pl
      where pl.country_day_id = p_country_day_id
        and pl.visible
        and pl.scene_ready
        and pl.last_seen_at + make_interval(secs => p_ttl_seconds)
          > v_runtime.last_accounted_at;
    end if;
    v_waiting_since := coalesce(v_last_expiry, v_runtime.last_accounted_at);
  end if;

  -- Accrue the prior interval at its persisted pace, splitting at lease expiry
  -- boundaries. The new caller never changes progress retroactively.
  while v_cursor < v_effective_now and v_interval_viewers > 0 loop
    select min(pl.last_seen_at + make_interval(secs => p_ttl_seconds))
      into v_next_expiry
    from public.presence_leases pl
    where pl.country_day_id = p_country_day_id
      and pl.visible
      and pl.scene_ready
      and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_cursor;

    exit when v_next_expiry is null;
    v_segment_end := least(v_effective_now, v_next_expiry);
    v_distance := v_distance
      + extract(epoch from v_segment_end - v_cursor) * 1.25 * v_interval_pace;
    v_cursor := v_segment_end;

    if v_cursor < v_effective_now then
      select count(distinct pl.visitor_hash)
        into v_interval_viewers
      from public.presence_leases pl
      where pl.country_day_id = p_country_day_id
        and pl.visible
        and pl.scene_ready
        and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_cursor;

      v_interval_pace := least(
        1 + log(2::numeric, greatest(v_interval_viewers, 1)::numeric),
        p_pace_cap::numeric
      )::real;
    end if;
  end loop;

  -- v3 remains the owner of leases, watched seconds, steps and per-visitor
  -- contribution. The authority row is already locked by this function.
  select * into v_result
  from public.record_presence_heartbeat_v3(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second
  );

  v_new_pace := least(
    1 + log(2::numeric, greatest(v_result.out_active_viewers, 1)::numeric),
    p_pace_cap::numeric
  )::real;

  if v_result.out_active_viewers = 0 then
    -- An explicit final departure transitions at this heartbeat. If the crowd
    -- had already expired, preserve the earlier expiry-derived boundary.
    if v_pre_viewers > 0 then
      v_waiting_since := v_effective_now;
    end if;
    v_waiting_since := coalesce(v_waiting_since, v_effective_now);
    v_response_waiting_since := v_waiting_since;
  elsif v_pre_viewers = 0 then
    -- Exactly the first serialized arrival sees the ended wait. Later arrivals
    -- see the now-live lease and cannot receive the same award.
    v_response_waiting_since := coalesce(v_waiting_since, v_effective_now);
    v_woke_him := extract(epoch from v_effective_now - v_response_waiting_since)
      >= p_first_watcher_gap_seconds;
    v_waiting_since := null;
  else
    v_waiting_since := null;
    v_response_waiting_since := null;
  end if;

  update public.journey_runtime set
    global_distance_metres = v_distance,
    pace_rate = v_new_pace,
    waiting_since = v_waiting_since,
    last_watcher_left_at = case
      when v_pre_viewers = 0 and v_result.out_active_viewers > 0
        then v_response_waiting_since
      else public.journey_runtime.last_watcher_left_at
    end,
    updated_at = v_result.out_accounted_at
  where country_day_id = p_country_day_id;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_distance,
    v_new_pace,
    v_response_waiting_since,
    v_woke_him;
end;
$$;

create or replace function public.read_journey_runtime_v5(
  p_country_day_id uuid,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
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
  out_last_watcher_left_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_runtime public.journey_runtime%rowtype;
  v_last_expiry timestamptz;
  v_waiting_since timestamptz;
begin
  select * into v_result
  from public.read_journey_runtime_v4(
    p_country_day_id,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap
  );

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;

  if not found then
    select least(cd.starts_at, p_now) into v_waiting_since
    from public.country_days cd
    where cd.id = p_country_day_id;

    return query select
      v_result.out_active_viewers,
      v_result.out_global_steps,
      v_result.out_visitor_active_seconds,
      v_result.out_accounted_at,
      v_result.out_global_active_seconds,
      v_result.out_global_distance_metres,
      v_result.out_pace_rate,
      v_waiting_since,
      null::timestamptz;
    return;
  end if;

  if v_result.out_active_viewers = 0 then
    v_waiting_since := v_runtime.waiting_since;
    if v_waiting_since is null and v_runtime.active_viewers > 0 then
      select max(pl.last_seen_at + make_interval(secs => p_ttl_seconds))
        into v_last_expiry
      from public.presence_leases pl
      where pl.country_day_id = p_country_day_id
        and pl.visible
        and pl.scene_ready
        and pl.last_seen_at + make_interval(secs => p_ttl_seconds)
          > v_runtime.last_accounted_at;
      v_waiting_since := v_last_expiry;
    end if;
    v_waiting_since := coalesce(v_waiting_since, v_runtime.last_accounted_at);
  end if;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_result.out_global_distance_metres,
    v_result.out_pace_rate,
    v_waiting_since,
    v_runtime.last_watcher_left_at;
end;
$$;

create or replace function public.read_bootstrap_bundle_v5(
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
  v_runtime jsonb;
begin
  v_result := public.read_bootstrap_bundle_v5(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_rate_limit,
    p_rate_window_seconds
  );

  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;

  v_bundle := v_result -> 'bundle';
  v_country_day_id := (v_bundle #>> '{country_day,id}')::uuid;
  select to_jsonb(runtime_row) into v_runtime
  from public.read_journey_runtime_v5(
    v_country_day_id,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap
  ) runtime_row;

  v_bundle := jsonb_set(v_bundle, '{runtime}', coalesce(v_runtime, '{}'::jsonb), true);
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer
) from public, anon, authenticated;
revoke all on function public.read_journey_runtime_v5(uuid, timestamptz, integer, numeric, real)
  from public, anon, authenticated;

grant execute on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer
) to service_role;
grant execute on function public.read_journey_runtime_v5(uuid, timestamptz, integer, numeric, real)
  to service_role;
