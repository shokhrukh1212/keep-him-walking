-- Keep the traveler at one natural pace regardless of audience size.
-- Migration 0012 introduced logarithmic crowd acceleration. The owner removed
-- that product rule on 13 September 2026. Existing accumulated distance stays
-- intact; every future eligible interval accrues at 1.25 metres per second.

update public.journey_runtime
set pace_rate = 1
where pace_rate <> 1;

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
  v_distance double precision;
  v_waiting_since timestamptz;
  v_response_waiting_since timestamptz;
  v_woke_him boolean := false;
begin
  -- Keep the public signature during a rolling deploy. This value is now a
  -- compatibility input and cannot change walking speed.
  if p_pace_cap < 1 or p_pace_cap > 5 then
    raise exception 'invalid pace cap' using errcode = '22023';
  end if;
  if p_first_watcher_gap_seconds < 0 or p_first_watcher_gap_seconds > 86400 then
    raise exception 'invalid first watcher gap' using errcode = '22023';
  end if;

  insert into public.journey_runtime (
    country_day_id,
    last_accounted_at,
    active_viewers,
    global_active_seconds,
    global_steps,
    waiting_since,
    pace_rate
  )
  select cd.id, p_now, 0, 0, 0, least(cd.starts_at, p_now), 1
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
  v_distance := v_runtime.global_distance_metres;
  v_waiting_since := v_runtime.waiting_since;

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

  -- Split only to stop at the exact final lease expiry. Audience size no
  -- longer changes the rate inside any segment.
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
      + extract(epoch from v_segment_end - v_cursor) * 1.25;
    v_cursor := v_segment_end;

    if v_cursor < v_effective_now then
      select count(distinct pl.visitor_hash)
        into v_interval_viewers
      from public.presence_leases pl
      where pl.country_day_id = p_country_day_id
        and pl.visible
        and pl.scene_ready
        and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_cursor;
    end if;
  end loop;

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

  if v_result.out_active_viewers = 0 then
    if v_pre_viewers > 0 then
      v_waiting_since := v_effective_now;
    end if;
    v_waiting_since := coalesce(v_waiting_since, v_effective_now);
    v_response_waiting_since := v_waiting_since;
  elsif v_pre_viewers = 0 then
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
    pace_rate = 1,
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
    1::real,
    v_response_waiting_since,
    v_woke_him;
end;
$$;

create or replace function public.record_presence_heartbeat_v4(
  p_country_day_id uuid,
  p_visitor_hash text,
  p_session_hash text,
  p_state text,
  p_scene_ready boolean,
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
  out_pace_rate real
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    heartbeat.out_active_viewers,
    heartbeat.out_global_steps,
    heartbeat.out_visitor_active_seconds,
    heartbeat.out_accounted_at,
    heartbeat.out_global_active_seconds,
    heartbeat.out_global_distance_metres,
    heartbeat.out_pace_rate
  from public.record_presence_heartbeat_v4(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_pace_cap,
    600
  ) heartbeat;
$$;

create or replace function public.read_journey_runtime_v4(
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
  out_pace_rate real
)
language plpgsql
stable
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
  v_interval_viewers bigint;
  v_distance double precision;
begin
  if p_pace_cap < 1 or p_pace_cap > 5 then
    raise exception 'invalid pace cap' using errcode = '22023';
  end if;

  select * into v_result
  from public.read_journey_runtime_v3(
    p_country_day_id,
    p_now,
    p_ttl_seconds,
    p_steps_per_second
  );

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;

  if not found then
    return query select
      v_result.out_active_viewers,
      v_result.out_global_steps,
      v_result.out_visitor_active_seconds,
      v_result.out_accounted_at,
      v_result.out_global_active_seconds,
      0::double precision,
      1::real;
    return;
  end if;

  v_effective_now := greatest(p_now, v_runtime.last_accounted_at);
  v_cursor := v_runtime.last_accounted_at;
  v_interval_viewers := v_runtime.active_viewers;
  v_distance := v_runtime.global_distance_metres;

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
      + extract(epoch from v_segment_end - v_cursor) * 1.25;
    v_cursor := v_segment_end;

    if v_cursor < v_effective_now then
      select count(distinct pl.visitor_hash)
        into v_interval_viewers
      from public.presence_leases pl
      where pl.country_day_id = p_country_day_id
        and pl.visible
        and pl.scene_ready
        and pl.last_seen_at + make_interval(secs => p_ttl_seconds) > v_cursor;
    end if;
  end loop;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_distance,
    1::real;
end;
$$;

revoke all on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer
) from public, anon, authenticated;
grant execute on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer
) to service_role;

revoke all on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real
) from public, anon, authenticated;
grant execute on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real
) to service_role;

revoke all on function public.read_journey_runtime_v4(
  uuid, timestamptz, integer, numeric, real
) from public, anon, authenticated;
grant execute on function public.read_journey_runtime_v4(
  uuid, timestamptz, integer, numeric, real
) to service_role;
