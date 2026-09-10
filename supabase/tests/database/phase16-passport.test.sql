begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status, season_number,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000160', 'phase16-passport-test',
  'Phase 16 Passport Test', '2034-04-01T16:00:00Z', 30, 'preview', 2,
  '2034-04-01T16:00:00Z', '2034-04-01T16:00:00Z', 1, true
);

-- Four days: 1, 2 and 4 are finished, 5 is live. Day 3 exists but was never
-- published, so it must not appear in the sheet at all.
insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  ('10000000-0000-4000-8000-000000000161', '00000000-0000-4000-8000-000000000160',
   1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
   '2034-04-01T16:00:00Z', '2034-04-02T16:00:00Z', 'tashkent-v4', 'completed'),
  ('10000000-0000-4000-8000-000000000162', '00000000-0000-4000-8000-000000000160',
   2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
   '2034-04-02T16:00:00Z', '2034-04-03T16:00:00Z', 'dushanbe-v1', 'completed'),
  ('10000000-0000-4000-8000-000000000163', '00000000-0000-4000-8000-000000000160',
   3, 'KG', 'Kyrgyzstan', 'Bishkek', 'Asia/Bishkek',
   '2034-04-03T16:00:00Z', '2034-04-04T16:00:00Z', 'bishkek-v1', 'draft'),
  ('10000000-0000-4000-8000-000000000164', '00000000-0000-4000-8000-000000000160',
   4, 'KZ', 'Kazakhstan', 'Almaty', 'Asia/Almaty',
   '2034-04-04T16:00:00Z', '2034-04-05T16:00:00Z', 'almaty-v1', 'completed'),
  ('10000000-0000-4000-8000-000000000165', '00000000-0000-4000-8000-000000000160',
   5, 'GE', 'Georgia', 'Tbilisi', 'Asia/Tbilisi',
   '2034-04-05T16:00:00Z', '2034-04-06T16:00:00Z', 'tbilisi-v1', 'live');

-- Visitor A: 30s on day 1 (exactly the threshold), 29s on day 2 (just under),
-- 45s on day 4 and 60s on day 5. His streak is therefore days 4 and 5 only.
insert into public.visitor_day_contributions (
  country_day_id, visitor_hash, active_seconds, first_contributed_at, last_contributed_at, expires_at
) values
  ('10000000-0000-4000-8000-000000000161', repeat('a', 64), 30,
   '2034-04-01T17:00:00Z', '2034-04-01T17:30:00Z', '2034-04-08T17:30:00Z'),
  ('10000000-0000-4000-8000-000000000162', repeat('a', 64), 29,
   '2034-04-02T17:00:00Z', '2034-04-02T17:30:00Z', '2034-04-09T17:30:00Z'),
  ('10000000-0000-4000-8000-000000000164', repeat('a', 64), 45,
   '2034-04-04T17:00:00Z', '2034-04-04T17:30:00Z', '2034-04-11T17:30:00Z'),
  ('10000000-0000-4000-8000-000000000165', repeat('a', 64), 60,
   '2034-04-05T17:00:00Z', '2034-04-05T17:30:00Z', '2034-04-12T17:30:00Z'),
  -- Visitor B watched only day 1. His passport must not borrow visitor A's days.
  ('10000000-0000-4000-8000-000000000161', repeat('b', 64), 120,
   '2034-04-01T17:00:00Z', '2034-04-01T17:30:00Z', '2034-04-08T17:30:00Z');

select has_column('public', 'journeys', 'season_number', 'a journey knows which season it belongs to');
select is(
  (select season_number from public.journeys where id = '00000000-0000-4000-8000-000000000160'),
  2, 'the season number is stored, not inferred'
);

create temporary table passport_a as
select public.read_visitor_passport(
  '00000000-0000-4000-8000-000000000160', repeat('a', 64), 30
) as result;

select is(
  (select jsonb_array_length(result -> 'days') from passport_a),
  4, 'only published days reach the sheet'
);
select is(
  (select (d ->> 'collected')::boolean from passport_a, jsonb_array_elements(result -> 'days') d
    where (d ->> 'dayNumber')::integer = 1),
  true, 'exactly the collect threshold counts as collected'
);
select is(
  (select (d ->> 'collected')::boolean from passport_a, jsonb_array_elements(result -> 'days') d
    where (d ->> 'dayNumber')::integer = 2),
  false, 'one second under the threshold is not collected'
);
select is(
  (select (d ->> 'dayNumber')::integer from passport_a, jsonb_array_elements(result -> 'days') d
    where (d ->> 'countryDayId') = '10000000-0000-4000-8000-000000000165'),
  5, 'the live day is on the sheet so today can be stamped'
);
select is((select (result ->> 'streak')::integer from passport_a), 2, 'a gap ends the streak at the most recent run');

create temporary table passport_b as
select public.read_visitor_passport(
  '00000000-0000-4000-8000-000000000160', repeat('b', 64), 30
) as result;
select is((select (result ->> 'streak')::integer from passport_b), 1, 'a single collected day is a streak of one');
select is(
  (select count(*)::integer from passport_b, jsonb_array_elements(result -> 'days') d
    where (d ->> 'collected')::boolean),
  1, 'one visitor never inherits another visitor''s stamps'
);

create temporary table passport_none as
select public.read_visitor_passport(
  '00000000-0000-4000-8000-000000000160', repeat('c', 64), 30
) as result;
select is((select (result ->> 'streak')::integer from passport_none), 0, 'a visitor who watched nothing has no streak');

select is(
  (select public.read_visitor_passport(null, repeat('a', 64), 30) ->> 'streak')::integer,
  0, 'no journey yields an empty passport instead of an error'
);

select has_function('public', 'read_bootstrap_bundle_v11', 'the v11 bundle exists');
select function_privs_are(
  'public', 'read_bootstrap_bundle_v11',
  array['text', 'timestamptz', 'integer', 'numeric', 'integer', 'integer', 'real', 'numeric'],
  'anon', array[]::text[], 'the browser role cannot call the v11 bundle'
);
select function_privs_are(
  'public', 'read_visitor_passport', array['uuid', 'text', 'numeric'],
  'service_role', array['EXECUTE'], 'only the server role reads a passport'
);

select * from finish();
rollback;
