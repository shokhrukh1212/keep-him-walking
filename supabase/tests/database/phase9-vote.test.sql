begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000066', 'phase9-vote-test',
  'Phase 9 Vote Test', '2026-09-28T16:00:00Z', 30, 'preview',
  '2026-09-28T16:00:00Z', '2026-09-28T16:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000067',
  '00000000-0000-4000-8000-000000000066',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-28T16:00:00Z', '2026-09-29T16:00:00Z', 'tashkent-v4', 'live'
);

-- Schema contract -----------------------------------------------------------

select has_column('public', 'votes', 'kind', 'a ballot knows whether it names him or a place');
select has_column('public', 'vote_options', 'pack_id', 'a destination option points at a pack');
select has_column('public', 'journeys', 'traveler_name', 'the journey remembers his voted name');
select has_function(
  'public', 'close_and_pick_vote_winner',
  array['timestamp with time zone'],
  'the rollover can close a ballot and name its winner'
);
select has_function(
  'public', 'create_next_country_day',
  array['timestamp with time zone', 'jsonb', 'jsonb'],
  'the rollover can create tomorrow'
);
select is(
  has_function_privilege('anon', 'public.close_and_pick_vote_winner(timestamptz)', 'EXECUTE'),
  false,
  'anon cannot close a ballot'
);
select is(
  has_function_privilege('service_role', 'public.create_next_country_day(timestamptz,jsonb,jsonb)', 'EXECUTE'),
  true,
  'service_role creates tomorrow'
);
select is(
  (select kind from public.votes where false),
  null,
  'the kind column is queryable'
);

-- A destination ballot with a clear winner ----------------------------------

insert into public.votes (
  id, country_day_id, question, opens_at, closes_at, result_publishes_at, status, kind
) values (
  '20000000-0000-4000-8000-000000000068',
  '10000000-0000-4000-8000-000000000067',
  'Where should he walk tomorrow?',
  '2026-09-28T16:00:00Z', '2026-09-29T16:00:00Z', '2026-09-29T16:00:00Z',
  'open', 'destination'
);

insert into public.vote_options (id, vote_id, label, display_order, pack_id) values
  ('30000000-0000-4000-8000-000000000069', '20000000-0000-4000-8000-000000000068', 'Tajikistan', 0, 'dushanbe-v1'),
  ('30000000-0000-4000-8000-000000000070', '20000000-0000-4000-8000-000000000068', 'Kyrgyzstan', 1, 'bishkek-v1');

insert into public.ballots (vote_id, voter_hash, option_id) values
  ('20000000-0000-4000-8000-000000000068', repeat('a', 64), '30000000-0000-4000-8000-000000000070'),
  ('20000000-0000-4000-8000-000000000068', repeat('b', 64), '30000000-0000-4000-8000-000000000070'),
  ('20000000-0000-4000-8000-000000000068', repeat('c', 64), '30000000-0000-4000-8000-000000000069');

create temporary table destination_result as
select public.close_and_pick_vote_winner('2026-09-29T16:00:00Z') as payload;

select is(
  (select payload ->> 'winnerPackId' from destination_result),
  'bishkek-v1',
  'the most-voted pack wins'
);
select is(
  (select payload ->> 'state' from destination_result),
  'closed',
  'the ballot is closed by the rollover'
);
select is(
  (select status from public.votes where id = '20000000-0000-4000-8000-000000000068'),
  'closed',
  'the vote row records the closure'
);
select is(
  (select result_option_id from public.votes where id = '20000000-0000-4000-8000-000000000068'),
  '30000000-0000-4000-8000-000000000070'::uuid,
  'the published winner is stored'
);
select is(
  (select traveler_name from public.journeys where id = '00000000-0000-4000-8000-000000000066'),
  null,
  'a destination ballot never names him'
);

-- Tomorrow is created once and only once ------------------------------------

create temporary table created_day as
select public.create_next_country_day(
  '2026-09-29T16:00:00Z',
  jsonb_build_object(
    'dayNumber', 2, 'countryCode', 'KG', 'countryName', 'Kyrgyzstan',
    'cityName', 'Bishkek', 'timeZone', 'Asia/Bishkek',
    'startsAt', '2026-09-29T16:00:00Z', 'endsAt', '2026-09-30T16:00:00Z',
    'scenePackId', 'bishkek-v1', 'storySummary', null
  ),
  jsonb_build_object(
    'question', 'Where should he walk tomorrow?',
    'kind', 'destination',
    'opensAt', '2026-09-29T16:00:00Z',
    'closesAt', '2026-09-30T16:00:00Z',
    'options', jsonb_build_array(
      jsonb_build_object('label', 'Kazakhstan', 'packId', 'almaty-v1'),
      jsonb_build_object('label', 'Tajikistan', 'packId', 'dushanbe-v1')
    )
  )
) as payload;

select is(
  (select payload ->> 'state' from created_day),
  'created',
  'tomorrow is created from the winning pack'
);
select is(
  (select scene_pack_id from public.country_days
   where journey_id = '00000000-0000-4000-8000-000000000066' and day_number = 2),
  'bishkek-v1',
  'tomorrow uses the winner pack'
);
select is(
  (select count(*) from public.vote_options vo
   join public.votes v on v.id = vo.vote_id
   join public.country_days cd on cd.id = v.country_day_id
   where cd.day_number = 2 and cd.journey_id = '00000000-0000-4000-8000-000000000066'),
  2::bigint,
  'tomorrow opens with its own two candidates'
);
select is(
  public.create_next_country_day(
    '2026-09-29T16:00:00Z',
    jsonb_build_object(
      'dayNumber', 2, 'countryCode', 'KG', 'countryName', 'Kyrgyzstan',
      'cityName', 'Bishkek', 'timeZone', 'Asia/Bishkek',
      'startsAt', '2026-09-29T16:00:00Z', 'endsAt', '2026-09-30T16:00:00Z',
      'scenePackId', 'bishkek-v1', 'storySummary', null
    ),
    null
  ) ->> 'state',
  'exists',
  'a repeated rollover creates nothing'
);

-- The name ballot -----------------------------------------------------------

insert into public.votes (
  id, country_day_id, question, opens_at, closes_at, result_publishes_at, status, kind
) values (
  '20000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000067',
  'What should we call him?',
  '2026-09-28T16:00:00Z', '2026-09-29T12:00:00Z', '2026-09-29T12:00:00Z',
  'open', 'name'
);

insert into public.vote_options (id, vote_id, label, display_order) values
  ('30000000-0000-4000-8000-000000000072', '20000000-0000-4000-8000-000000000071', 'Milo', 0),
  ('30000000-0000-4000-8000-000000000073', '20000000-0000-4000-8000-000000000071', 'Nur', 1);

insert into public.ballots (vote_id, voter_hash, option_id) values
  ('20000000-0000-4000-8000-000000000071', repeat('d', 64), '30000000-0000-4000-8000-000000000072'),
  ('20000000-0000-4000-8000-000000000071', repeat('e', 64), '30000000-0000-4000-8000-000000000072'),
  ('20000000-0000-4000-8000-000000000071', repeat('f', 64), '30000000-0000-4000-8000-000000000073');

create temporary table name_result as
select public.close_and_pick_vote_winner('2026-09-29T16:00:00Z') as payload;

select is((select payload ->> 'kind' from name_result), 'name', 'the name ballot is recognized');
select is((select payload ->> 'winnerLabel' from name_result), 'Milo', 'the most-voted name wins');
select is(
  (select traveler_name from public.journeys where id = '00000000-0000-4000-8000-000000000066'),
  'Milo',
  'the winning name is stored on the journey'
);
select is(public.read_traveler_name(), 'Milo', 'the bootstrap can read his name');

-- A tie breaks toward the pack with fewest previous visits -------------------

insert into public.votes (
  id, country_day_id, question, opens_at, closes_at, result_publishes_at, status, kind
) values (
  '20000000-0000-4000-8000-000000000074',
  '10000000-0000-4000-8000-000000000067',
  'Where next?',
  '2026-09-28T16:00:00Z', '2026-09-29T13:00:00Z', '2026-09-29T13:00:00Z',
  'open', 'destination'
);

-- bishkek-v1 is already day 2, so on a tie the unvisited pack wins.
insert into public.vote_options (id, vote_id, label, display_order, pack_id) values
  ('30000000-0000-4000-8000-000000000075', '20000000-0000-4000-8000-000000000074', 'Kyrgyzstan', 0, 'bishkek-v1'),
  ('30000000-0000-4000-8000-000000000078', '20000000-0000-4000-8000-000000000074', 'Kazakhstan', 1, 'almaty-v1');

insert into public.ballots (vote_id, voter_hash, option_id) values
  ('20000000-0000-4000-8000-000000000074', repeat('1', 64), '30000000-0000-4000-8000-000000000075'),
  ('20000000-0000-4000-8000-000000000074', repeat('2', 64), '30000000-0000-4000-8000-000000000078');

select is(
  public.close_and_pick_vote_winner('2026-09-29T16:00:00Z') ->> 'winnerPackId',
  'almaty-v1',
  'a tie breaks toward the pack with fewest previous visits'
);

select * from finish();
rollback;
