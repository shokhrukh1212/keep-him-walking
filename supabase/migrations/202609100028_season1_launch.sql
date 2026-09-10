-- P21: explicit production launch authority and a deterministic Season 1 seed.
-- Existing journeys remain valid: a null launch_at means their starts_at is the
-- launch boundary. New production seeds always set both timestamps identically.

alter table public.journeys
  add column launch_at timestamptz,
  add column rollover_utc_hour smallint not null default 16
    check (rollover_utc_hour between 0 and 23);

create or replace function public.seed_season1_launch(
  p_plan jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := p_plan #>> '{journey,slug}';
  v_launch_at timestamptz := nullif(p_plan #>> '{journey,launchAt}', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_plan #>> '{day,endsAt}', '')::timestamptz;
  v_total_days integer := nullif(p_plan #>> '{journey,totalDays}', '')::integer;
  v_season_number integer := nullif(p_plan #>> '{journey,seasonNumber}', '')::integer;
  v_rollover_hour integer := nullif(p_plan #>> '{journey,rolloverUtcHour}', '')::integer;
  v_founding_days integer := nullif(p_plan #>> '{founding,days}', '')::integer;
  v_founding_cents integer := nullif(p_plan #>> '{founding,priceCents}', '')::integer;
  v_currency char(3) := upper(coalesce(p_plan #>> '{founding,currency}', 'USD'));
  v_journey public.journeys%rowtype;
  v_day_id uuid;
  v_vote_id uuid;
  v_entry jsonb;
  v_offset integer;
  v_date date;
begin
  if v_slug <> 'keep-him-walking-season-1'
    or v_launch_at is null
    or v_total_days <> 30
    or v_season_number <> 1
    or v_rollover_hour <> 16
    or p_plan #>> '{day,scenePackId}' <> 'tashkent-v5'
    or (p_plan #>> '{day,startsAt}')::timestamptz <> v_launch_at
    or v_ends_at <> v_launch_at + interval '1 day'
    or extract(hour from v_launch_at at time zone 'UTC') <> 16
    or extract(minute from v_launch_at at time zone 'UTC') <> 0
    or extract(second from v_launch_at at time zone 'UTC') <> 0
    or v_founding_days <> 7
    or v_founding_cents <= 0
    or v_currency <> 'USD'
    or jsonb_array_length(coalesce(p_plan #> '{vote,options}', '[]'::jsonb)) <> 4 then
    raise exception 'invalid Season 1 launch plan' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_slug));
  select * into v_journey from public.journeys where slug = v_slug for update;
  if found then
    if v_journey.launch_at is distinct from v_launch_at
      or v_journey.starts_at is distinct from v_launch_at
      or v_journey.total_days <> 30
      or v_journey.season_number <> 1
      or v_journey.rollover_utc_hour <> 16
      or not v_journey.phase2_enabled
      or not exists (
        select 1 from public.country_days cd
        where cd.journey_id = v_journey.id and cd.day_number = 1
          and cd.scene_pack_id = 'tashkent-v5' and cd.starts_at = v_launch_at
      )
      or (select count(*) from public.sponsor_pricing sp where sp.journey_id = v_journey.id) <> 7
      or (select count(*) from public.sponsor_slots ss where ss.journey_id = v_journey.id) <> 7 then
      raise exception 'Season 1 already exists with different launch data' using errcode = '23505';
    end if;
    return jsonb_build_object('state', 'exists', 'journeyId', v_journey.id, 'launchAt', v_launch_at);
  end if;

  insert into public.journeys (
    slug, title, starts_at, launch_at, total_days, season_number,
    rollover_utc_hour, status, phase2_enabled, story_time_scale, updated_at
  ) values (
    v_slug, p_plan #>> '{journey,title}', v_launch_at, v_launch_at, 30, 1,
    16, 'active', true, 1, p_now
  ) returning * into v_journey;

  insert into public.country_days (
    journey_id, day_number, country_code, country_name, city_name, time_zone,
    starts_at, ends_at, scene_pack_id, status, story_summary,
    postcard_background_url, updated_at
  ) values (
    v_journey.id, 1, p_plan #>> '{day,countryCode}', p_plan #>> '{day,countryName}',
    p_plan #>> '{day,cityName}', p_plan #>> '{day,timeZone}', v_launch_at, v_ends_at,
    p_plan #>> '{day,scenePackId}', 'scheduled', p_plan #>> '{day,storySummary}',
    p_plan #>> '{day,postcardBackgroundUrl}', p_now
  ) returning id into v_day_id;

  for v_entry in select value from jsonb_array_elements(coalesce(p_plan -> 'events', '[]'::jsonb)) loop
    insert into public.story_events (
      country_day_id, type, starts_at, duration_seconds, payload_json, status, updated_at
    ) values (
      v_day_id, v_entry ->> 'type', (v_entry ->> 'startsAt')::timestamptz,
      (v_entry ->> 'durationSeconds')::integer, coalesce(v_entry -> 'payload', '{}'::jsonb),
      'scheduled', p_now
    );
  end loop;

  insert into public.votes (
    country_day_id, question, kind, opens_at, closes_at,
    result_publishes_at, status, updated_at
  ) values (
    v_day_id, p_plan #>> '{vote,question}', 'name', v_launch_at, v_ends_at,
    v_ends_at, 'open', p_now
  ) returning id into v_vote_id;

  for v_entry in select value from jsonb_array_elements(p_plan #> '{vote,options}') loop
    insert into public.vote_options (vote_id, label, display_order, payload_json, pack_id)
    values (
      v_vote_id, v_entry ->> 'label', (v_entry ->> 'displayOrder')::integer,
      '{}'::jsonb, null
    );
  end loop;

  insert into public.journey_runtime (
    country_day_id, last_accounted_at, active_viewers,
    global_active_seconds, global_steps, updated_at
  ) values (v_day_id, v_launch_at, 0, 0, 0, p_now);

  for v_offset in 0..6 loop
    v_date := (v_launch_at at time zone 'UTC')::date + v_offset;
    insert into public.sponsor_pricing (
      journey_id, day_date, price_cents, basis_uniques, founding, opened_at
    ) values (v_journey.id, v_date, v_founding_cents, 0, true, p_now);
    insert into public.sponsor_slots (
      journey_id, slot_date, country_day_id, price_cents, currency,
      status, created_at, updated_at
    ) values (
      v_journey.id, v_date, case when v_offset = 0 then v_day_id else null end,
      v_founding_cents, v_currency, 'available', p_now, p_now
    );
  end loop;

  return jsonb_build_object(
    'state', 'created', 'journeyId', v_journey.id, 'countryDayId', v_day_id,
    'voteId', v_vote_id, 'launchAt', v_launch_at, 'foundingSlots', 7
  );
end;
$$;

-- A guarded content rollback changes only the immutable pack pointer. The
-- expected-current argument prevents an operator acting on a stale day.
create or replace function public.switch_country_day_pack(
  p_country_day_id uuid,
  p_expected_current text,
  p_replacement text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.country_days%rowtype;
begin
  if coalesce(length(trim(p_replacement)), 0) = 0 then
    raise exception 'replacement pack is required' using errcode = '22023';
  end if;
  select * into v_day from public.country_days where id = p_country_day_id for update;
  if not found then raise exception 'country day not found' using errcode = 'P0002'; end if;
  if v_day.scene_pack_id <> p_expected_current then
    raise exception 'country day pack changed' using errcode = '40001';
  end if;
  if p_replacement = p_expected_current then return false; end if;
  update public.country_days
  set scene_pack_id = p_replacement, updated_at = p_now
  where id = p_country_day_id;
  return true;
end;
$$;

-- V10 remains available for rollback. Production uses this wrapper so even a
-- mistaken server call cannot advance the authoritative runtime before launch.
create or replace function public.record_presence_heartbeat_v11(
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
begin
  if not exists (
    select 1
    from public.country_days cd
    join public.journeys j on j.id = cd.journey_id
    where cd.id = p_country_day_id
      and coalesce(j.launch_at, j.starts_at) <= p_now
  ) then
    raise exception 'journey has not launched' using errcode = '55000';
  end if;

  return query select * from public.record_presence_heartbeat_v10(
    p_country_day_id, p_visitor_hash, p_session_hash, p_state, p_scene_ready,
    p_now, p_ttl_seconds, p_steps_per_second, p_pace_cap,
    p_first_watcher_gap_seconds, p_country_code
  );
end;
$$;

-- The live bundle carries the journey-owned rollover hour. V12 remains the
-- rollback contract.
create or replace function public.read_bootstrap_bundle_v13(
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
  v_rollover_hour integer;
begin
  v_result := public.read_bootstrap_bundle_v12(
    p_visitor_hash, p_real_now, p_ttl_seconds, p_steps_per_second,
    p_rate_limit, p_rate_window_seconds, p_pace_cap, p_collect_seconds
  );
  if not coalesce((v_result ->> 'allowed')::boolean, false)
    or v_result -> 'bundle' = 'null'::jsonb then
    return v_result;
  end if;
  v_bundle := v_result -> 'bundle';
  select j.rollover_utc_hour into v_rollover_hour
  from public.country_days cd
  join public.journeys j on j.id = cd.journey_id
  where cd.id = nullif(v_bundle #>> '{country_day,id}', '')::uuid;
  v_bundle := jsonb_set(
    v_bundle, '{journey,rolloverUtcHour}', to_jsonb(coalesce(v_rollover_hour, 16)), true
  );
  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.seed_season1_launch(jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.switch_country_day_pack(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_presence_heartbeat_v11(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v13(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) from public, anon, authenticated;

grant execute on function public.seed_season1_launch(jsonb, timestamptz) to service_role;
grant execute on function public.switch_country_day_pack(uuid, text, text, timestamptz) to service_role;
grant execute on function public.record_presence_heartbeat_v11(
  uuid, text, text, text, boolean, timestamptz, integer, numeric, real, integer, text
) to service_role;
grant execute on function public.read_bootstrap_bundle_v13(
  text, timestamptz, integer, numeric, integer, integer, real, numeric
) to service_role;
