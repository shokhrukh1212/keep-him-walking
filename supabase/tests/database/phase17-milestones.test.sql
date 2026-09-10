begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status, season_number,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000170', 'phase17-milestones-test',
  'Phase 17 Milestones Test', '2035-05-01T16:00:00Z', 30, 'preview', 1,
  '2035-05-01T16:00:00Z', '2035-05-01T16:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  ('10000000-0000-4000-8000-000000000171', '00000000-0000-4000-8000-000000000170',
   1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
   '2035-05-01T16:00:00Z', '2035-05-02T16:00:00Z', 'tashkent-v4', 'live'),
  ('10000000-0000-4000-8000-000000000172', '00000000-0000-4000-8000-000000000170',
   2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
   '2035-05-02T16:00:00Z', '2035-05-03T16:00:00Z', 'dushanbe-v1', 'scheduled');

insert into public.journey_runtime (
  country_day_id, last_accounted_at, active_viewers, global_active_seconds, global_steps
) values
  ('10000000-0000-4000-8000-000000000171', '2035-05-01T16:00:00Z', 0, 0, 0),
  ('10000000-0000-4000-8000-000000000172', '2035-05-02T16:00:00Z', 0, 0, 0);

select has_column('public', 'journey_runtime', 'hundred_watchers_at', 'the runtime records the hundred-watcher moment');
select is(
  (select hundred_watchers_at from public.journey_runtime where country_day_id = '10000000-0000-4000-8000-000000000171'),
  null, 'a day starts with no milestone'
);

-- Ninety-nine leases is not the moment, however close it looks.
insert into public.presence_leases (
  country_day_id, visitor_hash, session_hash, last_seen_at, visible, scene_ready, active_seconds
)
select
  '10000000-0000-4000-8000-000000000171',
  lpad(n::text, 64, '0'),
  lpad(n::text, 64, 'f'),
  '2035-05-01T17:00:00Z',
  true,
  true,
  60
from generate_series(1, 98) n;

create temporary table below as
select * from public.record_presence_heartbeat_v9(
  '10000000-0000-4000-8000-000000000171', repeat('9', 64), repeat('8', 64),
  'active', true, '2035-05-01T17:00:00Z', 300, 1.8, 5.0, 600, 'UZ'
);
select is((select out_active_viewers from below), 99::bigint, 'ninety-nine watchers is ninety-nine watchers');
select is((select out_hundred_watchers_at from below), null, 'ninety-nine does not raise the bunting');

-- The hundredth arrival is the moment.
create temporary table crossing as
select * from public.record_presence_heartbeat_v9(
  '10000000-0000-4000-8000-000000000171', repeat('7', 64), repeat('6', 64),
  'active', true, '2035-05-01T17:01:00Z', 300, 1.8, 5.0, 600, 'UZ'
);
select is((select out_active_viewers from crossing), 100::bigint, 'the hundredth watcher is counted');
select is(
  (select out_hundred_watchers_at from crossing),
  '2035-05-01T17:01:00Z'::timestamptz,
  'the moment is stamped when it happens'
);

-- A later heartbeat, with more watchers still, must not move it.
create temporary table later as
select * from public.record_presence_heartbeat_v9(
  '10000000-0000-4000-8000-000000000171', repeat('5', 64), repeat('4', 64),
  'active', true, '2035-05-01T17:04:00Z', 300, 1.8, 5.0, 600, 'UZ'
);
select is(
  (select out_hundred_watchers_at from later),
  '2035-05-01T17:01:00Z'::timestamptz,
  'the milestone is the first time it happened, not the last'
);

-- The flag belongs to the day, not the journey.
select is(
  (select hundred_watchers_at from public.journey_runtime where country_day_id = '10000000-0000-4000-8000-000000000172'),
  null, 'tomorrow starts its own day with no milestone'
);

select function_privs_are(
  'public', 'record_presence_heartbeat_v9',
  array['uuid', 'text', 'text', 'text', 'boolean', 'timestamptz', 'integer', 'numeric', 'real', 'integer', 'text'],
  'anon', array[]::text[], 'the browser role cannot record a heartbeat'
);
select function_privs_are(
  'public', 'read_bootstrap_bundle_v12',
  array['text', 'timestamptz', 'integer', 'numeric', 'integer', 'integer', 'real', 'numeric'],
  'service_role', array['EXECUTE'], 'only the server role reads the v12 bundle'
);

select * from finish();
rollback;
