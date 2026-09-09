begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000096', 'phase6-waiting-test',
  'Phase 6 Waiting Test', '2026-09-16T00:00:00Z', 3, 'preview',
  '2026-09-16T00:00:00Z', '2026-09-16T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  (
    '10000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000096',
    1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
    '2026-09-16T00:00:00Z', '2026-09-17T00:00:00Z', 'tashkent-v4', 'live'
  ),
  (
    '10000000-0000-4000-8000-000000000098',
    '00000000-0000-4000-8000-000000000096',
    2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
    '2026-09-17T00:00:00Z', '2026-09-18T00:00:00Z', 'dushanbe-v1', 'scheduled'
  ),
  (
    '10000000-0000-4000-8000-000000000099',
    '00000000-0000-4000-8000-000000000096',
    3, 'KG', 'Kyrgyzstan', 'Bishkek', 'Asia/Bishkek',
    '2026-09-18T00:00:00Z', '2026-09-19T00:00:00Z', 'bishkek-v1', 'scheduled'
  );

select has_column('public', 'journey_runtime', 'waiting_since', 'runtime records the live wait origin');
select has_column('public', 'journey_runtime', 'last_watcher_left_at', 'runtime preserves the ended wait origin');
select has_function(
  'public',
  'record_presence_heartbeat_v4',
  array[
    'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone',
    'integer', 'numeric', 'real', 'integer'
  ],
  'waiting heartbeat accepts the configured first-watcher gap'
);
select has_function(
  'public',
  'read_journey_runtime_v5',
  array['uuid', 'timestamp with time zone', 'integer', 'numeric', 'real'],
  'waiting runtime projection exists'
);
select is(
  has_function_privilege(
    'anon',
    'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric,real,integer)',
    'EXECUTE'
  ),
  false,
  'anon cannot call the waiting heartbeat'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric,real,integer)',
    'EXECUTE'
  ),
  true,
  'service role can call the waiting heartbeat'
);
select is(
  has_function_privilege(
    'anon',
    'public.read_journey_runtime_v5(uuid,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  false,
  'anon cannot call the waiting runtime projection'
);
select is(
  has_function_privilege(
    'service_role',
    'public.read_journey_runtime_v5(uuid,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  true,
  'service role can call the waiting runtime projection'
);

select is(
  (select out_waiting_since from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-16T00:00:00Z', 50, 1.8, 5, 600
  )),
  '2026-09-16T00:00:00Z'::timestamptz,
  'the first lease receives the day-start wait origin'
);
select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-16T00:00:01Z', 50, 1.8, 5, 600
  )),
  false,
  'a steady live lease does not receive a wake award'
);
select is(
  (select out_active_viewers from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'inactive', true, '2026-09-16T00:00:10Z', 50, 1.8, 5, 600
  )),
  0::bigint,
  'the last explicit departure transitions the crowd to zero'
);
select is(
  (select waiting_since from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000097'),
  '2026-09-16T00:00:10Z'::timestamptz,
  'the zero-watcher transition records its exact heartbeat time'
);
select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-16T00:10:09.999Z', 50, 1.8, 5, 600
  )),
  false,
  'a first arrival one millisecond before the threshold is not awarded'
);
select is(
  (select last_watcher_left_at from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000097'),
  '2026-09-16T00:00:10Z'::timestamptz,
  'arrival preserves the ended wait origin'
);
select is(
  (select waiting_since from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000097'),
  null::timestamptz,
  'arrival clears the live waiting timestamp'
);

do $$
begin
  perform * from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'inactive', true, '2026-09-16T00:10:10Z', 50, 1.8, 5, 600
  );
end;
$$;
select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('a', 64), repeat('1', 64),
    'active', true, '2026-09-16T00:20:10Z', 50, 1.8, 5, 600
  )),
  true,
  'a first arrival exactly at the configured boundary wakes him'
);
select is(
  (select out_waiting_since from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('b', 64), repeat('2', 64),
    'active', true, '2026-09-16T00:20:10Z', 50, 1.8, 5, 600
  )),
  null::timestamptz,
  'a later serialized arrival does not receive the ended wait'
);
select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000097', repeat('c', 64), repeat('3', 64),
    'active', true, '2026-09-16T00:20:10Z', 50, 1.8, 5, 600
  )),
  false,
  'the same wake interval is awarded exactly once'
);

select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000098', repeat('d', 64), repeat('4', 64),
    'active', true, '2026-09-17T00:00:00Z', 50, 1.8, 5, 600
  )),
  false,
  'a new day does not fabricate a qualifying gap'
);
create temporary table expiry_arrival as
select * from public.record_presence_heartbeat_v4(
  '10000000-0000-4000-8000-000000000098', repeat('e', 64), repeat('5', 64),
  'active', true, '2026-09-17T00:10:50Z', 50, 1.8, 5, 600
);
select is(
  (select out_waiting_since from expiry_arrival),
  '2026-09-17T00:00:50Z'::timestamptz,
  'an arrival after silent expiry receives the exact expiry boundary'
);
select is(
  (select out_woke_him from expiry_arrival),
  true,
  'an expiry-derived gap at the boundary awards the first arrival'
);
select is(
  (select out_woke_him from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000098', repeat('e', 64), repeat('5', 64),
    'active', true, '2026-09-17T00:10:51Z', 50, 1.8, 5, 600
  )),
  false,
  'the expiry-derived wake is not repeated on the recipient heartbeat'
);
select is(
  (select last_watcher_left_at from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000098'),
  '2026-09-17T00:00:50Z'::timestamptz,
  'the expiry-derived wait origin is retained after wake-up'
);

do $$
begin
  perform * from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000099', repeat('f', 64), repeat('6', 64),
    'active', true, '2026-09-18T00:00:00Z', 50, 1.8, 5, 600
  );
end;
$$;
select is(
  (select out_active_viewers from public.read_journey_runtime_v5(
    '10000000-0000-4000-8000-000000000099', '2026-09-18T00:10:50Z', 50, 1.8, 5
  )),
  0::bigint,
  'the read-only projection observes an expired final lease'
);
select is(
  (select out_waiting_since from public.read_journey_runtime_v5(
    '10000000-0000-4000-8000-000000000099', '2026-09-18T00:10:50Z', 50, 1.8, 5
  )),
  '2026-09-18T00:00:50Z'::timestamptz,
  'the read-only projection exposes the expiry-derived wait origin'
);
select is(
  ((public.read_bootstrap_bundle_v5(
    repeat('9', 64), '2026-09-18T00:10:50Z', 50, 1.8, 90, 60, 5
  ) #>> '{bundle,runtime,out_waiting_since}'))::timestamptz,
  '2026-09-18T00:00:50Z'::timestamptz,
  'bootstrap always carries the projected waiting timestamp'
);

select * from finish();
rollback;
