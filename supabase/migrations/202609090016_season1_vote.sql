-- Season 1 vote 2.0 (P9 / 01 §3, 04 §4).
-- Candidates come from the pack registry, which lives in TypeScript. The route
-- supplies them; every write still happens here, under the journey row lock.

alter table public.votes
  add column kind text not null default 'destination'
    check (kind in ('destination', 'name'));

alter table public.vote_options
  add column pack_id text;

alter table public.journeys
  add column traveler_name text check (traveler_name is null or char_length(traveler_name) <= 40);

-- Closes the vote that has reached its close time and names the winner.
-- Ties break by fewest previous visits for that pack, then alphabetically, so
-- the same ballot always resolves the same way.
create or replace function public.close_and_pick_vote_winner(p_real_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_journey public.journeys%rowtype;
  v_vote public.votes%rowtype;
  v_winner record;
  v_total bigint;
begin
  select * into v_journey
  from public.journeys j
  where j.phase2_enabled
    and j.status in ('preview', 'active')
  order by j.starts_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('state', 'inactive');
  end if;

  select v.* into v_vote
  from public.votes v
  join public.country_days cd on cd.id = v.country_day_id
  where cd.journey_id = v_journey.id
    and v.status = 'open'
    and v.closes_at <= p_real_now
  order by v.closes_at
  limit 1;

  if not found then
    return jsonb_build_object('state', 'no_closing_vote', 'journeyId', v_journey.id);
  end if;

  select count(*) into v_total from public.ballots b where b.vote_id = v_vote.id;

  select
    vo.id,
    vo.label,
    vo.pack_id,
    count(b.id) as ballots,
    coalesce((
      select count(*) from public.country_days cd2
      where cd2.journey_id = v_journey.id
        and cd2.scene_pack_id = vo.pack_id
    ), 0) as visits
  into v_winner
  from public.vote_options vo
  left join public.ballots b on b.option_id = vo.id
  where vo.vote_id = v_vote.id
  group by vo.id, vo.label, vo.pack_id, vo.display_order
  order by count(b.id) desc, visits asc, coalesce(vo.pack_id, vo.label) asc
  limit 1;

  if not found then
    return jsonb_build_object('state', 'no_options', 'voteId', v_vote.id);
  end if;

  update public.votes v
  set status = 'closed',
      result_option_id = v_winner.id,
      result_published_at = p_real_now,
      updated_at = p_real_now
  where v.id = v_vote.id;

  -- The name vote is the one ballot whose result is a word, not a place.
  if v_vote.kind = 'name' then
    update public.journeys j
    set traveler_name = v_winner.label, updated_at = p_real_now
    where j.id = v_journey.id;
  end if;

  return jsonb_build_object(
    'state', 'closed',
    'journeyId', v_journey.id,
    'voteId', v_vote.id,
    'kind', v_vote.kind,
    'winnerOptionId', v_winner.id,
    'winnerPackId', v_winner.pack_id,
    'winnerLabel', v_winner.label,
    'winnerBallots', v_winner.ballots,
    'totalBallots', v_total
  );
end;
$$;

-- Creates tomorrow from the winning pack and opens tomorrow's ballot. Idempotent
-- on (journey_id, day_number): a repeated rollover changes nothing.
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
  v_day_id uuid;
  v_vote_id uuid;
  v_existing uuid;
  v_option jsonb;
  v_order integer := 0;
begin
  select * into v_journey
  from public.journeys j
  where j.phase2_enabled
    and j.status in ('preview', 'active')
  order by j.starts_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('state', 'inactive');
  end if;

  select cd.id into v_existing
  from public.country_days cd
  where cd.journey_id = v_journey.id
    and cd.day_number = (p_day ->> 'dayNumber')::integer;

  if v_existing is not null then
    return jsonb_build_object('state', 'exists', 'countryDayId', v_existing);
  end if;

  insert into public.country_days (
    journey_id, day_number, country_code, country_name, city_name, time_zone,
    starts_at, ends_at, scene_pack_id, status, story_summary
  ) values (
    v_journey.id,
    (p_day ->> 'dayNumber')::integer,
    p_day ->> 'countryCode',
    p_day ->> 'countryName',
    p_day ->> 'cityName',
    p_day ->> 'timeZone',
    (p_day ->> 'startsAt')::timestamptz,
    (p_day ->> 'endsAt')::timestamptz,
    p_day ->> 'scenePackId',
    'scheduled',
    p_day ->> 'storySummary'
  )
  returning id into v_day_id;

  if p_vote is null or p_vote = 'null'::jsonb then
    return jsonb_build_object('state', 'created', 'countryDayId', v_day_id, 'voteId', null);
  end if;

  insert into public.votes (
    country_day_id, question, opens_at, closes_at, result_publishes_at, status, kind
  ) values (
    v_day_id,
    p_vote ->> 'question',
    (p_vote ->> 'opensAt')::timestamptz,
    (p_vote ->> 'closesAt')::timestamptz,
    (p_vote ->> 'closesAt')::timestamptz,
    'open',
    coalesce(p_vote ->> 'kind', 'destination')
  )
  returning id into v_vote_id;

  for v_option in select * from jsonb_array_elements(p_vote -> 'options') loop
    insert into public.vote_options (vote_id, label, payload_json, display_order, pack_id)
    values (
      v_vote_id,
      v_option ->> 'label',
      coalesce(v_option -> 'payload', '{}'::jsonb),
      v_order,
      v_option ->> 'packId'
    );
    v_order := v_order + 1;
  end loop;

  return jsonb_build_object('state', 'created', 'countryDayId', v_day_id, 'voteId', v_vote_id);
end;
$$;

-- The traveler's name once the Day-1 vote has named him, for the bootstrap.
create or replace function public.read_traveler_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.traveler_name
  from public.journeys j
  where j.phase2_enabled
    and j.status in ('preview', 'active')
  order by j.starts_at desc
  limit 1;
$$;

create or replace function public.read_bootstrap_bundle_v8(
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
  v_vote_id uuid;
  v_vote_extra jsonb;
begin
  v_result := public.read_bootstrap_bundle_v7(
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
  v_bundle := jsonb_set(
    v_bundle,
    '{journey}',
    jsonb_build_object('travelerName', to_jsonb(public.read_traveler_name())),
    true
  );

  v_vote_id := nullif(v_bundle #>> '{vote,id}', '')::uuid;
  if v_vote_id is not null then
    -- The ballot's kind, its pack ids and the live tally travel with the vote.
    select jsonb_build_object(
      'kind', v.kind,
      'options', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', vo.id,
            'pack_id', vo.pack_id,
            'ballots', (select count(*) from public.ballots b where b.option_id = vo.id)
          )
          order by vo.display_order
        )
        from public.vote_options vo
        where vo.vote_id = v.id
      ), '[]'::jsonb)
    )
    into v_vote_extra
    from public.votes v
    where v.id = v_vote_id;

    v_bundle := jsonb_set(v_bundle, '{vote_meta}', coalesce(v_vote_extra, '{}'::jsonb), true);
  end if;

  return jsonb_build_object('allowed', true, 'bundle', v_bundle);
end;
$$;

revoke all on function public.close_and_pick_vote_winner(timestamptz)
  from public, anon, authenticated;
revoke all on function public.create_next_country_day(timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.read_traveler_name()
  from public, anon, authenticated;
revoke all on function public.read_bootstrap_bundle_v8(
  text, timestamptz, integer, numeric, integer, integer, real
) from public, anon, authenticated;

grant execute on function public.close_and_pick_vote_winner(timestamptz) to service_role;
grant execute on function public.create_next_country_day(timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.read_traveler_name() to service_role;
grant execute on function public.read_bootstrap_bundle_v8(
  text, timestamptz, integer, numeric, integer, integer, real
) to service_role;
