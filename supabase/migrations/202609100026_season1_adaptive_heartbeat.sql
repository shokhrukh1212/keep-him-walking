-- P18: the heartbeat slows down as the crowd grows.
--
-- Twenty seconds per watcher is affordable at a hundred watchers and ruinous at
-- ten thousand. The server decides the interval from the same locked distinct
-- count the pace already uses, so the decision is made once, under the row lock,
-- and every client is told the same thing.
--
-- The lease has to outlive the interval it hands out, or a watcher who obeys the
-- server would expire between beats: ttl = max(50, 2 * heartbeat + 10).
--
-- The client already honours a server-supplied interval. What it must NOT do is
-- extrapolate further because the lease got longer; presentation authority is
-- capped at sixty seconds independently, in presentation-clock.ts.
--
-- v9 remains the rollback contract.

create or replace function public.presence_heartbeat_seconds(p_watchers bigint)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_watchers, 0) > 1000 then 40
    when coalesce(p_watchers, 0) > 300 then 30
    else 20
  end;
$$;

revoke all on function public.presence_heartbeat_seconds(bigint) from public, anon, authenticated;
grant execute on function public.presence_heartbeat_seconds(bigint) to service_role;

create or replace function public.presence_lease_ttl_seconds(p_heartbeat_seconds integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(50, 2 * coalesce(p_heartbeat_seconds, 20) + 10);
$$;

revoke all on function public.presence_lease_ttl_seconds(integer) from public, anon, authenticated;
grant execute on function public.presence_lease_ttl_seconds(integer) to service_role;

create or replace function public.record_presence_heartbeat_v10(
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
  out_reactions jsonb,
  out_weather jsonb,
  out_hundred_watchers_at timestamptz,
  out_heartbeat_seconds integer,
  out_lease_ttl_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_heartbeat integer;
begin
  select * into v_result
  from public.record_presence_heartbeat_v9(
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

  -- The count returned above is the one taken under the lock, so the interval
  -- and the crowd it was chosen for cannot disagree.
  v_heartbeat := public.presence_heartbeat_seconds(coalesce(v_result.out_active_viewers, 0));

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
    v_result.out_reactions,
    v_result.out_weather,
    v_result.out_hundred_watchers_at,
    v_heartbeat,
    public.presence_lease_ttl_seconds(v_heartbeat);
end;
$$;

revoke all on function public.record_presence_heartbeat_v10(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
grant execute on function public.record_presence_heartbeat_v10(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
