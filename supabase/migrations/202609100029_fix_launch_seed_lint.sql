-- Corrects 0028: the integer FOR loop declares its own variable, so the explicit
-- declaration was both shadowed and unused. Behaviour is otherwise unchanged.

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

  for v_day_offset in 0..6 loop
    v_date := (v_launch_at at time zone 'UTC')::date + v_day_offset;
    insert into public.sponsor_pricing (
      journey_id, day_date, price_cents, basis_uniques, founding, opened_at
    ) values (v_journey.id, v_date, v_founding_cents, 0, true, p_now);
    insert into public.sponsor_slots (
      journey_id, slot_date, country_day_id, price_cents, currency,
      status, created_at, updated_at
    ) values (
      v_journey.id, v_date, case when v_day_offset = 0 then v_day_id else null end,
      v_founding_cents, v_currency, 'available', p_now, p_now
    );
  end loop;

  return jsonb_build_object(
    'state', 'created', 'journeyId', v_journey.id, 'countryDayId', v_day_id,
    'voteId', v_vote_id, 'launchAt', v_launch_at, 'foundingSlots', 7
  );
end;
$$;
