begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Seven days, a departure beat at each day's end and a Day-1 name ballot.
create function pg_temp.season_plan(p_slug text, p_number integer, p_starts timestamptz)
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

create function pg_temp.season_id(p_slug text)
returns uuid
language sql
as $$ select id from public.journeys where slug = p_slug $$;

create function pg_temp.submit(p_slug text, p_name text, p_now timestamptz)
returns jsonb
language sql
as $$
  select public.submit_season_sponsorship(
    pg_temp.season_id(p_slug), p_name, 'https://' || lower(p_name) || '.example.com/',
    'A short factual description of ' || p_name || '.', 'Casey Owner',
    'owner@' || lower(p_name) || '.example.com', 'private/' || lower(p_name) || '.webp',
    true, p_now, 24
  );
$$;

create function pg_temp.booking(p_name text)
returns public.season_sponsorships
language sql
as $$ select * from public.season_sponsorships where product_name = p_name $$;

select public.configure_season(pg_temp.season_plan('test-move-a', 971, '2035-03-01T16:00:00Z'), '2035-01-01T00:00:00Z');
select public.configure_season(pg_temp.season_plan('test-move-b', 972, '2035-03-15T16:00:00Z'), '2035-01-01T00:00:00Z');
select public.configure_season(pg_temp.season_plan('test-move-paid', 973, '2035-05-01T16:00:00Z'), '2035-01-01T00:00:00Z');
insert into public.season_sponsor_prices (season_number, price_cents)
values (971, 49900), (972, 49900), (973, 49900);

select has_function('public', 'reschedule_season', array['integer', 'timestamp with time zone', 'timestamp with time zone'], 'a season that has not started can be moved');
select is(has_function_privilege('anon', 'public.reschedule_season(integer,timestamptz,timestamptz)', 'EXECUTE'), false, 'anon cannot move a season');
select is(has_function_privilege('service_role', 'public.reschedule_season(integer,timestamptz,timestamptz)', 'EXECUTE'), true, 'the service role moves a season');

select throws_ok(
  $$select public.reschedule_season(971, '2035-03-02T15:00:00Z', '2035-02-01T12:00:00Z')$$,
  '22023', 'invalid season start', 'a moved season still starts at the 16:00 UTC boundary'
);
select throws_ok(
  $$select public.reschedule_season(979, '2035-03-02T16:00:00Z', '2035-02-01T12:00:00Z')$$,
  'P0002', 'season not found', 'only a configured season can be moved'
);
select throws_ok(
  $$select public.reschedule_season(971, '2035-01-20T16:00:00Z', '2035-02-01T12:00:00Z')$$,
  '22023', 'a season must be configured before it starts', 'a season is never moved into the past'
);
select throws_ok(
  $$select public.reschedule_season(971, '2035-03-10T16:00:00Z', '2035-02-01T12:00:00Z')$$,
  '23P01', 'season overlaps another season', 'a moved week cannot overlap the next season'
);
select is(
  public.reschedule_season(971, '2035-03-01T16:00:00Z', '2035-02-01T12:00:00Z') ->> 'state',
  'unchanged', 'the same start changes nothing'
);

select pg_temp.submit('test-move-a', 'Acme', '2035-02-01T10:00:00Z');
select public.review_season_sponsorship((pg_temp.booking('Acme')).id, 'approved', 'public/acme.webp', '2035-02-01T11:00:00Z', 24);

create temporary table moved as
select public.reschedule_season(971, '2035-03-02T16:00:00Z', '2035-02-01T12:00:00Z') as result;
select is((select result ->> 'state' from moved), 'moved', 'a draft season moves one day later');
select is((select (result ->> 'requestsQuotedOldDates')::integer from moved), 1, 'the move reports requests quoted for the old dates');
select is((select starts_at from public.journeys where slug = 'test-move-a'), '2035-03-02T16:00:00Z'::timestamptz, 'the season starts at the new time');
select is((select ends_at from public.journeys where slug = 'test-move-a'), '2035-03-09T16:00:00Z'::timestamptz, 'the season still lasts exactly seven days');
select is((select launch_at = starts_at from public.journeys where slug = 'test-move-a'), true, 'its launch moves with its start');
select is(
  (select count(*) from public.country_days cd join public.journeys j on j.id = cd.journey_id
   where j.slug = 'test-move-a'
     and cd.starts_at = j.starts_at + make_interval(hours => 24 * (cd.day_number - 1))
     and cd.ends_at = j.starts_at + make_interval(hours => 24 * cd.day_number)),
  7::bigint, 'all seven days move inside the new week, in order'
);
select is(
  (select count(*) from public.journey_runtime jr join public.country_days cd on cd.id = jr.country_day_id
   join public.journeys j on j.id = cd.journey_id
   where j.slug = 'test-move-a' and jr.last_accounted_at = cd.starts_at),
  7::bigint, 'each day accrues nothing before its new start'
);
select is(
  (select count(*) from public.story_events e join public.country_days cd on cd.id = e.country_day_id
   join public.journeys j on j.id = cd.journey_id
   where j.slug = 'test-move-a' and e.starts_at = cd.ends_at),
  7::bigint, 'each departure beat stays at its day''s end'
);
select is(
  (select v.opens_at = '2035-03-02T16:00:00Z'::timestamptz and v.closes_at = '2035-03-03T16:00:00Z'::timestamptz
   from public.votes v join public.country_days cd on cd.id = v.country_day_id
   join public.journeys j on j.id = cd.journey_id
   where j.slug = 'test-move-a'),
  true, 'the Day-1 name ballot opens and closes with the moved Day 1'
);
select throws_ok(
  $$select public.hold_season_sponsorship((pg_temp.booking('Acme')).public_id, 'fixture', true, 30, 30, 24, '2035-02-01T12:30:00Z')$$,
  '55000', 'season schedule changed', 'a request quoted for the old dates cannot pay for the new week'
);

select is(
  public.reschedule_season(971, '2035-02-27T16:00:00Z', '2035-02-01T12:00:00Z') ->> 'state',
  'moved', 'a draft season can also move earlier'
);
select is(
  (select cd.ends_at from public.country_days cd join public.journeys j on j.id = cd.journey_id
   where j.slug = 'test-move-a' and cd.day_number = 7),
  '2035-03-06T16:00:00Z'::timestamptz, 'moving earlier keeps Day 7 at the season end'
);
select is(
  (select count(*) from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'test-move-a'),
  7::bigint, 'moving never adds or loses a day'
);

select pg_temp.submit('test-move-paid', 'Paid', '2035-02-01T10:00:00Z');
select public.review_season_sponsorship((pg_temp.booking('Paid')).id, 'approved', 'public/paid.webp', '2035-02-01T11:00:00Z', 24);
select is(
  public.hold_season_sponsorship((pg_temp.booking('Paid')).public_id, 'fixture', true, 30, 30, 24, '2035-02-01T12:00:00Z') ->> 'state',
  'held', 'a sponsor starts checkout'
);
select throws_ok(
  $$select public.reschedule_season(973, '2035-05-02T16:00:00Z', '2035-02-01T12:05:00Z')$$,
  '55000', 'season has a sponsor payment', 'a season with a checkout in progress cannot move'
);

select throws_ok(
  $$select public.reschedule_season(972, '2035-04-10T16:00:00Z', '2035-03-15T17:00:00Z')$$,
  '55000', 'a season can only be moved before it starts', 'a season whose start has passed cannot move'
);
select public.reconcile_season_state('2035-03-15T17:00:00Z', 50, 1.8, 1);
select throws_ok(
  $$select public.reschedule_season(972, '2035-04-10T16:00:00Z', '2035-03-01T00:00:00Z')$$,
  '55000', 'a season can only be moved before it starts', 'an active season cannot move, whatever the clock says'
);

select * from finish();
rollback;
