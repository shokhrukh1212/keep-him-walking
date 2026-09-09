-- Season 1 collective pace (P5 / migration 0011, part 2).
-- Existing signatures remain as 5x-cap compatibility wrappers; application calls
-- pass the configured cap explicitly.

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
  v_interval_viewers bigint;
  v_interval_pace real;
  v_new_pace real;
  v_distance double precision;
begin
  if p_pace_cap < 1 or p_pace_cap > 5 then
    raise exception 'invalid pace cap' using errcode = '22023';
  end if;

  insert into public.journey_runtime (
    country_day_id,
    last_accounted_at,
    active_viewers,
    global_active_seconds,
    global_steps
  ) values (p_country_day_id, p_now, 0, 0, 0)
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

  -- Accrue the interval owned by leases that existed before this request. Split
  -- at every expiry so a departed visitor stops affecting pace at the TTL edge.
  -- The caller is intentionally not upserted until this prior interval is done.
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

  -- v3 owns the lease mutation, watched seconds, steps, and contribution. Its
  -- returned count is post-upsert, so an active caller is included exactly once.
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

  update public.journey_runtime set
    global_distance_metres = v_distance,
    pace_rate = v_new_pace,
    updated_at = v_result.out_accounted_at
  where country_day_id = p_country_day_id;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_distance,
    v_new_pace;
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
  p_steps_per_second numeric
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
  select * from public.record_presence_heartbeat_v4(
    p_country_day_id,
    p_visitor_hash,
    p_session_hash,
    p_state,
    p_scene_ready,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    5::real
  );
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
  v_interval_pace real;
  v_current_pace real;
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
  v_interval_pace := v_runtime.pace_rate;
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

  v_current_pace := least(
    1 + log(2::numeric, greatest(v_result.out_active_viewers, 1)::numeric),
    p_pace_cap::numeric
  )::real;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_distance,
    v_current_pace;
end;
$$;

create or replace function public.read_journey_runtime_v4(
  p_country_day_id uuid,
  p_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric
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
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.read_journey_runtime_v4(
    p_country_day_id,
    p_now,
    p_ttl_seconds,
    p_steps_per_second,
    5::real
  );
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
  from public.read_journey_runtime_v4(
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
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real
) from public, anon, authenticated;
revoke all on function public.read_journey_runtime_v4(uuid, timestamptz, integer, numeric, real)
  from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v5(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;

grant execute on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real
) to service_role;
grant execute on function public.read_journey_runtime_v4(uuid, timestamptz, integer, numeric, real)
  to service_role;
grant execute on function public.read_bootstrap_bundle_v5(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
