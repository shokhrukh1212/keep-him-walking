-- Prompt 2, part 1: seven-day seasons.
--
-- A season is a journey with a fixed end. Its id, ordinal (season_number), title,
-- starts_at, ends_at and status live on public.journeys, and its ordered day/city
-- mapping is seven country_days created together when the season is configured.
-- An open-ended journey keeps ends_at null and its vote-driven daily rollover, so
-- no existing journey changes.
--
-- The clocks stay separate. The season clock is wall-clock UTC: it moves a season
-- from draft to active to completed under the journey row lock. Watched seconds and
-- walking distance still accrue only inside the presence RPCs, so a week nobody
-- watches ends with zero distance rather than an invented one.

alter table public.journeys
  add column ends_at timestamptz;

alter table public.journeys
  add constraint journeys_season_window_check
  check (ends_at is null or ends_at > starts_at);

create index journeys_season_starts_idx
  on public.journeys (starts_at)
  where ends_at is not null;

-- A season can never gain an eighth day or a day outside its own week, whoever
-- tries to insert it: rollover, a script or a hand-written statement.
create or replace function public.enforce_season_day_bounds()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
begin
  select * into v_journey from public.journeys j where j.id = new.journey_id;
  if not found or v_journey.ends_at is null then
    return new;
  end if;
  if new.day_number > v_journey.total_days
    or new.starts_at < v_journey.starts_at
    or new.ends_at > v_journey.ends_at then
    raise exception 'season day is outside its season' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger country_days_season_bounds
before insert or update of journey_id, day_number, starts_at, ends_at on public.country_days
for each row execute function public.enforce_season_day_bounds();

-- Configures one future season atomically: the journey, its seven days, their
-- runtime rows, the departure beats and an optional Day-1 name ballot. The CLI
-- builds the plan from the reviewed pack registry; this validates the whole plan.
-- A same-data retry answers 'exists'; drift is refused.
create or replace function public.configure_season(
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
  v_title text := nullif(trim(p_plan #>> '{season,title}'), '');
  v_number integer := nullif(p_plan #>> '{season,seasonNumber}', '')::integer;
  v_starts_at timestamptz := nullif(p_plan #>> '{season,startsAt}', '')::timestamptz;
  v_ends_at timestamptz := nullif(p_plan #>> '{season,endsAt}', '')::timestamptz;
  v_days jsonb := p_plan -> 'days';
  v_vote jsonb := p_plan -> 'vote';
  v_existing public.journeys%rowtype;
  v_journey_id uuid;
  v_day jsonb;
  v_event jsonb;
  v_option jsonb;
  v_day_id uuid;
  v_first_day_id uuid;
  v_vote_id uuid;
  v_index integer := 0;
  v_traveler_name text;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or v_title is null or char_length(v_title) > 120
    or v_number is null or v_number < 1
    or v_starts_at is null or v_ends_at is null
    -- Hours, not days: day arithmetic follows the session time zone.
    or v_ends_at <> v_starts_at + interval '168 hours'
    or extract(hour from v_starts_at at time zone 'UTC') <> 16
    or extract(minute from v_starts_at at time zone 'UTC') <> 0
    or extract(second from v_starts_at at time zone 'UTC') <> 0
    or jsonb_typeof(v_days) is distinct from 'array' then
    raise exception 'invalid season plan' using errcode = '22023';
  end if;
  if jsonb_array_length(v_days) <> 7 then
    raise exception 'a season has exactly seven days' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('season:' || v_slug));
  select * into v_existing from public.journeys j where j.slug = v_slug for update;
  if found then
    if v_existing.ends_at is distinct from v_ends_at
      or v_existing.starts_at is distinct from v_starts_at
      or v_existing.season_number <> v_number
      or v_existing.total_days <> 7
      or (select count(*) from public.country_days cd where cd.journey_id = v_existing.id) <> 7
      or exists (
        select 1
        from jsonb_array_elements(v_days) with ordinality as planned(value, position)
        left join public.country_days cd
          on cd.journey_id = v_existing.id and cd.day_number = planned.position
        where cd.id is null
          or cd.scene_pack_id is distinct from trim(planned.value ->> 'scenePackId')
      ) then
      raise exception 'season already exists with different data' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'state', 'exists', 'journeyId', v_existing.id, 'status', v_existing.status,
      'startsAt', v_existing.starts_at, 'endsAt', v_existing.ends_at
    );
  end if;

  -- The start is an explicit future instant, never inferred from a rehearsal.
  if v_starts_at <= p_now then
    raise exception 'a season must be configured before it starts' using errcode = '22023';
  end if;
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

  -- His name belongs to him rather than to one week. Rehearsal journeys are
  -- open-ended, so a name chosen there is never carried into a real season.
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
    v_slug, v_title, v_starts_at, v_starts_at, v_ends_at, 7, v_number,
    16, 'draft', true, 1, v_traveler_name, p_now, p_now
  ) returning id into v_journey_id;

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

    insert into public.country_days (
      journey_id, day_number, country_code, country_name, city_name, time_zone,
      starts_at, ends_at, scene_pack_id, status, story_summary,
      postcard_background_url, arrival_mode, created_at, updated_at
    ) values (
      v_journey_id, v_index, v_day ->> 'countryCode', trim(v_day ->> 'countryName'),
      trim(v_day ->> 'cityName'), trim(v_day ->> 'timeZone'),
      v_starts_at + make_interval(hours => 24 * (v_index - 1)),
      v_starts_at + make_interval(hours => 24 * v_index),
      trim(v_day ->> 'scenePackId'), 'scheduled', nullif(trim(v_day ->> 'storySummary'), ''),
      nullif(trim(v_day ->> 'postcardBackgroundUrl'), ''),
      coalesce(v_day ->> 'arrivalMode', 'walk'), p_now, p_now
    ) returning id into v_day_id;
    if v_index = 1 then
      v_first_day_id := v_day_id;
    end if;

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

  if v_vote is not null and jsonb_typeof(v_vote) = 'object' then
    if v_vote ->> 'kind' is distinct from 'name'
      or nullif(trim(v_vote ->> 'question'), '') is null
      or jsonb_typeof(v_vote -> 'options') is distinct from 'array' then
      raise exception 'invalid season ballot' using errcode = '22023';
    end if;
    if jsonb_array_length(v_vote -> 'options') not between 2 and 6 then
      raise exception 'invalid season ballot' using errcode = '22023';
    end if;
    insert into public.votes (
      country_day_id, question, kind, opens_at, closes_at,
      result_publishes_at, status, created_at, updated_at
    ) values (
      v_first_day_id, trim(v_vote ->> 'question'), 'name', v_starts_at,
      v_starts_at + interval '24 hours', v_starts_at + interval '24 hours', 'open', p_now, p_now
    ) returning id into v_vote_id;
    for v_option in select value from jsonb_array_elements(v_vote -> 'options') loop
      insert into public.vote_options (vote_id, label, display_order, payload_json, pack_id)
      values (
        v_vote_id, trim(v_option ->> 'label'), (v_option ->> 'displayOrder')::integer,
        '{}'::jsonb, null
      );
    end loop;
  end if;

  return jsonb_build_object(
    'state', 'created', 'journeyId', v_journey_id, 'status', 'draft',
    'startsAt', v_starts_at, 'endsAt', v_ends_at, 'days', v_index, 'voteId', v_vote_id
  );
end;
$$;

-- The daily rollover writes tomorrow for an open-ended journey only. A season's
-- days already exist, so the newest journey being a season answers 'season'
-- instead of creating Day 8. The trigger above refuses it regardless. The body is
-- otherwise the 202609100030 version.
create or replace function public.create_next_country_day(
  p_real_now timestamptz,
  p_day jsonb,
  p_vote jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_ticket public.tickets%rowtype;
  v_day_number integer := (p_day ->> 'dayNumber')::integer;
  v_day_id uuid;
  v_vote_id uuid;
  v_existing uuid;
  v_option jsonb;
  v_order integer := 0;
  v_write_vote jsonb := p_vote;
begin
  select * into v_journey from public.journeys j
  where j.phase2_enabled and j.status in ('preview', 'active')
  order by j.starts_at desc limit 1 for update;
  if not found then return jsonb_build_object('state', 'inactive'); end if;
  if v_journey.ends_at is not null then
    return jsonb_build_object('state', 'season', 'journeyId', v_journey.id);
  end if;
  select cd.id into v_existing from public.country_days cd
    where cd.journey_id = v_journey.id and cd.day_number = v_day_number;
  if v_existing is not null then return jsonb_build_object('state', 'exists', 'countryDayId', v_existing); end if;

  select * into v_ticket from public.tickets t
    where t.journey_id = v_journey.id and t.target_day_number = v_day_number and t.status = 'approved'
    for update;
  if found then
    p_day := p_day || jsonb_build_object(
      'countryCode', trim(v_ticket.country_code), 'countryName', v_ticket.country_name,
      'cityName', v_ticket.city_name, 'timeZone', v_ticket.time_zone,
      'scenePackId', v_ticket.pack_id, 'storySummary', 'Ticket destination',
      'arrivalMode', 'flight', 'ticketId', v_ticket.id
    );
  end if;
  if exists (select 1 from public.tickets t where t.journey_id = v_journey.id
    and t.target_day_number = v_day_number + 1 and t.status = 'approved') then
    v_write_vote := null;
  end if;

  insert into public.country_days (
    journey_id, day_number, country_code, country_name, city_name, time_zone,
    starts_at, ends_at, scene_pack_id, status, story_summary, arrival_mode, ticket_id,
    created_at, updated_at
  ) values (
    v_journey.id, v_day_number, p_day ->> 'countryCode', p_day ->> 'countryName',
    p_day ->> 'cityName', p_day ->> 'timeZone', (p_day ->> 'startsAt')::timestamptz,
    (p_day ->> 'endsAt')::timestamptz, p_day ->> 'scenePackId', 'scheduled',
    p_day ->> 'storySummary', coalesce(p_day ->> 'arrivalMode', 'walk'),
    nullif(p_day ->> 'ticketId', '')::uuid, p_real_now, p_real_now
  ) returning id into v_day_id;
  if v_write_vote is null or v_write_vote = 'null'::jsonb then
    return jsonb_build_object('state', 'created', 'countryDayId', v_day_id,
      'voteId', null, 'ticketId', v_ticket.id);
  end if;
  insert into public.votes (country_day_id, question, opens_at, closes_at,
    result_publishes_at, status, kind, created_at, updated_at)
  values (v_day_id, v_write_vote ->> 'question', (v_write_vote ->> 'opensAt')::timestamptz,
    (v_write_vote ->> 'closesAt')::timestamptz, (v_write_vote ->> 'closesAt')::timestamptz,
    'open', coalesce(v_write_vote ->> 'kind', 'destination'), p_real_now, p_real_now)
  returning id into v_vote_id;
  for v_option in select value from jsonb_array_elements(v_write_vote -> 'options') loop
    insert into public.vote_options (vote_id, label, payload_json, display_order, pack_id)
    values (v_vote_id, v_option ->> 'label', coalesce(v_option -> 'payload', '{}'::jsonb),
      v_order, v_option ->> 'packId');
    v_order := v_order + 1;
  end loop;
  return jsonb_build_object('state', 'created', 'countryDayId', v_day_id,
    'voteId', v_vote_id, 'ticketId', v_ticket.id);
end;
$$;

-- Moves every season whose start has passed to the state its timestamps name, in
-- start order, under each journey's row lock. It is state-based rather than
-- invocation-based, so a duplicate call changes nothing and a late call (after a
-- missed scheduler run, or days later) catches up in one pass: activate at
-- starts_at, finalize each ended day, and settle the season at ends_at. It never
-- creates a day or a journey, so a season with no configured successor simply
-- stays completed.
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
  v_cancelled integer;
  v_closed integer;
begin
  for v_season in
    select j.id, j.status, j.season_number, j.ends_at
    from public.journeys j
    where j.ends_at is not null
      and j.phase2_enabled
      and j.status in ('draft', 'preview', 'active')
      and j.starts_at <= p_real_now
    order by j.starts_at
    for update
  loop
    if v_season.status = 'draft' then
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

      -- A ballot still open at the end closes with its winner, exactly as the
      -- daily close does. Its result stays in this season's scope.
      v_closed := 0;
      for v_vote in
        select v.id, v.kind
        from public.votes v
        join public.country_days cd on cd.id = v.country_day_id
        where cd.journey_id = v_season.id and v.status = 'open'
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
    'finalizedOutcomes', v_finalized
  );
end;
$$;

revoke all on function public.enforce_season_day_bounds() from public, anon, authenticated;
revoke all on function public.configure_season(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.create_next_country_day(timestamptz, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_season_state(timestamptz, integer, numeric, real) from public, anon, authenticated;
grant execute on function public.configure_season(jsonb, timestamptz) to service_role;
grant execute on function public.create_next_country_day(timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.reconcile_season_state(timestamptz, integer, numeric, real) to service_role;
