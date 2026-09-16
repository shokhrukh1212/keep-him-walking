-- Season 1, "The Anniversary Journey": fourteen days on Tashkent calendar days.
--
-- What this extends and why. 0040's configure_season and 0044's reschedule_season accept
-- only a seven-day week starting at 16:00 UTC. The owner's launch travels fourteen days,
-- two per city, from 17 September 00:00 Asia/Tashkent (16 September 19:00 UTC), with a
-- name vote before launch and a free anniversary-setting poll that spans several days.
-- Applied migrations stay untouched; this adds:
--
--   * votes.kind 'anniversary', a season poll distinct from route and name votes.
--   * configure_season_v2: N consecutive 24-hour days from any whole UTC hour, and a
--     votes array whose entries may open before the season starts (the name vote) or
--     last several days (the poll). The 0040 function remains for its seven-day callers.
--   * replan_season: rewrites a draft season that has not started and has no activity of
--     any kind. It is guarded, not a reset: it refuses once anything exists that a visitor
--     or sponsor did (a ballot, presence, contribution, outcome, postcard, reaction, photo,
--     slot) or any sponsorship money state, so no historical or payment row can be lost.
--     Only unstarted placeholder days, their zeroed runtime rows, departure beats and
--     ballot definitions with no ballots are replaced.
--   * reschedule_season: a moved season starts on any whole UTC hour (was 16:00 only).
--   * reconcile_season_state: closes every season vote whose closing time has passed on
--     each run, not only at the season end, so the name vote settles at launch and the
--     poll at its own close. Everything else is the 0040 body.

alter table public.votes drop constraint votes_kind_check;
alter table public.votes
  add constraint votes_kind_check check (kind in ('destination', 'name', 'anniversary'));

-- A comparable picture of a plan: day packs and instants, and each vote's window and options.
create or replace function public.season_plan_signature(p_plan jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'title', trim(p_plan #>> '{season,title}'),
    'startsAt', extract(epoch from (p_plan #>> '{season,startsAt}')::timestamptz),
    'endsAt', extract(epoch from (p_plan #>> '{season,endsAt}')::timestamptz),
    'days', coalesce((
      select jsonb_agg(jsonb_build_array(position, trim(value ->> 'scenePackId')) order by position)
      from jsonb_array_elements(p_plan -> 'days') with ordinality as planned(value, position)
    ), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_array(
        value ->> 'kind',
        extract(epoch from (value ->> 'opensAt')::timestamptz),
        extract(epoch from (value ->> 'closesAt')::timestamptz),
        (select jsonb_agg(trim(o.value ->> 'label') order by (o.value ->> 'displayOrder')::integer)
         from jsonb_array_elements(value -> 'options') as o(value))
      ) order by value ->> 'kind')
      from jsonb_array_elements(coalesce(p_plan -> 'votes', '[]'::jsonb)) as planned_vote(value)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.season_schedule_signature(p_journey_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'title', j.title,
    'startsAt', extract(epoch from j.starts_at),
    'endsAt', extract(epoch from j.ends_at),
    'days', coalesce((
      select jsonb_agg(jsonb_build_array(cd.day_number, cd.scene_pack_id) order by cd.day_number)
      from public.country_days cd
      where cd.journey_id = j.id
    ), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_array(
        v.kind,
        extract(epoch from v.opens_at),
        extract(epoch from v.closes_at),
        (select jsonb_agg(vo.label order by vo.display_order) from public.vote_options vo where vo.vote_id = v.id)
      ) order by v.kind)
      from public.votes v
      join public.country_days cd on cd.id = v.country_day_id
      where cd.journey_id = j.id
    ), '[]'::jsonb)
  )
  from public.journeys j
  where j.id = p_journey_id;
$$;

-- Validates the season half of a plan. Raises 22023 on anything malformed.
create or replace function public.validate_season_plan(p_plan jsonb, p_now timestamptz)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_slug text := nullif(trim(p_plan #>> '{season,slug}'), '');
  v_title text := nullif(trim(p_plan #>> '{season,title}'), '');
  v_number integer := nullif(p_plan #>> '{season,seasonNumber}', '')::integer;
  v_starts_at timestamptz := nullif(p_plan #>> '{season,startsAt}', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_plan #>> '{season,endsAt}', '')::timestamptz;
  v_total integer := nullif(p_plan #>> '{season,totalDays}', '')::integer;
  v_days jsonb := p_plan -> 'days';
  v_votes jsonb := coalesce(p_plan -> 'votes', '[]'::jsonb);
  v_day jsonb;
  v_vote jsonb;
  v_index integer := 0;
  v_opens timestamptz;
  v_closes timestamptz;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or v_title is null or char_length(v_title) > 120
    or v_number is null or v_number < 1
    or v_starts_at is null or v_ends_at is null
    or v_total is null or v_total not between 1 and 31
    -- Hours, not days: day arithmetic follows the session time zone.
    or v_ends_at <> v_starts_at + make_interval(hours => 24 * v_total)
    or extract(minute from v_starts_at at time zone 'UTC') <> 0
    or extract(second from v_starts_at at time zone 'UTC') <> 0
    or jsonb_typeof(v_days) is distinct from 'array'
    or jsonb_typeof(v_votes) is distinct from 'array' then
    raise exception 'invalid season plan' using errcode = '22023';
  end if;
  if jsonb_array_length(v_days) <> v_total then
    raise exception 'a season has exactly its planned number of days' using errcode = '22023';
  end if;
  if v_starts_at <= p_now then
    raise exception 'a season must be configured before it starts' using errcode = '22023';
  end if;

  for v_day in select value from jsonb_array_elements(v_days) loop
    v_index := v_index + 1;
    if nullif(v_day ->> 'dayNumber', '')::integer is distinct from v_index
      or coalesce(v_day ->> 'countryCode', '') !~ '^[A-Z]{2}$'
      or nullif(trim(v_day ->> 'countryName'), '') is null
      or nullif(trim(v_day ->> 'cityName'), '') is null
      or nullif(trim(v_day ->> 'timeZone'), '') is null
      or nullif(trim(v_day ->> 'scenePackId'), '') is null
      or coalesce(v_day ->> 'arrivalMode', 'walk') not in ('walk', 'train', 'flight') then
      raise exception 'invalid season day %', v_index using errcode = '22023';
    end if;
  end loop;

  if (select count(distinct value ->> 'kind') from jsonb_array_elements(v_votes)) <> jsonb_array_length(v_votes) then
    raise exception 'invalid season ballot' using errcode = '22023';
  end if;
  for v_vote in select value from jsonb_array_elements(v_votes) loop
    v_opens := nullif(v_vote ->> 'opensAt', '')::timestamptz;
    v_closes := nullif(v_vote ->> 'closesAt', '')::timestamptz;
    if v_vote ->> 'kind' is null or v_vote ->> 'kind' not in ('name', 'anniversary')
      or nullif(trim(v_vote ->> 'question'), '') is null
      or v_opens is null or v_closes is null
      or v_closes <= v_opens or v_closes > v_ends_at or v_closes <= p_now
      or jsonb_typeof(v_vote -> 'options') is distinct from 'array'
      or jsonb_array_length(v_vote -> 'options') not between 2 and 6
      or exists (
        select 1 from jsonb_array_elements(v_vote -> 'options') as o(value)
        where nullif(trim(o.value ->> 'label'), '') is null
          or nullif(o.value ->> 'displayOrder', '') is null
      ) then
      raise exception 'invalid season ballot' using errcode = '22023';
    end if;
    -- Only the name vote may open before the season: the poll belongs to travel days.
    if v_vote ->> 'kind' = 'anniversary' and v_opens < v_starts_at then
      raise exception 'invalid season ballot' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Writes a validated plan's days, runtime rows, beats and votes under a journey the
-- caller has already locked.
create or replace function public.insert_season_schedule(
  p_journey_id uuid,
  p_plan jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_starts_at timestamptz := (p_plan #>> '{season,startsAt}')::timestamptz;
  v_day jsonb;
  v_event jsonb;
  v_vote jsonb;
  v_option jsonb;
  v_day_id uuid;
  v_vote_day_id uuid;
  v_vote_id uuid;
  v_index integer := 0;
  v_votes jsonb := '[]'::jsonb;
begin
  for v_day in select value from jsonb_array_elements(p_plan -> 'days') loop
    v_index := v_index + 1;
    insert into public.country_days (
      journey_id, day_number, country_code, country_name, city_name, time_zone,
      starts_at, ends_at, scene_pack_id, status, story_summary,
      postcard_background_url, arrival_mode, created_at, updated_at
    ) values (
      p_journey_id, v_index, v_day ->> 'countryCode', trim(v_day ->> 'countryName'),
      trim(v_day ->> 'cityName'), trim(v_day ->> 'timeZone'),
      v_starts_at + make_interval(hours => 24 * (v_index - 1)),
      v_starts_at + make_interval(hours => 24 * v_index),
      trim(v_day ->> 'scenePackId'), 'scheduled', nullif(trim(v_day ->> 'storySummary'), ''),
      nullif(trim(v_day ->> 'postcardBackgroundUrl'), ''),
      coalesce(v_day ->> 'arrivalMode', 'walk'), p_now, p_now
    ) returning id into v_day_id;

    insert into public.journey_runtime (
      country_day_id, last_accounted_at, active_viewers,
      global_active_seconds, global_steps, updated_at
    ) values (
      v_day_id, v_starts_at + make_interval(hours => 24 * (v_index - 1)), 0, 0, 0, p_now
    );

    if jsonb_typeof(v_day -> 'events') = 'array' then
      for v_event in select value from jsonb_array_elements(v_day -> 'events') loop
        insert into public.story_events (
          country_day_id, type, starts_at, duration_seconds, payload_json, status, updated_at
        ) values (
          v_day_id, v_event ->> 'type', (v_event ->> 'startsAt')::timestamptz,
          (v_event ->> 'durationSeconds')::integer,
          coalesce(v_event -> 'payload', '{}'::jsonb), 'scheduled', p_now
        );
      end loop;
    end if;
  end loop;

  for v_vote in select value from jsonb_array_elements(coalesce(p_plan -> 'votes', '[]'::jsonb)) loop
    -- A vote belongs to the day it opens on; one that opens before the season, to Day 1.
    select cd.id into v_vote_day_id
    from public.country_days cd
    where cd.journey_id = p_journey_id
      and cd.starts_at <= greatest((v_vote ->> 'opensAt')::timestamptz, v_starts_at)
    order by cd.starts_at desc
    limit 1;
    insert into public.votes (
      country_day_id, question, kind, opens_at, closes_at,
      result_publishes_at, status, created_at, updated_at
    ) values (
      v_vote_day_id, trim(v_vote ->> 'question'), v_vote ->> 'kind',
      (v_vote ->> 'opensAt')::timestamptz, (v_vote ->> 'closesAt')::timestamptz,
      (v_vote ->> 'closesAt')::timestamptz, 'open', p_now, p_now
    ) returning id into v_vote_id;
    for v_option in select value from jsonb_array_elements(v_vote -> 'options') loop
      insert into public.vote_options (vote_id, label, display_order, payload_json, pack_id)
      values (v_vote_id, trim(v_option ->> 'label'), (v_option ->> 'displayOrder')::integer, '{}'::jsonb, null);
    end loop;
    v_votes := v_votes || jsonb_build_array(jsonb_build_object('kind', v_vote ->> 'kind', 'voteId', v_vote_id));
  end loop;

  return jsonb_build_object('days', v_index, 'votes', v_votes);
end;
$$;

-- Configures one future season atomically. A same-data retry answers 'exists'.
create or replace function public.configure_season_v2(
  p_plan jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := nullif(trim(p_plan #>> '{season,slug}'), '');
  v_number integer := nullif(p_plan #>> '{season,seasonNumber}', '')::integer;
  v_starts_at timestamptz := nullif(p_plan #>> '{season,startsAt}', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_plan #>> '{season,endsAt}', '')::timestamptz;
  v_existing public.journeys%rowtype;
  v_journey_id uuid;
  v_traveler_name text;
  v_written jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('season:' || coalesce(v_slug, '')));
  select * into v_existing from public.journeys j where j.slug = v_slug for update;
  if found then
    if v_existing.ends_at is null
      or v_existing.season_number is distinct from v_number
      or public.season_schedule_signature(v_existing.id) is distinct from public.season_plan_signature(p_plan) then
      raise exception 'season already exists with different data' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'state', 'exists', 'journeyId', v_existing.id, 'status', v_existing.status,
      'startsAt', v_existing.starts_at, 'endsAt', v_existing.ends_at
    );
  end if;

  perform public.validate_season_plan(p_plan, p_now);
  if exists (
    select 1 from public.journeys j
    where j.ends_at is not null and j.season_number = v_number
  ) then
    raise exception 'season number is already used' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.journeys j
    where j.ends_at is not null
      and tstzrange(j.starts_at, j.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'season overlaps another season' using errcode = '23P01';
  end if;

  v_traveler_name := nullif(trim(p_plan #>> '{season,travelerName}'), '');
  if v_traveler_name is null then
    select j.traveler_name into v_traveler_name
    from public.journeys j
    where j.ends_at is not null and j.traveler_name is not null
    order by j.starts_at desc
    limit 1;
  end if;

  insert into public.journeys (
    slug, title, starts_at, launch_at, ends_at, total_days, season_number,
    rollover_utc_hour, status, phase2_enabled, story_time_scale, traveler_name,
    created_at, updated_at
  ) values (
    v_slug, trim(p_plan #>> '{season,title}'), v_starts_at, v_starts_at, v_ends_at,
    (p_plan #>> '{season,totalDays}')::integer, v_number,
    extract(hour from v_starts_at at time zone 'UTC')::integer, 'draft', true, 1, v_traveler_name,
    p_now, p_now
  ) returning id into v_journey_id;

  v_written := public.insert_season_schedule(v_journey_id, p_plan, p_now);
  return jsonb_build_object(
    'state', 'created', 'journeyId', v_journey_id, 'status', 'draft',
    'startsAt', v_starts_at, 'endsAt', v_ends_at,
    'days', v_written -> 'days', 'votes', v_written -> 'votes'
  );
end;
$$;

-- Rewrites a draft season that has not started and that nobody has touched yet.
create or replace function public.replan_season(
  p_plan jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text := nullif(trim(p_plan #>> '{season,slug}'), '');
  v_number integer := nullif(p_plan #>> '{season,seasonNumber}', '')::integer;
  v_starts_at timestamptz := nullif(p_plan #>> '{season,startsAt}', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_plan #>> '{season,endsAt}', '')::timestamptz;
  v_season public.journeys%rowtype;
  v_replaced integer;
  v_stale integer;
  v_written jsonb;
begin
  if p_now is null or v_number is null then
    raise exception 'invalid season plan' using errcode = '22023';
  end if;
  select * into v_season
  from public.journeys j
  where j.ends_at is not null and j.season_number = v_number
  for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_season.slug is distinct from v_slug then
    raise exception 'invalid season plan' using errcode = '22023';
  end if;
  if v_season.status <> 'draft' or v_season.starts_at <= p_now then
    raise exception 'a season can only be replanned before it starts' using errcode = '55000';
  end if;
  if public.season_schedule_signature(v_season.id) = public.season_plan_signature(p_plan) then
    return jsonb_build_object(
      'state', 'unchanged', 'journeyId', v_season.id,
      'startsAt', v_season.starts_at, 'endsAt', v_season.ends_at
    );
  end if;

  perform public.validate_season_plan(p_plan, p_now);
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = v_season.id
      and s.status in ('payment_pending', 'scheduled', 'active', 'completed', 'refund_required')
  ) then
    raise exception 'season has a sponsor payment' using errcode = '55000';
  end if;
  -- Anything a visitor, sponsor or the live clock produced stops a replan outright.
  if exists (select 1 from public.ballots b join public.votes v on v.id = b.vote_id
             join public.country_days cd on cd.id = v.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.presence_leases x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.visitor_day_contributions x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.day_outcomes x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.postcards x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.reaction_requests x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.reaction_windows x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.scheduled_actions x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.day_photos x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.step_buckets x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.country_day_watch x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.experiment_exposures x join public.country_days cd on cd.id = x.country_day_id where cd.journey_id = v_season.id)
    or exists (select 1 from public.sponsor_slots x where x.journey_id = v_season.id)
    or exists (select 1 from public.journey_runtime jr join public.country_days cd on cd.id = jr.country_day_id
               where cd.journey_id = v_season.id and (jr.global_active_seconds > 0 or jr.global_distance_metres > 0)) then
    raise exception 'season already has activity' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.journeys j
    where j.id <> v_season.id
      and j.ends_at is not null
      and tstzrange(j.starts_at, j.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'season overlaps another season' using errcode = '23P01';
  end if;

  update public.journeys j
  set title = trim(p_plan #>> '{season,title}'),
      starts_at = v_starts_at,
      launch_at = v_starts_at,
      ends_at = v_ends_at,
      total_days = (p_plan #>> '{season,totalDays}')::integer,
      rollover_utc_hour = extract(hour from v_starts_at at time zone 'UTC')::integer,
      updated_at = p_now
  where j.id = v_season.id;

  delete from public.country_days cd where cd.journey_id = v_season.id;
  get diagnostics v_replaced = row_count;
  v_written := public.insert_season_schedule(v_season.id, p_plan, p_now);

  select count(*) into v_stale
  from public.season_sponsorships s
  where s.journey_id = v_season.id
    and s.status in ('submitted', 'approved');

  return jsonb_build_object(
    'state', 'replanned', 'journeyId', v_season.id,
    'previousStartsAt', v_season.starts_at, 'previousEndsAt', v_season.ends_at,
    'previousDays', v_replaced,
    'startsAt', v_starts_at, 'endsAt', v_ends_at,
    'days', v_written -> 'days', 'votes', v_written -> 'votes',
    'requestsQuotedOldDates', v_stale
  );
end;
$$;

-- 0044's body with a whole-UTC-hour start instead of 16:00.
create or replace function public.reschedule_season(
  p_season_number integer,
  p_starts_at timestamptz,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.journeys%rowtype;
  v_shift interval;
  v_day record;
  v_moved integer := 0;
  v_stale integer;
begin
  if p_season_number is null or p_season_number < 1
    or p_starts_at is null or p_now is null
    or extract(minute from p_starts_at at time zone 'UTC') <> 0
    or extract(second from p_starts_at at time zone 'UTC') <> 0 then
    raise exception 'invalid season start' using errcode = '22023';
  end if;

  select * into v_season
  from public.journeys j
  where j.ends_at is not null and j.season_number = p_season_number
  for update;
  if not found then
    raise exception 'season not found' using errcode = 'P0002';
  end if;
  if v_season.status <> 'draft' or v_season.starts_at <= p_now then
    raise exception 'a season can only be moved before it starts' using errcode = '55000';
  end if;
  if p_starts_at <= p_now then
    raise exception 'a season must be configured before it starts' using errcode = '22023';
  end if;
  if p_starts_at = v_season.starts_at then
    return jsonb_build_object(
      'state', 'unchanged', 'journeyId', v_season.id,
      'startsAt', v_season.starts_at, 'endsAt', v_season.ends_at
    );
  end if;
  if exists (
    select 1 from public.season_sponsorships s
    where s.journey_id = v_season.id
      and s.status in ('payment_pending', 'scheduled', 'active', 'completed', 'refund_required')
  ) then
    raise exception 'season has a sponsor payment' using errcode = '55000';
  end if;

  v_shift := p_starts_at - v_season.starts_at;
  if exists (
    select 1 from public.journeys j
    where j.id <> v_season.id
      and j.ends_at is not null
      and tstzrange(j.starts_at, j.ends_at, '[)')
        && tstzrange(p_starts_at, v_season.ends_at + v_shift, '[)')
  ) then
    raise exception 'season overlaps another season' using errcode = '23P01';
  end if;

  update public.journeys j
  set starts_at = j.starts_at + v_shift,
      launch_at = j.launch_at + v_shift,
      ends_at = j.ends_at + v_shift,
      rollover_utc_hour = extract(hour from p_starts_at at time zone 'UTC')::integer,
      updated_at = p_now
  where j.id = v_season.id;

  for v_day in
    select cd.id
    from public.country_days cd
    where cd.journey_id = v_season.id
    order by case when v_shift > interval '0' then -cd.day_number else cd.day_number end
    for update
  loop
    update public.country_days cd
    set starts_at = cd.starts_at + v_shift,
        ends_at = cd.ends_at + v_shift,
        updated_at = p_now
    where cd.id = v_day.id;
    update public.journey_runtime jr
    set last_accounted_at = jr.last_accounted_at + v_shift,
        updated_at = p_now
    where jr.country_day_id = v_day.id;
    update public.story_events e
    set starts_at = e.starts_at + v_shift,
        updated_at = p_now
    where e.country_day_id = v_day.id;
    update public.votes v
    set opens_at = v.opens_at + v_shift,
        closes_at = v.closes_at + v_shift,
        result_publishes_at = v.result_publishes_at + v_shift,
        updated_at = p_now
    where v.country_day_id = v_day.id;
    v_moved := v_moved + 1;
  end loop;

  select count(*) into v_stale
  from public.season_sponsorships s
  where s.journey_id = v_season.id
    and s.status in ('submitted', 'approved');

  return jsonb_build_object(
    'state', 'moved', 'journeyId', v_season.id,
    'previousStartsAt', v_season.starts_at,
    'startsAt', p_starts_at, 'endsAt', v_season.ends_at + v_shift,
    'days', v_moved, 'requestsQuotedOldDates', v_stale
  );
end;
$$;

-- 0040's season clock, plus: any season vote whose closing time has passed is closed with
-- its winner on every run (a name vote names him then), rather than only at the season end.
create or replace function public.reconcile_season_state(
  p_real_now timestamptz,
  p_ttl_seconds integer,
  p_steps_per_second numeric,
  p_pace_cap real
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season record;
  v_day record;
  v_vote record;
  v_winner_id uuid;
  v_winner_label text;
  v_activated jsonb := '[]'::jsonb;
  v_completed jsonb := '[]'::jsonb;
  v_finalized integer := 0;
  v_votes_closed integer := 0;
  v_cancelled integer;
  v_closed integer;
begin
  for v_season in
    select j.id, j.status, j.season_number, j.starts_at, j.ends_at
    from public.journeys j
    where j.ends_at is not null
      and j.phase2_enabled
      and j.status in ('draft', 'preview', 'active')
      and (
        j.starts_at <= p_real_now
        or exists (
          select 1 from public.votes v
          join public.country_days cd on cd.id = v.country_day_id
          where cd.journey_id = j.id and v.status = 'open' and v.closes_at <= p_real_now
        )
      )
    order by j.starts_at
    for update
  loop
    if v_season.status = 'draft' and v_season.starts_at <= p_real_now then
      update public.journeys j
      set status = 'active', updated_at = p_real_now
      where j.id = v_season.id;
      v_activated := v_activated || jsonb_build_array(jsonb_build_object(
        'journeyId', v_season.id, 'seasonNumber', v_season.season_number
      ));
    end if;

    update public.country_days cd
    set status = case
          when cd.ends_at <= p_real_now then 'completed'
          when cd.starts_at <= p_real_now then 'live'
          else 'scheduled'
        end,
        updated_at = p_real_now
    where cd.journey_id = v_season.id
      and cd.status is distinct from case
        when cd.ends_at <= p_real_now then 'completed'
        when cd.starts_at <= p_real_now then 'live'
        else 'scheduled'
      end;

    for v_day in
      select cd.id
      from public.country_days cd
      where cd.journey_id = v_season.id
        and cd.ends_at <= p_real_now
        and not exists (
          select 1 from public.day_outcomes outcomes where outcomes.country_day_id = cd.id
        )
      order by cd.day_number
      for update of cd
    loop
      perform public.finalize_day_outcome(
        v_day.id, p_real_now, p_ttl_seconds, p_steps_per_second, p_pace_cap
      );
      v_finalized := v_finalized + 1;
    end loop;

    -- A ballot closes at its own closing time with its winner, exactly as the daily close
    -- does, and at the latest when the season ends. Its result stays in this season's scope.
    v_closed := 0;
    for v_vote in
      select v.id, v.kind
      from public.votes v
      join public.country_days cd on cd.id = v.country_day_id
      where cd.journey_id = v_season.id
        and v.status = 'open'
        and (v.closes_at <= p_real_now or v_season.ends_at <= p_real_now)
      order by v.closes_at
      for update of v
    loop
      select vo.id, vo.label into v_winner_id, v_winner_label
      from public.vote_options vo
      left join public.ballots b on b.option_id = vo.id
      where vo.vote_id = v_vote.id
      group by vo.id, vo.label, vo.display_order
      order by count(b.id) desc, vo.display_order, vo.label
      limit 1;
      update public.votes v
      set status = 'closed', result_option_id = v_winner_id,
          result_published_at = p_real_now, updated_at = p_real_now
      where v.id = v_vote.id;
      if v_vote.kind = 'name' and v_winner_label is not null then
        update public.journeys j
        set traveler_name = v_winner_label, updated_at = p_real_now
        where j.id = v_season.id;
      end if;
      v_closed := v_closed + 1;
    end loop;
    v_votes_closed := v_votes_closed + v_closed;

    if v_season.ends_at <= p_real_now then
      -- Nothing planned for after the final confirmed watched second will play.
      update public.scheduled_actions sa
      set cancelled_at = p_real_now
      from public.country_days cd
      left join public.journey_runtime jr on jr.country_day_id = cd.id
      where sa.country_day_id = cd.id
        and cd.journey_id = v_season.id
        and sa.cancelled_at is null
        and sa.at_active_second >= coalesce(jr.global_active_seconds, 0);
      get diagnostics v_cancelled = row_count;

      update public.journeys j
      set status = 'completed', updated_at = p_real_now
      where j.id = v_season.id;
      v_completed := v_completed || jsonb_build_array(jsonb_build_object(
        'journeyId', v_season.id, 'seasonNumber', v_season.season_number,
        'cancelledActions', v_cancelled, 'closedVotes', v_closed
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'activated', v_activated,
    'completed', v_completed,
    'finalizedOutcomes', v_finalized,
    'closedVotes', v_votes_closed
  );
end;
$$;

revoke all on function public.season_plan_signature(jsonb) from public, anon, authenticated;
revoke all on function public.season_schedule_signature(uuid) from public, anon, authenticated;
revoke all on function public.validate_season_plan(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.insert_season_schedule(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.configure_season_v2(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.replan_season(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.reschedule_season(integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.reconcile_season_state(timestamptz, integer, numeric, real) from public, anon, authenticated;
grant execute on function public.configure_season_v2(jsonb, timestamptz) to service_role;
grant execute on function public.replan_season(jsonb, timestamptz) to service_role;
grant execute on function public.reschedule_season(integer, timestamptz, timestamptz) to service_role;
grant execute on function public.reconcile_season_state(timestamptz, integer, numeric, real) to service_role;
