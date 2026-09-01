begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.journeys (id, slug, title, starts_at, total_days, status)
values (
  '00000000-0000-4000-8000-000000000098',
  'phase15-test',
  'Phase 1.5 Test',
  '2026-09-01T00:00:00Z',
  195,
  'active'
);

insert into public.country_days (
  id, journey_id, day_number, country_code, country_name, city_name, time_zone,
  starts_at, ends_at, scene_pack_id, status
) values (
  '10000000-0000-4000-8000-000000000098',
  '00000000-0000-4000-8000-000000000098',
  1, 'UZ', 'Uzbekistan', 'Tashkent', 'Asia/Tashkent',
  '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 'tashkent-v2', 'live'
);

select is(
  (select out_global_active_seconds from public.record_presence_heartbeat_v2(
    '10000000-0000-4000-8000-000000000098', repeat('d', 64), repeat('4', 64),
    'active', true, '2026-09-01T00:00:00Z', 50, 1.8
  )),
  0::numeric,
  'route begins at zero active seconds'
);

select is(
  (select out_global_active_seconds from public.record_presence_heartbeat_v2(
    '10000000-0000-4000-8000-000000000098', repeat('d', 64), repeat('4', 64),
    'active', true, '2026-09-01T00:00:20Z', 50, 1.8
  )),
  20::numeric,
  'route advances while a watcher lease is active'
);

select is(
  (select out_global_active_seconds from public.record_presence_heartbeat_v2(
    '10000000-0000-4000-8000-000000000098', null, null,
    'observe', false, '2026-09-01T00:03:20Z', 50, 1.8
  )),
  70::numeric,
  'route stops at the final watcher TTL expiry'
);

select is(
  (select out_global_active_seconds from public.record_presence_heartbeat_v2(
    '10000000-0000-4000-8000-000000000098', null, null,
    'observe', false, '2026-09-01T00:05:00Z', 50, 1.8
  )),
  70::numeric,
  'route remains stopped without a watcher'
);

select * from finish();
rollback;
