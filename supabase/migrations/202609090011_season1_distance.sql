-- Season 1 distance authority (P4 / migration 0011, part 1).
-- The v3 heartbeat and v4 bootstrap remain available as rollback contracts.

alter table public.journey_runtime
  add column global_distance_metres double precision not null default 0
    check (global_distance_metres >= 0),
  add column pace_rate real not null default 1
    check (pace_rate > 0 and pace_rate <= 5);

create table public.day_outcomes (
  country_day_id uuid primary key references public.country_days(id) on delete cascade,
  distance_metres double precision not null check (distance_metres >= 0),
  landmark_reached boolean not null,
  marathon boolean not null,
  peak_watchers integer not null check (peak_watchers >= 0),
  unique_watchers integer not null check (unique_watchers >= 0),
  countries_count integer not null check (countries_count >= 0),
  top_country char(2),
  recap_image_path text,
  computed_at timestamptz not null default now()
);

alter table public.day_outcomes enable row level security;
revoke all on public.day_outcomes from anon, authenticated;

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_previous_active_seconds numeric(18,3);
  v_distance double precision;
  v_pace real;
  v_delta_seconds numeric(18,3);
begin
  -- Take the authority-row lock before delegating active-time accounting to v3.
  -- The nested v3 call locks the same row re-entrantly and preserves its durable
  -- per-visitor contribution behavior.
  insert into public.journey_runtime (
    country_day_id,
    last_accounted_at,
    active_viewers,
    global_active_seconds,
    global_steps
  ) values (p_country_day_id, p_now, 0, 0, 0)
  on conflict (country_day_id) do nothing;

  select jr.global_active_seconds, jr.global_distance_metres, jr.pace_rate
    into v_previous_active_seconds, v_distance, v_pace
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id
  for update;

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

  v_delta_seconds := greatest(
    0,
    coalesce(v_result.out_global_active_seconds, 0) - coalesce(v_previous_active_seconds, 0)
  );
  v_distance := coalesce(v_distance, 0)
    + v_delta_seconds::double precision * 1.25 * coalesce(v_pace, 1)::double precision;

  update public.journey_runtime set
    global_distance_metres = v_distance,
    updated_at = v_result.out_accounted_at
  where country_day_id = p_country_day_id;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    v_distance,
    coalesce(v_pace, 1)::real;
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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result record;
  v_stored_active_seconds numeric(18,3) := 0;
  v_distance double precision := 0;
  v_pace real := 1;
begin
  select * into v_result
  from public.read_journey_runtime_v3(
    p_country_day_id,
    p_now,
    p_ttl_seconds,
    p_steps_per_second
  );

  select jr.global_active_seconds, jr.global_distance_metres, jr.pace_rate
    into v_stored_active_seconds, v_distance, v_pace
  from public.journey_runtime jr
  where jr.country_day_id = p_country_day_id;

  return query select
    v_result.out_active_viewers,
    v_result.out_global_steps,
    v_result.out_visitor_active_seconds,
    v_result.out_accounted_at,
    v_result.out_global_active_seconds,
    coalesce(v_distance, 0) + greatest(
      0,
      coalesce(v_result.out_global_active_seconds, 0) - coalesce(v_stored_active_seconds, 0)
    )::double precision * 1.25 * coalesce(v_pace, 1)::double precision,
    coalesce(v_pace, 1)::real;
end;
$$;

create or replace function public.read_bootstrap_bundle_v5(
  p_visitor_hash text,
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_rate_limit integer,
  p_rate_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean;
  v_bundle jsonb;
  v_country_day_id uuid;
  v_runtime jsonb;
begin
  v_allowed := public.consume_mutation_rate_limit(
    p_visitor_hash,
    'bootstrap',
    p_rate_limit,
    p_rate_window_seconds,
    p_real_now
  );

  if not v_allowed then
    return jsonb_build_object('allowed', false, 'bundle', null);
  end if;

  v_bundle := public.read_bootstrap_bundle_v3(
    p_visitor_hash,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second
  );
  if v_bundle is null then
    return jsonb_build_object('allowed', true, 'bundle', null);
  end if;

  v_country_day_id := (v_bundle #>> '{country_day,id}')::uuid;
  select to_jsonb(runtime_row) into v_runtime
  from public.read_journey_runtime_v4(
    v_country_day_id,
    p_real_now,
    p_ttl_seconds,
    p_steps_per_second
  ) runtime_row;

  v_bundle := jsonb_set(v_bundle, '{runtime}', coalesce(v_runtime, '{}'::jsonb), true);
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) from public, anon, authenticated;
revoke all on function public.read_journey_runtime_v4(uuid, timestamptz, integer, numeric)
  from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v5(text, timestamptz, integer, numeric, integer, integer)
  from public, anon, authenticated;

grant execute on function public.record_presence_heartbeat_v4(
  uuid, text, text, text, boolean, timestamptz, integer, numeric
) to service_role;
grant execute on function public.read_journey_runtime_v4(uuid, timestamptz, integer, numeric)
  to service_role;
grant execute on function public.read_bootstrap_bundle_v5(text, timestamptz, integer, numeric, integer, integer)
  to service_role;
