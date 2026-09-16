begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Fourteen days, two per city, a name vote that opens the day before and a poll on
-- Days 8-12 closing at 15:00 UTC (20:00 in Tashkent).
create function pg_temp.v2_plan(p_slug text, p_number integer, p_starts timestamptz)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'season', jsonb_build_object(
      'slug', p_slug, 'title', 'The Anniversary Journey', 'seasonNumber', p_number,
      'startsAt', p_starts, 'endsAt', p_starts + interval '336 hours', 'totalDays', 14
    ),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'dayNumber', n, 'countryCode', 'FR', 'countryName', 'France',
        'cityName', 'City ' || ((n + 1) / 2), 'timeZone', 'Europe/Paris',
        'scenePackId', 'pack-' || ((n + 1) / 2) || '-v1',
        'arrivalMode', case when n % 2 = 1 and n > 1 then 'train' else 'walk' end,
        'events', case when n % 2 = 0 then jsonb_build_array(jsonb_build_object(
          'type', 'departure', 'startsAt', p_starts + make_interval(hours => 24 * n),
          'durationSeconds', 60, 'payload', '{}'::jsonb
        )) else '[]'::jsonb end
      ) order by n)
      from generate_series(1, 14) as n
    ),
    'votes', jsonb_build_array(
      jsonb_build_object(
        'kind', 'name', 'question', 'What should we call him?',
        'opensAt', p_starts - interval '24 hours', 'closesAt', p_starts,
        'options', jsonb_build_array(
          jsonb_build_object('label', 'Alex', 'displayOrder', 0),
          jsonb_build_object('label', 'Sam', 'displayOrder', 1)
        )
      ),
      jsonb_build_object(
        'kind', 'anniversary', 'question', 'Choose the anniversary setting',
        'opensAt', p_starts + interval '168 hours', 'closesAt', p_starts + interval '284 hours',
        'options', jsonb_build_array(
          jsonb_build_object('label', 'A park', 'displayOrder', 0),
          jsonb_build_object('label', 'A café', 'displayOrder', 1),
          jsonb_build_object('label', 'A scenic spot', 'displayOrder', 2)
        )
      )
    )
  );
$$;

-- The 0040 week this launch replaced: seven 16:00 UTC days and a Day-1 name ballot.
create function pg_temp.week_plan(p_slug text, p_number integer, p_starts timestamptz)
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
        'dayNumber', n, 'countryCode', 'FR', 'countryName', 'France', 'cityName', 'City ' || n,
        'timeZone', 'Europe/Paris', 'scenePackId', 'pack-' || n || '-v1',
        'events', jsonb_build_array(jsonb_build_object(
          'type', 'departure', 'startsAt', p_starts + make_interval(hours => 24 * n),
          'durationSeconds', 60, 'payload', '{}'::jsonb
        ))
      ) order by n)
      from generate_series(1, 7) as n
    ),
    'vote', jsonb_build_object(
      'kind', 'name', 'question', 'What should he be called?',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Alex', 'displayOrder', 0),
        jsonb_build_object('label', 'Sam', 'displayOrder', 1)
      )
    )
  );
$$;

create function pg_temp.season_vote(p_slug text, p_kind text)
returns public.votes
language sql
as $$
  select v.* from public.votes v
  join public.country_days cd on cd.id = v.country_day_id
  join public.journeys j on j.id = cd.journey_id
  where j.slug = p_slug and v.kind = p_kind
$$;

create function pg_temp.option_id(p_slug text, p_kind text, p_label text)
returns uuid
language sql
as $$
  select vo.id from public.vote_options vo
  where vo.vote_id = (pg_temp.season_vote(p_slug, p_kind)).id and vo.label = p_label
$$;

create function pg_temp.day_status(p_slug text, p_day integer)
returns text
language sql
as $$
  select cd.status from public.country_days cd
  join public.journeys j on j.id = cd.journey_id
  where j.slug = p_slug and cd.day_number = p_day
$$;

select has_function('public', 'configure_season_v2', array['jsonb', 'timestamp with time zone'], 'a season of any length is configured atomically');
select has_function('public', 'replan_season', array['jsonb', 'timestamp with time zone'], 'a draft season can be replanned');
select is(has_function_privilege('anon', 'public.replan_season(jsonb,timestamptz)', 'EXECUTE'), false, 'anon cannot replan a season');
select is(has_function_privilege('service_role', 'public.configure_season_v2(jsonb,timestamptz)', 'EXECUTE'), true, 'the service role configures seasons');

select throws_ok(
  $$select public.configure_season_v2(pg_temp.v2_plan('test-anniv-half', 980, '2036-01-10T19:30:00Z'), '2036-01-01T00:00:00Z')$$,
  '22023', 'invalid season plan', 'a season starts on a whole UTC hour'
);
select throws_ok(
  $$select public.configure_season_v2(jsonb_set(pg_temp.v2_plan('test-anniv-long', 980, '2036-01-10T19:00:00Z'), '{season,endsAt}', to_jsonb('2036-01-25T19:00:00Z'::text)), '2036-01-01T00:00:00Z')$$,
  '22023', 'invalid season plan', 'a season ends exactly its number of days after it starts'
);
select throws_ok(
  $$select public.configure_season_v2(jsonb_set(pg_temp.v2_plan('test-anniv-early', 980, '2036-01-10T19:00:00Z'), '{votes,1,opensAt}', to_jsonb('2036-01-09T19:00:00Z'::text)), '2036-01-01T00:00:00Z')$$,
  '22023', 'invalid season ballot', 'the anniversary poll opens only during travel'
);

select is(
  public.configure_season_v2(pg_temp.v2_plan('test-anniv-a', 980, '2036-01-10T19:00:00Z'), '2036-01-01T00:00:00Z') ->> 'state',
  'created', 'a fourteen-day season is configured'
);
select is((select rollover_utc_hour::integer from public.journeys where slug = 'test-anniv-a'), 19, 'its days turn over at Tashkent midnight, 19:00 UTC');
select is(
  (select count(*) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-a'),
  14::bigint, 'it has fourteen days'
);
select is(
  (select cd.ends_at = j.ends_at from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-a' and cd.day_number = 14),
  true, 'Day 14 ends when the season ends'
);
select is(
  public.configure_season_v2(pg_temp.v2_plan('test-anniv-a', 980, '2036-01-10T19:00:00Z'), '2036-01-02T00:00:00Z') ->> 'state',
  'exists', 'a same-data retry changes nothing'
);
select is(
  (select cd.day_number::integer from public.country_days cd where cd.id = (pg_temp.season_vote('test-anniv-a', 'name')).country_day_id),
  1, 'the name vote belongs to Day 1 even though it opens the day before'
);
select is(
  (select cd.day_number::integer from public.country_days cd where cd.id = (pg_temp.season_vote('test-anniv-a', 'anniversary')).country_day_id),
  8, 'the anniversary poll belongs to the day it opens'
);

select throws_ok(
  $$select public.reschedule_season(980, '2036-01-11T19:30:00Z', '2036-01-02T00:00:00Z')$$,
  '22023', 'invalid season start', 'a moved season still starts on a whole hour'
);
select is(
  public.reschedule_season(980, '2036-01-11T19:00:00Z', '2036-01-02T00:00:00Z') ->> 'state',
  'moved', 'a season can move to a 19:00 UTC start'
);

-- The week configured before this launch, replanned into fourteen days.
select public.configure_season(pg_temp.week_plan('test-anniv-b', 981, '2036-03-01T16:00:00Z'), '2036-01-01T00:00:00Z');
select is(
  public.replan_season(pg_temp.v2_plan('test-anniv-b', 981, '2036-02-28T19:00:00Z'), '2036-02-01T00:00:00Z') ->> 'state',
  'replanned', 'a draft week becomes fourteen days'
);
select is(
  (select string_agg(cd.scene_pack_id, ',' order by cd.day_number) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-b'),
  'pack-1-v1,pack-1-v1,pack-2-v1,pack-2-v1,pack-3-v1,pack-3-v1,pack-4-v1,pack-4-v1,pack-5-v1,pack-5-v1,pack-6-v1,pack-6-v1,pack-7-v1,pack-7-v1',
  'the same cities stay in order, two days each'
);
select is(
  (select (starts_at, launch_at, ends_at, total_days::integer, rollover_utc_hour::integer)::text from public.journeys where slug = 'test-anniv-b'),
  (select ('2036-02-28T19:00:00Z'::timestamptz, '2036-02-28T19:00:00Z'::timestamptz, '2036-03-13T19:00:00Z'::timestamptz, 14, 19)::text),
  'the journey carries the new window, length and turnover hour'
);
select is(
  (select count(*) from public.votes v join public.country_days cd on cd.id = v.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-b'),
  2::bigint, 'the old unopened ballot is replaced by the planned name vote and poll'
);
select is(
  public.replan_season(pg_temp.v2_plan('test-anniv-b', 981, '2036-02-28T19:00:00Z'), '2036-02-02T00:00:00Z') ->> 'state',
  'unchanged', 'replanning the same plan changes nothing'
);
select throws_ok(
  $$select public.replan_season(pg_temp.v2_plan('test-anniv-b', 981, '2036-01-15T19:00:00Z'), '2036-01-02T00:00:00Z')$$,
  '23P01', 'season overlaps another season', 'a replan cannot overlap another season'
);

select is(
  (select out_accepted from public.submit_phase1_ballot(
    (pg_temp.season_vote('test-anniv-b', 'name')).id, pg_temp.option_id('test-anniv-b', 'name', 'Alex'), repeat('e', 64), '2036-02-28T10:00:00Z')),
  true, 'the name vote accepts a ballot before launch'
);
select is(
  (select out_option_id from public.submit_phase1_ballot(
    (pg_temp.season_vote('test-anniv-b', 'name')).id, pg_temp.option_id('test-anniv-b', 'name', 'Sam'), repeat('e', 64), '2036-02-28T11:00:00Z')),
  pg_temp.option_id('test-anniv-b', 'name', 'Alex'), 'a second, different choice keeps the first'
);
select throws_ok(
  format($$select * from public.submit_phase1_ballot(%L, %L, %L, '2036-02-28T19:00:00Z')$$,
    (pg_temp.season_vote('test-anniv-b', 'name')).id, pg_temp.option_id('test-anniv-b', 'name', 'Sam'), repeat('f', 64)),
  '22023', 'vote is not open', 'the name vote refuses a ballot at its closing instant'
);
select throws_ok(
  format($$select * from public.submit_phase1_ballot(%L, %L, %L, '2036-03-06T18:59:59Z')$$,
    (pg_temp.season_vote('test-anniv-b', 'anniversary')).id, pg_temp.option_id('test-anniv-b', 'anniversary', 'A park'), repeat('f', 64)),
  '22023', 'vote is not open', 'the poll refuses a ballot before it opens'
);
select throws_ok(
  $$select public.replan_season(pg_temp.v2_plan('test-anniv-b', 981, '2036-02-29T19:00:00Z'), '2036-02-28T12:00:00Z')$$,
  '55000', 'season already has activity', 'a season somebody has voted in cannot be replanned'
);

-- A sponsor checkout in progress also stops a replan (sponsorships are quoted for 0040 weeks).
select public.configure_season(pg_temp.week_plan('test-anniv-paid', 982, '2036-05-01T16:00:00Z'), '2036-01-01T00:00:00Z');
insert into public.season_sponsor_prices (season_number, price_cents) values (982, 5000);
select public.submit_season_sponsorship(
  (select id from public.journeys where slug = 'test-anniv-paid'), 'Paid', 'https://paid.example.com/',
  'A short factual description of Paid.', 'Casey Owner', 'owner@paid.example.com', 'private/paid.webp',
  true, '2036-02-01T10:00:00Z', 24
);
select public.review_season_sponsorship((select id from public.season_sponsorships where product_name = 'Paid'), 'approved', 'public/paid.webp', '2036-02-01T11:00:00Z', 24);
select public.hold_season_sponsorship((select public_id from public.season_sponsorships where product_name = 'Paid'), 'fixture', true, 30, 30, 24, '2036-02-01T12:00:00Z');
select throws_ok(
  $$select public.replan_season(pg_temp.v2_plan('test-anniv-paid', 982, '2036-05-02T19:00:00Z'), '2036-02-01T12:05:00Z')$$,
  '55000', 'season has a sponsor payment', 'a season with a checkout in progress cannot be replanned'
);

-- The calendar runs on wall-clock time whether or not anyone watches.
select public.reconcile_season_state('2036-02-28T18:59:59Z', 50, 1.8, 1);
select is((select status from public.journeys where slug = 'test-anniv-b'), 'draft', 'nothing starts a second early');
select is((pg_temp.season_vote('test-anniv-b', 'name')).status, 'open', 'the name vote is open until launch');

select public.reconcile_season_state('2036-02-28T19:00:00Z', 50, 1.8, 1);
select is((select status from public.journeys where slug = 'test-anniv-b'), 'active', 'the season starts at Tashkent midnight');
select is(pg_temp.day_status('test-anniv-b', 1), 'live', 'Day 1 is live');
select is((pg_temp.season_vote('test-anniv-b', 'name')).status, 'closed', 'the name vote closes at launch');
select is((select traveler_name from public.journeys where slug = 'test-anniv-b'), 'Alex', 'launch names him from the ballot');
select throws_ok(
  $$select public.replan_season(pg_temp.v2_plan('test-anniv-b', 981, '2036-03-28T19:00:00Z'), '2036-02-28T19:00:01Z')$$,
  '55000', 'a season can only be replanned before it starts', 'a started season cannot be replanned'
);

select public.reconcile_season_state('2036-03-11T14:59:59Z', 50, 1.8, 1);
select is((pg_temp.season_vote('test-anniv-b', 'anniversary')).status, 'open', 'the poll is open until 20:00 in Tashkent');
select public.reconcile_season_state('2036-03-11T15:00:00Z', 50, 1.8, 1);
select is((pg_temp.season_vote('test-anniv-b', 'anniversary')).status, 'closed', 'the poll closes at its own time, not at the season end');
select is((select traveler_name from public.journeys where slug = 'test-anniv-b'), 'Alex', 'the poll result never renames him');

select public.reconcile_season_state('2036-03-13T18:59:59Z', 50, 1.8, 1);
select is(pg_temp.day_status('test-anniv-b', 14), 'live', 'Day 14 is live in its last second');
select is(pg_temp.day_status('test-anniv-b', 13), 'completed', 'Day 13 is over');
select is((select status from public.journeys where slug = 'test-anniv-b'), 'active', 'the season is still travelling');

select public.reconcile_season_state('2036-03-13T19:00:00Z', 50, 1.8, 1);
select is((select status from public.journeys where slug = 'test-anniv-b'), 'completed', 'the season completes at Tashkent midnight on the anniversary');
select is(
  (select count(*) from public.day_outcomes o join public.country_days cd on cd.id = o.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-b'),
  14::bigint, 'every day has an outcome'
);
select is(
  (select count(*) from public.day_outcomes o join public.country_days cd on cd.id = o.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'test-anniv-b' and o.distance_metres > 0),
  0::bigint, 'days nobody watched advance without inventing distance'
);
select is(
  (select (r ->> 'finalizedOutcomes')::integer + (r ->> 'closedVotes')::integer
   from (select public.reconcile_season_state('2036-03-13T19:01:00Z', 50, 1.8, 1) as r) as retry),
  0, 'a retried reconcile changes nothing'
);

select * from finish();
rollback;
