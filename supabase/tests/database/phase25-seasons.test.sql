begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Seven days, one pack per day, a departure beat at each day's end.
create function pg_temp.season_plan(
  p_slug text,
  p_number integer,
  p_starts timestamptz,
  p_day3_pack text default 'pack-3-v1',
  p_days integer default 7
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'season', jsonb_build_object(
      'slug', p_slug, 'title', 'Season ' || p_number, 'seasonNumber', p_number,
      'startsAt', p_starts, 'endsAt', p_starts + interval '168 hours'
    ),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'dayNumber', n, 'countryCode', 'FR', 'countryName', 'France',
        'cityName', 'City ' || n, 'timeZone', 'Europe/Paris',
        'scenePackId', case when n = 3 then p_day3_pack else 'pack-' || n || '-v1' end,
        'arrivalMode', case when n = 1 then 'walk' else 'train' end,
        'events', jsonb_build_array(jsonb_build_object(
          'type', 'departure', 'startsAt', p_starts + make_interval(hours => 24 * n),
          'durationSeconds', 60, 'payload', '{}'::jsonb
        ))
      ) order by n)
      from generate_series(1, p_days) as n
    )
  );
$$;

create function pg_temp.season_result_count(p_result jsonb, p_field text, p_slug text)
returns bigint
language sql
as $$
  select count(*)
  from jsonb_array_elements(p_result -> p_field) as entry
  join public.journeys j on j.id::text = (entry ->> 'journeyId')
  where j.slug = p_slug
$$;

select has_column('public', 'journeys', 'ends_at', 'a season stores its authoritative end');
select has_function('public', 'configure_season', array['jsonb', 'timestamp with time zone'], 'seasons are configured atomically');
select has_function('public', 'reconcile_season_state', array['timestamp with time zone', 'integer', 'numeric', 'real'], 'the season clock reconciles');
select is(has_function_privilege('anon', 'public.configure_season(jsonb,timestamptz)', 'EXECUTE'), false, 'anon cannot configure a season');
select is(has_function_privilege('service_role', 'public.reconcile_season_state(timestamptz,integer,numeric,real)', 'EXECUTE'), true, 'service role reconciles seasons');

select throws_ok(
  $$select public.configure_season(pg_temp.season_plan('test-season-hour', 990, '2033-06-01T15:00:00Z'), '2033-05-20T12:00:00Z')$$,
  '22023', 'invalid season plan', 'a season starts exactly at the 16:00 UTC boundary'
);
select throws_ok(
  $$select public.configure_season(jsonb_set(pg_temp.season_plan('test-season-long', 990, '2033-06-01T16:00:00Z'), '{season,endsAt}', to_jsonb('2033-06-09T16:00:00Z'::text)), '2033-05-20T12:00:00Z')$$,
  '22023', 'invalid season plan', 'a season ends exactly seven days after it starts'
);
select throws_ok(
  $$select public.configure_season(pg_temp.season_plan('test-season-short', 990, '2033-06-01T16:00:00Z', 'pack-3-v1', 6), '2033-05-20T12:00:00Z')$$,
  '22023', 'a season has exactly seven days', 'a season has seven days, not six'
);
select throws_ok(
  $$select public.configure_season(pg_temp.season_plan('test-season-past', 990, '2033-06-01T16:00:00Z'), '2033-06-01T16:00:00Z')$$,
  '22023', 'a season must be configured before it starts', 'a start is never back-dated from a rehearsal'
);

create temporary table s1_created as
select public.configure_season(
  pg_temp.season_plan('test-season-one', 901, '2033-06-01T16:00:00Z')
    || jsonb_build_object('vote', jsonb_build_object(
      'kind', 'name', 'question', 'What should we call him?',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Milo', 'displayOrder', 0),
        jsonb_build_object('label', 'Nur', 'displayOrder', 1)
      )
    )),
  '2033-05-20T12:00:00Z'
) as result;
create temporary table s2_created as
select public.configure_season(
  pg_temp.season_plan('test-season-two', 902, '2033-06-08T16:00:00Z'),
  '2033-05-21T12:00:00Z'
) as result;

select is((select result ->> 'state' from s1_created), 'created', 'the first season is created');
select is((select result ->> 'state' from s2_created), 'created', 'an adjacent next season can be configured');
select is((select status from public.journeys where slug = 'test-season-one'), 'draft', 'a configured season waits as a draft');
select is((select ends_at - starts_at from public.journeys where slug = 'test-season-one'), interval '168 hours', 'ends_at is exactly seven days later');
select is(
  (select count(*) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  7::bigint, 'the ordered day/city mapping has seven days'
);
select is(
  (select max(cd.ends_at) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  '2033-06-08T16:00:00Z'::timestamptz, 'Day 7 ends exactly at the season boundary'
);
select is(
  (select count(*) from public.journey_runtime jr join public.country_days cd on cd.id = jr.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  7::bigint, 'every day has its runtime row before it starts'
);
select is(
  public.configure_season(pg_temp.season_plan('test-season-one', 901, '2033-06-01T16:00:00Z'), '2033-05-22T12:00:00Z') ->> 'state',
  'exists', 'repeating the same plan is idempotent'
);
select throws_ok(
  $$select public.configure_season(pg_temp.season_plan('test-season-one', 901, '2033-06-01T16:00:00Z', 'other-pack-v1'), '2033-05-22T12:00:00Z')$$,
  '23505', 'season already exists with different data', 'a changed itinerary for the same season is refused'
);
select throws_ok(
  $$select public.configure_season(pg_temp.season_plan('test-season-overlap', 903, '2033-06-05T16:00:00Z'), '2033-05-22T12:00:00Z')$$,
  '23P01', 'season overlaps another season', 'two seasons can never overlap'
);
select throws_ok(
  $$insert into public.country_days (journey_id, day_number, country_code, country_name, city_name, time_zone, starts_at, ends_at, scene_pack_id, status)
    select id, 8, 'FR', 'France', 'Extra', 'Europe/Paris', ends_at, ends_at + interval '24 hours', 'extra-v1', 'scheduled'
    from public.journeys where slug = 'test-season-one'$$,
  '22023', 'season day is outside its season', 'a seven-day season can never gain an eighth day'
);
select throws_ok(
  $$select * from public.record_presence_heartbeat_v12(
    (select cd.id from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one' and cd.day_number = 1),
    repeat('a', 64), repeat('b', 64), 'active', true, '2033-06-01T15:59:00Z', 50, 1.8, 1, 600, 'FR'
  )$$,
  '55000', 'journey has not launched', 'nobody can walk him before the season starts'
);

create temporary table before_start as
select public.reconcile_season_state('2033-06-01T15:59:59Z', 50, 1.8, 1) as result;
select is(pg_temp.season_result_count((select result from before_start), 'activated', 'test-season-one'), 0::bigint, 'nothing activates a second early');
select is((select status from public.journeys where slug = 'test-season-one'), 'draft', 'the season is still a draft before its start');

create temporary table at_start as
select public.reconcile_season_state('2033-06-01T16:00:30Z', 50, 1.8, 1) as result;
select is(pg_temp.season_result_count((select result from at_start), 'activated', 'test-season-one'), 1::bigint, 'the season activates at its start');
select is((select status from public.journeys where slug = 'test-season-one'), 'active', 'the season is active');
select is(
  (select cd.status from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one' and cd.day_number = 1),
  'live', 'Day 1 is live'
);
select is(
  public.create_next_country_day(
    '2033-06-02T16:00:00Z',
    jsonb_build_object('dayNumber', 8, 'countryCode', 'FR', 'countryName', 'France', 'cityName', 'Extra', 'timeZone', 'Europe/Paris', 'startsAt', '2033-06-08T16:00:00Z', 'endsAt', '2033-06-09T16:00:00Z', 'scenePackId', 'extra-v1'),
    null
  ) ->> 'state',
  'season', 'the daily rollover never adds a day to a season'
);

insert into public.ballots (vote_id, voter_hash, option_id)
select v.id, repeat('d', 64), vo.id
from public.votes v
join public.vote_options vo on vo.vote_id = v.id and vo.label = 'Nur'
join public.country_days cd on cd.id = v.country_day_id
join public.journeys j on j.id = cd.journey_id
where j.slug = 'test-season-one';

update public.journey_runtime jr set global_active_seconds = 200
from public.country_days cd join public.journeys j on j.id = cd.journey_id
where jr.country_day_id = cd.id and j.slug = 'test-season-one' and cd.day_number = 7;

insert into public.scheduled_actions (country_day_id, kind, at_active_second, end_active_second, source, occurrence_key)
select cd.id, 'photo', planned.at_second, planned.at_second + 5.2, 'system', planned.occurrence_key
from public.country_days cd
join public.journeys j on j.id = cd.journey_id
cross join (values (150, 'test:photo:early'), (300, 'test:photo:late')) as planned(at_second, occurrence_key)
where j.slug = 'test-season-one' and cd.day_number = 7;

create temporary table mid_season as
select public.reconcile_season_state('2033-06-04T10:00:00Z', 50, 1.8, 1) as result;
select is(((select result ->> 'finalizedOutcomes' from mid_season))::integer, 2, 'the two ended days are finalized');
select is(
  (select cd.status from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one' and cd.day_number = 3),
  'live', 'Day 3 of 7 is live mid-week'
);
select is(
  (public.reconcile_season_state('2033-06-04T10:00:00Z', 50, 1.8, 1) ->> 'finalizedOutcomes')::integer,
  0, 'a duplicate reconcile changes nothing'
);
select is((select status from public.journeys where slug = 'test-season-two'), 'draft', 'the next season waits for its own start');

create temporary table at_end as
select public.reconcile_season_state('2033-06-08T16:00:01Z', 50, 1.8, 1) as result;
select is(pg_temp.season_result_count((select result from at_end), 'completed', 'test-season-one'), 1::bigint, 'the season settles at its end');
select is((select status from public.journeys where slug = 'test-season-one'), 'completed', 'the season is completed');
select is(
  (select count(*) from public.day_outcomes o join public.country_days cd on cd.id = o.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  7::bigint, 'every day of the week has an immutable outcome'
);
select is(
  (select count(*) from public.day_outcomes o join public.country_days cd on cd.id = o.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one' and o.distance_metres > 0),
  0::bigint, 'elapsed season time never fabricates walking distance'
);
select is(
  (select cancelled_at is not null from public.scheduled_actions where occurrence_key = 'test:photo:late'),
  true, 'a stop planned after the final watched second is cancelled'
);
select is(
  (select cancelled_at is null from public.scheduled_actions where occurrence_key = 'test:photo:early'),
  true, 'a stop that already played is kept'
);
select is(
  (select v.status from public.votes v join public.country_days cd on cd.id = v.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  'closed', 'a ballot still open at the end is closed'
);
select is((select traveler_name from public.journeys where slug = 'test-season-one'), 'Nur', 'the name ballot applies only to its own scope');
select is(
  (select count(*) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-one'),
  7::bigint, 'settlement never creates an eighth day'
);
select is(pg_temp.season_result_count((select result from at_end), 'activated', 'test-season-two'), 1::bigint, 'the configured next season begins in the same pass');
select is((select status from public.journeys where slug = 'test-season-two'), 'active', 'the next season is active at its scheduled timestamp');
select is(
  (select cd.status from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-two' and cd.day_number = 1),
  'live', 'the next season opens on its own Day 1'
);

create temporary table missed as
select public.reconcile_season_state('2033-06-20T00:00:00Z', 50, 1.8, 1) as result;
select is(pg_temp.season_result_count((select result from missed), 'completed', 'test-season-two'), 1::bigint, 'a scheduler that missed a whole week settles it in one pass');
select is(
  (select count(*) from public.day_outcomes o join public.country_days cd on cd.id = o.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-season-two'),
  7::bigint, 'the missed week still finalizes all seven days'
);
select is(
  (select jsonb_array_length(result -> 'activated') + jsonb_array_length(result -> 'completed')
   from (select public.reconcile_season_state('2033-06-21T00:00:00Z', 50, 1.8, 1) as result) as later),
  0, 'with no next season configured, the completed state holds'
);
select is((select count(*) from public.journeys where slug like 'test-season-%'), 2::bigint, 'no empty season is ever generated');

select * from finish();
rollback;
