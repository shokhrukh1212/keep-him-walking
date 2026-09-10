-- P17: the first moment a hundred people watched the same day at once.
--
-- Bunting goes up in the market when it happens, and it must never be guessed
-- from a client-side count. The flag is written under the same row lock the
-- heartbeat already holds, so the exact live count and the flag agree.
--
-- It is written once and never moved: the day's milestone is the first time it
-- happened, not the last. v8 and v10 remain the rollback contracts.

alter table public.journey_runtime
  add column hundred_watchers_at timestamptz;

create or replace function public.record_presence_heartbeat_v9(
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
  out_hundred_watchers_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_hundred timestamptz;
begin
  select * into v_result
  from public.record_presence_heartbeat_v8(
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

  -- `is null` makes this idempotent: the first hundred-watcher heartbeat stamps
  -- the moment, and every later one leaves it exactly where it is.
  update public.journey_runtime jr
  set hundred_watchers_at = p_now
  where jr.country_day_id = p_country_day_id
    and jr.hundred_watchers_at is null
    and coalesce(v_result.out_active_viewers, 0) >= 100;

  select jr.hundred_watchers_at into v_hundred
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;

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
    v_hundred;
end;
$$;

revoke all on function public.record_presence_heartbeat_v9(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
grant execute on function public.record_presence_heartbeat_v9(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;

-- The bundle carries the flag so the bunting is up on the first paint for
-- someone who arrives after the moment, not only after the next heartbeat.
create or replace function public.read_bootstrap_bundle_v12(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer,
  p_pace_cap real,
  p_collect_seconds numeric
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
  v_hundred timestamptz;
begin
  v_result := public.read_bootstrap_bundle_v11(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second,
    p_rate_limit,
    p_rate_window_seconds,
    p_pace_cap,
    p_collect_seconds
  );

  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;

  v_bundle := v_result -> 'bundle';
  v_country_day_id := nullif(v_bundle #>> '{country_day,id}', '')::uuid;

  select jr.hundred_watchers_at into v_hundred
  from public.journey_runtime jr
  where jr.country_day_id = v_country_day_id;

  v_bundle := jsonb_set(
    v_bundle,
    '{milestones}',
    jsonb_build_object('hundredWatchersAt', to_jsonb(v_hundred)),
    true
  );

  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.read_bootstrap_bundle_v12(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) from public, anon, authenticated;
grant execute on function public.read_bootstrap_bundle_v12(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) to service_role;
