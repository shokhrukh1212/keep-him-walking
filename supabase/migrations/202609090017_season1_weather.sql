-- Season 1 local time and real weather (P10 / 02 §6-7).
-- One reading per city per ten minutes, fetched by the server and cached on the
-- authority row. v6 and bundle v8 remain callable as the rollback contract.

alter table public.journey_runtime
  add column weather jsonb;

-- Writes a reading only if it is newer than the one already stored, so a slow
-- request can never overwrite a fresher one.
create or replace function public.write_journey_weather(
  p_country_day_id uuid,
  p_weather jsonb,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_runtime public.journey_runtime%rowtype;
  v_incoming timestamptz;
  v_existing timestamptz;
begin
  if p_weather is null or p_weather ->> 'fetchedAt' is null then
    return false;
  end if;

  begin
    v_incoming := (p_weather ->> 'fetchedAt')::timestamptz;
  exception when others then
    return false;
  end;

  select * into v_runtime
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

  if not found then
    return false;
  end if;

  begin
    v_existing := (v_runtime.weather ->> 'fetchedAt')::timestamptz;
  exception when others then
    v_existing := null;
  end;

  if v_existing is not null and v_existing >= v_incoming then
    return false;
  end if;

  update public.journey_runtime
  set weather = p_weather, updated_at = greatest(updated_at, p_now)
  where country_day_id = p_country_day_id;

  return true;
end;
$$;

create or replace function public.read_journey_weather(p_country_day_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jr.weather
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;
$$;

create or replace function public.record_presence_heartbeat_v7(
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
  out_weather jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
begin
  select * into v_result
  from public.record_presence_heartbeat_v6(
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
    v_result.out_reactions,
    public.read_journey_weather(p_country_day_id);
end;
$$;

create or replace function public.read_bootstrap_bundle_v9(
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
begin
  v_result := public.read_bootstrap_bundle_v8(
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
  v_bundle := jsonb_set(
    v_bundle,
    '{weather}',
    coalesce(public.read_journey_weather(v_country_day_id), 'null'::jsonb),
    true
  );

  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.write_journey_weather(uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.read_journey_weather(uuid)
  from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v7(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v9(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;

grant execute on function public.write_journey_weather(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.read_journey_weather(uuid) to service_role;
grant execute on function public.record_presence_heartbeat_v7(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.read_bootstrap_bundle_v9(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
