begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000094', 'phase4-distance-test', 'Phase 4 Distance Test',
  '2026-09-12T00:00:00Z', 7, 'preview',
  '2026-09-12T00:00:00Z', '2026-09-12T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000094',
  '00000000-0000-4000-8000-000000000094',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-12T00:00:00Z', '2026-09-13T00:00:00Z', 'tashkent-v4', 'live'
);

select has_column('public', 'journey_runtime', 'global_distance_metres', 'runtime stores authoritative metres');
select has_column('public', 'journey_runtime', 'pace_rate', 'runtime stores the sampled pace');
select has_table('public', 'day_outcomes', 'day outcomes table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.day_outcomes'::regclass), 'day outcomes enforce RLS');
select is(has_table_privilege('anon', 'public.day_outcomes', 'SELECT'), false, 'anon cannot enumerate day outcomes');
select has_function('public', 'record_presence_heartbeat_v4', array['uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone', 'integer', 'numeric'], 'distance heartbeat exists');
select is(has_function_privilege('anon', 'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric)', 'EXECUTE'), false, 'anon cannot call distance heartbeat');
select is(has_function_privilege('service_role', 'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric)', 'EXECUTE'), true, 'service role can call distance heartbeat');

select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000094', repeat('d', 64), repeat('4', 64),
    'active', true, '2026-09-12T00:00:00Z', 50, 1.8
  )),
  0::double precision,
  'a new lease does not receive retroactive distance'
);
select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000094', repeat('d', 64), repeat('4', 64),
    'active', true, '2026-09-12T00:00:20Z', 50, 1.8
  )),
  25::double precision,
  'twenty watched seconds accrue twenty-five metres at 1.25 m/s'
);
select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000094', repeat('d', 64), repeat('4', 64),
    'inactive', true, '2026-09-12T00:00:40Z', 50, 1.8
  )),
  50::double precision,
  'the previously confirmed live interval accrues before the lease becomes inactive'
);
select is((select pace_rate from public.journey_runtime where country_day_id = '10000000-0000-4000-8000-000000000094'), 1::real, 'P4 retains the default 1x pace');
select is((select global_distance_metres from public.journey_runtime where country_day_id = '10000000-0000-4000-8000-000000000094'), 50::double precision, 'confirmed distance persists on the authority row');
select has_function('public', 'read_bootstrap_bundle_v5', array['text', 'timestamp with time zone', 'integer', 'numeric', 'integer', 'integer'], 'distance bootstrap bundle exists');
select is(
  ((public.read_bootstrap_bundle_v5(repeat('e', 64), '2026-09-12T00:00:41Z', 50, 1.8, 10, 60) #>> '{bundle,runtime,out_global_distance_metres}'))::double precision,
  50::double precision,
  'bootstrap returns the confirmed distance'
);

select * from finish();
rollback;
