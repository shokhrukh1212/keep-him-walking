begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.journeys (
  id, slug, title, starts_at, total_days, status,
  real_time_anchor_at, story_time_anchor_at, story_time_scale, phase2_enabled
) values (
  '00000000-0000-4000-8000-000000000095', 'phase5-pace-test', 'Phase 5 Pace Test',
  '2026-09-14T00:00:00Z', 2, 'preview',
  '2026-09-14T00:00:00Z', '2026-09-14T00:00:00Z', 1, true
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values
  (
    '10000000-0000-4000-8000-000000000095',
    '00000000-0000-4000-8000-000000000095',
    1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
    '2026-09-14T00:00:00Z', '2026-09-15T00:00:00Z', 'tashkent-v4', 'live'
  ),
  (
    '10000000-0000-4000-8000-000000000096',
    '00000000-0000-4000-8000-000000000095',
    2, 'TJ', 'Tajikistan', 'Dushanbe', 'Asia/Dushanbe',
    '2026-09-15T00:00:00Z', '2026-09-16T00:00:00Z', 'dushanbe-v1', 'scheduled'
  );

select has_function(
  'public',
  'record_presence_heartbeat_v4',
  array['uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone', 'integer', 'numeric', 'real'],
  'pace heartbeat accepts the configured cap'
);
select is(
  has_function_privilege(
    'anon',
    'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  false,
  'anon cannot call the pace heartbeat'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_presence_heartbeat_v4(uuid,text,text,text,boolean,timestamptz,integer,numeric,real)',
    'EXECUTE'
  ),
  true,
  'service role can call the pace heartbeat'
);

select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('1', 64, '0'), lpad('s1', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  1::real,
  'one live visitor produces 1x pace'
);
select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('2', 64, '0'), lpad('s2', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  2::real,
  'two live visitors produce 2x pace'
);

do $$
begin
  for visitor in 3..3 loop
    perform * from public.record_presence_heartbeat_v4(
      '10000000-0000-4000-8000-000000000095',
      lpad(visitor::text, 64, '0'), lpad('s' || visitor::text, 64, 's'),
      'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
    );
  end loop;
end;
$$;
select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('4', 64, '0'), lpad('s4', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  3::real,
  'four live visitors produce 3x pace'
);

do $$
begin
  for visitor in 5..7 loop
    perform * from public.record_presence_heartbeat_v4(
      '10000000-0000-4000-8000-000000000095',
      lpad(visitor::text, 64, '0'), lpad('s' || visitor::text, 64, 's'),
      'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
    );
  end loop;
end;
$$;
select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('8', 64, '0'), lpad('s8', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  4::real,
  'eight live visitors produce 4x pace'
);

do $$
begin
  for visitor in 9..15 loop
    perform * from public.record_presence_heartbeat_v4(
      '10000000-0000-4000-8000-000000000095',
      lpad(visitor::text, 64, '0'), lpad('s' || visitor::text, 64, 's'),
      'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
    );
  end loop;
end;
$$;
select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('16', 64, '0'), lpad('s16', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  5::real,
  'sixteen live visitors produce the 5x cap'
);

do $$
begin
  for visitor in 17..39 loop
    perform * from public.record_presence_heartbeat_v4(
      '10000000-0000-4000-8000-000000000095',
      lpad(visitor::text, 64, '0'), lpad('s' || visitor::text, 64, 's'),
      'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
    );
  end loop;
end;
$$;
select is(
  (select out_pace_rate from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('40', 64, '0'), lpad('s40', 64, 's'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  5::real,
  'forty live visitors remain capped at 5x pace'
);
select is(
  (select out_active_viewers from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000095', lpad('1', 64, '0'), lpad('duplicate', 64, 'd'),
    'active', true, '2026-09-14T00:00:00Z', 50, 1.8, 5
  )),
  40::bigint,
  'a second session for one visitor does not increase watchers or pace'
);

select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000096', lpad('a', 64, 'a'), lpad('sa', 64, 's'),
    'active', true, '2026-09-15T00:00:00Z', 50, 1.8, 5
  )),
  0::double precision,
  'the first caller receives no retroactive distance'
);
select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000096', lpad('b', 64, 'b'), lpad('sb', 64, 's'),
    'active', true, '2026-09-15T00:00:10Z', 50, 1.8, 5
  )),
  12.5::double precision,
  'a new second caller does not apply 2x pace to the preceding interval'
);
select is(
  (select out_global_distance_metres from public.record_presence_heartbeat_v4(
    '10000000-0000-4000-8000-000000000096', lpad('a', 64, 'a'), lpad('sa', 64, 's'),
    'active', true, '2026-09-15T00:00:20Z', 50, 1.8, 5
  )),
  37.5::double precision,
  'two confirmed viewers accrue distance at 2x pace'
);
select is(
  (select out_global_distance_metres from public.read_journey_runtime_v4(
    '10000000-0000-4000-8000-000000000096', '2026-09-15T00:01:05Z', 50, 1.8, 5
  )),
  143.75::double precision,
  'projected distance drops to 1x at the earlier lease expiry'
);
select is(
  (select out_active_viewers from public.read_journey_runtime_v4(
    '10000000-0000-4000-8000-000000000096', '2026-09-15T00:01:05Z', 50, 1.8, 5
  )),
  1::bigint,
  'the runtime projection reports only the remaining live visitor'
);
select is(
  (select out_pace_rate from public.read_journey_runtime_v4(
    '10000000-0000-4000-8000-000000000096', '2026-09-15T00:01:05Z', 50, 1.8, 5
  )),
  1::real,
  'the bootstrap runtime pace matches its projected watcher count'
);
select is(
  (select pace_rate from public.journey_runtime
    where country_day_id = '10000000-0000-4000-8000-000000000096'),
  2::real,
  'read-only projection does not mutate the persisted pace authority'
);

select * from finish();
rollback;
