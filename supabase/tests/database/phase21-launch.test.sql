begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_column('public', 'journeys', 'launch_at', 'journeys store the production launch boundary');
select has_column('public', 'journeys', 'rollover_utc_hour', 'journeys store their rollover hour');
select has_function('public', 'seed_season1_launch', array['jsonb','timestamp with time zone'], 'the atomic launch seed exists');
select has_function('public', 'switch_country_day_pack', array['uuid','text','text','timestamp with time zone'], 'the guarded pack rollback exists');
select has_function('public', 'record_presence_heartbeat_v11', array['uuid','text','text','text','boolean','timestamp with time zone','integer','numeric','real','integer','text'], 'the launch-guarded heartbeat exists');
select has_function('public', 'read_bootstrap_bundle_v13', array['text','timestamp with time zone','integer','numeric','integer','integer','real','numeric'], 'the launch bootstrap exists');
select is(has_function_privilege('anon', 'public.seed_season1_launch(jsonb,timestamptz)', 'EXECUTE'), false, 'anon cannot seed a season');
select is(has_function_privilege('service_role', 'public.seed_season1_launch(jsonb,timestamptz)', 'EXECUTE'), true, 'service role can seed a season');
select is(has_function_privilege('anon', 'public.switch_country_day_pack(uuid,text,text,timestamptz)', 'EXECUTE'), false, 'anon cannot switch a live pack');

create temporary table launch_seed as select public.seed_season1_launch(
  jsonb_build_object(
    'journey', jsonb_build_object(
      'slug', 'keep-him-walking-season-1', 'title', 'Keep Him Walking — Season 1',
      'launchAt', '2034-09-20T16:00:00Z', 'totalDays', 30,
      'seasonNumber', 1, 'rolloverUtcHour', 16
    ),
    'day', jsonb_build_object(
      'dayNumber', 1, 'countryCode', 'UZ', 'countryName', 'Uzbekistan',
      'cityName', 'Tashkent', 'timeZone', 'Asia/Tashkent',
      'startsAt', '2034-09-20T16:00:00Z', 'endsAt', '2034-09-21T16:00:00Z',
      'scenePackId', 'tashkent-v5', 'storySummary', 'The journey begins in Tashkent.',
      'postcardBackgroundUrl', '/postcards/tashkent/v4/background.webp'
    ),
    'events', jsonb_build_array(
      jsonb_build_object(
        'type', 'departure', 'startsAt', '2034-09-21T16:00:00Z',
        'durationSeconds', 60, 'payload', jsonb_build_object('travelerState', 'goodbye')
      )
    ),
    'vote', jsonb_build_object(
      'question', 'What should we call him?', 'kind', 'name',
      'opensAt', '2034-09-20T16:00:00Z', 'closesAt', '2034-09-21T16:00:00Z',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Milo', 'displayOrder', 0),
        jsonb_build_object('label', 'Nur', 'displayOrder', 1),
        jsonb_build_object('label', 'Sami', 'displayOrder', 2),
        jsonb_build_object('label', 'Bek', 'displayOrder', 3)
      )
    ),
    'founding', jsonb_build_object('days', 7, 'priceCents', 2900, 'currency', 'USD')
  ),
  '2034-09-10T12:00:00Z'
) as result;

select is((select result ->> 'state' from launch_seed), 'created', 'the first seed creates Season 1 atomically');
select is((select launch_at from public.journeys where slug = 'keep-him-walking-season-1'), '2034-09-20T16:00:00Z'::timestamptz, 'the launch instant is stored');
select is((select total_days from public.journeys where slug = 'keep-him-walking-season-1'), 30, 'Season 1 promises thirty days');
select is((select rollover_utc_hour::integer from public.journeys where slug = 'keep-him-walking-season-1'), 16, 'rollover is 16:00 UTC');
select is((select scene_pack_id from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'), 'tashkent-v5', 'Day 1 uses calibrated Tashkent v5');
select is((select kind from public.votes v join public.country_days cd on cd.id = v.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'), 'name', 'Day 1 opens the name vote');
select is((select count(*) from public.vote_options vo join public.votes v on v.id = vo.vote_id join public.country_days cd on cd.id = v.country_day_id join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'), 4::bigint, 'the name vote has four approved choices');
select is((select count(*) from public.sponsor_pricing sp join public.journeys j on j.id = sp.journey_id where j.slug = 'keep-him-walking-season-1'), 7::bigint, 'seven founding prices are seeded');
select is((select count(*) from public.sponsor_pricing sp join public.journeys j on j.id = sp.journey_id where j.slug = 'keep-him-walking-season-1' and sp.founding and sp.price_cents = 2900), 7::bigint, 'every first-week price is founding');
select is((select count(*) from public.sponsor_slots ss join public.journeys j on j.id = ss.journey_id where j.slug = 'keep-him-walking-season-1'), 7::bigint, 'seven empty sponsor slots are seeded');
select is((select count(*) from public.sponsor_slots ss join public.journeys j on j.id = ss.journey_id where j.slug = 'keep-him-walking-season-1' and ss.status = 'available' and ss.reserved_by is null), 7::bigint, 'all founding slots begin available and unreserved');
select is((select count(*) from public.sponsor_slots ss join public.journeys j on j.id = ss.journey_id where j.slug = 'keep-him-walking-season-1' and ss.country_day_id is not null), 1::bigint, 'only the known Day 1 slot is bound');
select is((select count(*) from public.sponsor_slots ss join public.journeys j on j.id = ss.journey_id where j.slug = 'keep-him-walking-season-1' and ss.country_day_id is null), 6::bigint, 'six future slots wait for vote-owned days');

select is(
  public.seed_season1_launch((
    select jsonb_build_object(
      'journey', jsonb_build_object('slug', 'keep-him-walking-season-1', 'title', 'Keep Him Walking — Season 1', 'launchAt', '2034-09-20T16:00:00Z', 'totalDays', 30, 'seasonNumber', 1, 'rolloverUtcHour', 16),
      'day', jsonb_build_object('dayNumber', 1, 'countryCode', 'UZ', 'countryName', 'Uzbekistan', 'cityName', 'Tashkent', 'timeZone', 'Asia/Tashkent', 'startsAt', '2034-09-20T16:00:00Z', 'endsAt', '2034-09-21T16:00:00Z', 'scenePackId', 'tashkent-v5', 'storySummary', 'The journey begins in Tashkent.', 'postcardBackgroundUrl', '/postcards/tashkent/v4/background.webp'),
      'events', '[]'::jsonb,
      'vote', jsonb_build_object('question', 'What should we call him?', 'kind', 'name', 'opensAt', '2034-09-20T16:00:00Z', 'closesAt', '2034-09-21T16:00:00Z', 'options', jsonb_build_array(jsonb_build_object('label', 'Milo', 'displayOrder', 0), jsonb_build_object('label', 'Nur', 'displayOrder', 1), jsonb_build_object('label', 'Sami', 'displayOrder', 2), jsonb_build_object('label', 'Bek', 'displayOrder', 3))),
      'founding', jsonb_build_object('days', 7, 'priceCents', 2900, 'currency', 'USD')
    )
  ), '2034-09-10T12:01:00Z') ->> 'state',
  'exists',
  'repeating the exact seed is idempotent'
);
select is((select count(*) from public.journeys where slug = 'keep-him-walking-season-1'), 1::bigint, 'an idempotent seed never duplicates the journey');
select is(
  public.switch_country_day_pack(
    (select cd.id from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'),
    'tashkent-v5', 'tashkent-v4', '2034-09-10T12:02:00Z'
  ),
  true,
  'the guarded rollback switches an expected pack'
);
select is((select scene_pack_id from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'), 'tashkent-v4', 'the rollback stores only the replacement pointer');
select throws_ok(
  $$select * from public.record_presence_heartbeat_v11(
    (select cd.id from public.country_days cd join public.journeys j on j.id = cd.journey_id where j.slug = 'keep-him-walking-season-1'),
    repeat('a', 64), repeat('b', 64), 'active', true, '2034-09-20T15:59:00Z', 50, 1.8, 5, 600, 'UZ'
  )$$,
  '55000', 'journey has not launched', 'Postgres refuses prelaunch presence advancement'
);
select is(has_function_privilege('anon', 'public.record_presence_heartbeat_v11(uuid,text,text,text,boolean,timestamptz,integer,numeric,real,integer,text)', 'EXECUTE'), false, 'anon cannot call the guarded heartbeat');
select is(has_function_privilege('service_role', 'public.read_bootstrap_bundle_v13(text,timestamptz,integer,numeric,integer,integer,real,numeric)', 'EXECUTE'), true, 'service role can read the launch bundle');
select is(
  (public.read_bootstrap_bundle_v13(repeat('c', 64), '2034-09-20T15:00:00Z', 50, 1.8, 100, 60, 5, 30) -> 'bundle')::text,
  'null',
  'the database bundle exposes no live day before launch'
);

select * from finish();
rollback;
